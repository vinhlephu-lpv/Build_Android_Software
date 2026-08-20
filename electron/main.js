const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');

// Disable GPU / Disk cache locks that cause Access is denied (0x5) on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('no-sandbox');

// Use dedicated temp directory for session data
const tempUserData = path.join(os.tmpdir(), 'bas_electron_data_' + process.pid);
try {
  app.setPath('userData', tempUserData);
} catch (e) {}

let mainWindow = null;
let serverInstance = null;

const PORT = process.env.PORT || 3000;

function waitForServer(url, timeout = 5000) {
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          resolve(); // Graceful fallback
        } else {
          setTimeout(check, 30);
        }
      });
    }
    check();
  });
}

function startBackendServer() {
  try {
    process.env.OPEN_BROWSER = 'false';
    require('../server.js');
    console.log('🚀 [Electron Main] Backend Express Server started internally on port ' + PORT);
  } catch (err) {
    console.warn('⚠️ [Electron Main] Server may already be running externally:', err.message);
  }
}

async function createWindow() {
  startBackendServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'Build Android Software - Aurasoft Systems',
    backgroundColor: '#0a0d14',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Log] ${message}`);
  });

  try {
    await waitForServer(`http://localhost:${PORT}/api/status`, 6000);
    mainWindow.loadURL(`http://localhost:${PORT}`);
  } catch (e) {
    console.warn('Loading fallback file...');
    mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==========================================
// IPC Handlers: Native Dialogs & OS Integration
// ==========================================
ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return { success: false };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục dự án React Native',
    properties: ['openDirectory'],
    buttonLabel: 'Chọn thư mục này'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false, cancelled: true };
});

ipcMain.handle('shell:showItemInFolder', (event, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
});

ipcMain.handle('screen:captureRect', async (event, bounds) => {
  try {
    if (!mainWindow) return { success: false, error: 'No main window' };
    
    let image;
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      image = await mainWindow.webContents.capturePage({
        x: Math.max(0, Math.floor(bounds.x)),
        y: Math.max(0, Math.floor(bounds.y)),
        width: Math.ceil(bounds.width),
        height: Math.ceil(bounds.height)
      });
    } else {
      image = await mainWindow.webContents.capturePage();
    }
    
    clipboard.writeImage(image);
    return { success: true, dataUrl: image.toDataURL() };
  } catch (err) {
    console.error('captureRect error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('clipboard:writeImage', (event, dataUrl) => {
  try {
    if (!dataUrl) return { success: false, error: 'No dataUrl provided' };
    const img = nativeImage.createFromDataURL(dataUrl);
    clipboard.writeImage(img);
    return { success: true };
  } catch (err) {
    console.error('Clipboard write error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('network:getInfo', async () => {
  try {
    const os = require('os');
    const QRCode = require('qrcode');
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({
            name,
            address: iface.address,
            previewUrl: `http://${iface.address}:${PORT}/mobile-preview.html`
          });
        }
      }
    }

    const primary = addresses.find(a => 
      a.name.toLowerCase().includes('wi-fi') || 
      a.name.toLowerCase().includes('wlan') || 
      a.name.toLowerCase().includes('wireless')
    ) || addresses[0] || { address: 'localhost', previewUrl: `http://localhost:${PORT}/mobile-preview.html` };

    const qrDataUrl = await QRCode.toDataURL(primary.previewUrl, {
      width: 240,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    return {
      success: true,
      port: PORT,
      primaryIp: primary.address,
      previewUrl: primary.previewUrl,
      qrDataUrl,
      allAddresses: addresses
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

const adbService = require('../src/services/adbService');

ipcMain.handle('device:connectWifi', async (event, { ip, port }) => {
  try {
    return await adbService.connectWifi(ip, port);
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('device:pairWifi', async (event, { ip, port, code }) => {
  try {
    return await adbService.pairWifi(ip, port, code);
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

// App Lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
