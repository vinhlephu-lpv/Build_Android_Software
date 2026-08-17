const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const adbService = require('./adbService');

class MetroService {
  constructor() {
    this.process = null;
    this.projectPath = null;
    this.port = 8081;
    this.logSubscribers = new Set();
    this.logHistory = [];
  }

  subscribeLogs(ws) {
    this.logSubscribers.add(ws);
    // Send recent log history
    if (this.logHistory.length > 0) {
      ws.send(JSON.stringify({
        type: 'metro_history',
        logs: this.logHistory
      }));
    }
  }

  unsubscribeLogs(ws) {
    this.logSubscribers.delete(ws);
  }

  broadcastLog(logText, type = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message: logText
    };

    this.logHistory.push(entry);
    if (this.logHistory.length > 500) {
      this.logHistory.shift();
    }

    const payload = JSON.stringify({
      type: 'metro_log',
      entry
    });

    for (const ws of this.logSubscribers) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  broadcastStatus(isRunning) {
    const payload = JSON.stringify({
      type: 'metro_status',
      isRunning,
      port: this.port
    });

    for (const ws of this.logSubscribers) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  async checkMetroAlive() {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${this.port}/status`, { timeout: 1500 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve(data.includes('packager-status:running') || res.statusCode === 200);
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async startMetro(projectPath, options = {}) {
    if (this.process) {
      this.broadcastLog('Metro is already running.', 'warn');
      return { success: true, message: 'Metro already running' };
    }

    this.projectPath = projectPath;
    this.port = options.port || 8081;

    this.broadcastLog(`Starting Metro Bundler for project: ${projectPath} on port ${this.port}...`, 'info');

    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npx.cmd' : 'npx';
    const args = ['react-native', 'start', '--port', `${this.port}`];

    if (options.resetCache) {
      args.push('--reset-cache');
    }

    try {
      this.process = spawn(npmCmd, args, {
        cwd: projectPath,
        shell: isWindows,
        env: { ...process.env, FORCE_COLOR: 'true' }
      });

      this.broadcastStatus(true);

      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        this.broadcastLog(text, 'stdout');
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        this.broadcastLog(text, 'stderr');
      });

      this.process.on('error', (err) => {
        this.broadcastLog(`Metro process error: ${err.message}`, 'error');
        this.process = null;
        this.broadcastStatus(false);
      });

      this.process.on('close', (code) => {
        this.broadcastLog(`Metro Bundler exited with code ${code}`, 'info');
        this.process = null;
        this.broadcastStatus(false);
      });

      return { success: true, message: 'Metro started' };
    } catch (err) {
      this.broadcastLog(`Failed to spawn Metro: ${err.message}`, 'error');
      this.process = null;
      this.broadcastStatus(false);
      return { success: false, error: err.message };
    }
  }

  async stopMetro() {
    if (!this.process) {
      this.broadcastStatus(false);
      return { success: true, message: 'Metro is not running' };
    }

    const pid = this.process.pid;
    this.broadcastLog(`Stopping Metro Bundler (PID: ${pid})...`, 'info');

    if (process.platform === 'win32') {
      exec(`taskkill /pid ${pid} /T /F`, () => {});
    } else {
      this.process.kill('SIGTERM');
    }

    this.process = null;
    this.broadcastStatus(false);
    return { success: true, message: 'Metro stopped' };
  }

  async reloadApp(serial) {
    this.broadcastLog('Reloading React Native Application...', 'info');

    // 1. Try reverse port
    if (serial) {
      await adbService.reversePort(serial, this.port);
    }

    // 2. Trigger reload via HTTP endpoint if Metro is up
    try {
      await new Promise((resolve) => {
        const req = http.get(`http://localhost:${this.port}/reload`, { timeout: 1000 }, resolve);
        req.on('error', resolve);
      });
    } catch (e) {}

    // 3. Fallback: ADB double 'r' keyevent or Dev menu reload
    if (serial) {
      await adbService.sendKeyEvent(serial, 82); // Dev Menu
      setTimeout(async () => {
        await adbService.sendKeyEvent(serial, 66); // Enter / Select Reload
      }, 300);
    }

    return { success: true, message: 'Reload signal dispatched' };
  }

  async openDevMenu(serial) {
    if (serial) {
      await adbService.sendKeyEvent(serial, 82); // KEYCODE_MENU / Dev Menu
      return { success: true, message: 'Dev Menu opened' };
    }
    return { success: false, error: 'No serial provided' };
  }
}

module.exports = new MetroService();
