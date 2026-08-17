const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const open = require('open');

const adbService = require('./src/services/adbService');
const streamerService = require('./src/services/streamerService');
const metroService = require('./src/services/metroService');
const buildService = require('./src/services/buildService');
const logcatService = require('./src/services/logcatService');
const standaloneRunnerService = require('./src/services/standaloneRunnerService');
const watcherService = require('./src/services/watcherService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Default paths
const defaultProjectPath = path.resolve(__dirname, '..', 'ExampleApp');

// ==========================================
// REST APIs: Virtual Standalone Simulator (Zero Android Studio / Device Needed)
// ==========================================

// 1. Virtual Build & Serve Bundle
app.post('/api/virtual-build/build', async (req, res) => {
  const projectPath = req.body.projectPath || defaultProjectPath;

  buildService.broadcastStatus('compiling', { message: 'Đang biên dịch React Native cho Máy Ảo Nội Bộ...' });
  buildService.broadcastLog('====================================================', 'info');
  buildService.broadcastLog('🚀 KHỞI ĐỘNG BIÊN DỊCH REACT NATIVE (STANDALONE SIMULATOR)', 'info');
  buildService.broadcastLog(`📁 Thư mục dự án: ${projectPath}`, 'info');
  buildService.broadcastLog('⚡ Chế độ: Máy ảo độc lập (Không cần Android Studio / Thiết bị thật)', 'info');
  buildService.broadcastLog('====================================================', 'info');

  try {
    const result = await standaloneRunnerService.buildBundle(projectPath, (msg, level) => {
      buildService.broadcastLog(msg, level);
    });

    buildService.broadcastStatus('success', { message: 'Ứng dụng đã được nạp lên Máy Ảo thành công!' });

    // Start Live Hot Reload File Watcher on this project
    watcherService.startWatching(projectPath, async (changedFile, projPath) => {
      const fileName = path.basename(changedFile);
      buildService.broadcastLog(`⚡ [Hot Reload] Phát hiện thay đổi: ${fileName}`, 'warn');
      buildService.broadcastLog(`🔨 Đang tự động đóng gói lại mã nguồn...`, 'info');

      try {
        const reResult = await standaloneRunnerService.buildBundle(projPath, (msg, level) => {
          buildService.broadcastLog(msg, level);
        });

        buildService.broadcastLog(`🚀 [Hot Reload] Đã cập nhật ứng dụng tức thì trong ${reResult.elapsed}ms!`, 'success');
        buildService.broadcastStatus('hot_reload', {
          changedFile: fileName,
          elapsed: reResult.elapsed,
          bundleSizeKb: reResult.bundleSizeKb,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        buildService.broadcastLog(`❌ [Hot Reload Lỗi] ${e.message}`, 'error');
      }
    });

    res.json({ success: true, ...result });
  } catch (err) {
    buildService.broadcastStatus('error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/virtual-build/bundle.js', (req, res) => {
  const bundle = standaloneRunnerService.getBundle();
  if (bundle) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(bundle);
  } else {
    res.status(404).send('// Bundle not built yet. Click "BUILD & RUN APP"');
  }
});

app.get('/api/watcher/status', (req, res) => {
  res.json({ success: true, ...watcherService.getStatus() });
});

app.post('/api/watcher/toggle', (req, res) => {
  const enabled = watcherService.toggleEnabled(req.body.enabled);
  res.json({ success: true, enabled });
});

// ==========================================
// REST APIs: General & External ADB Device Support
// ==========================================

// Health & Config
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    adbPath: adbService.adbPath,
    defaultProjectPath,
    serverTime: new Date().toISOString()
  });
});

// Devices
app.get('/api/devices', async (req, res) => {
  const devices = await adbService.getDevices();
  res.json({ success: true, devices });
});

app.get('/api/device-info', async (req, res) => {
  const serial = req.query.serial || '';
  const info = await adbService.getDeviceInfo(serial);
  res.json({ success: true, info });
});

app.post('/api/connect-wifi', async (req, res) => {
  const { ip, port } = req.body;
  if (!ip) return res.status(400).json({ success: false, error: 'IP is required' });
  const result = await adbService.connectWifi(ip, port || 5555);
  res.json(result);
});

// Package Export (APK / AAB)
app.post('/api/build/package', async (req, res) => {
  const projectPath = req.body.projectPath || defaultProjectPath;
  const type = req.body.type || 'debug_apk';
  const clean = !!req.body.clean;

  try {
    const result = await buildService.buildPackage(projectPath, type, { clean });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/fs/reveal', (req, res) => {
  const filePath = req.body.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File does not exist' });
  }
  const { exec } = require('child_process');
  if (process.platform === 'win32') {
    exec(`explorer.exe /select,"${filePath.replace(/\//g, '\\')}"`, () => {});
  } else {
    exec(`open "${path.dirname(filePath)}"`, () => {});
  }
  res.json({ success: true });
});

app.get('/api/build/download', (req, res) => {
  const filePath = req.query.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  res.download(filePath);
});

// Run commands in native external Terminal window
app.post('/api/terminal/open-and-run', (req, res) => {
  const { cwd, command, title } = req.body;
  const targetDir = cwd || defaultProjectPath;
  const cmdToRun = command || 'gradlew.bat clean';
  const termTitle = title || 'Android Terminal';

  const { exec } = require('child_process');
  if (process.platform === 'win32') {
    const fullCmd = `start "${termTitle}" cmd.exe /k "title ${termTitle} && color 0B && echo ======================================================== && echo 🚀 THUC THI LENH TRUC TIEP: && echo 📁 Thu muc: ${targetDir} && echo 🔨 Lenh: ${cmdToRun} && echo 💡 Nhan Ctrl+C de dung tien trinh bat ky luc nao! && echo ======================================================== && echo. && cd /d \"${targetDir.replace(/\//g, '\\')}\" && ${cmdToRun}"`;
    exec(fullCmd, { cwd: targetDir }, (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: 'Đã mở cửa sổ Terminal ngoài' });
    });
  } else {
    exec(`open -a Terminal "${targetDir}"`, () => {
      res.json({ success: true });
    });
  }
});

// Project Management & Native Folder Dialog
let activeDialogProcess = null;

app.post('/api/dialog/pick-folder', (req, res) => {
  const { exec } = require('child_process');
  
  if (activeDialogProcess) {
    try { activeDialogProcess.kill(); } catch (e) {}
    activeDialogProcess = null;
  }

  const scriptPath = path.join(__dirname, 'src', 'utils', 'pickFolder.ps1');
  const cmd = `powershell -Sta -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;

  activeDialogProcess = exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
    activeDialogProcess = null;
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    const selectedPath = (stdout || '').trim();
    if (selectedPath) {
      res.json({ success: true, path: selectedPath });
    } else {
      res.json({ success: false, cancelled: true });
    }
  });
});

app.get('/api/projects/discover', (req, res) => {
  const baseDirs = [
    'd:\\My_Software',
    'D:\\reactnative\\codereact'
  ];

  const validProjects = [];
  const visited = new Set();

  for (const base of baseDirs) {
    if (fs.existsSync(base)) {
      const selfInspect = buildService.inspectProject(base);
      if (selfInspect.valid && selfInspect.reactNativeVersion !== 'Unknown' && !visited.has(base.toLowerCase())) {
        visited.add(base.toLowerCase());
        validProjects.push({ path: base, name: selfInspect.name || path.basename(base), ...selfInspect });
      }

      try {
        const entries = fs.readdirSync(base, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPath = path.join(base, entry.name);
            if (!visited.has(subPath.toLowerCase())) {
              const inspect = buildService.inspectProject(subPath);
              if (inspect.valid && inspect.reactNativeVersion !== 'Unknown') {
                visited.add(subPath.toLowerCase());
                validProjects.push({ path: subPath, name: inspect.name || entry.name, ...inspect });
              } else {
                try {
                  const nestedEntries = fs.readdirSync(subPath, { withFileTypes: true });
                  for (const nested of nestedEntries) {
                    if (nested.isDirectory()) {
                      const nestedPath = path.join(subPath, nested.name);
                      if (!visited.has(nestedPath.toLowerCase())) {
                        const nestedInspect = buildService.inspectProject(nestedPath);
                        if (nestedInspect.valid && nestedInspect.reactNativeVersion !== 'Unknown') {
                          visited.add(nestedPath.toLowerCase());
                          validProjects.push({ path: nestedPath, name: nestedInspect.name || nested.name, ...nestedInspect });
                        }
                      }
                    }
                  }
                } catch (e) {}
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  res.json({ success: true, projects: validProjects });
});

app.get('/api/fs/browse', (req, res) => {
  let targetDir = req.query.dir || 'D:\\reactnative\\codereact';
  if (!fs.existsSync(targetDir)) {
    targetDir = 'D:\\';
    if (!fs.existsSync(targetDir)) targetDir = 'C:\\';
  }

  try {
    const parentDir = path.dirname(targetDir);
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const folders = [];

    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '$RECYCLE.BIN') {
        const fullPath = path.join(targetDir, e.name);
        const inspect = buildService.inspectProject(fullPath);
        folders.push({
          name: e.name,
          path: fullPath,
          isRN: inspect.valid && inspect.reactNativeVersion !== 'Unknown',
          appName: inspect.name || e.name,
          rnVersion: inspect.reactNativeVersion
        });
      }
    }

    folders.sort((a, b) => {
      if (a.isRN && !b.isRN) return -1;
      if (!a.isRN && b.isRN) return 1;
      return a.name.localeCompare(b.name);
    });

    const isCurrentDirRN = buildService.inspectProject(targetDir);

    res.json({
      success: true,
      currentDir: targetDir,
      parentDir: parentDir !== targetDir ? parentDir : null,
      isRN: isCurrentDirRN.valid && isCurrentDirRN.reactNativeVersion !== 'Unknown',
      appName: isCurrentDirRN.name || path.basename(targetDir),
      rnVersion: isCurrentDirRN.reactNativeVersion,
      folders
    });
  } catch (err) {
    res.json({ success: false, error: err.message, currentDir: targetDir });
  }
});

app.post('/api/project/inspect', (req, res) => {
  const projectPath = req.body.projectPath || defaultProjectPath;
  const result = buildService.inspectProject(projectPath);
  res.json({ success: result.valid, project: result });
});

// Native ADB Gradle Build Pipeline
app.post('/api/build/start', async (req, res) => {
  const projectPath = req.body.projectPath || defaultProjectPath;
  const serial = req.body.serial || '';
  const clean = !!req.body.clean;

  buildService.buildAndRun(projectPath, serial, { clean }).catch(err => {
    console.error('Build error:', err);
  });

  res.json({ success: true, message: 'Build pipeline started' });
});

app.post('/api/build/cancel', (req, res) => {
  buildService.cancelBuild();
  res.json({ success: true, message: 'Build cancelled' });
});

// Metro Bundler
app.post('/api/metro/start', async (req, res) => {
  const projectPath = req.body.projectPath || defaultProjectPath;
  const resetCache = !!req.body.resetCache;
  const result = await metroService.startMetro(projectPath, { resetCache });
  res.json(result);
});

app.post('/api/metro/stop', async (req, res) => {
  const result = await metroService.stopMetro();
  res.json(result);
});

app.post('/api/metro/reload', async (req, res) => {
  const serial = req.body.serial || '';
  const result = await metroService.reloadApp(serial);
  res.json(result);
});

app.post('/api/metro/dev-menu', async (req, res) => {
  const serial = req.body.serial || '';
  const result = await metroService.openDevMenu(serial);
  res.json(result);
});

// Device Input & Key Events
app.post('/api/device/key', async (req, res) => {
  const { serial, keycode } = req.body;
  if (keycode === undefined) return res.status(400).json({ success: false, error: 'Keycode is required' });
  const result = await adbService.sendKeyEvent(serial, keycode);
  res.json(result);
});

app.post('/api/device/text', async (req, res) => {
  const { serial, text } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'Text is required' });
  const result = await adbService.sendText(serial, text);
  res.json(result);
});

app.get('/api/device/screenshot', async (req, res) => {
  const serial = req.query.serial || '';
  const result = await adbService.takeScreenshot(serial);
  if (result.success && result.buffer) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="screenshot-${Date.now()}.png"`);
    return res.send(result.buffer);
  }
  res.status(500).json({ success: false, error: result.error || 'Failed to capture screenshot' });
});

// ==========================================
// WebSockets Hub
// ==========================================
const wssStream = new WebSocketServer({ noServer: true });
const wssLogs = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;

  if (pathname === '/ws/stream') {
    wssStream.handleUpgrade(request, socket, head, (ws) => {
      wssStream.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/logs') {
    wssLogs.handleUpgrade(request, socket, head, (ws) => {
      wssLogs.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wssStream.on('connection', (ws) => {
  ws.on('message', (message) => {
    streamerService.handleInputMessage(ws, message);
  });

  ws.on('close', () => {
    streamerService.stopStream(ws);
  });
});

wssLogs.on('connection', (ws) => {
  buildService.subscribeLogs(ws);
  metroService.subscribeLogs(ws);
  logcatService.subscribeLogs(ws);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'start_logcat' && data.serial) {
        logcatService.startLogcat(data.serial);
      } else if (data.type === 'stop_logcat' && data.serial) {
        logcatService.stopLogcat(data.serial);
      } else if (data.type === 'clear_logcat') {
        logcatService.clearLogs();
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    buildService.unsubscribeLogs(ws);
    metroService.unsubscribeLogs(ws);
    logcatService.unsubscribeLogs(ws);
  });
});

// SPA Fallback for Simulator Navigation (handles /MainTabs/*, /PlanTab, etc.)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'simulator.html'));
});

// ==========================================
// Start Server
// ==========================================
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n======================================================`);
  console.log(`🚀 Build Android Software is RUNNING!`);
  console.log(`🌐 Web Interface: ${url}`);
  console.log(`📂 Default RN Project: ${defaultProjectPath}`);
  console.log(`📱 Mode: Standalone Virtual Simulator (Zero Android Studio / Physical Device Required)`);
  console.log(`======================================================\n`);

  if (process.env.OPEN_BROWSER !== 'false') {
    open(url).catch(() => {});
  }
});
