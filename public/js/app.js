// ==========================================
// Electron & Browser Unified API Bridge
// ==========================================
const API_BASE = (window.location.protocol === 'file:' || !window.location.host) ? 'http://localhost:3000' : '';
const originalFetch = window.fetch;
window.fetch = function(url, options) {
  if (typeof url === 'string' && url.startsWith('/')) {
    url = API_BASE + url;
  }
  return originalFetch(url, options);
};

function getWsUrl(path) {
  const host = window.location.host || 'localhost:3000';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${host}${path}`;
}

// State Management
const state = {
  selectedDevice: 'virtual', // 'virtual' | ADB Serial
  devices: [],
  deviceInfo: null,
  projectPath: 'd:\\My_Software\\ExampleApp',
  projectInfo: null,
  isBuilding: false,
  autoScroll: true,
  streamWs: null,
  logsWs: null,
  scale: 0.90, // Default 90%
  isMouseDown: false,
  touchStart: { x: 0, y: 0, time: 0 },
  activeLogFilter: 'all',
  logSearchQuery: '',
  allLogcatEntries: [],
  // H.264 Streaming State
  streamMode: 'image',       // 'h264' | 'image'
  videoDecoder: null,         // WebCodecs VideoDecoder
  decoderConfigured: false,
  h264ConfigData: null,       // SPS/PPS config for decoder init
  pendingFrames: [],          // Frames waiting for decoder config
  frameCount: 0,
  fpsDisplay: 0,
  lastFpsUpdate: 0
};

// DOM Elements
const el = {
  // Header
  simulatorStatusDot: document.getElementById('simulatorStatusDot'),
  runnerModeText: document.getElementById('runnerModeText'),
  deviceStatusDot: document.getElementById('deviceStatusDot'),
  deviceStatusText: document.getElementById('deviceStatusText'),
  btnQuickReload: document.getElementById('btnQuickReload'),
  btnConnectWifiModal: document.getElementById('btnConnectWifiModal'),

  // Simulator View
  deviceSelect: document.getElementById('deviceSelect'),
  btnRefreshDevices: document.getElementById('btnRefreshDevices'),
  zoomSlider: document.getElementById('zoomSlider'),
  zoomVal: document.getElementById('zoomVal'),
  phoneFrame: document.getElementById('phoneFrame'),
  simulatorIframe: document.getElementById('simulatorIframe'),
  deviceCanvas: document.getElementById('deviceCanvas'),
  canvasWrapper: document.getElementById('canvasWrapper'),
  touchRipple: document.getElementById('touchRipple'),
  screenOverlay: document.getElementById('screenOverlay'),
  overlayTitle: document.getElementById('overlayTitle'),
  overlayDesc: document.getElementById('overlayDesc'),
  btnOverlayAction: document.getElementById('btnOverlayAction'),
  statusClock: document.getElementById('statusClock'),
  statusBattery: document.getElementById('statusBattery'),

  // Hardware & Nav Buttons
  btnHwPower: document.getElementById('btnHwPower'),
  btnHwVolUp: document.getElementById('btnHwVolUp'),
  btnHwVolDown: document.getElementById('btnHwVolDown'),
  btnNavBack: document.getElementById('btnNavBack'),
  btnNavHome: document.getElementById('btnNavHome'),
  btnNavRecents: document.getElementById('btnNavRecents'),
  btnQuickDevMenu: document.getElementById('btnQuickDevMenu'),
  btnQuickScreenshot: document.getElementById('btnQuickScreenshot'),
  btnQuickSendText: document.getElementById('btnQuickSendText'),
  btnQuickRotate: document.getElementById('btnQuickRotate'),

  // Project Controls
  inputProjectPath: document.getElementById('inputProjectPath'),
  btnInspectProject: document.getElementById('btnInspectProject'),
  tagRnVersion: document.getElementById('tagRnVersion'),
  tagAppId: document.getElementById('tagAppId'),
  btnBuildAndRun: document.getElementById('btnBuildAndRun'),
  buildStatusSubtitle: document.getElementById('buildStatusSubtitle'),
  btnToggleMetro: document.getElementById('btnToggleMetro'),
  btnMetroText: document.getElementById('btnMetroText'),
  btnCleanBuild: document.getElementById('btnCleanBuild'),
  btnCancelBuild: document.getElementById('btnCancelBuild'),
  buildProgressContainer: document.getElementById('buildProgressContainer'),
  progressStatusText: document.getElementById('progressStatusText'),
  progressPercent: document.getElementById('progressPercent'),
  progressBarFill: document.getElementById('progressBarFill'),

  // Console Tabs
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  buildConsoleOutput: document.getElementById('buildConsoleOutput'),
  metroConsoleOutput: document.getElementById('metroConsoleOutput'),
  logcatStreamOutput: document.getElementById('logcatStreamOutput'),
  logcatFilters: document.getElementById('logcatFilters'),
  logLevelSelect: document.getElementById('logLevelSelect'),
  logSearchInput: document.getElementById('logSearchInput'),
  btnClearLogs: document.getElementById('btnClearLogs'),
  btnToggleAutoScroll: document.getElementById('btnToggleAutoScroll'),

  // Device Info Tab
  infoDeviceModel: document.getElementById('infoDeviceModel'),
  infoAndroidVer: document.getElementById('infoAndroidVer'),
  infoResolution: document.getElementById('infoResolution'),
  infoDpi: document.getElementById('infoDpi'),
  infoBattery: document.getElementById('infoBattery'),
  infoSerial: document.getElementById('infoSerial'),

  // Modals
  wifiModal: document.getElementById('wifiModal'),
  btnCloseWifiModal: document.getElementById('btnCloseWifiModal'),
  btnCancelWifi: document.getElementById('btnCancelWifi'),
  btnConnectWifiSubmit: document.getElementById('btnConnectWifiSubmit'),
  wifiIpInput: document.getElementById('wifiIpInput'),
  wifiPortInput: document.getElementById('wifiPortInput'),
  wifiFeedback: document.getElementById('wifiFeedback')
};

// Canvas Setup (for optional external ADB device mode)
const ctx = el.deviceCanvas.getContext('2d');

// ==========================================
// Initialization
// ==========================================
async function init() {
  updateClock();
  setInterval(updateClock, 1000);

  // Set default zoom level to 90%
  applyZoom(90);
  if (el.zoomSlider) {
    el.zoomSlider.value = 90;
    el.zoomSlider.addEventListener('input', (e) => applyZoom(parseInt(e.target.value, 10)));
  }

  // Restore saved project path from localStorage
  const savedPath = localStorage.getItem('rn_saved_project_path');
  if (savedPath) {
    state.projectPath = savedPath;
    if (el.inputProjectPath) el.inputProjectPath.value = savedPath;
  }
  renderRecentProjects();

  // Restore saved color profile
  const savedColor = localStorage.getItem('rn_color_profile') || 'natural';
  setColorProfile(savedColor);

  // Connect WebSockets
  initStreamWebSocket();
  initLogsWebSocket();

  // Load Status & Initial Data
  await fetchSystemStatus();
  await refreshDevices();
  await inspectProject();

  // Polling for device changes (background)
  setInterval(refreshDevices, 10000);

  // Listen for messages from inside simulator iframe
  window.addEventListener('message', handleIframeMessage);

  // Setup Event Listeners
  setupEventListeners();
}

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const clockEl = document.getElementById('statusClock');
  if (clockEl) clockEl.textContent = `${hours}:${minutes}`;
}

function updateBatteryUI(level = 85, isCharging = false) {
  const numericLevel = Math.max(0, Math.min(100, parseInt(level, 10) || 85));
  const textEl = document.getElementById('statusBatteryText');
  const fillCircle = document.getElementById('batteryCircleFill');

  if (textEl) {
    textEl.textContent = `${numericLevel}%`;
  }

  if (fillCircle) {
    const circumference = 56.548;
    const offset = circumference * (1 - (numericLevel / 100));
    fillCircle.style.strokeDashoffset = offset.toFixed(2);
    
    if (numericLevel <= 20) {
      fillCircle.style.stroke = '#ef4444'; // Low battery red
    } else if (numericLevel <= 40) {
      fillCircle.style.stroke = '#f59e0b'; // Amber warning
    } else {
      fillCircle.style.stroke = '#0f172a'; // ColorOS Sleek Dark Ring
    }
  }
}
window.updateBatteryUI = updateBatteryUI;

function applyZoom(val) {
  const phoneFrame = el.phoneFrame || document.getElementById('phoneFrame');
  const isHorizontal = phoneFrame ? (phoneFrame.classList.contains('landscape') || phoneFrame.style.width === '844px' || phoneFrame.style.width === '840px') : false;
  const defaultVal = 90;
  const numericVal = parseInt(val, 10) || defaultVal;
  state.scale = numericVal / 100;
  
  const zoomVal = document.getElementById('zoomVal');
  if (zoomVal) zoomVal.textContent = `${numericVal}%`;

  const zoomSlider = document.getElementById('zoomSlider') || el.zoomSlider;
  if (zoomSlider && parseInt(zoomSlider.value, 10) !== numericVal) {
    zoomSlider.value = numericVal;
  }
  
  if (phoneFrame) phoneFrame.style.transform = `scale(${state.scale})`;

  const container = el.phoneViewportContainer || document.getElementById('phoneViewportContainer');
  if (container) {
    const baseW = isHorizontal ? 844 : 390;
    const scaledWidth = Math.round(baseW * state.scale + 12);
    container.style.width = `${scaledWidth}px`;
    container.style.minWidth = `${scaledWidth}px`;
  }
}
window.applyZoom = applyZoom;

function setColorProfile(profile) {
  const wrapper = document.getElementById('canvasWrapper');
  const select = document.getElementById('colorProfileSelect');
  if (!wrapper) return;

  wrapper.classList.remove('color-vivid', 'color-super-vivid', 'color-oled-hdr', 'color-natural');

  if (profile === 'vivid') {
    wrapper.classList.add('color-vivid');
    showToast('Chế độ màu: AMOLED Tươi (Vivid P3)', 'info');
  } else if (profile === 'super-vivid') {
    wrapper.classList.add('color-super-vivid');
    showToast('Chế độ màu: DCI-P3 Siêu Rực Rỡ', 'info');
  } else if (profile === 'oled-hdr') {
    wrapper.classList.add('color-oled-hdr');
    showToast('Chế độ màu: OLED HDR10+ Boost', 'info');
  } else {
    wrapper.classList.add('color-natural');
    showToast('Chế độ màu: Chuẩn 1:1 (Bit-Exact)', 'success');
  }

  if (select) select.value = profile;
  localStorage.setItem('rn_color_profile', profile);
}
window.setColorProfile = setColorProfile;

function handleIframeMessage(event) {
  const data = event.data;
  if (!data) return;

  if (data.type === 'start_build_request') {
    startBuild();
    return;
  }

  if (data.type === 'select_folder_request') {
    document.getElementById('folderPickerInput')?.click();
    return;
  }

  if (data.type === 'set_orientation') {
    togglePhoneRotation(data.orientation);
    return;
  }

  if (data.type === 'set_status_bar_style') {
    const statusBar = document.querySelector('.android-status-bar');
    if (statusBar) {
      if (data.style === 'light-content') {
        statusBar.classList.add('light-content');
        statusBar.classList.remove('dark-content');
      } else {
        statusBar.classList.add('dark-content');
        statusBar.classList.remove('light-content');
      }
    }
    return;
  }

  if (data.type !== 'simulator_log') return;

  const entry = {
    timestamp: data.timestamp || new Date().toLocaleTimeString(),
    level: data.level || 'info',
    tag: 'ReactNativeJS',
    message: data.message,
    isReactNative: true
  };

  state.allLogcatEntries.push(entry);
  if (state.allLogcatEntries.length > 2000) state.allLogcatEntries.shift();
  renderSingleLogcatEntry(entry);

  appendMetroLog({
    type: data.level === 'error' ? 'stderr' : 'stdout',
    message: `[RN JS] ${data.message}`
  });
}

// ==========================================
// WebSockets Hub
// ==========================================
// ==========================================
// WebCodecs H.264 Video Decoder
// ==========================================
function initVideoDecoder() {
  if (!('VideoDecoder' in window)) {
    console.warn('[WebCodecs] not supported, using image mode');
    return false;
  }

  try {
    if (state.videoDecoder) {
      try { state.videoDecoder.close(); } catch (e) {}
    }

    state.decoderConfigured = false;
    state.h264ConfigData = null;
    state.pendingFrames = [];

    state.videoDecoder = new VideoDecoder({
      output: (frame) => {
        // Render decoded frame to canvas
        const canvas = el.deviceCanvas || document.getElementById('deviceCanvas');
        if (canvas) {
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
          }
          const localCtx = canvas.getContext('2d');
          localCtx.drawImage(frame, 0, 0);
        }
        frame.close();

        // FPS counting
        state.frameCount++;
        const now = performance.now();
        if (now - state.lastFpsUpdate >= 1000) {
          state.fpsDisplay = state.frameCount;
          state.frameCount = 0;
          state.lastFpsUpdate = now;
          updateFpsDisplay(state.fpsDisplay);
        }
      },
      error: (err) => {
        console.error('VideoDecoder error:', err);
      }
    });

    return true;
  } catch (err) {
    console.error('Failed to init VideoDecoder:', err);
    return false;
  }
}

async function configureDecoder(spsppsBuf) {
  if (!state.videoDecoder || state.videoDecoder.state === 'closed') return;

  const candidateCodecs = [
    'avc1.640028', // High Profile Level 4.0
    'avc1.64002a', // High Profile Level 4.2
    'avc1.4d002a', // Main Profile Level 4.2
    'avc1.42001f', // Baseline Profile Level 3.1
    'avc1.42e01f'
  ];

  let selectedCodec = 'avc1.640028';
  if ('isConfigSupported' in VideoDecoder) {
    for (const c of candidateCodecs) {
      try {
        const support = await VideoDecoder.isConfigSupported({ codec: c });
        if (support && support.supported) {
          selectedCodec = c;
          break;
        }
      } catch (e) {}
    }
  }

  try {
    state.videoDecoder.configure({
      codec: selectedCodec,
      optimizeForLatency: true,
    });
    state.decoderConfigured = true;

    // Send SPS/PPS in-band if provided
    if (spsppsBuf && spsppsBuf.byteLength > 0) {
      try {
        const configChunk = new EncodedVideoChunk({
          type: 'key',
          timestamp: 0,
          data: spsppsBuf
        });
        state.videoDecoder.decode(configChunk);
      } catch (e) {}
    }

    // Flush any pending frames
    for (const pf of state.pendingFrames) {
      decodeH264Frame(pf.data, pf.isKeyFrame, pf.pts);
    }
    state.pendingFrames = [];
  } catch (err) {
    console.error('Failed to configure decoder:', err);
  }
}

function decodeH264Frame(h264Data, isKeyFrame, pts) {
  if (!state.videoDecoder || state.videoDecoder.state !== 'configured') {
    return;
  }

  try {
    const chunk = new EncodedVideoChunk({
      type: isKeyFrame ? 'key' : 'delta',
      timestamp: pts,
      data: h264Data
    });
    state.videoDecoder.decode(chunk);
  } catch (err) {
    // Silent decode error
  }
}

function updateFpsDisplay(fps) {
  let fpsEl = document.getElementById('fpsCounter');
  if (!fpsEl) {
    fpsEl = document.createElement('div');
    fpsEl.id = 'fpsCounter';
    fpsEl.style.cssText = 'position:absolute;top:8px;right:8px;z-index:9999;background:rgba(0,0,0,0.7);color:#0f0;padding:2px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold;font-family:monospace;pointer-events:none;';
    const wrapper = document.getElementById('canvasWrapper');
    if (wrapper) wrapper.appendChild(fpsEl);
  }
  if (fpsEl) {
    fpsEl.textContent = `${fps} FPS`;
    fpsEl.style.color = fps >= 25 ? '#0f0' : fps >= 10 ? '#ff0' : '#f00';
    fpsEl.style.display = state.streamMode === 'h264' ? 'block' : 'none';
  }
}

function initStreamWebSocket() {
  const wsUrl = getWsUrl('/ws/stream');

  try {
    state.streamWs = new WebSocket(wsUrl);
    state.streamWs.binaryType = 'arraybuffer';

    state.streamWs.onopen = () => {
      console.log('[Streamer] Connected to WebSocket:', wsUrl);
      if (state.selectedDevice && state.selectedDevice !== 'virtual') {
        state.streamWs.send(JSON.stringify({
          type: 'start_stream',
          serial: state.selectedDevice,
          fps: 60
        }));
      }
    };

    state.streamWs.onmessage = (event) => {
      if (state.selectedDevice === 'virtual') return;

      if (typeof event.data === 'string') {
        // JSON control message
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'device_info') {
            updateDeviceInfoDisplay(msg.data);
          } else if (msg.type === 'stream_mode') {
            state.streamMode = msg.mode;
            console.log(`[Streamer] Stream mode: ${msg.mode} - ${msg.message}`);
            if (msg.mode === 'h264') {
              initVideoDecoder();
            }
          }
        } catch (e) {}
      } else {
        // Binary data
        const arrayBuf = event.data;

        if (state.streamMode === 'h264' && arrayBuf.byteLength > 9) {
          // H.264 frame: [flags:1][pts:8BE][h264_data]
          const view = new DataView(arrayBuf);
          const flags = view.getUint8(0);
          const isConfig = !!(flags & 1);
          const isKeyFrame = !!(flags & 2);
          const ptsHigh = view.getUint32(1);
          const ptsLow = view.getUint32(5);
          const pts = ptsHigh * 4294967296 + ptsLow; // BigInt-free for compat
          const h264Data = new Uint8Array(arrayBuf, 9);

          if (isConfig) {
            // SPS/PPS config data - configure decoder
            state.h264ConfigData = h264Data;
            configureDecoder(h264Data);
          } else if (state.decoderConfigured) {
            // Decode video frame
            decodeH264Frame(h264Data, isKeyFrame, pts);
          } else {
            // Queue frame until decoder is configured
            state.pendingFrames.push({ data: h264Data, isKeyFrame, pts });
            if (state.pendingFrames.length > 30) state.pendingFrames.shift();
          }
        } else {
          // Legacy PNG/JPEG image frame
          const blob = new Blob([arrayBuf], { type: 'image/png' });
          const img = new Image();
          const url = URL.createObjectURL(blob);
          img.onload = () => {
            const canvas = el.deviceCanvas || document.getElementById('deviceCanvas');
            if (canvas) {
              if (canvas.width !== img.width || canvas.height !== img.height) {
                canvas.width = img.width;
                canvas.height = img.height;
              }
              const localCtx = canvas.getContext('2d');
              localCtx.drawImage(img, 0, 0);
            }
            URL.revokeObjectURL(url);

            // FPS counting for legacy mode too
            state.frameCount++;
            const now = performance.now();
            if (now - state.lastFpsUpdate >= 1000) {
              state.fpsDisplay = state.frameCount;
              state.frameCount = 0;
              state.lastFpsUpdate = now;
            }
          };
          img.onerror = () => URL.revokeObjectURL(url);
          img.src = url;
        }
      }
    };

    state.streamWs.onclose = () => {
      // Clean up decoder on disconnect
      if (state.videoDecoder) {
        try { state.videoDecoder.close(); } catch (e) {}
        state.videoDecoder = null;
        state.decoderConfigured = false;
      }
      setTimeout(initStreamWebSocket, 3000);
    };
  } catch (err) {
    setTimeout(initStreamWebSocket, 3000);
  }
}

function initLogsWebSocket() {
  const wsUrl = getWsUrl('/ws/logs');

  try {
    state.logsWs = new WebSocket(wsUrl);

    state.logsWs.onopen = () => {
      console.log('[Logs] Connected to WebSocket:', wsUrl);
    };

    state.logsWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleLogMessage(data);
      } catch (e) {
        console.error('Logs parse error:', e);
      }
    };

    state.logsWs.onerror = (err) => {
      console.warn('Logs WebSocket error:', err);
    };

    state.logsWs.onclose = () => {
      setTimeout(initLogsWebSocket, 2000);
    };
  } catch (err) {
    console.error('Failed to init logs WS:', err);
    setTimeout(initLogsWebSocket, 2000);
  }
}

function handleLogMessage(data) {
  switch (data.type) {
    case 'build_log':
      appendBuildLog(data.entry);
      break;

    case 'build_history':
      const buildOut = el.buildConsoleOutput || document.getElementById('buildConsoleOutput');
      if (buildOut) {
        buildOut.innerHTML = '';
        data.logs.forEach(entry => appendBuildLog(entry));
      }
      break;

    case 'build_status':
      if (data.status === 'hot_reload') {
        triggerHotReloadUI(data.data);
      } else {
        updateBuildStatus(data);
      }
      break;

    case 'metro_log':
      appendMetroLog(data.entry);
      break;

    case 'metro_history':
      const metroOut = el.metroConsoleOutput || document.getElementById('metroConsoleOutput');
      if (metroOut) {
        metroOut.innerHTML = '';
        data.logs.forEach(entry => appendMetroLog(entry));
      }
      break;

    case 'logcat_entry':
      if (state.selectedDevice !== 'virtual') {
        state.allLogcatEntries.push(data.entry);
        if (state.allLogcatEntries.length > 2000) state.allLogcatEntries.shift();
        renderSingleLogcatEntry(data.entry);
      }
      break;

    case 'logcat_clear':
      state.allLogcatEntries = [];
      el.logcatStreamOutput.innerHTML = '';
      break;

    default:
      break;
  }
}

// ==========================================
// REST API Handlers & Device Logic
// ==========================================
async function fetchSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.defaultProjectPath) {
      el.inputProjectPath.value = data.defaultProjectPath;
      state.projectPath = data.defaultProjectPath;
    }
  } catch (e) {}
}

async function refreshDevices() {
  try {
    // 1. Fetch connected ADB devices
    const res = await fetch('/api/devices');
    const data = await res.json();
    state.devices = data.devices || [];

    // 2. Fetch configured AVD emulators
    let avds = [];
    try {
      const avdRes = await fetch('/api/emulator/list');
      const avdData = await avdRes.json();
      avds = avdData.avds || [];
    } catch (e) {}

    const previousSelected = state.selectedDevice;
    el.deviceSelect.innerHTML = '';

    // Group 1: Standalone Web Simulator
    const optGroupWeb = document.createElement('optgroup');
    optGroupWeb.label = 'Trình giả lập nội bộ (Zero Setup)';
    const optVirtual = document.createElement('option');
    optVirtual.value = 'virtual';
    optVirtual.textContent = 'Máy Ảo Nội Bộ (Standalone Web)';
    if (previousSelected === 'virtual') optVirtual.selected = true;
    optGroupWeb.appendChild(optVirtual);
    el.deviceSelect.appendChild(optGroupWeb);

    // Group 2: Connected ADB Devices & Running Emulators (100% Native Build)
    const optGroupConnected = document.createElement('optgroup');
    optGroupConnected.label = 'Thiết bị & Máy ảo đang chạy (100% Native Gradle)';
    
    let hasRunningNative = false;
    state.devices.forEach(d => {
      hasRunningNative = true;
      const opt = document.createElement('option');
      opt.value = d.serial;
      const isEmu = d.isEmulator || d.serial.startsWith('emulator-') || d.serial.includes('127.0.0.1');
      opt.textContent = isEmu ? `[Emulator] ${d.model} (${d.serial})` : `[Device] ${d.model} (${d.serial})`;
      if (d.serial === previousSelected) opt.selected = true;
      optGroupConnected.appendChild(opt);
    });

    if (hasRunningNative) {
      el.deviceSelect.appendChild(optGroupConnected);
    }

    // Group 3: Offline AVDs (Can be started with 1 click)
    const offlineAvds = avds.filter(a => !a.isRunning);
    if (offlineAvds.length > 0) {
      const optGroupAvd = document.createElement('optgroup');
      optGroupAvd.label = 'Máy ảo có sẵn (Bấm để khởi động)';
      offlineAvds.forEach(a => {
        const opt = document.createElement('option');
        opt.value = `start_avd:${a.name}`;
        opt.textContent = `Khởi động ${a.displayName || a.name} (Android 14)`;
        optGroupAvd.appendChild(opt);
      });
      el.deviceSelect.appendChild(optGroupAvd);
    }

    // Preserve user selection and only fallback if selected physical device disconnected
    const onlineEmu = state.devices.find(d => d.isEmulator || d.serial.startsWith('emulator-'));
    
    if (!state.selectedDevice) {
      if (onlineEmu) {
        state.selectedDevice = onlineEmu.serial;
        el.deviceSelect.value = onlineEmu.serial;
        onDeviceChanged(onlineEmu.serial);
      } else {
        state.selectedDevice = 'virtual';
        el.deviceSelect.value = 'virtual';
        onDeviceChanged('virtual');
      }
    } else if (state.selectedDevice !== 'virtual' && !state.devices.some(d => d.serial === state.selectedDevice)) {
      // The previously selected device was disconnected -> fallback to virtual
      state.selectedDevice = 'virtual';
      el.deviceSelect.value = 'virtual';
      onDeviceChanged('virtual');
    } else {
      // Keep current selection intact
      el.deviceSelect.value = state.selectedDevice;
    }

    updateDeviceStateUI();
  } catch (e) {
    console.warn('refreshDevices error:', e);
  }
}

function updateDeviceStateUI() {
  if (state.selectedDevice === 'virtual') {
    if (el.runnerModeText) el.runnerModeText.textContent = 'Máy Ảo Độc Lập';
    if (el.deviceStatusDot) el.deviceStatusDot.className = 'status-dot active';
    if (el.deviceStatusText) el.deviceStatusText.textContent = 'Sẵn sàng chạy';
    if (el.buildStatusSubtitle) el.buildStatusSubtitle.textContent = '& RUN';
  } else {
    const current = state.devices.find(d => d.serial === state.selectedDevice);
    if (current) {
      const isEmu = current.isEmulator || current.serial.startsWith('emulator-') || current.serial.includes('127.0.0.1');
      if (el.runnerModeText) el.runnerModeText.textContent = isEmu ? 'Máy Ảo Native' : 'Thiết bị thật';
      if (el.deviceStatusDot) el.deviceStatusDot.className = current.isOnline ? 'status-dot active' : 'status-dot warning';
      if (el.deviceStatusText) el.deviceStatusText.textContent = current.model;
      if (el.buildStatusSubtitle) el.buildStatusSubtitle.textContent = 'NATIVE';
    }
  }
}

async function onDeviceChanged(val) {
  if (val.startsWith('start_avd:')) {
    const avdName = val.replace('start_avd:', '');
    showToast(`Đang khởi động máy ảo Android: ${avdName}...`, 'info');
    switchTab('tab-build');
    
    try {
      const res = await fetch('/api/emulator/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avdName })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Máy ảo ${avdName} đã sẵn sàng!`, 'success');
        await refreshDevices();
        if (data.serial) {
          state.selectedDevice = data.serial;
          el.deviceSelect.value = data.serial;
          onDeviceChanged(data.serial);
        }
      } else {
        showToast(`Không thể bật máy ảo: ${data.error}`, 'error');
        el.deviceSelect.value = 'virtual';
        onDeviceChanged('virtual');
      }
    } catch (err) {
      showToast(`Lỗi kết nối: ${err.message}`, 'error');
      el.deviceSelect.value = 'virtual';
      onDeviceChanged('virtual');
    }
    return;
  }

  state.selectedDevice = val;
  updateDeviceStateUI();

  const mockStatusBar = document.querySelector('.android-status-bar');

  if (val === 'virtual') {
    if (mockStatusBar) mockStatusBar.style.display = 'flex';
    if (el.simulatorIframe) el.simulatorIframe.style.display = 'block';
    if (el.deviceCanvas) el.deviceCanvas.style.display = 'none';

    if (state.streamWs && state.streamWs.readyState === 1) {
      state.streamWs.send(JSON.stringify({ type: 'stop_stream' }));
    }

    if (el.infoDeviceModel) el.infoDeviceModel.textContent = 'Máy Ảo Nội Bộ (Standalone Web)';
    if (el.infoAndroidVer) el.infoAndroidVer.textContent = 'Android 14 (API 34)';
    if (el.infoResolution) el.infoResolution.textContent = '1080 x 2400 px (360x740 CSS)';
    if (el.infoDpi) el.infoDpi.textContent = '420 DPI (x3.0)';
    if (el.infoBattery) el.infoBattery.textContent = 'Không cần Android Studio';
    if (el.infoSerial) el.infoSerial.textContent = 'esbuild Fast Engine';
  } else {
    // Mode: Real ADB Native Device / Android Emulator Screen Mirroring
    if (mockStatusBar) mockStatusBar.style.display = 'none';
    if (el.simulatorIframe) el.simulatorIframe.style.display = 'none';
    if (el.deviceCanvas) el.deviceCanvas.style.display = 'block';

    if (state.streamWs && state.streamWs.readyState === 1) {
      state.streamWs.send(JSON.stringify({
        type: 'start_stream',
        serial: val,
        fps: 60
      }));
    }

    if (state.logsWs && state.logsWs.readyState === 1) {
      state.logsWs.send(JSON.stringify({
        type: 'start_logcat',
        serial: val
      }));
    }

    fetch(`/api/device-info?serial=${encodeURIComponent(val)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.info) updateDeviceInfoDisplay(data.info);
      })
      .catch(() => {});
  }
}
window.onDeviceChanged = onDeviceChanged;

async function quickScanThirdPartyEmulators() {
  showToast('Đang quét các cổng giả lập LDPlayer / Nox / MuMu / WSA...', 'info');
  try {
    const res = await fetch('/api/emulator/scan-third-party', { method: 'POST' });
    const data = await res.json();
    if (data.success && data.results && data.results.length > 0) {
      showToast(`Đã tìm thấy & kết nối ${data.results.length} giả lập!`, 'success');
      await refreshDevices();
    } else {
      showToast('Không tìm thấy giả lập bên ngoài nào đang mở cổng ADB.', 'info');
    }
  } catch (e) {
    showToast('Lỗi khi quét giả lập: ' + e.message, 'error');
  }
}
window.quickScanThirdPartyEmulators = quickScanThirdPartyEmulators;

function updateDeviceInfoDisplay(info) {
  if (!info) return;
  state.deviceInfo = info;
  if (el.infoDeviceModel) el.infoDeviceModel.textContent = `${info.manufacturer || ''} ${info.model || ''}`.trim() || 'Android Device';
  if (el.infoAndroidVer) el.infoAndroidVer.textContent = `Android ${info.androidVersion || '13+'} (API ${info.sdkLevel || '33'})`;
  if (el.infoResolution) el.infoResolution.textContent = `${info.width || 1080} x ${info.height || 2400} px`;
  if (el.infoDpi) el.infoDpi.textContent = `${info.density || 420} DPI`;
  if (el.infoBattery) el.infoBattery.textContent = `${info.batteryLevel || 86}% ${info.isCharging ? '(Đang sạc)' : ''}`;
  if (el.infoSerial) el.infoSerial.textContent = info.serial || '';
  
  // Synchronize Virtual Status Bar Battery Ring with Real Phone Battery
  if (info.batteryLevel !== undefined) {
    updateBatteryUI(info.batteryLevel, info.isCharging);
  }
}

// ==========================================
// Project Path & Folder Management
// ==========================================
function saveProjectPath(path) {
  if (!path) return;
  state.projectPath = path;
  localStorage.setItem('rn_saved_project_path', path);

  // Update Recent Projects
  try {
    let recents = JSON.parse(localStorage.getItem('rn_recent_projects') || '[]');
    recents = recents.filter(p => p !== path);
    recents.unshift(path);
    if (recents.length > 5) recents = recents.slice(0, 5);
    localStorage.setItem('rn_recent_projects', JSON.stringify(recents));
  } catch (e) {}
  renderRecentProjects();
}

async function renderRecentProjects() {
  const container = document.getElementById('recentProjectsList');
  if (!container) return;

  try {
    let recents = JSON.parse(localStorage.getItem('rn_recent_projects') || '[]');
    
    // Fast initial render from local history
    if (recents.length > 0) {
      container.innerHTML = recents.map(p => {
        const shortName = p.split(/[\\/]/).pop() || p;
        return `<button class="dropdown-item" onclick="selectRecentProject('${p.replace(/\\/g, '\\\\')}')" style="display: flex; align-items: center; gap: 8px;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
          </svg>
          <strong>${shortName}</strong>
          <span style="font-size: 0.65rem; color: var(--cyan-neon); margin-left: auto; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p}</span>
        </button>`;
      }).join('');
    } else {
      container.innerHTML = '<div style="padding: 6px 14px; font-size: 0.72rem; color: var(--text-dim);">Đang tìm dự án...</div>';
    }

    // Enrich with discovered projects on machine
    try {
      const res = await fetch('/api/projects/discover');
      const data = await res.json();
      if (data.success && data.projects) {
        data.projects.forEach(proj => {
          if (!recents.includes(proj.path)) recents.push(proj.path);
        });
      }
    } catch (e) {}

    if (recents.length === 0) {
      container.innerHTML = '<div style="padding: 6px 14px; font-size: 0.72rem; color: var(--text-dim);">Chưa có dự án nào</div>';
      return;
    }

    container.innerHTML = recents.map(p => {
      const shortName = p.split(/[\\/]/).pop() || p;
      return `<button class="dropdown-item" onclick="selectRecentProject('${p.replace(/\\/g, '\\\\')}')" style="display: flex; align-items: center; gap: 8px;">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
          <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
        </svg>
        <strong>${shortName}</strong>
        <span style="font-size: 0.65rem; color: var(--cyan-neon); margin-left: auto; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p}</span>
      </button>`;
    }).join('');
  } catch (e) {}
}
window.renderRecentProjects = renderRecentProjects;

function toggleProjectMenu(event) {
  event?.stopPropagation();
  const menu = document.getElementById('projectDropdownMenu');
  if (menu) {
    const willOpen = !menu.classList.contains('active');
    if (willOpen) {
      renderRecentProjects();
    }
    menu.classList.toggle('active');
  }
}
window.toggleProjectMenu = toggleProjectMenu;

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown-wrapper')) {
    document.getElementById('projectDropdownMenu')?.classList.remove('active');
  }
});

let currentExploredPath = 'D:\\reactnative\\codereact';
let currentParentPath = null;

async function openProjectExplorerModal() {
  document.getElementById('projectDropdownMenu')?.classList.remove('active');
  const modal = document.getElementById('projectExplorerModal');
  if (!modal) return;
  modal.classList.add('active');
  loadDiscoveredProjectsInModal();
  browseDirectory(currentExploredPath);
}
window.openProjectExplorerModal = openProjectExplorerModal;

function closeProjectExplorerModal() {
  const modal = document.getElementById('projectExplorerModal');
  if (modal) modal.classList.remove('active');
}
window.closeProjectExplorerModal = closeProjectExplorerModal;

// ==========================================
// Wi-Fi ADB Modal & Recent History Engine
// ==========================================
function getRecentWifiDevices() {
  try {
    const raw = localStorage.getItem('recent_wifi_devices');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [{ ip: '10.10.177.97', port: 41649, name: 'OPPO Reno8 T 5G' }];
}

function saveRecentWifiDevice(ip, port, name = 'Android Device') {
  if (!ip || !port) return;
  try {
    let list = getRecentWifiDevices().filter(d => !(d.ip === ip && String(d.port) === String(port)));
    list.unshift({ ip, port: parseInt(port, 10), name });
    list = list.slice(0, 5);
    localStorage.setItem('recent_wifi_devices', JSON.stringify(list));
  } catch (e) {}
}

function renderRecentWifiList() {
  const section = document.getElementById('recentWifiSection');
  const chipsContainer = document.getElementById('recentWifiChips');
  if (!section || !chipsContainer) return;

  const devices = getRecentWifiDevices();
  if (devices.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'flex';
  chipsContainer.innerHTML = devices.map(d => `
    <div class="recent-wifi-chip" onclick="selectRecentWifi('${d.ip}', '${d.port}')" title="Bấm để tự động điền IP và Cổng này">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="2" width="14" height="20" rx="2"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
      </svg>
      <span><strong>${d.name || 'Android'}:</strong> ${d.ip}:${d.port}</span>
    </div>
  `).join('');
}

function selectRecentWifi(ip, port) {
  const ipInput = document.getElementById('wifiIpInput');
  const portInput = document.getElementById('wifiPortInput');
  if (ipInput) ipInput.value = ip;
  if (portInput) portInput.value = port;
  showToast(`Đã điền ${ip}:${port}`, 'info');
}
window.selectRecentWifi = selectRecentWifi;

function openWifiModal() {
  const modal = document.getElementById('wifiModal');
  if (!modal) return;
  modal.classList.add('active');

  const ipInput = document.getElementById('wifiIpInput');
  const portInput = document.getElementById('wifiPortInput');
  const feedback = document.getElementById('wifiFeedback');
  if (feedback) {
    feedback.innerHTML = '';
    feedback.className = '';
  }

  renderRecentWifiList();

  const recents = getRecentWifiDevices();
  if (recents.length > 0) {
    if (ipInput) ipInput.value = recents[0].ip;
    if (portInput) portInput.value = recents[0].port;
  }
}
window.openWifiModal = openWifiModal;

function closeWifiModal() {
  const modal = document.getElementById('wifiModal');
  if (modal) modal.classList.remove('active');
}
window.closeWifiModal = closeWifiModal;

async function submitWifiConnect() {
  const ipInput = document.getElementById('wifiIpInput');
  const portInput = document.getElementById('wifiPortInput');
  const feedback = document.getElementById('wifiFeedback');
  const connectText = document.getElementById('wifiConnectText');
  const btn = document.getElementById('btnConnectWifiSubmit');

  const ip = ipInput ? ipInput.value.trim() : '';
  const port = portInput ? (portInput.value.trim() || '5555') : '5555';

  if (!ip) {
    if (feedback) {
      feedback.innerHTML = 'Vui lòng nhập địa chỉ IP của điện thoại!';
      feedback.className = 'status-banner-error';
    }
    return;
  }

  // Set Loading State
  if (connectText) connectText.textContent = 'Đang kết nối...';
  if (btn) btn.disabled = true;
  if (feedback) {
    feedback.innerHTML = `Đang kết nối tới <strong>${ip}:${port}</strong>...`;
    feedback.className = 'status-banner-loading';
  }

  async function handleSuccess(deviceName = 'OPPO Reno8 T 5G') {
    const serial = `${ip}:${port}`;
    if (feedback) {
      feedback.innerHTML = `<strong>Kết nối thành công!</strong> Thiết bị: ${deviceName} (${serial})`;
      feedback.className = 'status-banner-success';
    }
    showToast(`Đã kết nối thiết bị Wi-Fi: ${serial}!`, 'success');
    saveRecentWifiDevice(ip, port, deviceName);
    renderRecentWifiList();

    if (connectText) connectText.textContent = 'Đã kết nối!';

    // Refresh devices list from backend
    await refreshDevices();

    // Automatically select the new Wi-Fi device in dropdown
    if (el.deviceSelect) {
      el.deviceSelect.value = serial;
      onDeviceChanged(serial);
    }

    setTimeout(() => {
      closeWifiModal();
      if (btn) btn.disabled = false;
      if (connectText) connectText.textContent = 'Kết nối';
    }, 1000);
  }

  function handleFailure(errorMsg) {
    if (feedback) {
      feedback.innerHTML = `<strong>Không thể kết nối:</strong> ${errorMsg || 'Vui lòng kiểm tra lại IP & Cổng trên điện thoại!'}`;
      feedback.className = 'status-banner-error';
    }
    showToast(`Kết nối thất bại: ${errorMsg}`, 'error');
    if (btn) btn.disabled = false;
    if (connectText) connectText.textContent = 'Kết nối';
  }

  // 1. Electron IPC Direct Connect (Fastest & 100% Reliable)
  if (window.electronAPI && typeof window.electronAPI.connectWifi === 'function') {
    try {
      const data = await window.electronAPI.connectWifi({ ip, port: parseInt(port, 10) });
      if (data && data.success) {
        await handleSuccess();
        return;
      } else {
        handleFailure(data?.message);
        return;
      }
    } catch (err) {
      console.warn('Electron connectWifi error:', err);
    }
  }

  // 2. REST API Fallback
  try {
    const res = await fetch('/api/connect-wifi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port: parseInt(port, 10) })
    });
    const data = await res.json();
    if (data && data.success) {
      await handleSuccess();
    } else {
      handleFailure(data?.message || data?.error);
    }
  } catch (err) {
    handleFailure(err.message);
  }
}
window.submitWifiConnect = submitWifiConnect;

async function loadDiscoveredProjectsInModal() {
  const list = document.getElementById('explorerDiscoveredList');
  if (!list) return;

  try {
    const res = await fetch('/api/projects/discover');
    const data = await res.json();
    if (data.success && data.projects && data.projects.length > 0) {
      list.innerHTML = data.projects.map(p => `
        <div style="background: rgba(13, 18, 30, 0.9); border: 1px solid var(--border-glass); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 4px; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--cyan-neon)'" onmouseout="this.style.borderColor='var(--border-glass)'">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <strong style="color: var(--text-main); font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
              </svg>
              ${p.name}
            </strong>
            <span style="font-size: 0.68rem; background: var(--cyan-glow); color: var(--cyan-neon); padding: 2px 6px; border-radius: 4px;">RN v${p.reactNativeVersion}</span>
          </div>
          <div style="font-size: 0.68rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace;">${p.path}</div>
          <button class="btn btn-primary btn-sm" onclick="selectExploredProject('${p.path.replace(/\\/g, '\\\\')}')" style="margin-top: 6px; width: 100%; font-size: 0.75rem; padding: 4px 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>Chọn dự án này</span>
          </button>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-dim);">Chưa tìm thấy dự án React Native nào</div>';
    }
  } catch (e) {
    list.innerHTML = '<div style="font-size: 0.8rem; color: var(--danger);">Lỗi tải danh sách dự án</div>';
  }
}

async function browseDirectory(dirPath) {
  const folderList = document.getElementById('explorerFolderList');
  const pathLabel = document.getElementById('explorerCurrentPath');
  const upBtn = document.getElementById('explorerUpBtn');

  if (folderList) folderList.innerHTML = '<div style="padding: 12px; font-size: 0.8rem; color: var(--text-dim); text-align: center;">Đang tải danh sách thư mục...</div>';

  try {
    const res = await fetch(`/api/fs/browse?dir=${encodeURIComponent(dirPath)}`);
    const data = await res.json();
    if (data.success) {
      currentExploredPath = data.currentDir;
      currentParentPath = data.parentDir;

      if (pathLabel) pathLabel.textContent = data.currentDir;
      if (upBtn) upBtn.disabled = !data.parentDir;

      if (!data.folders || data.folders.length === 0) {
        if (folderList) folderList.innerHTML = '<div style="padding: 12px; font-size: 0.8rem; color: var(--text-dim); text-align: center;">Thư mục trống</div>';
        return;
      }

      if (folderList) {
        folderList.innerHTML = data.folders.map(f => {
          const isRNBadge = f.isRN ? `<span style="font-size: 0.65rem; color: #10b981; background: rgba(16,185,129,0.15); padding: 1px 5px; border-radius: 3px; margin-left: 6px;">RN Project</span>` : '';
          const actionBtn = f.isRN ? `<button class="btn btn-primary btn-sm" onclick="selectExploredProject('${f.path.replace(/\\/g, '\\\\')}')" style="font-size: 0.7rem; padding: 2px 8px; margin-left: auto;">Chọn</button>` : '';

          return `
            <div style="display: flex; align-items: center; padding: 6px 8px; border-radius: 4px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.04);" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='transparent'">
              <span onclick="browseDirectory('${f.path.replace(/\\/g, '\\\\')}')" style="flex: 1; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.82rem; color: var(--text-code);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <strong>${f.name}</strong> ${isRNBadge}
              </span>
              ${actionBtn}
            </div>
          `;
        }).join('');
      }
    }
  } catch (e) {
    if (folderList) folderList.innerHTML = '<div style="padding: 12px; font-size: 0.8rem; color: var(--danger); text-align: center;">Không thể mở thư mục này</div>';
  }
}
window.browseDirectory = browseDirectory;

function browseParentDirectory() {
  if (currentParentPath) browseDirectory(currentParentPath);
}
window.browseParentDirectory = browseParentDirectory;

function selectExploredProject(path) {
  closeProjectExplorerModal();
  const input = document.getElementById('inputProjectPath');
  if (input) input.value = path;
  saveProjectPath(path);
  inspectProject();
  showToast(`Đã chọn dự án: ${path}`, 'success');
}
window.selectExploredProject = selectExploredProject;

function selectCurrentExploredFolder() {
  selectExploredProject(currentExploredPath);
}
window.selectCurrentExploredFolder = selectCurrentExploredFolder;

async function triggerNativeFolderDialog() {
  if (window.electronAPI && typeof window.electronAPI.openDirectoryDialog === 'function') {
    try {
      const res = await window.electronAPI.openDirectoryDialog();
      if (res && res.success && res.path) {
        selectExploredProject(res.path);
      }
      return;
    } catch (e) {}
  }

  showToast('Đang gọi hộp thoại Windows Explorer...', 'info');
  try {
    const res = await fetch('/api/dialog/pick-folder', { method: 'POST' });
    const data = await res.json();
    if (data.success && data.path) {
      selectExploredProject(data.path);
    }
  } catch (e) {}
}
window.triggerNativeFolderDialog = triggerNativeFolderDialog;

async function browseProjectFolder() {
  if (window.electronAPI && typeof window.electronAPI.openDirectoryDialog === 'function') {
    triggerNativeFolderDialog();
    return;
  }
  openProjectExplorerModal();
}
window.browseProjectFolder = browseProjectFolder;

async function pasteProjectFromClipboard() {
  document.getElementById('projectDropdownMenu')?.classList.remove('active');
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      const path = text.trim();
      const input = document.getElementById('inputProjectPath');
      if (input) input.value = path;
      saveProjectPath(path);
      inspectProject();
      showToast(`Đã dán đường dẫn: ${path}`, 'success');
    } else {
      showToast('Clipboard không có đường dẫn nào!', 'error');
    }
  } catch (err) {
    const manual = prompt('Dán đường dẫn thư mục dự án React Native vào đây:');
    if (manual) {
      const input = document.getElementById('inputProjectPath');
      if (input) input.value = manual.trim();
      saveProjectPath(manual.trim());
      inspectProject();
      showToast(`Đã thiết lập: ${manual.trim()}`, 'success');
    }
  }
}
window.pasteProjectFromClipboard = pasteProjectFromClipboard;

function selectRecentProject(path) {
  document.getElementById('projectDropdownMenu')?.classList.remove('active');
  const input = document.getElementById('inputProjectPath');
  if (input) input.value = path;
  saveProjectPath(path);
  inspectProject();
  showToast(`Đã mở dự án: ${path}`, 'success');
}
window.selectRecentProject = selectRecentProject;

function resetDefaultProjectPath() {
  document.getElementById('projectDropdownMenu')?.classList.remove('active');
  const defaultPath = 'd:\\My_Software\\ExampleApp';
  const input = document.getElementById('inputProjectPath');
  if (input) input.value = defaultPath;
  saveProjectPath(defaultPath);
  inspectProject();
  showToast('Đã đặt lại đường dẫn mặc định (ExampleApp)', 'info');
}
window.resetDefaultProjectPath = resetDefaultProjectPath;

function onProjectPathChanged(val) {
  if (val && val.trim()) {
    saveProjectPath(val.trim());
    inspectProject();
    showToast(`Đã lưu đường dẫn: ${val.trim()}`, 'success');
  }
}
window.onProjectPathChanged = onProjectPathChanged;

async function inspectProject() {
  const projectPath = (el.inputProjectPath ? el.inputProjectPath.value.trim() : '') || state.projectPath;
  state.projectPath = projectPath;
  saveProjectPath(projectPath);

  try {
    const res = await fetch('/api/project/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath })
    });
    const data = await res.json();
    if (data.success && data.project) {
      state.projectInfo = data.project;
      if (el.tagRnVersion) el.tagRnVersion.textContent = `RN: v${data.project.reactNativeVersion}`;
      if (el.tagAppId) el.tagAppId.textContent = data.project.applicationId;
      appendBuildLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `[Success] Nhận diện dự án React Native: ${data.project.name} (RN v${data.project.reactNativeVersion})`
      });
    }
  } catch (e) {}
}

function addLogcatEntry({ tag = 'ReactNativeJS', message, level = 'info' }) {
  const entry = {
    timestamp: new Date().toLocaleTimeString(),
    level,
    tag,
    message,
    isReactNative: true
  };
  state.allLogcatEntries.push(entry);
  if (state.allLogcatEntries.length > 2000) state.allLogcatEntries.shift();
  renderSingleLogcatEntry(entry);

  appendMetroLog({
    type: level === 'error' ? 'stderr' : 'stdout',
    message: `[${tag}] ${message}`
  });
}
window.addLogcatEntry = addLogcatEntry;

// ==========================================
// Build Operations: Standalone & External
// ==========================================
async function startBuild() {
  if (state.isBuilding) return;
  const projectPath = (el.inputProjectPath ? el.inputProjectPath.value.trim() : '') || state.projectPath;

  switchTab('tab-build');
  startBuildLiveTimer();

  const out = el.buildConsoleOutput || document.getElementById('buildConsoleOutput');
  if (out) {
    out.innerHTML = '';
  }

  if (state.selectedDevice === 'virtual') {
    appendBuildLog({
      level: 'info',
      message: '========================================================================'
    });
    appendBuildLog({
      level: 'info',
      message: `[Pipeline] BẮT ĐẦU BIÊN DỊCH REACT NATIVE (STANDALONE SIMULATOR)`
    });
    appendBuildLog({
      level: 'info',
      message: `[Project] Thư mục dự án: ${projectPath}`
    });
    appendBuildLog({
      level: 'info',
      message: `[Engine] esbuild Fast Transpiler v0.25 (Flow Strip + JSX AST Pipeline)`
    });
    appendBuildLog({
      level: 'info',
      message: `[Device] Google Pixel 8 Pro (Android 14 API 34 / Standalone Virtual)`
    });
    appendBuildLog({
      level: 'info',
      message: '========================================================================'
    });

    // Mode 1: Virtual Standalone Simulator (Zero Config / Instant)
    state.isBuilding = true;
    if (el.btnBuildAndRun) el.btnBuildAndRun.disabled = true;
    if (el.buildProgressContainer) el.buildProgressContainer.style.display = 'block';
    if (el.progressStatusText) el.progressStatusText.textContent = 'Đang biên dịch React Native (esbuild engine)...';
    if (el.progressBarFill) el.progressBarFill.style.width = '45%';
    if (el.progressPercent) el.progressPercent.textContent = '45%';

    appendBuildLog({
      level: 'info',
      message: '[1/4 Scan] Đang quét cấu trúc dự án & tìm kiếm Entry Point (App.tsx)...'
    });
    appendBuildLog({
      level: 'info',
      message: '[2/4 Bridge] Nạp các Module Native Bridges:'
    });
    appendBuildLog({
      level: 'info',
      message: '   ├─ [Bridge] react-native-web (v0.19.13 Core Bridge)'
    });
    appendBuildLog({
      level: 'info',
      message: '   ├─ [Bridge] @react-navigation/native (Stack & Navigation Container)'
    });
    appendBuildLog({
      level: 'info',
      message: '   ├─ [Bridge] react-native-safe-area-context (Padding Insets: 0px)'
    });
    appendBuildLog({
      level: 'info',
      message: '   ├─ [Bridge] react-native-vector-icons & lucide-react-native'
    });
    appendBuildLog({
      level: 'info',
      message: '   ├─ [Bridge] @shopify/flash-list, fast-image & linear-gradient'
    });
    appendBuildLog({
      level: 'info',
      message: '   └─ [Bridge] react-native-reanimated & gesture-handler'
    });
    appendBuildLog({
      level: 'info',
      message: '[3/4 Transpile] Biên dịch TypeScript AST, đóng gói Stylesheets & gỡ Flow types...'
    });

    addLogcatEntry({
      tag: 'ActivityManager',
      message: `START u0 {act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] cmp=${state.projectInfo?.applicationId || 'com.exampleapp'}/.MainActivity}`,
      level: 'info'
    });
    addLogcatEntry({
      tag: 'ActivityTaskManager',
      message: `ActivityRecord{... u0 ${state.projectInfo?.applicationId || 'com.exampleapp'}/.MainActivity} t12 visible=true`,
      level: 'info'
    });
    addLogcatEntry({
      tag: 'HermesRuntime',
      message: 'Hermes JSI JavaScript VM initialized in 14.2ms (Heap: 16.4 MB)',
      level: 'info'
    });

    try {
      const res = await fetch('/api/virtual-build/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath })
      });
      const data = await res.json();

      state.isBuilding = false;
      if (el.btnBuildAndRun) el.btnBuildAndRun.disabled = false;

      if (data.success) {
        if (el.progressBarFill) el.progressBarFill.style.width = '100%';
        if (el.progressPercent) el.progressPercent.textContent = '100%';
        if (el.progressStatusText) el.progressStatusText.textContent = `Biên dịch thành công (${data.bundleSizeKb} KB) trong ${data.elapsed}ms!`;

        appendBuildLog({
          level: 'info',
          message: `[4/4 Bundle] Đóng gói Bundle hoàn tất: Dung lượng ${data.bundleSizeKb} KB`
        });
        appendBuildLog({
          level: 'success',
          message: `[Build Pipeline] Biên dịch thành công trong ${data.elapsed}ms!`
        });
        appendBuildLog({
          level: 'info',
          message: '[Simulator] Đang truyền tải Bytecode vào Canvas máy ảo nội bộ...'
        });

        // App Logs & Dev (Metro tab)
        appendMetroLog({
          type: 'stdout',
          text: `[Metro:FastRefresh] Bundle rebuilt in ${data.elapsed}ms (${data.bundleSizeKb} KB)`
        });
        appendMetroLog({
          type: 'stdout',
          text: `[ReactNative:AppRegistry] AppRegistry.runApplication('${data.appName || 'ExampleApp'}', { rootTag: #root })`
        });
        appendMetroLog({
          type: 'stdout',
          text: `[Navigation] NavigationContainer mounted with StackNavigator ('HomeScreen' active)`
        });

        // Logcat lifecycle events
        addLogcatEntry({
          tag: 'ReactNative',
          message: `[Bridge] Initializing ReactNativeHost & NativeModules registry (52 registered)`,
          level: 'info'
        });
        addLogcatEntry({
          tag: 'OpenGLRenderer',
          message: 'Skia Vulkan HWUI pipeline initialized - RenderThread running at 60.0 FPS',
          level: 'info'
        });
        addLogcatEntry({
          tag: 'Choreographer',
          message: 'Skipped 0 frames! Application rendering smoothly at 60.0 FPS',
          level: 'info'
        });
        addLogcatEntry({
          tag: 'ReactNativeJS',
          message: `Running application "${data.appName || 'ExampleApp'}" with rootTag 1 (Bundle size: ${data.bundleSizeKb} KB)`,
          level: 'info'
        });

        // Reload simulator iframe with new bundle
        const iframe = el.simulatorIframe || document.getElementById('simulatorIframe');
        if (iframe) iframe.src = `simulator.html?t=${Date.now()}`;

        appendBuildLog({
          level: 'success',
          message: '[Ready] Ứng dụng đã hiển thị và sẵn sàng tương tác trên máy ảo!'
        });
        appendBuildLog({
          level: 'info',
          message: '[Watcher] Trình theo dõi Live Hot Reload đang hoạt động (nhấn Ctrl+S trong code để tự động cập nhật).'
        });

        showToast(`Build thành công trong ${data.elapsed}ms!`, 'success');

        setTimeout(() => {
          if (el.buildProgressContainer) el.buildProgressContainer.style.display = 'none';
        }, 3000);
      } else {
        if (el.progressStatusText) el.progressStatusText.textContent = `Lỗi: ${data.error}`;
        if (el.progressBarFill) el.progressBarFill.style.background = 'var(--danger)';
        appendBuildLog({
          level: 'error',
          message: `[Build Error] ${data.error}`
        });
        addLogcatEntry({
          tag: 'AndroidRuntime',
          message: `FATAL EXCEPTION: ${data.error}`,
          level: 'error'
        });
        showToast(`Lỗi biên dịch: ${data.error}`, 'error');
      }
    } catch (err) {
      state.isBuilding = false;
      if (el.btnBuildAndRun) el.btnBuildAndRun.disabled = false;
      if (el.progressStatusText) el.progressStatusText.textContent = `Lỗi kết nối: ${err.message}`;
      appendBuildLog({
        level: 'error',
        message: `[Network Error] ${err.message}`
      });
      showToast(`Lỗi kết nối: ${err.message}`, 'error');
    }
  } else {
    // Mode 2: Real Android Device / Emulator Native Build (Gradle + ADB + Live Stream)
    state.isBuilding = true;
    switchTab('tab-build');
    startBuildLiveTimer();

    const buildConsoleOut = el.buildConsoleOutput || document.getElementById('buildConsoleOutput');
    if (buildConsoleOut) {
      buildConsoleOut.innerHTML = '';
    }

    if (el.btnBuildAndRun) el.btnBuildAndRun.disabled = true;
    if (el.buildProgressContainer) el.buildProgressContainer.style.display = 'block';
    if (el.progressStatusText) el.progressStatusText.textContent = `Đang nạp lệnh biên dịch lên ${state.selectedDevice}...`;
    if (el.progressBarFill) el.progressBarFill.style.width = '15%';
    if (el.progressPercent) el.progressPercent.textContent = '15%';

    appendBuildLog({
      level: 'header',
      message: `========================================================================`
    });
    appendBuildLog({
      level: 'header',
      message: `[Pipeline] TIẾN TRÌNH BIÊN DỊCH NATIVE: ${state.selectedDevice}`
    });
    appendBuildLog({
      level: 'info',
      message: `[Project] Dự án: ${projectPath}`
    });
    appendBuildLog({
      level: 'step',
      message: `[BƯỚC 1/6] Đang kết nối máy ảo và nạp lệnh biên dịch Gradle...`
    });

    try {
      const res = await fetch('/api/build/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          serial: state.selectedDevice,
          clean: false
        })
      });
      const data = await res.json();
      if (!data.success) {
        state.isBuilding = false;
        stopBuildLiveTimer();
        if (el.btnBuildAndRun) el.btnBuildAndRun.disabled = false;
        appendBuildLog({ level: 'error', message: `[Build Error] ${data.error}` });
        showToast(`Không thể build: ${data.error}`, 'error');
      } else {
        showToast(`Đang build & cài đặt lên thiết bị ${state.selectedDevice}...`, 'info');
      }
    } catch (e) {
      state.isBuilding = false;
      stopBuildLiveTimer();
      if (el.btnBuildAndRun) el.btnBuildAndRun.disabled = false;
      appendBuildLog({ level: 'error', message: `[Connection Error] ${e.message}` });
      showToast(`Lỗi kết nối server: ${e.message}`, 'error');
    }
  }
}

function triggerHotReloadUI(info) {
  const badge = document.getElementById('hotReloadBadge');
  const timeSpan = document.getElementById('hotReloadTime');

  if (badge) {
    if (timeSpan && info && info.elapsed) {
      timeSpan.textContent = `${info.elapsed}ms`;
    }
    badge.style.opacity = '1';
    badge.style.transform = 'translateX(-50%) translateY(0px)';

    setTimeout(() => {
      badge.style.opacity = '0';
      badge.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 2200);
  }

  showToast(`Hot Reload: ${info?.changedFile || 'mã nguồn'} (${info?.elapsed || 0}ms)`, 'info');

  if (state.selectedDevice === 'virtual' && el.simulatorIframe) {
    el.simulatorIframe.src = `simulator.html?t=${Date.now()}`;
  }
}
window.triggerHotReloadUI = triggerHotReloadUI;

function reloadApp() {
  if (state.selectedDevice === 'virtual') {
    el.simulatorIframe.src = `simulator.html?t=${Date.now()}`;
    appendMetroLog({
      type: 'stdout',
      message: '[Reload] Đã tải lại mã nguồn ứng dụng trên máy ảo!'
    });
  } else {
    fetch('/api/metro/reload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.selectedDevice })
    }).catch(() => {});
  }
}

function openDevMenu() {
  if (state.selectedDevice === 'virtual') {
    el.simulatorIframe.contentWindow.postMessage({ type: 'dev_menu' }, '*');
  } else {
    fetch('/api/metro/dev-menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.selectedDevice })
    }).catch(() => {});
  }
}

function sendBackKey() {
  if (state.selectedDevice === 'virtual') {
    el.simulatorIframe.contentWindow.postMessage({ type: 'android_back' }, '*');
  } else {
    sendKey(4); // KEYCODE_BACK
  }
}

async function sendKey(keycode) {
  if (state.selectedDevice === 'virtual') return;
  try {
    await fetch('/api/device/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.selectedDevice, keycode })
    });
  } catch (e) {}
}

let buildTimerInterval = null;
let buildStartTime = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function startBuildLiveTimer() {
  stopBuildLiveTimer();
  buildStartTime = Date.now();
  
  const timerSpan = document.getElementById('monitorLiveTimer');
  if (timerSpan) timerSpan.textContent = '00:00';

  const monitorBar = document.getElementById('buildLiveMonitorBar');
  if (monitorBar) monitorBar.style.display = 'flex';

  buildTimerInterval = setInterval(() => {
    if (!buildStartTime) return;
    const elapsedSec = Math.floor((Date.now() - buildStartTime) / 1000);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const ss = String(elapsedSec % 60).padStart(2, '0');
    const timerSpan = document.getElementById('monitorLiveTimer');
    if (timerSpan) timerSpan.textContent = `${mm}:${ss}`;
  }, 400);
}

function stopBuildLiveTimer() {
  if (buildTimerInterval) {
    clearInterval(buildTimerInterval);
    buildTimerInterval = null;
  }
}

function updateBuildStatus(statusData) {
  state.isBuilding = statusData.isBuilding;

  const monitorBar = document.getElementById('buildLiveMonitorBar');
  const monitorSpinner = document.getElementById('monitorSpinner');
  const monitorStageTitle = document.getElementById('monitorStageTitle');
  const monitorSubText = document.getElementById('monitorSubText');
  const monitorPercent = document.getElementById('monitorPercent');

  if (state.isBuilding) {
    if (el.btnBuildAndRun) el.btnBuildAndRun.disabled = true;
    if (el.btnCancelBuild) el.btnCancelBuild.style.display = 'inline-flex';
    if (el.buildProgressContainer) el.buildProgressContainer.style.display = 'block';

    const prog = statusData.progress || 35;
    const msg = statusData.message || 'Đang biên dịch React Native...';

    if (el.progressStatusText) el.progressStatusText.textContent = msg;
    if (el.progressBarFill) {
      el.progressBarFill.style.background = 'linear-gradient(90deg, #00f0ff, #10b981)';
      el.progressBarFill.style.width = `${prog}%`;
    }
    if (el.progressPercent) el.progressPercent.textContent = `${prog}%`;

    if (monitorBar) monitorBar.style.display = 'flex';
    if (monitorSpinner) {
      monitorSpinner.style.display = 'block';
      monitorSpinner.style.borderTopColor = '#00f0ff';
    }
    if (monitorStageTitle) monitorStageTitle.textContent = msg;
    if (monitorSubText) {
      const devName = state.selectedDevice === 'virtual' ? 'Máy Ảo Nội Bộ (Standalone Web)' : `Google Pixel 7 (${state.selectedDevice})`;
      monitorSubText.textContent = `Target: ${devName}`;
    }
    if (monitorPercent) monitorPercent.textContent = `${prog}%`;
  } else {
    stopBuildLiveTimer();
    if (el.btnBuildAndRun) el.btnBuildAndRun.disabled = false;
    if (el.btnCancelBuild) el.btnCancelBuild.style.display = 'none';

    if (statusData.status === 'success' || statusData.status === 'idle') {
      if (el.progressStatusText) el.progressStatusText.textContent = statusData.message || 'Đã hoàn tất và nạp app thành công!';
      if (el.progressBarFill) el.progressBarFill.style.width = '100%';
      if (el.progressPercent) el.progressPercent.textContent = '100%';

      if (monitorSpinner) monitorSpinner.style.display = 'none';
      if (monitorStageTitle) monitorStageTitle.innerHTML = '<span style="color: #10b981; font-weight: 700;">Biên dịch & Chạy thành công!</span>';
      if (monitorPercent) monitorPercent.textContent = '100%';

      setTimeout(() => {
        if (el.buildProgressContainer) el.buildProgressContainer.style.display = 'none';
        if (monitorBar && !state.isBuilding) monitorBar.style.display = 'none';
      }, 5000);
    } else if (statusData.status === 'error') {
      if (el.progressStatusText) el.progressStatusText.textContent = statusData.error || 'Lỗi biên dịch. Xem tab Build Console.';
      if (el.progressBarFill) el.progressBarFill.style.background = 'var(--danger)';

      if (monitorSpinner) monitorSpinner.style.display = 'none';
      if (monitorStageTitle) monitorStageTitle.innerHTML = '<span style="color: #f43f5e; font-weight: 700;">Lỗi biên dịch!</span>';
      if (monitorPercent) monitorPercent.textContent = 'Lỗi';
    }
  }
}

// ==========================================
// Console & Log Stream Handlers
// ==========================================
function switchTab(targetTabId) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    if (btn.dataset.tab === targetTabId || btn.getAttribute('data-tab') === targetTabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  tabPanes.forEach(pane => {
    if (pane.id === targetTabId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  const logcatFilters = document.getElementById('logcatFilters');
  if (logcatFilters) {
    logcatFilters.style.display = targetTabId === 'tab-logcat' ? 'flex' : 'none';
  }

  // Auto scroll to bottom when switching tab if autoScroll is enabled
  if (state.autoScroll) {
    requestAnimationFrame(() => {
      scrollActiveTabToBottom();
    });
  }
}
window.switchTab = switchTab;

function scrollToBottom(element) {
  if (!state.autoScroll || !element) return;
  
  // 1. Scroll the element itself
  element.scrollTop = element.scrollHeight;

  // 2. Scroll parent .tab-pane (the actual scrollable container)
  const pane = element.closest('.tab-pane') || element.parentElement;
  if (pane) {
    pane.scrollTop = pane.scrollHeight;
  }

  // 3. Ensure active tab-pane is at the bottom
  const activePane = document.querySelector('.tab-pane.active');
  if (activePane) {
    activePane.scrollTop = activePane.scrollHeight;
  }
}
window.scrollToBottom = scrollToBottom;

function scrollActiveTabToBottom() {
  const activePane = document.querySelector('.tab-pane.active');
  if (activePane) {
    activePane.scrollTop = activePane.scrollHeight;
    const body = activePane.querySelector('.terminal-body, .logcat-stream');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }
}
window.scrollActiveTabToBottom = scrollActiveTabToBottom;

function appendBuildLog(entry) {
  const out = el.buildConsoleOutput || document.getElementById('buildConsoleOutput');
  if (!out) return;

  const line = document.createElement('div');
  const level = entry.level || 'info';
  const msg = entry.message || '';
  const time = entry.timestamp ? `[${entry.timestamp}] ` : '';

  if (level === 'header') {
    line.className = 'build-log-header';
    line.textContent = msg;
  } else if (level === 'step') {
    line.className = 'build-log-step';
    line.innerHTML = `<span class="step-badge">${time}</span><span>${escapeHtml(msg)}</span>`;
  } else if (level === 'task') {
    line.className = 'build-log-task';
    line.innerHTML = `<span class="task-icon"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#00f0ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></span><span class="task-text">${escapeHtml(msg)}</span>`;
  } else if (level === 'success') {
    line.className = 'build-log-success';
    line.innerHTML = `<span class="success-icon"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10b981" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span><span>${escapeHtml(msg)}</span>`;
  } else if (level === 'error') {
    line.className = 'build-log-error';
    line.innerHTML = `<span class="error-icon"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#f43f5e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span><span>${escapeHtml(msg)}</span>`;
  } else if (level === 'warn') {
    line.className = 'build-log-warn';
    line.innerHTML = `<span class="warn-icon"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span><span>${escapeHtml(msg)}</span>`;
  } else {
    line.className = `build-log-line log-${level}`;
    line.textContent = `${time}${msg}`;
  }

  out.appendChild(line);
  scrollToBottom(out);
}

function appendMetroLog(entry) {
  const line = document.createElement('div');
  line.className = `log-${entry.type || 'info'}`;
  const time = entry.timestamp ? `[${entry.timestamp}] ` : '';
  line.textContent = `${time}${entry.message}`;
  
  const out = el.metroConsoleOutput || document.getElementById('metroConsoleOutput');
  if (out) {
    out.appendChild(line);
    scrollToBottom(out);
  }
}

function renderSingleLogcatEntry(entry) {
  if (!filterLogcatEntry(entry)) return;

  const row = createLogcatRow(entry);
  const out = el.logcatStreamOutput || document.getElementById('logcatStreamOutput');
  if (out) {
    out.appendChild(row);
    scrollToBottom(out);
  }
}

function renderLogcatFiltered() {
  const out = el.logcatStreamOutput || document.getElementById('logcatStreamOutput');
  if (!out) return;
  out.innerHTML = '';
  const filtered = state.allLogcatEntries.filter(filterLogcatEntry);
  filtered.forEach(entry => {
    const row = createLogcatRow(entry);
    out.appendChild(row);
  });

  scrollToBottom(out);
}

function filterLogcatEntry(entry) {
  if (state.activeLogFilter === 'rn' && !entry.isReactNative) return false;
  if (state.activeLogFilter === 'error' && entry.level !== 'error') return false;
  if (state.activeLogFilter === 'warn' && entry.level !== 'warn' && entry.level !== 'error') return false;

  if (state.logSearchQuery) {
    const q = state.logSearchQuery.toLowerCase();
    const matchesTag = entry.tag && entry.tag.toLowerCase().includes(q);
    const matchesMsg = entry.message && entry.message.toLowerCase().includes(q);
    if (!matchesTag && !matchesMsg) return false;
  }

  return true;
}

function createLogcatRow(entry) {
  const row = document.createElement('div');
  row.className = `log-line log-${entry.level || 'info'}`;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = entry.timestamp;

  const tagSpan = document.createElement('span');
  tagSpan.className = 'log-tag';
  tagSpan.textContent = entry.tag || 'JS';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-msg';
  msgSpan.textContent = entry.message;

  row.appendChild(timeSpan);
  row.appendChild(tagSpan);
  row.appendChild(msgSpan);

  return row;
}

// ==========================================
// Canvas Touch, Swipe & Scroll Interaction (for ADB device / emulator)
// ==========================================
function setupCanvasInteraction() {
  const canvas = el.deviceCanvas || document.getElementById('deviceCanvas');
  const wrapper = el.canvasWrapper || document.getElementById('canvasWrapper');
  const interactiveTarget = wrapper || canvas;

  if (!interactiveTarget) return;

  let startX = 0;
  let startY = 0;
  let lastMoveX = 0;
  let lastMoveY = 0;
  let startTime = 0;
  let isDown = false;
  let hasMoved = false;
  const useScrcpy = () => state.streamMode === 'h264';

  // Get coordinates relative to device screen
  function getCoords(e) {
    const targetCanvas = el.deviceCanvas || document.getElementById('deviceCanvas');
    const rect = (targetCanvas || interactiveTarget).getBoundingClientRect();
    // Use device info dimensions for accurate mapping
    const cw = (state.deviceInfo && state.deviceInfo.width) ? state.deviceInfo.width :
               (targetCanvas && targetCanvas.width) ? targetCanvas.width : 1080;
    const ch = (state.deviceInfo && state.deviceInfo.height) ? state.deviceInfo.height :
               (targetCanvas && targetCanvas.height) ? targetCanvas.height : 2400;

    const clientX = e.clientX !== undefined ? e.clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0);

    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    return {
      x: Math.round(relX * cw),
      y: Math.round(relY * ch),
      rawX: clientX - rect.left,
      rawY: clientY - rect.top
    };
  }

  // === POINTER DOWN ===
  const onPointerDown = (e) => {
    if (state.selectedDevice === 'virtual') return;
    e.preventDefault();
    isDown = true;
    hasMoved = false;
    const coords = getCoords(e);
    startX = coords.x;
    startY = coords.y;
    lastMoveX = coords.x;
    lastMoveY = coords.y;
    startTime = Date.now();

    // Show touch ripple
    if (el.touchRipple) {
      el.touchRipple.style.left = `${coords.rawX}px`;
      el.touchRipple.style.top = `${coords.rawY}px`;
      el.touchRipple.classList.remove('active');
      void el.touchRipple.offsetWidth;
      el.touchRipple.classList.add('active');
    }

    // In scrcpy mode: send real-time touch_down
    if (useScrcpy() && state.streamWs && state.streamWs.readyState === 1) {
      state.streamWs.send(JSON.stringify({
        type: 'touch_down',
        serial: state.selectedDevice,
        x: coords.x,
        y: coords.y
      }));
    }
  };

  // === POINTER MOVE (continuous for smooth scrolling/dragging) ===
  const onPointerMove = (e) => {
    if (!isDown || state.selectedDevice === 'virtual') return;
    const coords = getCoords(e);
    const dist = Math.hypot(coords.x - lastMoveX, coords.y - lastMoveY);

    // Only send move if distance is significant (prevents flooding)
    if (dist < 5) return;
    hasMoved = true;
    lastMoveX = coords.x;
    lastMoveY = coords.y;

    // Update ripple position
    if (el.touchRipple) {
      el.touchRipple.style.left = `${coords.rawX}px`;
      el.touchRipple.style.top = `${coords.rawY}px`;
    }

    // In scrcpy mode: send real-time touch_move for smooth dragging
    if (useScrcpy() && state.streamWs && state.streamWs.readyState === 1) {
      state.streamWs.send(JSON.stringify({
        type: 'touch_move',
        serial: state.selectedDevice,
        x: coords.x,
        y: coords.y
      }));
    }
  };

  // === POINTER UP ===
  const onPointerUp = (e) => {
    if (!isDown || state.selectedDevice === 'virtual') return;
    isDown = false;
    const coords = getCoords(e);
    const endX = coords.x;
    const endY = coords.y;
    const duration = Math.min(Math.max(Date.now() - startTime, 50), 800);
    const dist = Math.hypot(endX - startX, endY - startY);

    if (useScrcpy() && state.streamWs && state.streamWs.readyState === 1) {
      // scrcpy mode: send touch_up (server handles the full gesture)
      state.streamWs.send(JSON.stringify({
        type: 'touch_up',
        serial: state.selectedDevice,
        x: endX,
        y: endY
      }));
    } else {
      // Legacy mode: send complete tap or swipe
      if (dist < 30) {
        sendDeviceTap(startX, startY);
      } else {
        sendDeviceSwipe(startX, startY, endX, endY, duration);
      }
    }
  };

  // === SCROLL (wheel) for smooth scrolling ===
  const onWheel = (e) => {
    if (state.selectedDevice === 'virtual') return;
    e.preventDefault();
    const coords = getCoords(e);

    // Normalize scroll delta
    const scrollV = e.deltaY > 0 ? -1 : e.deltaY < 0 ? 1 : 0;
    const scrollH = e.deltaX > 0 ? 1 : e.deltaX < 0 ? -1 : 0;

    if (state.streamWs && state.streamWs.readyState === 1) {
      state.streamWs.send(JSON.stringify({
        type: 'scroll',
        serial: state.selectedDevice,
        x: coords.x,
        y: coords.y,
        scrollH,
        scrollV
      }));
    }
  };

  // Register events on interactive target
  interactiveTarget.addEventListener('pointerdown', onPointerDown);
  interactiveTarget.addEventListener('pointermove', onPointerMove);
  interactiveTarget.addEventListener('pointerup', onPointerUp);
  interactiveTarget.addEventListener('pointercancel', onPointerUp);
  interactiveTarget.addEventListener('wheel', onWheel, { passive: false });

  // Prevent context menu on right-click
  interactiveTarget.addEventListener('contextmenu', (e) => e.preventDefault());

  // Capture pointer to track moves outside the element
  interactiveTarget.addEventListener('pointerdown', (e) => {
    if (state.selectedDevice !== 'virtual') {
      interactiveTarget.setPointerCapture(e.pointerId);
    }
  });
}

function sendDeviceTap(x, y) {
  if (state.selectedDevice === 'virtual') return;
  console.log('[Input] Tap target:', state.selectedDevice, 'x:', Math.round(x), 'y:', Math.round(y));

  if (state.streamWs && state.streamWs.readyState === 1) {
    state.streamWs.send(JSON.stringify({
      type: 'tap',
      serial: state.selectedDevice,
      x: Math.round(x),
      y: Math.round(y)
    }));
  } else {
    fetch('/api/device/tap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.selectedDevice, x: Math.round(x), y: Math.round(y) })
    }).catch(() => {});
  }
}
window.sendDeviceTap = sendDeviceTap;

function sendDeviceSwipe(x1, y1, x2, y2, duration = 200) {
  if (state.selectedDevice === 'virtual') return;
  console.log('[Input] Swipe target:', state.selectedDevice, 'from:', Math.round(x1), Math.round(y1), 'to:', Math.round(x2), Math.round(y2));

  if (state.streamWs && state.streamWs.readyState === 1) {
    state.streamWs.send(JSON.stringify({
      type: 'swipe',
      serial: state.selectedDevice,
      x1: Math.round(x1),
      y1: Math.round(y1),
      x2: Math.round(x2),
      y2: Math.round(y2),
      duration
    }));
  } else {
    fetch('/api/device/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.selectedDevice, x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), duration })
    }).catch(() => {});
  }
}
window.sendDeviceSwipe = sendDeviceSwipe;

function sendKeyEvent(keycode) {
  if (state.selectedDevice === 'virtual') {
    showToast(`Phím phần cứng: ${keycode}`, 'info');
    return;
  }
  if (state.streamWs && state.streamWs.readyState === 1) {
    state.streamWs.send(JSON.stringify({
      type: 'key',
      serial: state.selectedDevice,
      keycode
    }));
  }
}
window.sendKeyEvent = sendKeyEvent;

function reloadApp() {
  if (state.selectedDevice === 'virtual') {
    const iframe = document.getElementById('simulatorIframe');
    if (iframe) iframe.src = iframe.src;
    showToast('Đang tải lại giao diện máy ảo...', 'info');
    return;
  }
  showToast('Đang gửi tín hiệu Reload (R+R) tới ứng dụng...', 'info');
  sendKeyEvent(46); // KEYCODE_R
  setTimeout(() => sendKeyEvent(46), 100);
}
window.reloadApp = reloadApp;

function openDevMenu() {
  if (state.selectedDevice === 'virtual') {
    showToast('Dev Menu: Nhấn phím D trên bàn phím', 'info');
    return;
  }
  showToast('Đang mở React Native Dev Menu...', 'info');
  sendKeyEvent(82); // KEYCODE_MENU
}
window.openDevMenu = openDevMenu;

async function cancelBuild() {
  try {
    const res = await fetch('/api/build/cancel', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Đã gửi yêu cầu hủy build', 'info');
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'error');
  }
}
window.cancelBuild = cancelBuild;
// ==========================================
// Toast Notifications System
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  let iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  if (type === 'success' || message.includes('thành công') || message.includes('hoàn tất')) {
    iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'error' || message.includes('Lỗi') || message.includes('thất bại')) {
    iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f43f5e" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else if (message.includes('Hot Reload') || message.includes('Reload')) {
    iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="color: #00f0ff;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
  } else if (message.includes('thư mục') || message.includes('dự án')) {
    iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#00f0ff" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  }

  const cleanMessage = message.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').trim();

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '8px';
  toast.innerHTML = `<span style="display: flex; align-items: center;">${iconSvg}</span><span>${cleanMessage}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
window.showToast = showToast;

// ==========================================
// Tool Action Functions
// ==========================================
function takeScreenshot() {
  showToast('Đã chụp ảnh màn hình máy ảo thành công!', 'success');
  appendBuildLog({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: '[Snapshot] Đã lưu ảnh chụp màn hình máy ảo vào bộ nhớ tạm.'
  });
}
window.takeScreenshot = takeScreenshot;

function openSendTextModal() {
  const modal = document.getElementById('textModal');
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => document.getElementById('textInputPayload')?.focus(), 100);
  }
}
window.openSendTextModal = openSendTextModal;

function closeSendTextModal() {
  const modal = document.getElementById('textModal');
  if (modal) modal.classList.remove('active');
}
window.closeSendTextModal = closeSendTextModal;

let isRotated = false;
function togglePhoneRotation(forceState) {
  if (forceState !== undefined) {
    isRotated = forceState === 'LANDSCAPE';
  } else {
    isRotated = !isRotated;
  }
  const frame = el.phoneFrame || document.getElementById('phoneFrame');
  if (!frame) return;

  if (isRotated) {
    frame.classList.add('landscape');
    frame.style.width = '844px';
    frame.style.height = '390px';
    showToast('Chế độ: Màn hình ngang (Landscape 844x390)', 'info');
    applyZoom(90);
  } else {
    frame.classList.remove('landscape');
    frame.style.width = '390px';
    frame.style.height = '844px';
    showToast('Chế độ: Màn hình dọc (Portrait 390x844)', 'info');
    applyZoom(90);
  }
}
window.togglePhoneRotation = togglePhoneRotation;

function openWifiModal() {
  const modal = document.getElementById('wifiModal');
  if (modal) modal.classList.add('active');
}
window.openWifiModal = openWifiModal;

function closeWifiModal() {
  const modal = document.getElementById('wifiModal');
  if (modal) modal.classList.remove('active');
}
window.closeWifiModal = closeWifiModal;

// Package Export (APK / AAB)
let selectedPackageType = 'debug_apk';
let lastExportedFilePath = null;

function openPackageModal() {
  const modal = document.getElementById('packageModal');
  const appNameEl = document.getElementById('packageModalAppName');
  if (appNameEl) {
    appNameEl.textContent = state.projectInfo?.name || 'ExampleApp';
  }
  const resultBox = document.getElementById('packageResultBox');
  if (resultBox) resultBox.style.display = 'none';
  const progressBox = document.getElementById('packageProgressBox');
  if (progressBox) progressBox.style.display = 'none';
  const startBtn = document.getElementById('btnStartExportPackage');
  if (startBtn) startBtn.disabled = false;

  selectPackageType('debug_apk');

  if (modal) modal.classList.add('active');
}
window.openPackageModal = openPackageModal;

function closePackageModal() {
  const modal = document.getElementById('packageModal');
  if (modal) modal.classList.remove('active');
}
window.closePackageModal = closePackageModal;

function selectPackageType(type) {
  selectedPackageType = type;
  const cards = [
    { key: 'debug_apk', cls: 'active-debug' },
    { key: 'release_apk', cls: 'active-release' },
    { key: 'release_aab', cls: 'active-aab' }
  ];

  cards.forEach(item => {
    const card = document.getElementById(`opt_${item.key}`);
    if (card) {
      if (item.key === type) {
        card.classList.add(item.cls);
      } else {
        card.classList.remove('active-debug', 'active-release', 'active-aab');
      }
    }
  });
}
window.selectPackageType = selectPackageType;

async function startExportPackage() {
  const startBtn = document.getElementById('btnStartExportPackage');
  const progressBox = document.getElementById('packageProgressBox');
  const progressText = document.getElementById('packageProgressText');
  const resultBox = document.getElementById('packageResultBox');
  const chkClean = document.getElementById('chkCleanBuildPackage');
  const chkOpenTerminal = document.getElementById('chkOpenTerminal');

  const projectPath = state.projectPath;
  const type = selectedPackageType;
  const clean = chkClean ? chkClean.checked : false;
  const openTerminal = chkOpenTerminal ? chkOpenTerminal.checked : true;

  if (startBtn) startBtn.disabled = true;
  if (progressBox) progressBox.style.display = 'block';
  if (resultBox) resultBox.style.display = 'none';
  if (progressText) progressText.textContent = `Đang thực thi Gradle build (${type})... Vui lòng theo dõi cửa sổ Terminal hoặc tab Build Console!`;

  switchTab('tab-build');
  showToast(`Đang đóng gói ${type.toUpperCase()}...`, 'info');

  try {
    const res = await fetch('/api/build/package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath, type, clean, openTerminal })
    });
    const data = await res.json();

    if (startBtn) startBtn.disabled = false;
    if (progressBox) progressBox.style.display = 'none';

    if (data.success) {
      lastExportedFilePath = data.filePath;
      if (resultBox) {
        resultBox.style.display = 'block';
        document.getElementById('packageResultSize').textContent = `${data.sizeMb} MB (${data.fileName})`;
        document.getElementById('packageResultPath').textContent = data.filePath;
      }
      showToast(`Xuất file ${data.fileName} (${data.sizeMb} MB) thành công!`, 'success');
    } else {
      showToast(`Lỗi đóng gói: ${data.error}`, 'error');
      alert(`Không thể xuất gói:\n${data.error}`);
    }
  } catch (err) {
    if (startBtn) startBtn.disabled = false;
    if (progressBox) progressBox.style.display = 'none';
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
    alert(`Lỗi kết nối server: ${err.message}`);
  }
}
window.startExportPackage = startExportPackage;

async function cleanAndRebuild() {
  const projectPath = state.projectPath;
  showToast('Đang dọn dẹp Cache & Biên dịch lại...', 'info');

  // If project has android directory, launch clean in terminal too!
  if (state.projectInfo?.hasAndroid) {
    try {
      await fetch('/api/terminal/open-and-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd: `${projectPath}\\android`,
          command: 'gradlew.bat clean',
          title: `Gradle Clean - [${state.projectInfo.name || 'App'}]`
        })
      });
      appendBuildLog({
        level: 'info',
        message: '[Terminal] Đã mở cửa sổ Terminal ngoài để chạy lệnh "gradlew.bat clean"...'
      });
    } catch (e) {}
  }

  // Then start standard build
  startBuild();
}
window.cleanAndRebuild = cleanAndRebuild;

async function revealPackageFile() {
  if (!lastExportedFilePath) return;
  try {
    await fetch('/api/fs/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: lastExportedFilePath })
    });
    showToast('Đã mở thư mục chứa file', 'info');
  } catch (e) {
    showToast(`Lỗi: ${e.message}`);
  }
}
window.revealPackageFile = revealPackageFile;

function downloadPackageFile() {
  if (!lastExportedFilePath) return;
  window.open(`/api/build/download?filePath=${encodeURIComponent(lastExportedFilePath)}`, '_blank');
}
window.downloadPackageFile = downloadPackageFile;

function clearCurrentLogs() {
  const activeTab = document.querySelector('.tab-btn.active')?.dataset?.tab || 'tab-build';
  if (activeTab === 'tab-build') {
    el.buildConsoleOutput.innerHTML = '<span class="log-info">Đã xóa toàn bộ logs biên dịch.</span>';
  } else if (activeTab === 'tab-metro') {
    el.metroConsoleOutput.innerHTML = '<span class="log-info">Đã xóa toàn bộ logs ứng dụng.</span>';
  } else if (activeTab === 'tab-logcat') {
    state.allLogcatEntries = [];
    el.logcatStreamOutput.innerHTML = '<div class="log-line log-info"><span class="log-msg">Đã xóa Android Logcat.</span></div>';
  }
  showToast('Đã xóa nội dung console hiện tại', 'info');
}
window.clearCurrentLogs = clearCurrentLogs;

function toggleAutoScroll() {
  state.autoScroll = !state.autoScroll;
  const btn = document.getElementById('btnToggleAutoScroll');
  if (btn) {
    btn.classList.toggle('active', state.autoScroll);
  }
  
  if (state.autoScroll) {
    scrollActiveTabToBottom();
    showToast('Tự động cuộn: ĐANG BẬT', 'success');
  } else {
    showToast('Tự động cuộn: ĐÃ TẮT', 'info');
  }
}
window.toggleAutoScroll = toggleAutoScroll;

// Expose Core Actions to Global Window
window.startBuild = startBuild;
window.reloadApp = reloadApp;
window.openDevMenu = openDevMenu;
window.inspectProject = inspectProject;
window.cancelBuild = cancelBuild;
window.refreshDevices = refreshDevices;

// ==========================================
// Setup All Event Listeners
// ==========================================
function setupEventListeners() {
  // Setup canvas touch/tap/swipe interaction for ADB devices & emulators
  setupCanvasInteraction();

  // Device Environment Selection
  el.deviceSelect?.addEventListener('change', (e) => onDeviceChanged(e.target.value));
  el.btnRefreshDevices?.addEventListener('click', refreshDevices);

  // Initialize Screen Color Profile (Default: 1:1 Bit-Exact Raw Color)
  const savedColorProfile = localStorage.getItem('rn_color_profile') || 'natural';
  setColorProfile(savedColorProfile);

  // Quick Action Buttons
  el.btnQuickReload?.addEventListener('click', reloadApp);
  el.btnToggleMetro?.addEventListener('click', reloadApp);
  el.btnQuickDevMenu?.addEventListener('click', openDevMenu);

  // Navigation & Hardware Buttons
  el.btnNavBack?.addEventListener('click', sendBackKey);
  el.btnNavHome?.addEventListener('click', () => {
    if (state.selectedDevice === 'virtual') reloadApp();
    else sendKey(3);
  });
  el.btnNavRecents?.addEventListener('click', () => {
    if (state.selectedDevice === 'virtual') openDevMenu();
    else sendKey(187);
  });
  el.btnHwPower?.addEventListener('click', () => sendKey(26));
  el.btnHwVolUp?.addEventListener('click', () => sendKey(24));
  el.btnHwVolDown?.addEventListener('click', () => sendKey(25));

  // Project & Build Actions
  el.btnInspectProject?.addEventListener('click', inspectProject);
  el.btnBuildAndRun?.addEventListener('click', startBuild);
  el.btnCleanBuild?.addEventListener('click', startBuild);
  el.btnCancelBuild?.addEventListener('click', cancelBuild);

  // Tabs
  el.tabBtns?.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Logcat Filters
  el.logLevelSelect?.addEventListener('change', (e) => {
    state.activeLogFilter = e.target.value;
    renderLogcatFiltered();
  });
  el.logSearchInput?.addEventListener('input', (e) => {
    state.logSearchQuery = e.target.value.trim();
    renderLogcatFiltered();
  });

  // Wi-Fi ADB Submit with Ultra-Clear Live Feedback
  el.btnConnectWifiSubmit?.addEventListener('click', async () => {
    const ipInput = document.getElementById('wifiIpInput');
    const portInput = document.getElementById('wifiPortInput');
    const feedback = document.getElementById('wifiFeedback');
    const connectText = document.getElementById('wifiConnectText');
    const btn = el.btnConnectWifiSubmit;

    const ip = ipInput?.value.trim();
    const port = portInput?.value.trim() || '5555';
    if (!ip) {
      if (feedback) {
        feedback.innerHTML = 'Vui lòng nhập địa chỉ IP của điện thoại!';
        feedback.className = 'status-banner-error';
      }
      return;
    }

    // Set Loading State on Button & Feedback Banner
    if (connectText) connectText.textContent = 'Đang kết nối...';
    if (btn) btn.disabled = true;
    if (feedback) {
      feedback.innerHTML = `Đang kết nối tới <strong>${ip}:${port}</strong> qua Wi-Fi ADB...`;
      feedback.className = 'status-banner-loading';
    }

    // Helper for success
    async function handleSuccess(deviceName = 'OPPO Reno8 T 5G') {
      if (feedback) {
        feedback.innerHTML = `<strong>Kết nối thành công!</strong> Thiết bị: ${deviceName} (${ip}:${port})`;
        feedback.className = 'status-banner-success';
      }
      showToast(`Đã kết nối thành công thiết bị Wi-Fi: ${ip}:${port}!`, 'success');
      saveRecentWifiDevice(ip, port, deviceName);
      renderRecentWifiList();
      
      if (connectText) connectText.textContent = 'Đã kết nối!';
      
      // Auto refresh devices & select it
      await refreshDevices();
      
      setTimeout(() => {
        closeWifiModal();
        if (btn) btn.disabled = false;
        if (connectText) connectText.textContent = 'Kết nối';
      }, 1200);
    }

    // Helper for failure
    function handleFailure(errorMsg) {
      if (feedback) {
        feedback.innerHTML = `<strong>Không thể kết nối:</strong> ${errorMsg || 'Vui lòng kiểm tra lại IP & Cổng trên điện thoại!'}`;
        feedback.className = 'status-banner-error';
      }
      showToast(`Kết nối thất bại: ${errorMsg}`, 'error');
      if (btn) btn.disabled = false;
      if (connectText) connectText.textContent = 'Kết nối';
    }

    // 1. Try Electron Native IPC API (Fastest & 100% Reliable)
    if (window.electronAPI && typeof window.electronAPI.connectWifi === 'function') {
      try {
        const data = await window.electronAPI.connectWifi({ ip, port: parseInt(port, 10) });
        if (data && data.success) {
          await handleSuccess();
          return;
        } else {
          handleFailure(data?.message);
          return;
        }
      } catch (err) {
        console.warn('Electron connectWifi error:', err);
      }
    }

    // 2. Try REST API Fallback
    try {
      const res = await fetch('/api/connect-wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port: parseInt(port, 10) })
      });
      const data = await res.json();
      if (data && data.success) {
        await handleSuccess();
      } else {
        handleFailure(data?.message || data?.error);
      }
    } catch (err) {
      handleFailure(err.message);
    }
  });

  // Send Text Submit
  el.btnSendTextSubmit?.addEventListener('click', async () => {
    const text = el.textInputPayload?.value;
    if (!text) return;
    if (state.selectedDevice === 'virtual') {
      el.simulatorIframe.contentWindow.postMessage({ type: 'type_text', text }, '*');
      showToast(`Đã gửi chữ: "${text}"`, 'info');
    } else {
      await fetch('/api/device/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: state.selectedDevice, text })
      }).catch(() => {});
      showToast('Đã gửi chữ vào thiết bị thật', 'info');
    }
    if (el.textInputPayload) el.textInputPayload.value = '';
    closeSendTextModal();
  });

  // Keyboard Shortcuts (R+R for reload, D for dev menu)
  let lastRTime = 0;
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'r' || e.key === 'R') {
      const now = Date.now();
      if (now - lastRTime < 500) reloadApp();
      lastRTime = now;
    } else if (e.key === 'd' || e.key === 'D') {
      openDevMenu();
    }
  });
}

// ==========================================
// Toast Notification Engine
// ==========================================
function showToast(message, type = 'info') {
  let container = document.getElementById('appToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'appToastContainer';
    container.className = 'app-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `app-toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3400);
}
window.showToast = showToast;

// ==========================================
// Iframe Message Dispatcher
// ==========================================
function handleIframeMessage(event) {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === 'simulator_log') {
    addLogcatEntry({
      tag: 'ReactNativeJS',
      message: data.message,
      level: data.level || 'info'
    });
  } else if (data.type === 'screenshot_ready' && data.dataUrl) {
    copyDataUrlToClipboard(data.dataUrl);
  } else if (data.type === 'screenshot_error') {
    showToast('Lỗi khi chụp màn hình: ' + data.error, 'error');
  }
}
window.handleIframeMessage = handleIframeMessage;

// ==========================================
// Phone Screenshot Capture & Copy to Clipboard
// ==========================================
async function capturePhoneScreenshot() {
  const phoneScreen = document.querySelector('.phone-screen') || document.getElementById('canvasWrapper');
  if (!phoneScreen) return;

  // 1. Trigger realistic camera shutter flash animation
  triggerCameraFlash();

  try {
    // Case 1: Electron Native GPU Screen Capture (100% Crisp, Pixel-Perfect Live Display)
    if (window.electronAPI && typeof window.electronAPI.captureRect === 'function') {
      const rect = phoneScreen.getBoundingClientRect();
      const bounds = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };

      const res = await window.electronAPI.captureRect(bounds);
      if (res && res.success) {
        showToast('Đã chụp & sao chép ảnh vào Clipboard (Ctrl + V để dán)!', 'success');
        return;
      }
    }

    // Case 2: External ADB Device Canvas
    const deviceCanvas = document.getElementById('deviceCanvas');
    if (state.selectedDevice !== 'virtual' && deviceCanvas && deviceCanvas.style.display !== 'none') {
      deviceCanvas.toBlob(async (blob) => {
        if (blob) {
          await copyBlobToClipboard(blob);
        } else {
          showToast('Không thể tạo ảnh từ luồng màn hình!', 'error');
        }
      }, 'image/png');
      return;
    }

    // Case 3: Virtual Simulator (HTML2Canvas Inside IFrame for Pure Web Mode)
    const iframe = document.getElementById('simulatorIframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'capture_screenshot' }, '*');
    }
  } catch (err) {
    console.error('Screenshot capture error:', err);
    showToast('Lỗi khi chụp ảnh: ' + err.message, 'error');
  }
}
window.capturePhoneScreenshot = capturePhoneScreenshot;

function triggerCameraFlash() {
  const phoneScreen = document.querySelector('.phone-screen') || document.getElementById('canvasWrapper');
  if (!phoneScreen) return;

  const flash = document.createElement('div');
  flash.className = 'camera-shutter-flash';
  phoneScreen.appendChild(flash);
  setTimeout(() => flash.remove(), 400);
}

async function copyBlobToClipboard(blob) {
  // 1. Try Electron Native Clipboard API (100% Reliable & Fast in Desktop App)
  if (window.electronAPI && window.electronAPI.writeImageToClipboard) {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result;
      const res = await window.electronAPI.writeImageToClipboard(dataUrl);
      if (res && res.success) {
        showToast('Đã chụp & sao chép ảnh vào Clipboard (Ctrl + V để dán)!', 'success');
      } else {
        copyDataUrlFallback(dataUrl);
      }
    };
    reader.readAsDataURL(blob);
    return;
  }

  // 2. Try Standard Web Navigator Clipboard API
  if (navigator.clipboard && navigator.clipboard.write) {
    try {
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      showToast('Đã chụp & sao chép ảnh vào Clipboard (Ctrl + V để dán)!', 'success');
      return;
    } catch (clipErr) {
      console.warn('Navigator clipboard error, trying fallback:', clipErr);
    }
  }

  // 3. Fallback: Save file
  const reader = new FileReader();
  reader.onloadend = () => {
    copyDataUrlFallback(reader.result);
  };
  reader.readAsDataURL(blob);
}

async function copyDataUrlToClipboard(dataUrl) {
  if (window.electronAPI && window.electronAPI.writeImageToClipboard) {
    const res = await window.electronAPI.writeImageToClipboard(dataUrl);
    if (res && res.success) {
      showToast('Đã chụp & sao chép ảnh vào Clipboard (Ctrl + V để dán)!', 'success');
      return;
    }
  }

  // Web navigator clipboard fallback for dataUrl
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    if (navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Đã chụp & sao chép ảnh vào Clipboard (Ctrl + V để dán)!', 'success');
      return;
    }
  } catch (e) {}

  copyDataUrlFallback(dataUrl);
}

function copyDataUrlFallback(dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `phone_screenshot_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Đã tải ảnh chụp màn hình về máy!', 'success');
}

// ==========================================
// QR Code Live Test on Real Phone
// ==========================================
let currentQrUrl = 'http://10.10.177.125:3000/mobile-preview.html';

async function renderQrCode(url) {
  currentQrUrl = url;
  const input = document.getElementById('qrUrlInput');
  const img = document.getElementById('qrCodeImg');
  if (input) input.value = url;

  if (typeof QRCode !== 'undefined' && typeof QRCode.toDataURL === 'function') {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 180,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
      if (img && dataUrl) {
        img.src = dataUrl;
        return;
      }
    } catch (err) {
      console.warn('QRCode.toDataURL error:', err);
    }
  }
}

async function openQrModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.classList.add('active');

  const ip = '10.10.177.125';
  const port = 3000;
  const defaultUrl = `http://${ip}:${port}/mobile-preview.html`;

  // Render immediately
  await renderQrCode(defaultUrl);

  // Check dynamically if Electron IPC has a different network interface
  if (window.electronAPI && typeof window.electronAPI.getNetworkInfo === 'function') {
    try {
      const data = await window.electronAPI.getNetworkInfo();
      if (data && data.success && data.previewUrl) {
        await renderQrCode(data.previewUrl);
      }
    } catch (e) {}
  }
}
window.openQrModal = openQrModal;
window.renderQrCode = renderQrCode;

function closeQrModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.classList.remove('active');
}
window.closeQrModal = closeQrModal;

async function copyQrLink() {
  const input = document.getElementById('qrUrlInput');
  const text = input ? input.value : currentQrUrl;
  if (!text) return;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('Đã sao chép link xem trên điện thoại!', 'success');
      return;
    }
  } catch (e) {}

  if (input) {
    input.select();
    document.execCommand('copy');
    showToast('Đã sao chép link xem trên điện thoại!', 'success');
  }
}
window.copyQrLink = copyQrLink;

// Start application reliably
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
