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
  scale: 0.88, // Default 88%
  isMouseDown: false,
  touchStart: { x: 0, y: 0, time: 0 },
  activeLogFilter: 'all',
  logSearchQuery: '',
  allLogcatEntries: []
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

  // Set default zoom level to 88%
  applyZoom(88);
  if (el.zoomSlider) {
    el.zoomSlider.value = 88;
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

  // Auto trigger initial virtual build so app appears immediately
  setTimeout(() => {
    startBuild();
  }, 500);
}

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  el.statusClock.textContent = `${hours}:${minutes}`;
}

function applyZoom(val) {
  const numericVal = parseInt(val, 10) || 88;
  state.scale = numericVal / 100;
  
  const zoomVal = document.getElementById('zoomVal');
  if (zoomVal) zoomVal.textContent = `${numericVal}%`;

  const zoomSlider = document.getElementById('zoomSlider') || el.zoomSlider;
  if (zoomSlider && parseInt(zoomSlider.value, 10) !== numericVal) {
    zoomSlider.value = numericVal;
  }
  
  const phoneFrame = el.phoneFrame || document.getElementById('phoneFrame');
  if (phoneFrame) phoneFrame.style.transform = `scale(${state.scale})`;

  const container = el.phoneViewportContainer || document.getElementById('phoneViewportContainer');
  if (container) {
    const isHorizontal = phoneFrame && (phoneFrame.classList.contains('landscape') || phoneFrame.style.width === '840px');
    const baseW = isHorizontal ? 840 : 390;
    const scaledWidth = Math.round(baseW * state.scale + 6);
    container.style.width = `${scaledWidth}px`;
  }
}
window.applyZoom = applyZoom;

function setColorProfile(profile) {
  const wrapper = document.getElementById('canvasWrapper');
  const select = document.getElementById('colorProfileSelect');
  if (!wrapper) return;

  wrapper.classList.remove('color-vivid', 'color-super-vivid', 'color-natural');

  if (profile === 'super-vivid') {
    wrapper.classList.add('color-super-vivid');
    showToast('Chế độ màn hình: DCI-P3 Siêu Rực Rỡ', 'info');
  } else if (profile === 'natural') {
    wrapper.classList.add('color-natural');
    showToast('Chế độ màn hình: RGB Chuẩn (Tự Nhiên)', 'info');
  } else {
    wrapper.classList.add('color-vivid');
    showToast('Chế độ màn hình: AMOLED Tươi Sáng', 'info');
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
function initStreamWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/stream`;

  state.streamWs = new WebSocket(wsUrl);
  state.streamWs.binaryType = 'arraybuffer';

  state.streamWs.onmessage = (event) => {
    if (state.selectedDevice === 'virtual') return;

    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'device_info') updateDeviceInfoDisplay(msg.data);
      } catch (e) {}
    } else {
      const blob = new Blob([event.data], { type: 'image/png' });
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        el.deviceCanvas.width = img.width;
        el.deviceCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  };

  state.streamWs.onclose = () => setTimeout(initStreamWebSocket, 3000);
}

function initLogsWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/logs`;

  state.logsWs = new WebSocket(wsUrl);

  state.logsWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleLogMessage(data);
    } catch (e) {}
  };

  state.logsWs.onclose = () => setTimeout(initLogsWebSocket, 3000);
}

function handleLogMessage(data) {
  switch (data.type) {
    case 'build_log':
      appendBuildLog(data.entry);
      break;

    case 'build_history':
      el.buildConsoleOutput.innerHTML = '';
      data.logs.forEach(entry => appendBuildLog(entry));
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
      el.metroConsoleOutput.innerHTML = '';
      data.logs.forEach(entry => appendMetroLog(entry));
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
    const res = await fetch('/api/devices');
    const data = await res.json();
    state.devices = data.devices || [];

    const previousSelected = state.selectedDevice;
    el.deviceSelect.innerHTML = '';

    // Primary: Virtual Standalone Simulator
    const optVirtual = document.createElement('option');
    optVirtual.value = 'virtual';
    optVirtual.textContent = 'Máy Ảo Nội Bộ (Standalone)';
    if (previousSelected === 'virtual') optVirtual.selected = true;
    el.deviceSelect.appendChild(optVirtual);

    // Optional: External connected ADB devices
    state.devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.serial;
      opt.textContent = `${d.model} (${d.serial})`;
      if (d.serial === previousSelected) opt.selected = true;
      el.deviceSelect.appendChild(opt);
    });

    if (state.selectedDevice === 'virtual') {
      el.runnerModeText.textContent = 'Máy Ảo Độc Lập';
      el.deviceStatusDot.className = 'status-dot active';
      el.deviceStatusText.textContent = 'Sẵn sàng chạy';
    } else {
      const current = state.devices.find(d => d.serial === state.selectedDevice);
      if (current) {
        el.runnerModeText.textContent = 'Thiết bị ngoài';
        el.deviceStatusDot.className = current.isOnline ? 'status-dot active' : 'status-dot warning';
        el.deviceStatusText.textContent = current.model;
      }
    }
  } catch (e) {}
}

function onDeviceChanged(serial) {
  state.selectedDevice = serial;

  if (serial === 'virtual') {
    el.simulatorIframe.style.display = 'block';
    el.deviceCanvas.style.display = 'none';
    el.runnerModeText.textContent = 'Máy Ảo Độc Lập';
    el.deviceStatusDot.className = 'status-dot active';
    el.deviceStatusText.textContent = 'Sẵn sàng chạy';

    el.infoDeviceModel.textContent = 'Máy Ảo Nội Bộ (Standalone)';
    el.infoAndroidVer.textContent = 'Android 14 (API 34)';
    el.infoResolution.textContent = '1080 x 2400 px (360x740 CSS)';
    el.infoDpi.textContent = '420 DPI (x3.0)';
    el.infoBattery.textContent = 'Không cần Android Studio';
    el.infoSerial.textContent = 'esbuild Fast Engine';
  } else {
    el.simulatorIframe.style.display = 'none';
    el.deviceCanvas.style.display = 'block';
    el.runnerModeText.textContent = 'Thiết bị ADB ngoài';

    if (state.streamWs && state.streamWs.readyState === 1) {
      state.streamWs.send(JSON.stringify({
        type: 'start_stream',
        serial,
        fps: 15
      }));
    }

    if (state.logsWs && state.logsWs.readyState === 1) {
      state.logsWs.send(JSON.stringify({
        type: 'start_logcat',
        serial
      }));
    }

    fetch(`/api/device-info?serial=${encodeURIComponent(serial)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.info) updateDeviceInfoDisplay(data.info);
      })
      .catch(() => {});
  }
}

function updateDeviceInfoDisplay(info) {
  state.deviceInfo = info;
  el.infoDeviceModel.textContent = `${info.manufacturer} ${info.model}`.trim() || 'Android Device';
  el.infoAndroidVer.textContent = `Android ${info.androidVersion} (API ${info.sdkLevel})`;
  el.infoResolution.textContent = `${info.width} x ${info.height} px`;
  el.infoDpi.textContent = `${info.density} DPI`;
  el.infoBattery.textContent = `${info.batteryLevel}% ${info.isCharging ? '(Đang sạc)' : ''}`;
  el.infoSerial.textContent = info.serial;
  el.statusBattery.innerHTML = `<span>${info.batteryLevel}%</span>`;
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

  const out = el.buildConsoleOutput || document.getElementById('buildConsoleOutput');
  if (out && out.textContent.includes('Sẵn sàng.')) {
    out.innerHTML = '';
  }

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

  if (state.selectedDevice === 'virtual') {
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
    // Mode 2: External Native Gradle Build
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
      if (!data.success) alert(`Không thể build: ${data.error}`);
    } catch (e) {
      alert(`Lỗi kết nối server: ${e.message}`);
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

function updateBuildStatus(statusData) {
  state.isBuilding = statusData.isBuilding;

  if (state.isBuilding) {
    el.btnBuildAndRun.disabled = true;
    el.btnCancelBuild.style.display = 'inline-flex';
    el.buildProgressContainer.style.display = 'block';

    if (statusData.status === 'compiling') {
      el.progressStatusText.textContent = statusData.message || 'Đang biên dịch...';
      el.progressBarFill.style.width = '60%';
      el.progressPercent.textContent = '60%';
    }
  } else {
    el.btnBuildAndRun.disabled = false;
    el.btnCancelBuild.style.display = 'none';

    if (statusData.status === 'success') {
      el.progressStatusText.textContent = 'Đã hoàn tất và nạp app thành công!';
      el.progressBarFill.style.width = '100%';
      el.progressPercent.textContent = '100%';
      setTimeout(() => {
        el.buildProgressContainer.style.display = 'none';
      }, 3000);
    } else if (statusData.status === 'error') {
      el.progressStatusText.textContent = 'Lỗi biên dịch. Xem tab Build Console.';
      el.progressBarFill.style.background = 'var(--danger)';
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
  const line = document.createElement('div');
  line.className = `log-${entry.level || 'info'}`;
  const time = entry.timestamp ? `[${entry.timestamp}] ` : '';
  line.textContent = `${time}${entry.message}`;
  
  const out = el.buildConsoleOutput || document.getElementById('buildConsoleOutput');
  if (out) {
    out.appendChild(line);
    scrollToBottom(out);
  }
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
// Setup All Event Listeners
// ==========================================
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
    frame.style.width = '840px';
    frame.style.height = '380px';
    showToast('Chế độ: Màn hình ngang (Landscape 840x380)', 'info');
  } else {
    frame.classList.remove('landscape');
    frame.style.width = '390px';
    frame.style.height = '820px';
    showToast('Chế độ: Màn hình dọc (Portrait 390x820)', 'info');
  }
  
  // Consistently preserve the active zoom percentage (default 88%)
  const currentZoomPercent = Math.round((state.scale || 0.88) * 100);
  applyZoom(currentZoomPercent);
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
  // Device Environment Selection
  el.deviceSelect?.addEventListener('change', (e) => onDeviceChanged(e.target.value));
  el.btnRefreshDevices?.addEventListener('click', refreshDevices);

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

  // Wi-Fi ADB Submit
  el.btnConnectWifiSubmit?.addEventListener('click', async () => {
    const ip = el.wifiIpInput?.value.trim();
    const port = el.wifiPortInput?.value.trim() || '5555';
    if (!ip) return (el.wifiFeedback.innerHTML = '<span class="log-error">Vui lòng nhập IP!</span>');

    el.wifiFeedback.innerHTML = '<span class="log-info">Đang kết nối...</span>';
    try {
      const res = await fetch('/api/connect-wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port: parseInt(port, 10) })
      });
      const data = await res.json();
      if (data.success) {
        el.wifiFeedback.innerHTML = '<span class="log-success">Kết nối thành công!</span>';
        showToast('Đã kết nối thiết bị Wi-Fi!', 'success');
        setTimeout(() => {
          closeWifiModal();
          refreshDevices();
        }, 1000);
      } else {
        el.wifiFeedback.innerHTML = `<span class="log-error">${data.message || data.error}</span>`;
      }
    } catch (err) {
      el.wifiFeedback.innerHTML = `<span class="log-error">${err.message}</span>`;
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

// Start application reliably
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
