/**
 * ScrcpyService - High-performance screen mirroring via scrcpy-server protocol
 * 
 * Uses scrcpy-server's MediaCodec H.264 hardware encoder for 30-60 FPS streaming
 * and binary control protocol for low-latency touch/key input (<10ms).
 * 
 * Protocol reference: https://github.com/Genymobile/scrcpy
 */

const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const adbService = require('./adbService');

// scrcpy control message types (enum order from control_msg.h)
const CONTROL_MSG = {
  INJECT_KEYCODE: 0,
  INJECT_TEXT: 1,
  INJECT_TOUCH_EVENT: 2,
  INJECT_SCROLL_EVENT: 3,
  BACK_OR_SCREEN_ON: 4,
  EXPAND_NOTIFICATION_PANEL: 5,
  EXPAND_SETTINGS_PANEL: 6,
  COLLAPSE_PANELS: 7,
  GET_CLIPBOARD: 8,
  SET_CLIPBOARD: 9,
  SET_DISPLAY_POWER: 10,
  ROTATE_DEVICE: 11
};

// Android MotionEvent actions
const MOTION_EVENT = {
  ACTION_DOWN: 0,
  ACTION_UP: 1,
  ACTION_MOVE: 2
};

// Android KeyEvent actions
const KEY_EVENT = {
  ACTION_DOWN: 0,
  ACTION_UP: 1
};

// Special pointer IDs
const POINTER_ID_MOUSE = BigInt('0xFFFFFFFFFFFFFFFF'); // -1 as uint64
const POINTER_ID_FINGER = BigInt('0xFFFFFFFFFFFFFFFE'); // -2 as uint64

class ScrcpyService {
  constructor() {
    this.serverPath = null;      // Path to scrcpy-server binary
    this.serverVersion = '4.1';  // Protocol version matching scrcpy binary
    this.sessions = new Map();   // serial -> session state
    this._pendingStarts = new Map(); // serial -> Promise
    this._findServerPath();
  }

  /**
   * Locate scrcpy-server binary from scrcpy installation
   */
  _findServerPath() {
    const candidates = [
      // winget install location
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages'),
    ];

    for (const base of candidates) {
      if (!fs.existsSync(base)) continue;
      try {
        const dirs = fs.readdirSync(base).filter(d => d.includes('scrcpy'));
        for (const dir of dirs) {
          const fullDir = path.join(base, dir);
          // Search recursively for scrcpy-server
          const serverFile = this._findFileRecursive(fullDir, 'scrcpy-server', 3);
          if (serverFile) {
            this.serverPath = serverFile;
            // Detect version from path (e.g. scrcpy-win64-v4.1 -> 4.1)
            const pathMatch = serverFile.match(/v(\d+\.\d+)/);
            if (pathMatch) this.serverVersion = pathMatch[1];
            console.log(`[ScrcpyService] Found scrcpy-server v${this.serverVersion}: ${this.serverPath}`);
            return;
          }
        }
      } catch (e) {}
    }

    // Try PATH
    try {
      const scrcpyExe = execSync('where.exe scrcpy', { encoding: 'utf8', windowsHide: true }).trim().split('\n')[0];
      if (scrcpyExe) {
        const dir = path.dirname(scrcpyExe);
        const serverFile = path.join(dir, 'scrcpy-server');
        if (fs.existsSync(serverFile)) {
          this.serverPath = serverFile;
          console.log(`[ScrcpyService] Found scrcpy-server via PATH: ${this.serverPath}`);
          return;
        }
      }
    } catch (e) {}

    console.warn('[ScrcpyService:Warn] scrcpy-server not found. Install scrcpy: winget install Genymobile.scrcpy');
  }

  _findFileRecursive(dir, filename, maxDepth) {
    if (maxDepth <= 0) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name === filename) {
          return path.join(dir, entry.name);
        }
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const found = this._findFileRecursive(path.join(dir, entry.name), filename, maxDepth - 1);
          if (found) return found;
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Check if scrcpy is available
   */
  isAvailable() {
    return !!this.serverPath && fs.existsSync(this.serverPath);
  }

  /**
   * Start a scrcpy streaming session for a device (deduplicated & reusable)
   * @param {string} serial - Device serial number
   * @param {object} options - { maxSize, maxFps, bitRate }
   * @returns {Promise<object>} Session info with { width, height, deviceName }
   */
  async startSession(serial, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('scrcpy-server not found. Install: winget install Genymobile.scrcpy');
    }

    // Reuse existing running session
    const existing = this.sessions.get(serial);
    if (existing && existing.isRunning) {
      return {
        success: true,
        deviceName: existing.deviceName,
        width: existing.deviceWidth,
        height: existing.deviceHeight
      };
    }

    // Reuse in-flight startup promise
    if (this._pendingStarts.has(serial)) {
      return this._pendingStarts.get(serial);
    }

    const startPromise = this._doStartSession(serial, options);
    this._pendingStarts.set(serial, startPromise);

    try {
      const result = await startPromise;
      return result;
    } finally {
      this._pendingStarts.delete(serial);
    }
  }

  async _doStartSession(serial, options = {}) {
    // Stop existing inactive session if any
    await this.stopSession(serial);

    const maxSize = options.maxSize || 1024;
    const maxFps = options.maxFps || 60;
    const bitRate = options.bitRate || 8000000;
    const localPort = 27183 + Math.floor(Math.random() * 100);

    const session = {
      serial,
      localPort,
      serverProcess: null,
      videoSocket: null,
      controlSocket: null,
      deviceWidth: 1080,
      deviceHeight: 2400,
      deviceName: '',
      isRunning: false,
      videoListeners: new Set(), // Set of callback(h264Buffer, isConfig, isKeyFrame, pts)
      disconnectListeners: new Set(),
      lastConfigPacket: null,   // SPS/PPS cache
      _videoBuffer: Buffer.alloc(0),
      _headerParsed: false,
    };

    try {
      // Step 1: Push scrcpy-server to device
      console.log(`[ScrcpyService] Pushing scrcpy-server to ${serial}...`);
      const pushResult = await adbService.execAdb(
        `${serial ? `-s ${serial} ` : ''}push "${this.serverPath}" /data/local/tmp/scrcpy-server.jar`
      );
      if (!pushResult.success) {
        throw new Error(`Failed to push scrcpy-server: ${pushResult.error}`);
      }

      // Step 2: Generate session ID and set up ADB forward
      const scid = Math.floor(Math.random() * 0x0FFFFFFF);
      const scidHex = scid.toString(16).padStart(8, '0');
      const socketName = `scrcpy_${scidHex}`;
      session.scid = scid;

      console.log(`[ScrcpyService] Setting up ADB forward on port ${localPort} -> ${socketName}...`);
      const fwdResult = await adbService.execAdb(
        `${serial ? `-s ${serial} ` : ''}forward tcp:${localPort} localabstract:${socketName}`
      );
      if (!fwdResult.success) {
        throw new Error(`Failed to forward port: ${fwdResult.error}`);
      }

      // Step 3: Start scrcpy-server on device
      console.log(`[ScrcpyService] Starting scrcpy-server v${this.serverVersion} (scid=${scid})...`);
      const serverArgs = [
        ...(serial ? ['-s', serial] : []),
        'shell',
        `CLASSPATH=/data/local/tmp/scrcpy-server.jar`,
        'app_process', '/',
        'com.genymobile.scrcpy.Server',
        this.serverVersion,
        `scid=${scidHex}`,
        `tunnel_forward=true`,
        `control=true`,
        `audio=false`,
        `max_size=${maxSize}`,
        `max_fps=${maxFps}`,
        `video_bit_rate=${bitRate}`,
        `video_codec=h264`,
        `send_frame_meta=true`,
        `send_device_meta=true`,
        `send_dummy_byte=true`,
        `log_level=info`,
      ];

      session.serverProcess = spawn(adbService.adbPath, serverArgs, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      session.serverProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[scrcpy-server] ${msg}`);
      });

      session.serverProcess.on('close', (code) => {
        console.log(`[scrcpy-server] Process exited with code ${code}`);
        if (session.isRunning) {
          session.isRunning = false;
          for (const cb of session.disconnectListeners) {
            try { cb(); } catch (e) {}
          }
        }
      });

      // Step 4: Wait for server to start
      await this._sleep(1500);

      // Step 5: Connect video socket (first connection) with retries
      session.videoSocket = await this._connectWithRetry(localPort, 3, 800);
      console.log(`[ScrcpyService] Video socket connected`);

      // Step 6: Connect control socket (second connection)
      session.controlSocket = await this._connectWithRetry(localPort, 3, 800);
      console.log(`[ScrcpyService] Control socket connected`);

      // Step 7: Read initial handshake from video socket
      const deviceInfo = await this._readDeviceInfo(session);
      session.deviceName = deviceInfo.name;
      session.deviceWidth = deviceInfo.width || 1080;
      session.deviceHeight = deviceInfo.height || 2400;
      console.log(`[ScrcpyService] Device: ${session.deviceName} (${session.deviceWidth}x${session.deviceHeight})`);

      // Step 8: Start reading video frames
      session.isRunning = true;
      this._startVideoReader(session);

      this.sessions.set(serial, session);

      return {
        success: true,
        deviceName: session.deviceName,
        width: session.deviceWidth,
        height: session.deviceHeight,
      };

    } catch (err) {
      console.error(`[ScrcpyService:Error] Failed to start session: ${err.message}`);
      await this._cleanupSession(session);
      throw err;
    }
  }

  /**
   * Connect socket with retry logic
   */
  async _connectWithRetry(port, maxRetries = 3, retryDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this._connectSocket(port, 3000);
      } catch (err) {
        if (attempt === maxRetries) throw err;
        console.log(`[ScrcpyService] Socket connect attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
        await this._sleep(retryDelay);
      }
    }
  }

  _connectSocket(port, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to port ${port}`));
      }, timeout);

      socket.connect(port, '127.0.0.1', () => {
        clearTimeout(timer);
        socket.setNoDelay(true);
        resolve(socket);
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Read device info from the video socket handshake (scrcpy v4.x)
   * Format:
   *   1. Dummy byte (1 byte, value 0x00) - connection test
   *   2. Device name (64 bytes, NUL-padded UTF-8) - when send_device_meta=true
   *   3. Codec ID (4 bytes, int32 BE) - when send_stream_meta=true (e.g. H.264 = 0x68323634)
   *   Total: 69 bytes
   */
  _readDeviceInfo(session) {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const HANDSHAKE_SIZE = 69; // 1 + 64 + 4

      const timeout = setTimeout(() => {
        cleanup();
        console.warn('[ScrcpyService:Warn] Handshake timeout, using defaults');
        resolve({ name: 'Android Device', width: 1080, height: 2400 });
      }, 5000);

      const onData = (data) => {
        buffer = Buffer.concat([buffer, data]);

        if (buffer.length >= HANDSHAKE_SIZE) {
          clearTimeout(timeout);
          cleanup();

          // Parse: [dummy:1][deviceName:64][codecId:4]
          const dummyByte = buffer[0];
          const nameBytes = buffer.slice(1, 65);
          const nullIdx = nameBytes.indexOf(0);
          const name = nameBytes.slice(0, nullIdx >= 0 ? nullIdx : 64).toString('utf8');
          const codecId = buffer.readUInt32BE(65);
          console.log(`[ScrcpyService] Handshake OK: device="${name}", codecId=0x${codecId.toString(16)}`);

          // Remaining data goes back into the video buffer for frame parsing
          if (buffer.length > HANDSHAKE_SIZE) {
            session._videoBuffer = buffer.slice(HANDSHAKE_SIZE);
          }

          // Get device dimensions from ADB
          adbService.getDeviceInfo(session.serial).then(info => {
            resolve({
              name: name || 'Android Device',
              width: info ? info.width : 1080,
              height: info ? info.height : 2400
            });
          }).catch(() => {
            resolve({ name: name || 'Android Device', width: 1080, height: 2400 });
          });
        }
      };

      const cleanup = () => {
        session.videoSocket.removeListener('data', onData);
      };

      session.videoSocket.on('data', onData);
    });
  }

  /**
   * Start reading H.264 video frames from the video socket
   * 
   * Frame format (scrcpy v4.x, send_frame_meta=true):
   * [pts_and_flags: 8 bytes BE] [packet_size: 4 bytes BE] [h264_data: packet_size bytes]
   * 
   * pts_and_flags (64-bit):
   *   - Bit 63: PACKET_FLAG_SESSION  (new session/resolution change)
   *   - Bit 62: PACKET_FLAG_CONFIG   (SPS/PPS codec config)
   *   - Bit 61: PACKET_FLAG_KEY_FRAME
   *   - Bits 60-0: PTS in microseconds
   */
  _startVideoReader(session) {
    const HEADER_SIZE = 12; // 8 bytes pts_flags + 4 bytes size
    const FLAG_SESSION   = BigInt(1) << BigInt(63);
    const FLAG_CONFIG    = BigInt(1) << BigInt(62);
    const FLAG_KEY_FRAME = BigInt(1) << BigInt(61);
    const PTS_MASK       = (BigInt(1) << BigInt(61)) - BigInt(1); // bits 60-0

    session.videoSocket.on('data', (data) => {
      if (!session.isRunning) return;

      // Append to buffer
      session._videoBuffer = Buffer.concat([session._videoBuffer, data]);

      // Process all complete packets in buffer
      while (session._videoBuffer.length >= HEADER_SIZE) {
        // Read packet header
        const ptsAndFlags = session._videoBuffer.readBigUInt64BE(0);
        const packetSize = session._videoBuffer.readUInt32BE(8);

        // Sanity check packet size (max 4MB)
        if (packetSize > 4 * 1024 * 1024) {
          console.error(`[ScrcpyService:Error] Invalid packet size: ${packetSize}, resetting buffer`);
          session._videoBuffer = Buffer.alloc(0);
          break;
        }

        // Check if we have the full packet
        if (session._videoBuffer.length < HEADER_SIZE + packetSize) {
          break; // Wait for more data
        }

        // Extract flags (scrcpy v4.x bit positions)
        const isConfig   = !!(ptsAndFlags & FLAG_CONFIG);
        const isKeyFrame = !!(ptsAndFlags & FLAG_KEY_FRAME);
        const pts = Number(ptsAndFlags & PTS_MASK);

        // Extract H.264 data
        const h264Data = session._videoBuffer.slice(HEADER_SIZE, HEADER_SIZE + packetSize);

        // Advance buffer
        session._videoBuffer = session._videoBuffer.slice(HEADER_SIZE + packetSize);

        // Cache SPS/PPS config packet
        if (isConfig) {
          session.lastConfigPacket = h264Data;
        }

        // Broadcast to all active video listeners
        for (const listener of session.videoListeners) {
          try {
            listener(h264Data, isConfig, isKeyFrame, pts);
          } catch (e) {}
        }
      }
    });

    session.videoSocket.on('close', () => {
      console.log('[ScrcpyService] Video socket closed');
      if (session.isRunning) {
        session.isRunning = false;
        for (const cb of session.disconnectListeners) {
          try { cb(); } catch (e) {}
        }
      }
    });

    session.videoSocket.on('error', (err) => {
      console.error(`[ScrcpyService:Error] Video socket error: ${err.message}`);
    });
  }

  // ==========================================
  // Control Input Methods (Binary Protocol, <10ms latency)
  // ==========================================

  /**
   * Inject a touch event
   * Binary format: [type:1][action:1][pointerId:8BE][x:4BE][y:4BE][screenW:2BE][screenH:2BE][pressure:2BE][actionButton:4BE][buttons:4BE]
   * Total: 32 bytes
   */
  injectTouch(serial, action, x, y, pressure = 0xFFFF) {
    const session = this.sessions.get(serial);
    if (!session || !session.controlSocket || !session.isRunning) return false;

    const buf = Buffer.alloc(32);
    let offset = 0;

    buf.writeUInt8(CONTROL_MSG.INJECT_TOUCH_EVENT, offset); offset += 1;
    buf.writeUInt8(action, offset); offset += 1;
    buf.writeBigUInt64BE(POINTER_ID_FINGER, offset); offset += 8;
    buf.writeUInt32BE(Math.round(x), offset); offset += 4;
    buf.writeUInt32BE(Math.round(y), offset); offset += 4;
    buf.writeUInt16BE(session.deviceWidth, offset); offset += 2;
    buf.writeUInt16BE(session.deviceHeight, offset); offset += 2;
    buf.writeUInt16BE(action === MOTION_EVENT.ACTION_UP ? 0 : pressure, offset); offset += 2;
    buf.writeUInt32BE(0, offset); offset += 4; // actionButton
    buf.writeUInt32BE(0, offset); offset += 4; // buttons

    try {
      session.controlSocket.write(buf);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Send a tap (touch down + up)
   */
  sendTap(serial, x, y) {
    this.injectTouch(serial, MOTION_EVENT.ACTION_DOWN, x, y);
    // Small delay to simulate real tap
    setTimeout(() => {
      this.injectTouch(serial, MOTION_EVENT.ACTION_UP, x, y, 0);
    }, 20);
  }

  /**
   * Send a swipe (touch down + moves + up)
   */
  sendSwipe(serial, x1, y1, x2, y2, durationMs = 200) {
    const steps = Math.max(10, Math.round(durationMs / 16)); // ~60fps step rate
    const stepDelay = durationMs / steps;

    this.injectTouch(serial, MOTION_EVENT.ACTION_DOWN, x1, y1);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cx = x1 + (x2 - x1) * t;
      const cy = y1 + (y2 - y1) * t;

      setTimeout(() => {
        if (i < steps) {
          this.injectTouch(serial, MOTION_EVENT.ACTION_MOVE, cx, cy);
        } else {
          this.injectTouch(serial, MOTION_EVENT.ACTION_UP, cx, cy, 0);
        }
      }, i * stepDelay);
    }
  }

  /**
   * Send a scroll event
   * Binary format: [type:1][x:4BE][y:4BE][screenW:2BE][screenH:2BE][scrollH:4BE_float][scrollV:4BE_float][buttons:4BE]
   * Total: 25 bytes
   */
  sendScroll(serial, x, y, scrollH, scrollV) {
    const session = this.sessions.get(serial);
    if (!session || !session.controlSocket || !session.isRunning) return false;

    const buf = Buffer.alloc(25);
    let offset = 0;

    buf.writeUInt8(CONTROL_MSG.INJECT_SCROLL_EVENT, offset); offset += 1;
    buf.writeUInt32BE(Math.round(x), offset); offset += 4;
    buf.writeUInt32BE(Math.round(y), offset); offset += 4;
    buf.writeUInt16BE(session.deviceWidth, offset); offset += 2;
    buf.writeUInt16BE(session.deviceHeight, offset); offset += 2;

    // Write float as int32 (IEEE 754 representation)
    const hBuf = Buffer.alloc(4);
    hBuf.writeFloatBE(scrollH);
    hBuf.copy(buf, offset); offset += 4;

    const vBuf = Buffer.alloc(4);
    vBuf.writeFloatBE(scrollV);
    vBuf.copy(buf, offset); offset += 4;

    buf.writeUInt32BE(0, offset); offset += 4; // buttons

    try {
      session.controlSocket.write(buf);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Inject a key event
   * Binary format: [type:1][action:1][keycode:4BE][repeat:4BE][metastate:4BE]
   * Total: 14 bytes
   */
  injectKeycode(serial, action, keycode, repeat = 0, metastate = 0) {
    const session = this.sessions.get(serial);
    if (!session || !session.controlSocket || !session.isRunning) return false;

    const buf = Buffer.alloc(14);
    let offset = 0;

    buf.writeUInt8(CONTROL_MSG.INJECT_KEYCODE, offset); offset += 1;
    buf.writeUInt8(action, offset); offset += 1;
    buf.writeUInt32BE(keycode, offset); offset += 4;
    buf.writeUInt32BE(repeat, offset); offset += 4;
    buf.writeUInt32BE(metastate, offset); offset += 4;

    try {
      session.controlSocket.write(buf);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Send a key press (down + up)
   */
  sendKeyPress(serial, keycode) {
    this.injectKeycode(serial, KEY_EVENT.ACTION_DOWN, keycode);
    setTimeout(() => {
      this.injectKeycode(serial, KEY_EVENT.ACTION_UP, keycode);
    }, 20);
  }

  /**
   * Inject text via scrcpy
   * Binary format: [type:1][length:4BE][text:length bytes]
   */
  injectText(serial, text) {
    const session = this.sessions.get(serial);
    if (!session || !session.controlSocket || !session.isRunning) return false;

    const textBuf = Buffer.from(text, 'utf8');
    const maxLen = Math.min(textBuf.length, 300);
    const buf = Buffer.alloc(1 + 4 + maxLen);

    buf.writeUInt8(CONTROL_MSG.INJECT_TEXT, 0);
    buf.writeUInt32BE(maxLen, 1);
    textBuf.copy(buf, 5, 0, maxLen);

    try {
      session.controlSocket.write(buf);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Send back or screen on
   */
  sendBackOrScreenOn(serial) {
    const session = this.sessions.get(serial);
    if (!session || !session.controlSocket || !session.isRunning) return false;

    const buf = Buffer.alloc(2);
    buf.writeUInt8(CONTROL_MSG.BACK_OR_SCREEN_ON, 0);
    buf.writeUInt8(0, 1); // action (0 = back if screen is on)

    try {
      session.controlSocket.write(buf);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Add video data callback
   */
  onVideo(serial, callback) {
    const session = this.sessions.get(serial);
    if (session) {
      session.videoListeners.add(callback);
      // If we already have SPS/PPS cached, send it immediately to initialize the client decoder
      if (session.lastConfigPacket) {
        try {
          callback(session.lastConfigPacket, true, false, 0);
        } catch (e) {}
      }
    }
  }

  /**
   * Remove video data callback
   */
  offVideo(serial, callback) {
    const session = this.sessions.get(serial);
    if (session) {
      session.videoListeners.delete(callback);
    }
  }

  /**
   * Add disconnect callback
   */
  onDisconnect(serial, callback) {
    const session = this.sessions.get(serial);
    if (session) {
      session.disconnectListeners.add(callback);
    }
  }

  /**
   * Remove disconnect callback
   */
  offDisconnect(serial, callback) {
    const session = this.sessions.get(serial);
    if (session) {
      session.disconnectListeners.delete(callback);
    }
  }

  /**
   * Get session info
   */
  getSession(serial) {
    return this.sessions.get(serial);
  }

  /**
   * Check if a session is running
   */
  isSessionRunning(serial) {
    const session = this.sessions.get(serial);
    return session && session.isRunning;
  }

  /**
   * Stop a streaming session
   */
  async stopSession(serial) {
    const session = this.sessions.get(serial);
    if (!session) return;

    session.isRunning = false;
    await this._cleanupSession(session);
    this.sessions.delete(serial);
    console.log(`[ScrcpyService] Session stopped for ${serial}`);
  }

  async _cleanupSession(session) {
    session.isRunning = false;

    if (session.videoSocket) {
      try { session.videoSocket.destroy(); } catch (e) {}
      session.videoSocket = null;
    }

    if (session.controlSocket) {
      try { session.controlSocket.destroy(); } catch (e) {}
      session.controlSocket = null;
    }

    if (session.serverProcess) {
      try { session.serverProcess.kill(); } catch (e) {}
      session.serverProcess = null;
    }

    // Remove ADB forward
    if (session.localPort) {
      try {
        await adbService.execAdb(
          `${session.serial ? `-s ${session.serial} ` : ''}forward --remove tcp:${session.localPort}`
        );
      } catch (e) {}
    }
  }

  /**
   * Stop all sessions
   */
  async stopAll() {
    for (const [serial] of this.sessions) {
      await this.stopSession(serial);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ScrcpyService();
