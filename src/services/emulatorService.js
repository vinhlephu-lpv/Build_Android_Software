const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const adbService = require('./adbService');

class EmulatorService {
  constructor() {
    this.emulatorPath = this.resolveEmulatorPath();
    this.avdManagerPath = this.resolveAvdManagerPath();
    this.activeProcesses = new Map(); // avdName -> ChildProcess
  }

  resolveEmulatorPath() {
    const candidates = [
      'D:\\Program Files\\Emulator\\emulator\\emulator.exe',
      'C:\\Android\\emulator\\emulator.exe',
      process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'emulator', 'emulator.exe') : null,
      process.env.ANDROID_SDK_ROOT ? path.join(process.env.ANDROID_SDK_ROOT, 'emulator', 'emulator.exe') : null,
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'emulator', 'emulator.exe'),
      'emulator'
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate === 'emulator' || fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return 'D:\\Program Files\\Emulator\\emulator\\emulator.exe';
  }

  resolveAvdManagerPath() {
    const candidates = [
      'C:\\Android\\cmdline-tools\\latest\\bin\\avdmanager.bat',
      process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'cmdline-tools', 'latest', 'bin', 'avdmanager.bat') : null,
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'cmdline-tools', 'latest', 'bin', 'avdmanager.bat'),
      'avdmanager'
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate === 'avdmanager' || fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return 'C:\\Android\\cmdline-tools\\latest\\bin\\avdmanager.bat';
  }

  getAvdDirectory() {
    const customDir = 'D:\\Program Files\\Emulator\\avd';
    if (fs.existsSync(customDir)) return customDir;
    return path.join(os.homedir(), '.android', 'avd');
  }

  async listAvds() {
    this.emulatorPath = this.resolveEmulatorPath();
    const avdDir = this.getAvdDirectory();
    const avds = [];

    // Approach 1: Scan ~/.android/avd folder for *.ini files
    if (fs.existsSync(avdDir)) {
      try {
        const files = fs.readdirSync(avdDir);
        for (const file of files) {
          if (file.endsWith('.ini')) {
            const avdName = file.replace('.ini', '');
            const iniPath = path.join(avdDir, file);
            let target = 'Android';
            let pathAvd = path.join(avdDir, `${avdName}.avd`);
            
            try {
              const iniContent = fs.readFileSync(iniPath, 'utf8');
              const targetMatch = iniContent.match(/target=(.+)/);
              const pathMatch = iniContent.match(/path=(.+)/);
              if (targetMatch) target = targetMatch[1].trim();
              if (pathMatch) pathAvd = pathMatch[1].trim();
            } catch (e) {}

            avds.push({
              name: avdName,
              displayName: avdName.replace(/_/g, ' '),
              target,
              path: pathAvd,
              isRunning: false
            });
          }
        }
      } catch (err) {
        console.warn('Error scanning AVD directory:', err.message);
      }
    }

    // Approach 2: Query CLI if folder was empty
    if (avds.length === 0 && fs.existsSync(this.emulatorPath)) {
      try {
        const stdout = await new Promise((resolve) => {
          exec(`"${this.emulatorPath}" -list-avds`, { timeout: 10000 }, (err, out) => {
            resolve(err ? '' : (out || ''));
          });
        });

        const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const name of lines) {
          if (!avds.some(a => a.name === name)) {
            avds.push({
              name,
              displayName: name.replace(/_/g, ' '),
              target: 'Android (Google AVD)',
              path: path.join(avdDir, `${name}.avd`),
              isRunning: false
            });
          }
        }
      } catch (e) {}
    }

    // Check which ones are currently running in ADB
    const devices = await adbService.getDevices();
    for (const avd of avds) {
      for (const dev of devices) {
        if (dev.isEmulator) {
          // Check emulator name via adb emu avd name
          try {
            const nameRes = await adbService.execAdb(`-s ${dev.serial} emu avd name`);
            if (nameRes.success && nameRes.stdout.includes(avd.name)) {
              avd.isRunning = true;
              avd.serial = dev.serial;
              break;
            }
          } catch (e) {}
        }
      }
    }

    return avds;
  }

  async createDefaultAvd(name = 'Pixel_7_API_34', systemImage = 'system-images;android-34;google_apis;x86_64', device = 'pixel_7') {
    this.avdManagerPath = this.resolveAvdManagerPath();
    if (!fs.existsSync(this.avdManagerPath)) {
      throw new Error(`avdmanager không tìm thấy tại "${this.avdManagerPath}"`);
    }

    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const cmd = `echo no | "${this.avdManagerPath}" create avd -n "${name}" -k "${systemImage}" --device "${device}" --force`;

      exec(cmd, {
        shell: isWindows,
        env: {
          ...process.env,
          ANDROID_HOME: process.env.ANDROID_HOME || 'C:\\Android',
          ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || 'C:\\Android',
          JAVA_HOME: process.env.JAVA_HOME || 'C:\\Program Files\\Java\\jdk-17'
        }
      }, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`Tạo máy ảo thất bại: ${stderr || err.message}`));
        }

        // Optimize config.ini for high performance
        try {
          const configIniPath = path.join(this.getAvdDirectory(), `${name}.avd`, 'config.ini');
          if (fs.existsSync(configIniPath)) {
            let config = fs.readFileSync(configIniPath, 'utf8');
            const updates = {
              'hw.ramSize': '2048',
              'vm.heapSize': '512',
              'hw.gpu.enabled': 'yes',
              'hw.gpu.mode': 'host',
              'hw.keyboard': 'yes',
              'showDeviceFrame': 'no',
              'skin.dynamic': 'yes',
              'hw.lcd.density': '420',
              'hw.lcd.width': '1080',
              'hw.lcd.height': '2400'
            };

            for (const [key, val] of Object.entries(updates)) {
              const regex = new RegExp(`^${key}=.*$`, 'm');
              if (regex.test(config)) {
                config = config.replace(regex, `${key}=${val}`);
              } else {
                config += `\n${key}=${val}`;
              }
            }

            fs.writeFileSync(configIniPath, config, 'utf8');
          }
        } catch (e) {
          console.warn('Could not optimize config.ini:', e.message);
        }

        resolve({ success: true, name, message: `Máy ảo "${name}" đã được tạo thành công!` });
      });
    });
  }

  async startEmulator(avdName, options = {}, onLog = () => {}) {
    this.emulatorPath = this.resolveEmulatorPath();
    if (!fs.existsSync(this.emulatorPath)) {
      throw new Error(`Emulator executable không tìm thấy tại "${this.emulatorPath}"`);
    }

    onLog(`[AVD] Đang khởi chạy máy ảo Android: ${avdName}...`, 'info');

    const args = [
      '-avd', avdName,
      '-gpu', options.gpu || 'host',
      '-no-snapshot-load',
      '-no-boot-anim',
      '-camera-back', 'webcam0',
      '-camera-front', 'none'
    ];

    if (options.wipeData) {
      args.push('-wipe-data');
    }

    const isWindows = process.platform === 'win32';
    const proc = spawn(`"${this.emulatorPath}"`, args, {
      detached: true,
      stdio: 'ignore',
      shell: isWindows,
      env: {
        ...process.env,
        ANDROID_HOME: process.env.ANDROID_HOME || 'C:\\Android',
        ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || 'C:\\Android',
        ANDROID_AVD_HOME: 'D:\\Program Files\\Emulator\\avd',
        ANDROID_EMULATOR_HOME: 'D:\\Program Files\\Emulator'
      }
    });

    proc.unref();
    this.activeProcesses.set(avdName, proc);

    onLog('[AVD] Đang chờ máy ảo khởi động và kết nối ADB (chờ 10-30s)...', 'info');

    // Poll until emulator is detected and booted
    const serial = await this.waitForEmulatorBoot(60000, onLog);
    if (serial) {
      onLog(`[AVD] Máy ảo Android [${serial}] đã khởi động và sẵn sàng!`, 'success');
      // Auto reverse Metro port 8081
      await adbService.reversePort(serial, 8081);
      onLog(`[ADB] Đã tự động cấu hình reverse tcp:8081 cho ${serial}`, 'info');
      return { success: true, serial, avdName };
    } else {
      onLog('[AVD] Máy ảo đang khởi động ở chế độ nền. Hãy đợi thêm vài giây rồi làm mới danh sách thiết bị.', 'warn');
      return { success: true, pending: true, avdName };
    }
  }

  async waitForEmulatorBoot(timeoutMs = 60000, onLog = () => {}) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const devices = await adbService.getDevices();
      const emulatorDev = devices.find(d => d.isEmulator && d.isOnline);

      if (emulatorDev) {
        // Check if boot is completed
        try {
          const res = await adbService.execAdb(`-s ${emulatorDev.serial} shell getprop sys.boot_completed`);
          if (res.success && res.stdout.trim() === '1') {
            return emulatorDev.serial;
          }
        } catch (e) {}
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    return null;
  }

  async stopEmulator(serial) {
    if (!serial) return { success: false, error: 'Thiếu serial máy ảo' };
    
    try {
      const res = await adbService.execAdb(`-s ${serial} emu kill`);
      return { success: true, message: `Đã dừng máy ảo ${serial}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async scanAndConnectAllThirdParty(onLog = () => {}) {
    const ports = [
      { port: 5555, name: 'LDPlayer / WSA / Genymotion' },
      { port: 62001, name: 'NoxPlayer (Instance 1)' },
      { port: 62025, name: 'NoxPlayer (Instance 2)' },
      { port: 7555, name: 'MuMu Player' },
      { port: 58526, name: 'Windows Subsystem for Android (WSA)' },
      { port: 16384, name: 'BlueStacks 5 (Pie 64)' },
      { port: 21503, name: 'MEmu Play' }
    ];

    const results = [];

    for (const item of ports) {
      try {
        const connectRes = await adbService.connectWifi('127.0.0.1', item.port);
        if (connectRes.success) {
          onLog(`[AVD] Đã kết nối thành công với ${item.name} qua cổng ${item.port}`, 'success');
          results.push({ port: item.port, name: item.name, connected: true });
        }
      } catch (e) {}
    }

    return results;
  }
}

module.exports = new EmulatorService();
