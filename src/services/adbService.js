const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AdbService {
  constructor() {
    this.adbPath = this.resolveAdbPath();
  }

  resolveAdbPath() {
    const candidates = [
      'C:\\Android\\platform-tools\\adb.exe',
      process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe') : null,
      process.env.ANDROID_SDK_ROOT ? path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe') : null,
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
      'adb'
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate === 'adb' || fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return 'adb';
  }

  execAdb(args, options = {}) {
    return new Promise((resolve, reject) => {
      const command = `"${this.adbPath}" ${args}`;
      exec(command, { maxBuffer: 1024 * 1024 * 10, ...options }, (error, stdout, stderr) => {
        if (error) {
          return resolve({ success: false, error: stderr || error.message, stdout });
        }
        resolve({ success: true, stdout: stdout.trim(), stderr });
      });
    });
  }

  async getDevices() {
    const res = await this.execAdb('devices -l');
    if (!res.success) {
      return [];
    }

    const lines = res.stdout.split('\n').map(l => l.trim()).filter(Boolean);
    const devices = [];

    // Skip the first line: "List of devices attached"
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const serial = parts[0];
        const state = parts[1];
        
        let model = 'Android Device';
        let product = '';
        let deviceName = '';
        
        for (const part of parts.slice(2)) {
          if (part.startsWith('model:')) model = part.replace('model:', '').replace(/_/g, ' ');
          if (part.startsWith('product:')) product = part.replace('product:', '');
          if (part.startsWith('device:')) deviceName = part.replace('device:', '');
        }

        const isEmulator = serial.startsWith('emulator-');

        devices.push({
          serial,
          state,
          model,
          product,
          deviceName,
          isEmulator,
          isOnline: state === 'device'
        });
      }
    }

    return devices;
  }

  async connectWifi(ip, port = 5555) {
    const target = `${ip}:${port}`;
    const res = await this.execAdb(`connect ${target}`);
    return {
      success: res.success && res.stdout.includes('connected'),
      message: res.stdout || res.error
    };
  }

  async pairWifi(ip, port, code) {
    const target = `${ip}:${port}`;
    const res = await this.execAdb(`pair ${target} ${code}`);
    return {
      success: res.success && res.stdout.toLowerCase().includes('successfully paired'),
      message: res.stdout || res.error
    };
  }

  async disconnectWifi(ip, port = 5555) {
    const target = `${ip}:${port}`;
    const res = await this.execAdb(`disconnect ${target}`);
    return {
      success: res.success,
      message: res.stdout || res.error
    };
  }

  async getDeviceInfo(serial) {
    const prefix = serial ? `-s ${serial}` : '';
    
    // Get screen size
    const sizeRes = await this.execAdb(`${prefix} shell wm size`);
    let width = 1080;
    let height = 2400;
    if (sizeRes.success) {
      const match = sizeRes.stdout.match(/Physical size:\s*(\d+)x(\d+)/i) || sizeRes.stdout.match(/(\d+)x(\d+)/);
      if (match) {
        width = parseInt(match[1], 10);
        height = parseInt(match[2], 10);
      }
    }

    // Get density
    const densityRes = await this.execAdb(`${prefix} shell wm density`);
    let density = 420;
    if (densityRes.success) {
      const match = densityRes.stdout.match(/Physical density:\s*(\d+)/i) || densityRes.stdout.match(/(\d+)/);
      if (match) {
        density = parseInt(match[1], 10);
      }
    }

    // Get Android release version & SDK API level
    const releaseRes = await this.execAdb(`${prefix} shell getprop ro.build.version.release`);
    const sdkRes = await this.execAdb(`${prefix} shell getprop ro.build.version.sdk`);
    const manufacturerRes = await this.execAdb(`${prefix} shell getprop ro.product.manufacturer`);
    const modelRes = await this.execAdb(`${prefix} shell getprop ro.product.model`);

    // Get battery level
    const batteryRes = await this.execAdb(`${prefix} shell dumpsys battery`);
    let batteryLevel = 100;
    let isCharging = false;
    if (batteryRes.success) {
      const levelMatch = batteryRes.stdout.match(/level:\s*(\d+)/i);
      const statusMatch = batteryRes.stdout.match(/status:\s*(\d+)/i);
      if (levelMatch) batteryLevel = parseInt(levelMatch[1], 10);
      if (statusMatch && (statusMatch[1] === '2' || statusMatch[1] === '5')) isCharging = true;
    }

    return {
      serial,
      width,
      height,
      density,
      aspectRatio: (height / width).toFixed(2),
      androidVersion: releaseRes.success ? releaseRes.stdout : 'Unknown',
      sdkLevel: sdkRes.success ? sdkRes.stdout : 'Unknown',
      manufacturer: manufacturerRes.success ? manufacturerRes.stdout : '',
      model: modelRes.success ? modelRes.stdout : '',
      batteryLevel,
      isCharging
    };
  }

  async sendKeyEvent(serial, keycode) {
    const prefix = serial ? `-s ${serial}` : '';
    return await this.execAdb(`${prefix} shell input keyevent ${keycode}`);
  }

  async sendTap(serial, x, y) {
    const prefix = serial ? `-s ${serial}` : '';
    return await this.execAdb(`${prefix} shell input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  async sendSwipe(serial, x1, y1, x2, y2, durationMs = 250) {
    const prefix = serial ? `-s ${serial}` : '';
    return await this.execAdb(`${prefix} shell input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${durationMs}`);
  }

  async sendText(serial, text) {
    const prefix = serial ? `-s ${serial}` : '';
    // Escape special characters for adb input text
    const escaped = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/&/g, '\\&')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
      .replace(/\|/g, '\\|')
      .replace(/;/g, '\\;')
      .replace(/ /g, '%s');
    return await this.execAdb(`${prefix} shell input text "${escaped}"`);
  }

  async reversePort(serial, port = 8081) {
    const prefix = serial ? `-s ${serial}` : '';
    return await this.execAdb(`${prefix} reverse tcp:${port} tcp:${port}`);
  }

  async installApk(serial, apkPath) {
    const prefix = serial ? `-s ${serial}` : '';
    return await this.execAdb(`${prefix} install -r -d "${apkPath}"`);
  }

  async launchApp(serial, component) {
    const prefix = serial ? `-s ${serial}` : '';
    return await this.execAdb(`${prefix} shell am start -n "${component}"`);
  }

  async takeScreenshot(serial) {
    const prefix = serial ? `-s ${serial}` : '';
    return new Promise((resolve) => {
      const chunks = [];
      const proc = spawn(this.adbPath, [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p']);

      proc.stdout.on('data', chunk => chunks.push(chunk));
      proc.on('close', code => {
        if (code === 0 && chunks.length > 0) {
          const buffer = Buffer.concat(chunks);
          resolve({ success: true, buffer });
        } else {
          resolve({ success: false, error: `Screencap failed with exit code ${code}` });
        }
      });
      proc.on('error', err => resolve({ success: false, error: err.message }));
    });
  }
}

module.exports = new AdbService();
