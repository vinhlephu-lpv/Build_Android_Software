const { spawn } = require('child_process');
const adbService = require('./adbService');

class LogcatService {
  constructor() {
    this.processes = new Map(); // serial -> child_process
    this.logSubscribers = new Set();
    this.logHistory = [];
  }

  subscribeLogs(ws) {
    this.logSubscribers.add(ws);
    if (this.logHistory.length > 0) {
      ws.send(JSON.stringify({
        type: 'logcat_history',
        logs: this.logHistory.slice(-200)
      }));
    }
  }

  unsubscribeLogs(ws) {
    this.logSubscribers.delete(ws);
  }

  broadcastLog(logEntry) {
    this.logHistory.push(logEntry);
    if (this.logHistory.length > 2000) {
      this.logHistory.shift();
    }

    const payload = JSON.stringify({
      type: 'logcat_entry',
      entry: logEntry
    });

    for (const ws of this.logSubscribers) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  startLogcat(serial) {
    if (this.processes.has(serial)) {
      return;
    }

    const args = [...(serial ? ['-s', serial] : []), 'logcat', '-v', 'time'];
    const proc = spawn(adbService.adbPath, args);

    this.processes.set(serial, proc);

    let buffer = '';

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep last incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = this.parseLogcatLine(line);
        if (parsed) {
          this.broadcastLog(parsed);
        }
      }
    });

    proc.on('close', () => {
      this.processes.delete(serial);
    });

    proc.on('error', () => {
      this.processes.delete(serial);
    });
  }

  stopLogcat(serial) {
    const proc = this.processes.get(serial);
    if (proc) {
      proc.kill();
      this.processes.delete(serial);
    }
  }

  clearLogs() {
    this.logHistory = [];
    const payload = JSON.stringify({ type: 'logcat_clear' });
    for (const ws of this.logSubscribers) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  parseLogcatLine(line) {
    // Standard format: "08-17 14:30:12.345 I/ReactNativeJS(12345): Running "ExampleApp"..."
    const match = line.match(/^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEF])\/([^(:]+)(?:\((\s*\d+)\))?:\s*(.*)$/);
    if (match) {
      const time = match[1];
      const levelChar = match[2];
      const tag = match[3].trim();
      const pid = match[4] ? match[4].trim() : '';
      const message = match[5];

      let level = 'info';
      if (levelChar === 'V') level = 'verbose';
      else if (levelChar === 'D') level = 'debug';
      else if (levelChar === 'I') level = 'info';
      else if (levelChar === 'W') level = 'warn';
      else if (levelChar === 'E' || levelChar === 'F') level = 'error';

      const isReactNative = tag.includes('ReactNative') || tag.includes('ReactNativeJS');

      return {
        timestamp: time,
        level,
        tag,
        pid,
        message,
        isReactNative,
        raw: line
      };
    }

    return {
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      tag: 'System',
      pid: '',
      message: line,
      isReactNative: false,
      raw: line
    };
  }
}

module.exports = new LogcatService();
