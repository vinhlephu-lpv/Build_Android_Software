const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const adbService = require('./adbService');
const metroService = require('./metroService');

class BuildService {
  constructor() {
    this.isBuilding = false;
    this.currentProcess = null;
    this.logSubscribers = new Set();
    this.buildHistory = [];
  }

  subscribeLogs(ws) {
    this.logSubscribers.add(ws);
    if (this.buildHistory.length > 0) {
      ws.send(JSON.stringify({
        type: 'build_history',
        logs: this.buildHistory
      }));
    }
  }

  unsubscribeLogs(ws) {
    this.logSubscribers.delete(ws);
  }

  broadcastLog(text, level = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: text
    };

    this.buildHistory.push(entry);
    if (this.buildHistory.length > 1000) {
      this.buildHistory.shift();
    }

    const payload = JSON.stringify({
      type: 'build_log',
      entry
    });

    for (const ws of this.logSubscribers) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  broadcastStatus(status, details = {}) {
    const payload = JSON.stringify({
      type: 'build_status',
      isBuilding: this.isBuilding,
      status, // 'idle' | 'preparing' | 'compiling' | 'installing' | 'launching' | 'success' | 'error'
      ...details
    });

    for (const ws of this.logSubscribers) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  inspectProject(projectPath) {
    try {
      if (!fs.existsSync(projectPath)) {
        return { valid: false, error: 'Directory does not exist' };
      }

      const pkgPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        return { valid: false, error: 'package.json not found in project directory' };
      }

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const androidDir = path.join(projectPath, 'android');
      const hasAndroid = fs.existsSync(androidDir);
      const hasGradlew = fs.existsSync(path.join(androidDir, 'gradlew')) || fs.existsSync(path.join(androidDir, 'gradlew.bat'));

      let applicationId = 'com.exampleapp';
      const appBuildGradle = path.join(androidDir, 'app', 'build.gradle');
      if (fs.existsSync(appBuildGradle)) {
        const content = fs.readFileSync(appBuildGradle, 'utf8');
        const matchNamespace = content.match(/namespace\s+['"]([^'"]+)['"]/);
        const matchAppId = content.match(/applicationId\s+['"]([^'"]+)['"]/);
        if (matchAppId) applicationId = matchAppId[1];
        else if (matchNamespace) applicationId = matchNamespace[1];
      }

      const rnVersion = (pkg.dependencies && pkg.dependencies['react-native']) || 
                        (pkg.devDependencies && pkg.devDependencies['react-native']) || 'Unknown';

      return {
        valid: true,
        name: pkg.name || path.basename(projectPath),
        version: pkg.version || '1.0.0',
        reactNativeVersion: rnVersion,
        hasAndroid,
        hasGradlew,
        applicationId,
        projectPath
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async buildAndRun(projectPath, serial, options = {}) {
    if (this.isBuilding) {
      return { success: false, error: 'A build process is already in progress' };
    }

    this.isBuilding = true;
    this.buildHistory = [];
    this.broadcastStatus('preparing', { message: 'Analyzing project and environment...' });
    this.broadcastLog(`====================================================`, 'info');
    this.broadcastLog(`🚀 INITIATING BUILD PIPELINE`, 'info');
    this.broadcastLog(`📁 Target Project: ${projectPath}`, 'info');
    this.broadcastLog(`📱 Target Device: ${serial || 'Default Device'}`, 'info');
    this.broadcastLog(`====================================================`, 'info');

    const projectInfo = this.inspectProject(projectPath);
    if (!projectInfo.valid) {
      this.isBuilding = false;
      this.broadcastLog(`❌ Invalid project: ${projectInfo.error}`, 'error');
      this.broadcastStatus('error', { error: projectInfo.error });
      return { success: false, error: projectInfo.error };
    }

    const androidDir = path.join(projectPath, 'android');
    if (!projectInfo.hasAndroid || !projectInfo.hasGradlew) {
      this.isBuilding = false;
      this.broadcastLog('❌ Android folder or gradlew not found in project!', 'error');
      this.broadcastStatus('error', { error: 'Android directory missing' });
      return { success: false, error: 'Android directory missing' };
    }

    // Step 1: Start Metro Bundler in background if not already alive
    this.broadcastLog('⚡ Checking Metro Bundler...', 'info');
    const isMetroUp = await metroService.checkMetroAlive();
    if (!isMetroUp) {
      this.broadcastLog('⚡ Metro Bundler is not running. Starting automatically...', 'info');
      await metroService.startMetro(projectPath);
    } else {
      this.broadcastLog('✅ Metro Bundler is active on port 8081', 'info');
    }

    // Step 2: Reverse ADB Port
    if (serial) {
      this.broadcastLog(`🔗 Configuring reverse port forwarding for device ${serial}...`, 'info');
      await adbService.reversePort(serial, 8081);
    }

    // Step 3: Run Gradle Build
    this.broadcastStatus('compiling', { message: 'Compiling Android debug build via Gradle...' });
    this.broadcastLog('🔨 Executing Gradle build: gradlew.bat assembleDebug...', 'info');

    const isWindows = process.platform === 'win32';
    const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';
    const gradleArgs = ['assembleDebug'];

    if (options.clean) {
      gradleArgs.unshift('clean');
    }

    const buildSuccess = await new Promise((resolve) => {
      const proc = spawn(gradlewCmd, gradleArgs, {
        cwd: androidDir,
        shell: isWindows,
        env: {
          ...process.env,
          ANDROID_HOME: process.env.ANDROID_HOME || 'C:\\Android',
          ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || 'C:\\Android',
          JAVA_HOME: process.env.JAVA_HOME || 'C:\\Program Files\\Java\\jdk-17',
          FORCE_COLOR: 'true'
        }
      });

      this.currentProcess = proc;

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        this.broadcastLog(text, 'stdout');
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        this.broadcastLog(text, 'stderr');
      });

      proc.on('close', (code) => {
        this.currentProcess = null;
        if (code === 0) {
          resolve(true);
        } else {
          this.broadcastLog(`❌ Gradle build failed with exit code: ${code}`, 'error');
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        this.currentProcess = null;
        this.broadcastLog(`❌ Gradle execution error: ${err.message}`, 'error');
        resolve(false);
      });
    });

    if (!buildSuccess) {
      this.isBuilding = false;
      this.broadcastStatus('error', { error: 'Gradle compilation failed' });
      return { success: false, error: 'Gradle compilation failed' };
    }

    // Step 4: Locate APK
    this.broadcastLog('📦 Locating generated debug APK...', 'info');
    const apkDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug');
    let apkPath = path.join(apkDir, 'app-debug.apk');

    if (!fs.existsSync(apkPath)) {
      if (fs.existsSync(apkDir)) {
        const files = fs.readdirSync(apkDir);
        const apkFile = files.find(f => f.endsWith('.apk'));
        if (apkFile) {
          apkPath = path.join(apkDir, apkFile);
        }
      }
    }

    if (!fs.existsSync(apkPath)) {
      this.isBuilding = false;
      this.broadcastLog(`❌ APK file not found at ${apkPath}`, 'error');
      this.broadcastStatus('error', { error: 'APK not found' });
      return { success: false, error: 'APK not found' };
    }

    this.broadcastLog(`✅ APK built successfully: ${apkPath}`, 'info');

    // Step 5: Install APK to device
    this.broadcastStatus('installing', { message: `Installing APK onto device ${serial}...` });
    this.broadcastLog(`📲 Installing ${path.basename(apkPath)} onto ${serial || 'device'}...`, 'info');

    const installRes = await adbService.installApk(serial, apkPath);
    if (!installRes.success) {
      this.isBuilding = false;
      this.broadcastLog(`❌ Failed to install APK: ${installRes.error || installRes.stdout}`, 'error');
      this.broadcastStatus('error', { error: 'APK installation failed' });
      return { success: false, error: installRes.error || installRes.stdout };
    }
    this.broadcastLog('✅ APK installed successfully!', 'info');

    // Step 6: Launch App
    this.broadcastStatus('launching', { message: `Launching ${projectInfo.applicationId}...` });
    const mainComponent = `${projectInfo.applicationId}/.MainActivity`;
    this.broadcastLog(`🚀 Launching Android Activity: ${mainComponent}...`, 'info');

    const launchRes = await adbService.launchApp(serial, mainComponent);
    if (!launchRes.success) {
      this.isBuilding = false;
      this.broadcastLog(`❌ Failed to launch activity: ${launchRes.error || launchRes.stdout}`, 'error');
      this.broadcastStatus('error', { error: 'Failed to launch activity' });
      return { success: false, error: launchRes.error || launchRes.stdout };
    }

    // Step 7: Completed
    this.isBuilding = false;
    this.broadcastLog('====================================================', 'info');
    this.broadcastLog('🎉 BUILD & LAUNCH COMPLETED SUCCESSFULLY!', 'info');
    this.broadcastLog('====================================================', 'info');
    this.broadcastStatus('success', { message: 'Application launched successfully' });

    return {
      success: true,
      applicationId: projectInfo.applicationId,
      apkPath
    };
  }

  cancelBuild() {
    if (this.currentProcess) {
      const pid = this.currentProcess.pid;
      this.broadcastLog(`⛔ Cancelling build process (PID: ${pid})...`, 'warn');
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${pid} /T /F`, () => {});
      } else {
        this.currentProcess.kill('SIGTERM');
      }
      this.currentProcess = null;
    }
    this.isBuilding = false;
    this.broadcastStatus('idle', { message: 'Build cancelled' });
  }
}

module.exports = new BuildService();
