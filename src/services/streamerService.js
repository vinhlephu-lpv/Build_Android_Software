/**
 * StreamerService - Unified screen mirroring & input control
 * 
 * Supports two modes:
 * 1. scrcpy mode (30-60 FPS H.264): Uses scrcpy-server hardware encoder
 * 2. legacy mode (1-2 FPS PNG): Falls back to adb screencap
 */

const adbService = require('./adbService');
const scrcpyService = require('./scrcpyService');

class StreamerService {
  constructor() {
    this.activeStreams = new Map(); // ws -> streamState
    this._sessionCleanupTimers = new Map(); // serial -> timer
  }

  /**
   * Start streaming for a device
   */
  async startStream(serial, ws, options = {}) {
    this.stopStream(ws);

    // Cancel pending session stop if any (e.g. user reloaded page)
    if (this._sessionCleanupTimers.has(serial)) {
      clearTimeout(this._sessionCleanupTimers.get(serial));
      this._sessionCleanupTimers.delete(serial);
    }

    const streamState = {
      serial,
      ws,
      mode: 'none',           // 'scrcpy' | 'legacy' | 'none'
      isRunning: true,
      deviceWidth: 1080,
      deviceHeight: 2400,
      videoCallback: null,
      disconnectCallback: null,
      // Legacy mode fields
      isCapturing: false,
      timer: null,
    };

    this.activeStreams.set(ws, streamState);

    // Fetch device info
    try {
      const info = await adbService.getDeviceInfo(serial);
      if (info && info.width && info.height) {
        streamState.deviceWidth = info.width;
        streamState.deviceHeight = info.height;
        this._sendJson(ws, { type: 'device_info', data: info });
      }
    } catch (e) {}

    // Try scrcpy mode first (30-60 FPS)
    if (scrcpyService.isAvailable()) {
      try {
        await this._startScrcpyStream(streamState, options);
        return;
      } catch (err) {
        console.warn(`[Streamer:Warn] scrcpy failed, falling back to legacy: ${err.message}`);
      }
    }

    // Fallback: legacy screencap mode (1-2 FPS)
    this._startLegacyStream(streamState, options);
  }

  /**
   * Start scrcpy-based H.264 streaming (30-60 FPS)
   */
  async _startScrcpyStream(streamState, options = {}) {
    const { serial, ws } = streamState;
    const maxFps = options.fps || 60;

    console.log(`[Streamer] Starting scrcpy H.264 stream for ${serial} @ ${maxFps}fps`);

    // Notify client we're using H.264 mode
    this._sendJson(ws, {
      type: 'stream_mode',
      mode: 'h264',
      message: 'scrcpy H.264 hardware encoder active'
    });

    // Start or reuse scrcpy session
    const sessionInfo = await scrcpyService.startSession(serial, {
      maxSize: 1024,
      maxFps,
      bitRate: options.bitRate || 8000000
    });

    if (!streamState.isRunning) {
      // Stream stopped while session was starting
      return;
    }

    streamState.mode = 'scrcpy';
    streamState.deviceWidth = sessionInfo.width;
    streamState.deviceHeight = sessionInfo.height;

    // Send updated device info
    this._sendJson(ws, {
      type: 'device_info',
      data: {
        width: sessionInfo.width,
        height: sessionInfo.height,
        deviceName: sessionInfo.deviceName,
        streamMode: 'h264'
      }
    });

    // Video callback
    streamState.videoCallback = (h264Data, isConfig, isKeyFrame, pts) => {
      if (!streamState.isRunning || ws.readyState !== 1) return;

      try {
        // Send frame metadata + H.264 data as binary
        // Protocol: [flags:1byte][pts:8bytes_BE][h264_data]
        const header = Buffer.alloc(9);
        let flags = 0;
        if (isConfig) flags |= 1;  // bit 0: config (SPS/PPS)
        if (isKeyFrame) flags |= 2; // bit 1: key frame
        header.writeUInt8(flags, 0);
        const ptsBigInt = BigInt(pts);
        header.writeBigUInt64BE(ptsBigInt, 1);

        const packet = Buffer.concat([header, h264Data]);
        ws.send(packet);
      } catch (e) {}
    };

    // Disconnect callback
    streamState.disconnectCallback = () => {
      if (streamState.isRunning) {
        console.log(`[Streamer] scrcpy disconnected for ${serial}, switching to legacy`);
        streamState.mode = 'none';
        this._sendJson(ws, { type: 'stream_mode', mode: 'image', message: 'Switched to screenshot mode' });
        this._startLegacyStream(streamState, options);
      }
    };

    scrcpyService.onVideo(serial, streamState.videoCallback);
    scrcpyService.onDisconnect(serial, streamState.disconnectCallback);
  }

  /**
   * Start legacy screencap streaming (fallback, 1-2 FPS)
   */
  _startLegacyStream(streamState, options = {}) {
    const { serial, ws } = streamState;
    const targetFps = options.fps || 15;
    const intervalMs = Math.round(1000 / targetFps);

    streamState.mode = 'legacy';

    console.log(`[Streamer] Starting legacy screencap stream for ${serial} @ ${targetFps}fps target`);

    this._sendJson(ws, {
      type: 'stream_mode',
      mode: 'image',
      message: 'Screenshot mode'
    });

    const captureLoop = async () => {
      if (!streamState.isRunning || ws.readyState !== 1) {
        return;
      }

      if (streamState.isCapturing) {
        streamState.timer = setTimeout(captureLoop, intervalMs);
        return;
      }

      streamState.isCapturing = true;
      try {
        const result = await adbService.takeScreenshot(serial);
        if (result.success && result.buffer && streamState.isRunning && ws.readyState === 1) {
          ws.send(result.buffer);
        }
      } catch (err) {
        // Silent retry
      } finally {
        streamState.isCapturing = false;
        if (streamState.isRunning && streamState.mode === 'legacy') {
          streamState.timer = setTimeout(captureLoop, intervalMs);
        }
      }
    };

    captureLoop();
  }

  /**
   * Stop streaming for a WebSocket client
   */
  stopStream(ws) {
    const streamState = this.activeStreams.get(ws);
    if (!streamState) return;

    streamState.isRunning = false;

    if (streamState.timer) {
      clearTimeout(streamState.timer);
    }

    // Unbind listeners from scrcpy
    if (streamState.mode === 'scrcpy' && streamState.serial) {
      if (streamState.videoCallback) {
        scrcpyService.offVideo(streamState.serial, streamState.videoCallback);
      }
      if (streamState.disconnectCallback) {
        scrcpyService.offDisconnect(streamState.serial, streamState.disconnectCallback);
      }

      // Check if any other client is still using this serial
      const serial = streamState.serial;
      let otherClients = 0;
      for (const [clientWs, state] of this.activeStreams) {
        if (clientWs !== ws && state.serial === serial && state.isRunning) {
          otherClients++;
        }
      }

      // If no other clients, schedule stop after 5s grace period (allows quick page reload without killing scrcpy-server)
      if (otherClients === 0) {
        const timer = setTimeout(() => {
          this._sessionCleanupTimers.delete(serial);
          let stillNoClients = true;
          for (const [, state] of this.activeStreams) {
            if (state.serial === serial && state.isRunning) {
              stillNoClients = false;
              break;
            }
          }
          if (stillNoClients) {
            scrcpyService.stopSession(serial).catch(() => {});
          }
        }, 5000);
        this._sessionCleanupTimers.set(serial, timer);
      }
    }

    this.activeStreams.delete(ws);
  }

  /**
   * Handle input messages from WebSocket clients
   */
  async handleInputMessage(ws, message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    const streamState = this.activeStreams.get(ws);
    const serial = data.serial || (streamState ? streamState.serial : '');
    const useScrcpy = streamState && streamState.mode === 'scrcpy' && scrcpyService.isSessionRunning(serial);

    switch (data.type) {
      case 'start_stream':
        this.startStream(data.serial, ws, { fps: data.fps || 60 });
        break;

      case 'stop_stream':
        this.stopStream(ws);
        break;

      case 'tap':
        if (data.x !== undefined && data.y !== undefined) {
          if (useScrcpy) {
            scrcpyService.sendTap(serial, data.x, data.y);
          } else {
            await adbService.sendTap(serial, data.x, data.y);
            this._captureAfterInput(streamState, 80);
          }
        }
        break;

      case 'swipe':
        if (data.x1 !== undefined && data.y1 !== undefined && data.x2 !== undefined && data.y2 !== undefined) {
          if (useScrcpy) {
            scrcpyService.sendSwipe(serial, data.x1, data.y1, data.x2, data.y2, data.duration || 200);
          } else {
            await adbService.sendSwipe(serial, data.x1, data.y1, data.x2, data.y2, data.duration || 200);
            this._captureAfterInput(streamState, (data.duration || 200) + 80);
          }
        }
        break;

      case 'scroll':
        if (data.x !== undefined && data.y !== undefined && useScrcpy) {
          scrcpyService.sendScroll(serial, data.x, data.y, data.scrollH || 0, data.scrollV || 0);
        } else if (data.x !== undefined && data.y !== undefined) {
          const scrollAmount = (data.scrollV || 0) * 300;
          const y2 = Math.max(100, Math.min(2300, data.y - scrollAmount));
          await adbService.sendSwipe(serial, data.x, data.y, data.x, y2, 150);
          this._captureAfterInput(streamState, 200);
        }
        break;

      case 'touch_down':
        if (data.x !== undefined && data.y !== undefined && useScrcpy) {
          scrcpyService.injectTouch(serial, 0, data.x, data.y);
        }
        break;

      case 'touch_move':
        if (data.x !== undefined && data.y !== undefined && useScrcpy) {
          scrcpyService.injectTouch(serial, 2, data.x, data.y);
        }
        break;

      case 'touch_up':
        if (data.x !== undefined && data.y !== undefined && useScrcpy) {
          scrcpyService.injectTouch(serial, 1, data.x, data.y);
        }
        break;

      case 'key':
        if (data.keycode !== undefined) {
          if (useScrcpy) {
            scrcpyService.sendKeyPress(serial, data.keycode);
          } else {
            await adbService.sendKeyEvent(serial, data.keycode);
            this._captureAfterInput(streamState, 80);
          }
        }
        break;

      case 'text':
        if (data.text) {
          if (useScrcpy) {
            scrcpyService.injectText(serial, data.text);
          } else {
            await adbService.sendText(serial, data.text);
            this._captureAfterInput(streamState, 100);
          }
        }
        break;

      case 'back':
        if (useScrcpy) {
          scrcpyService.sendBackOrScreenOn(serial);
        } else {
          await adbService.sendKeyEvent(serial, 4); // KEYCODE_BACK
          this._captureAfterInput(streamState, 80);
        }
        break;
    }
  }

  _captureAfterInput(streamState, delayMs = 50) {
    if (streamState && streamState.mode === 'legacy' && !streamState.isCapturing) {
      setTimeout(async () => {
        if (!streamState.isRunning || streamState.ws.readyState !== 1) return;
        try {
          const result = await adbService.takeScreenshot(streamState.serial);
          if (result.success && result.buffer && streamState.isRunning) {
            streamState.ws.send(result.buffer);
          }
        } catch (e) {}
      }, delayMs);
    }
  }

  _sendJson(ws, obj) {
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(obj));
      } catch (e) {}
    }
  }
}

module.exports = new StreamerService();
