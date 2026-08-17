const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let serverInstance = null;

const PORT = process.env.PORT || 3000;

function waitForServer(url, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Server timeout'));
        } else {
          setTimeout(check, 200);
        }
      });
    }
    check();
  });
}

function startBackendServer() {
  try {
    // If running in same node process
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
    title: 'Build Android Software - React Native Desktop Simulator',
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
