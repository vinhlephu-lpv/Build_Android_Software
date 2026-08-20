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
      return { success: false, error: 'Tiến trình build đang chạy...' };
    }

    this.isBuilding = true;
    this.buildHistory = [];
    const startTime = Date.now();

    const deviceLabel = serial ? serial : 'Máy Ảo Độc Lập';

    this.broadcastStatus('compiling', { message: `[1/6] Chuẩn bị môi trường build cho ${deviceLabel}...`, progress: 10 });

    this.broadcastLog(`========================================================================`, 'header');
    this.broadcastLog(`[Pipeline] TIẾN TRÌNH BIÊN DỊCH & CÀI ĐẶT NATIVE REACT NATIVE`, 'header');
    this.broadcastLog(`[Project] Thư mục dự án: ${projectPath}`, 'info');
    this.broadcastLog(`[Device] Thiết bị đích: ${deviceLabel} [${serial || 'default'}]`, 'info');
    this.broadcastLog(`[Mode] Chế độ: Native Gradle Assemble (APK Debug + Metro Bridge)`, 'info');
    this.broadcastLog(`========================================================================`, 'header');

    // [BƯỚC 1/6] Kiểm tra dự án
    this.broadcastLog(`[BƯỚC 1/6] Đang quét cấu trúc mã nguồn React Native & tệp cấu hình...`, 'step');
    const projectInfo = this.inspectProject(projectPath);
    if (!projectInfo.valid) {
      this.isBuilding = false;
      this.broadcastLog(`[Error] Lỗi cấu trúc dự án: ${projectInfo.error}`, 'error');
      this.broadcastStatus('error', { error: projectInfo.error });
      return { success: false, error: projectInfo.error };
    }

    const androidDir = path.join(projectPath, 'android');
    if (!projectInfo.hasAndroid || !projectInfo.hasGradlew) {
      this.isBuilding = false;
      this.broadcastLog('[Error] Thư mục android hoặc gradlew.bat không tìm thấy trong dự án!', 'error');
      this.broadcastStatus('error', { error: 'Android directory missing' });
      return { success: false, error: 'Android directory missing' };
    }

    this.broadcastLog(`   ├─ [App] Tên ứng dụng: ${projectInfo.name || 'ExampleApp'} (${projectInfo.applicationId || 'com.exampleapp'})`, 'info');
    this.broadcastLog(`   ├─ [RN] Phiên bản React Native: ${projectInfo.reactNativeVersion || '0.87.0'}`, 'info');
    this.broadcastLog(`   └─ [Path] Thư mục Android: ${androidDir}`, 'info');

    // [BƯỚC 2/6] Metro Bundler
    this.broadcastStatus('compiling', { message: '[2/6] Kiểm tra & khởi động Metro Bundler...', progress: 20 });
    this.broadcastLog(`[BƯỚC 2/6] Kiểm tra trạng thái Metro JavaScript Bundler (Port 8081)...`, 'step');
    const isMetroUp = await metroService.checkMetroAlive();
    if (!isMetroUp) {
      this.broadcastLog('   ├─ Metro Bundler chưa chạy, đang tự động khởi động trên cổng 8081...', 'info');
      await metroService.startMetro(projectPath);
      this.broadcastLog('   └─ Metro Bundler đã sẵn sàng phục vụ Fast Refresh & Hot Reload!', 'success');
    } else {
      this.broadcastLog('   └─ Metro Bundler đang hoạt động ổn định trên cổng 8081', 'success');
    }

    // [BƯỚC 3/6] Reverse ADB Port
    if (serial) {
      this.broadcastStatus('compiling', { message: `[3/6] Chuyển tiếp cổng ADB reverse tcp:8081...`, progress: 30 });
      this.broadcastLog(`[BƯỚC 3/6] Thiết lập đường truyền dữ liệu ADB Reverse Port (tcp:8081 -> tcp:8081)...`, 'step');
      const revRes = await adbService.reversePort(serial, 8081);
      if (revRes.success) {
        this.broadcastLog(`   └─ Đã kết nối cầu nối Metro -> ${serial} thành công!`, 'success');
      } else {
        this.broadcastLog(`   └─ Thông báo ADB reverse: ${revRes.message || 'Tiếp tục build...'}`, 'warn');
      }
    }

    // [BƯỚC 4/6] Run Gradle Build
    this.broadcastStatus('compiling', { message: '[4/6] Đang chạy Gradle assembleDebug (Java/C++/Hermes)...', progress: 40 });
    this.broadcastLog(`[BƯỚC 4/6] Đang thực thi Gradle Engine: gradlew.bat assembleDebug...`, 'step');
    this.broadcastLog('   ├─ [Compiler] Trình biên dịch: JDK 17 + Android Gradle Plugin + C++ CMake', 'info');
    this.broadcastLog('   ├─ [Optimize] Tối ưu hóa: Hermes Bytecode Compiler + Parallel Worker Tasks', 'info');
    this.broadcastLog('   └─ Đang dịch các file mã nguồn và đóng gói tài nguyên...', 'info');

    const isWindows = process.platform === 'win32';
    const gradlewCmd = isWindows ? path.join(androidDir, 'gradlew.bat') : './gradlew';
    const gradleArgs = ['assembleDebug', '--console=plain'];

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
          ANDROID_AVD_HOME: 'D:\\Program Files\\Emulator\\avd',
          ANDROID_EMULATOR_HOME: 'D:\\Program Files\\Emulator',
          JAVA_HOME: process.env.JAVA_HOME || 'C:\\Program Files\\Java\\jdk-17',
          FORCE_COLOR: 'true'
        }
      });

      this.currentProcess = proc;
      let taskCount = 0;

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('> Task')) {
            taskCount++;
            const taskProgress = Math.min(40 + Math.floor(taskCount * 1.5), 85);
            this.broadcastLog(`   ${trimmed}`, 'task');
            this.broadcastStatus('compiling', {
              message: `[4/6] ${trimmed}`,
              progress: taskProgress
            });
          } else if (trimmed.includes('BUILD SUCCESSFUL')) {
            this.broadcastLog(`   ${trimmed}`, 'success');
            this.broadcastStatus('compiling', { message: trimmed, progress: 88 });
          } else if (trimmed.includes('BUILD FAILED')) {
            this.broadcastLog(`   ${trimmed}`, 'error');
          } else if (trimmed.startsWith('WARNING:') || trimmed.startsWith('WARN')) {
            this.broadcastLog(`   ${trimmed}`, 'warn');
          } else if (trimmed.includes('UP-TO-DATE') || trimmed.includes('FROM-CACHE')) {
            this.broadcastLog(`   ${trimmed}`, 'task');
          } else {
            this.broadcastLog(`   ${trimmed}`, 'stdout');
          }
        }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) this.broadcastLog(`   [Gradle] ${trimmed}`, 'stderr');
        }
      });

      proc.on('close', (code) => {
        this.currentProcess = null;
        if (code === 0) {
          resolve(true);
        } else {
          this.broadcastLog(`[Error] Gradle build thất bại với mã lỗi: ${code}`, 'error');
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        this.currentProcess = null;
        this.broadcastLog(`[Error] Lỗi thực thi Gradle: ${err.message}`, 'error');
        resolve(false);
      });
    });

    if (!buildSuccess) {
      this.isBuilding = false;
      this.broadcastStatus('error', { error: 'Gradle compilation failed' });
      return { success: false, error: 'Gradle compilation failed' };
    }

    // [BƯỚC 5/6] Locate & Install APK
    this.broadcastStatus('installing', { message: '[5/6] Đang nạp gói APK lên thiết bị...', progress: 90 });
    this.broadcastLog(`[BƯỚC 5/6] Đang xác thực file APK và nạp lên thiết bị...`, 'step');
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
      this.broadcastLog(`[Error] Không tìm thấy file APK tại: ${apkPath}`, 'error');
      this.broadcastStatus('error', { error: 'APK not found' });
      return { success: false, error: 'APK not found' };
    }

    const apkStats = fs.statSync(apkPath);
    const apkSizeMb = (apkStats.size / (1024 * 1024)).toFixed(2);
    this.broadcastLog(`   ├─ [File] File APK: ${path.basename(apkPath)} (${apkSizeMb} MB)`, 'info');
    this.broadcastLog(`   ├─ Đang truyền tải và cài đặt (adb install) lên ${serial || 'device'}...`, 'info');

    const installRes = await adbService.installApk(serial, apkPath);
    if (!installRes.success) {
      this.isBuilding = false;
      this.broadcastLog(`[Error] Cài đặt APK thất bại: ${installRes.error || installRes.stdout}`, 'error');
      this.broadcastStatus('error', { error: 'APK installation failed' });
      return { success: false, error: installRes.error || installRes.stdout };
    }
    this.broadcastLog(`   └─ Đã cài đặt APK thành công lên hệ điều hành Android!`, 'success');

    // [BƯỚC 6/6] Launch App Activity
    this.broadcastStatus('launching', { message: `[6/6] Đang khởi chạy ${projectInfo.applicationId}...`, progress: 96 });
    const mainComponent = `${projectInfo.applicationId}/.MainActivity`;
    this.broadcastLog(`[BƯỚC 6/6] Đang khởi chạy Activity: ${mainComponent}...`, 'step');

    const launchRes = await adbService.launchApp(serial, mainComponent);
    if (!launchRes.success) {
      this.isBuilding = false;
      this.broadcastLog(`[Error] Không thể mở ứng dụng: ${launchRes.error || launchRes.stdout}`, 'error');
      this.broadcastStatus('error', { error: 'Failed to launch activity' });
      return { success: false, error: launchRes.error || launchRes.stdout };
    }

    const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // Completed
    this.isBuilding = false;
    this.broadcastStatus('success', { message: `Build & Cài đặt thành công trong ${totalElapsedSec}s!`, progress: 100 });
    this.broadcastLog(`   └─ Ứng dụng đã mở và kết nối với Metro Bundler!`, 'success');
    this.broadcastLog(`========================================================================`, 'header');
    this.broadcastLog(`TOÀN BỘ TIẾN TRÌNH HOÀN TẤT THÀNH CÔNG TRONG ${totalElapsedSec}s!`, 'success');
    this.broadcastLog(`Nhấn Ctrl+S trong trình soạn thảo để Hot Reload ngay lập tức!`, 'info');
    this.broadcastLog(`========================================================================`, 'header');

    return {
      success: true,
      applicationId: projectInfo.applicationId,
      apkPath,
      elapsedSec: totalElapsedSec
    };
  }

  async buildPackage(projectPath, type = 'debug_apk', options = {}) {
    if (this.isBuilding) {
      return { success: false, error: 'Tiến trình biên dịch khác đang chạy, vui lòng chờ!' };
    }

    this.isBuilding = true;
    this.buildHistory = [];

    const isAAB = type === 'release_aab';
    const isRelease = type === 'release_apk' || isAAB;
    const taskName = isAAB ? 'Release AAB (Google Play)' : (isRelease ? 'Release APK' : 'Debug APK');

    this.broadcastStatus('compiling', { message: `Đang biên dịch gói ${taskName}...` });
    this.broadcastLog('====================================================', 'info');
    this.broadcastLog(`[Package] BẮT ĐẦU XUẤT GÓI CÀI ĐẶT: ${taskName.toUpperCase()}`, 'info');
    this.broadcastLog(`[Project] Thư mục dự án: ${projectPath}`, 'info');
    this.broadcastLog('====================================================', 'info');

    const projectInfo = this.inspectProject(projectPath);
    if (!projectInfo.valid) {
      this.isBuilding = false;
      this.broadcastLog(`[Error] Lỗi cấu trúc dự án: ${projectInfo.error}`, 'error');
      this.broadcastStatus('error', { error: projectInfo.error });
      return { success: false, error: projectInfo.error };
    }

    const androidDir = path.join(projectPath, 'android');
    if (!projectInfo.hasAndroid || !projectInfo.hasGradlew) {
      this.isBuilding = false;
      const errMsg = 'Dự án chưa có thư mục android/ hoặc gradlew.bat (Cần cấu trúc React Native Native tiêu chuẩn để chạy Gradle)';
      this.broadcastLog(`[Error] ${errMsg}`, 'error');
      this.broadcastStatus('error', { error: errMsg });
      return { success: false, error: errMsg };
    }

    // Determine gradle command and argument
    const isWindows = process.platform === 'win32';
    const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';
    let gradleTask = 'assembleDebug';
    if (type === 'release_apk') gradleTask = 'assembleRelease';
    else if (type === 'release_aab') gradleTask = 'bundleRelease';

    const gradleArgs = [gradleTask];
    if (options.clean) {
      gradleArgs.unshift('clean');
      this.broadcastLog('[Clean] Đang dọn dẹp cache Gradle trước khi build (Clean Build)...', 'info');
    }

    this.broadcastLog(`[Gradle] Đang thực thi lệnh Gradle: ${gradlewCmd} ${gradleArgs.join(' ')}...`, 'info');

    if (options.openTerminal !== false && isWindows) {
      const termTitle = `${taskName.toUpperCase()} - [${path.basename(projectPath)}]`;
      const fullCmd = `start "${termTitle}" cmd.exe /k "title ${termTitle} && color 0A && echo ======================================================== && echo DANG XUAT GOI ANDROID: ${taskName.toUpperCase()} && echo Thu muc: ${androidDir} && echo Lenh: ${gradlewCmd} ${gradleArgs.join(' ')} && echo Nhan Ctrl+C de dung tien trinh bat ky luc nao! && echo ======================================================== && echo. && cd /d \"${androidDir}\" && ${gradlewCmd} ${gradleArgs.join(' ')}"`;
      exec(fullCmd, { cwd: androidDir });
      this.broadcastLog(`[Native Terminal] Đã mở cửa sổ Terminal riêng trên Desktop để chạy: ${gradlewCmd} ${gradleArgs.join(' ')}`, 'warn');
      this.broadcastLog(`Bạn có thể theo dõi tiến trình trực quan trên cửa sổ Terminal và nhấn Ctrl+C để dừng tùy ý!`, 'info');
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
        this.broadcastLog(data.toString(), 'stdout');
      });

      proc.stderr.on('data', (data) => {
        this.broadcastLog(data.toString(), 'stderr');
      });

      proc.on('close', (code) => {
        this.currentProcess = null;
        if (code === 0) resolve(true);
        else {
          this.broadcastLog(`[Error] Gradle thất bại với mã lỗi exit code: ${code}`, 'error');
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        this.currentProcess = null;
        this.broadcastLog(`[Error] Lỗi khởi chạy Gradle: ${err.message}`, 'error');
        resolve(false);
      });
    });

    if (!buildSuccess) {
      this.isBuilding = false;
      this.broadcastStatus('error', { error: 'Biên dịch Gradle thất bại' });
      return { success: false, error: 'Biên dịch Gradle thất bại. Xem chi tiết lỗi trong Build Console.' };
    }

    // Locate Output File
    let targetDir = '';
    let ext = '.apk';

    if (type === 'debug_apk') {
      targetDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug');
      ext = '.apk';
    } else if (type === 'release_apk') {
      targetDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release');
      ext = '.apk';
    } else if (type === 'release_aab') {
      targetDir = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release');
      ext = '.aab';
    }

    let foundFile = null;
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir);
      const matched = files.filter(f => f.endsWith(ext));
      if (matched.length > 0) {
        const sorted = matched.map(f => ({
          name: f,
          path: path.join(targetDir, f),
          time: fs.statSync(path.join(targetDir, f)).mtimeMs
        })).sort((a, b) => b.time - a.time);
        foundFile = sorted[0].path;
      }
    }

    this.isBuilding = false;

    if (!foundFile || !fs.existsSync(foundFile)) {
      this.broadcastLog(`[Error] Không tìm thấy file xuất ra trong thư mục: ${targetDir}`, 'error');
      this.broadcastStatus('error', { error: 'Không tìm thấy file sản phẩm sau khi build' });
      return { success: false, error: 'Không tìm thấy file sản phẩm sau khi build' };
    }

    const stat = fs.statSync(foundFile);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    const fileName = path.basename(foundFile);

    this.broadcastLog('====================================================', 'info');
    this.broadcastLog(`XUẤT GÓI ${taskName.toUpperCase()} THÀNH CÔNG!`, 'success');
    this.broadcastLog(`[File] Tên file: ${fileName}`, 'success');
    this.broadcastLog(`[Size] Dung lượng: ${sizeMb} MB`, 'success');
    this.broadcastLog(`[Path] Đường dẫn: ${foundFile}`, 'info');
    this.broadcastLog('====================================================', 'info');
    this.broadcastStatus('success', { message: `Đã xuất file ${fileName} (${sizeMb} MB) thành công!` });

    return {
      success: true,
      filePath: foundFile,
      fileName,
      sizeMb,
      type,
      directory: path.dirname(foundFile)
    };
  }

  cancelBuild() {
    if (this.currentProcess) {
      const pid = this.currentProcess.pid;
      this.broadcastLog(`[Cancel] Cancelling build process (PID: ${pid})...`, 'warn');
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
