const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const flowRemoveTypes = require('flow-remove-types');

class StandaloneRunnerService {
  constructor() {
    this.currentBundle = null;
    this.isBuilding = false;
    this.projectPath = null;
  }

  getMocksPlugin(projectPath) {
    const mocksDir = path.join(__dirname, '..', 'mocks');

    return {
      name: 'standalone-rn-mocks',
      setup: (build) => {
        // Intercept react-native-gesture-handler
        build.onResolve({ filter: /^react-native-gesture-handler/ }, (args) => {
          return { path: path.join(mocksDir, 'gestureHandler.js') };
        });

        // Intercept react-native-reanimated
        build.onResolve({ filter: /^react-native-reanimated/ }, (args) => {
          return { path: path.join(mocksDir, 'reanimated.js') };
        });

        // Intercept react-native-vector-icons & expo vector icons
        build.onResolve({ filter: /^(react-native-vector-icons|@expo\/vector-icons)/ }, (args) => {
          return { path: path.join(mocksDir, 'vectorIcons.js') };
        });

        // Intercept @shopify/flash-list
        build.onResolve({ filter: /^@shopify\/flash-list/ }, (args) => {
          return { path: path.join(mocksDir, 'flashList.js') };
        });

        // Intercept react-native-device-info
        build.onResolve({ filter: /^react-native-device-info/ }, (args) => {
          return { path: path.join(mocksDir, 'deviceInfo.js') };
        });

        // Intercept react-native-fast-image
        build.onResolve({ filter: /^react-native-fast-image/ }, (args) => {
          return { path: path.join(mocksDir, 'fastImage.js') };
        });

        // Intercept react-native-webview
        build.onResolve({ filter: /^react-native-webview/ }, (args) => {
          return { path: path.join(mocksDir, 'webview.js') };
        });

        // Intercept clipboard
        build.onResolve({ filter: /^(@react-native-clipboard\/clipboard|react-native-clipboard)/ }, (args) => {
          return { path: path.join(mocksDir, 'clipboard.js') };
        });

        // Intercept react-native-screens
        build.onResolve({ filter: /^react-native-screens/ }, (args) => {
          return { path: path.join(mocksDir, 'reactNativeScreens.js') };
        });

        // Intercept react-native-svg
        build.onResolve({ filter: /^react-native-svg/ }, (args) => {
          return { path: path.join(mocksDir, 'reactNativeSvg.js') };
        });

        // Intercept @react-native-async-storage/async-storage
        build.onResolve({ filter: /^@react-native-async-storage\/async-storage/ }, (args) => {
          return { path: path.join(mocksDir, 'asyncStorage.js') };
        });

        // Intercept @react-native-community/slider
        build.onResolve({ filter: /^@react-native-community\/slider/ }, (args) => {
          return { path: path.join(mocksDir, 'slider.js') };
        });

        // Intercept react-native-linear-gradient
        build.onResolve({ filter: /^react-native-linear-gradient/ }, (args) => {
          return { path: path.join(mocksDir, 'linearGradient.js') };
        });

        // Intercept native hardware modules
        build.onResolve({ filter: /^(react-native-ble-plx|react-native-permissions|react-native-fs|react-native-geolocation-service|react-native-orientation-locker|react-native-network-info|@react-native-community\/netinfo|react-native-sound|react-native-haptic-feedback|@react-native-masked-view\/masked-view)/ }, (args) => {
          return { path: path.join(mocksDir, 'emptyModule.js') };
        });

        // Intercept react-native/Libraries/*
        build.onResolve({ filter: /^react-native\/Libraries\// }, (args) => {
          if (args.path.includes('openURLInBrowser')) {
            return { path: path.join(mocksDir, 'openURLInBrowser.js') };
          }
          return { path: path.join(mocksDir, 'emptyModule.js') };
        });

        // Strip Flow types from .js / .jsx files in node_modules
        build.onLoad({ filter: /\.(js|jsx)$/ }, async (args) => {
          const source = await fs.promises.readFile(args.path, 'utf8');
          if (
            source.includes('@flow') ||
            source.includes('export type') ||
            source.includes('import type') ||
            source.includes('type ') ||
            source.includes(': ')
          ) {
            try {
              const transformed = flowRemoveTypes(source, { all: true, pretty: true }).toString();
              return { contents: transformed, loader: 'jsx' };
            } catch (e) {}
          }
          return { contents: source, loader: 'jsx' };
        });
      }
    };
  }

  findEntryFile(projectPath) {
    if (!fs.existsSync(projectPath)) {
      return null;
    }

    // Check package.json main field
    const pkgJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.main) {
          const mainFile = path.resolve(projectPath, pkg.main);
          if (fs.existsSync(mainFile)) return mainFile;
          // Try extensions
          for (const ext of ['.tsx', '.jsx', '.js', '.ts']) {
            if (fs.existsSync(mainFile + ext)) return mainFile + ext;
          }
        }
      } catch (e) {}
    }

    const candidates = [
      path.join(projectPath, 'App.tsx'),
      path.join(projectPath, 'App.jsx'),
      path.join(projectPath, 'App.js'),
      path.join(projectPath, 'index.js'),
      path.join(projectPath, 'index.tsx'),
      path.join(projectPath, 'index.android.js'),
      path.join(projectPath, 'index.android.tsx'),
      path.join(projectPath, 'src', 'App.tsx'),
      path.join(projectPath, 'src', 'App.jsx'),
      path.join(projectPath, 'src', 'App.js'),
      path.join(projectPath, 'src', 'index.js'),
      path.join(projectPath, 'src', 'index.tsx'),
      path.join(projectPath, 'src', 'main.tsx'),
      path.join(projectPath, 'src', 'main.js'),
      path.join(projectPath, 'app', 'index.tsx'),
      path.join(projectPath, 'app', 'index.js'),
      path.join(projectPath, 'app', 'App.tsx'),
      path.join(projectPath, 'app', 'App.js')
    ];

    for (const file of candidates) {
      if (fs.existsSync(file)) return file;
    }

    // Fallback: Check top-level .tsx / .jsx / .js files
    try {
      const files = fs.readdirSync(projectPath);
      for (const f of files) {
        if (f.match(/\.(tsx|jsx|js)$/i) && !f.startsWith('.') && !f.includes('config')) {
          const fullPath = path.join(projectPath, f);
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) return fullPath;
        }
      }
    } catch (e) {}

    return null;
  }

  async buildBundle(projectPath, onLog = () => {}) {
    this.projectPath = projectPath;
    this.isBuilding = true;

    if (!fs.existsSync(projectPath)) {
      this.isBuilding = false;
      throw new Error(`Thư mục "${projectPath}" không tồn tại trên ổ đĩa máy tính!`);
    }

    onLog('[Analyze] Đang phân tích mã nguồn React Native...', 'info');

    const entryFile = this.findEntryFile(projectPath);
    if (!entryFile) {
      this.isBuilding = false;
      throw new Error(`Không tìm thấy file đầu vào (App.tsx / index.js) trong thư mục "${projectPath}"!`);
    }

    onLog(`[Entry] File đầu vào (Entry): ${entryFile}`, 'info');

    let appName = 'ExampleApp';
    const appJsonPath = path.join(projectPath, 'app.json');
    const pkgJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(appJsonPath)) {
      try {
        const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
        appName = appJson.name || appName;
      } catch (e) {}
    } else if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        appName = pkg.name || appName;
      } catch (e) {}
    }

    const tempDir = path.join(__dirname, '..', '..', '.temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempEntry = path.join(tempDir, `entry-${Date.now()}.jsx`);

    const wrapperCode = `
import * as React from 'react';
import { AppRegistry } from 'react-native';
import App from '${entryFile.replace(/\\/g, '/')}';

if (typeof window !== 'undefined') {
  window.React = React;
}

// Register Component with React Native Web AppRegistry
AppRegistry.registerComponent('${appName}', () => App);
const rootTag = document.getElementById('root');
if (rootTag) {
  AppRegistry.runApplication('${appName}', {
    initialProps: {},
    rootTag
  });
}
`;

    fs.writeFileSync(tempEntry, wrapperCode, 'utf8');

    onLog('[Transpile] Đang biên dịch mã nguồn và đóng gói JS Bundle (esbuild)...', 'info');

    const rootDir = path.resolve(__dirname, '..', '..');
    const mocksDir = path.join(__dirname, '..', 'mocks');

    // Pin strictly to single React instance
    const reactPath = path.join(rootDir, 'node_modules', 'react');
    const reactDomPath = path.join(rootDir, 'node_modules', 'react-dom');

    try {
      const startTime = Date.now();
      const result = await esbuild.build({
        entryPoints: [tempEntry],
        bundle: true,
        write: false,
        format: 'iife',
        globalName: 'RNApp',
        inject: [path.join(mocksDir, 'reactShim.js')],
        banner: {
          js: 'var global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;'
        },
        plugins: [this.getMocksPlugin(projectPath)],
        resolveExtensions: [
          '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
          '.tsx', '.ts', '.jsx', '.js', '.json'
        ],
        loader: {
          '.js': 'jsx',
          '.jsx': 'jsx',
          '.ts': 'ts',
          '.tsx': 'tsx',
          '.png': 'dataurl',
          '.jpg': 'dataurl',
          '.jpeg': 'dataurl',
          '.gif': 'dataurl',
          '.svg': 'dataurl',
          '.webp': 'dataurl'
        },
        alias: {
          'react': reactPath,
          'react-dom': reactDomPath,
          'react-native': path.join(mocksDir, 'reactNativeWrapper.js'),
          'react-native-safe-area-context': path.join(mocksDir, 'safeAreaContext.js')
        },
        define: {
          'process.env.NODE_ENV': '"development"',
          '__DEV__': 'true',
          'global': 'window'
        }
      });

      const elapsed = Date.now() - startTime;
      const bundleSizeKb = (result.outputFiles[0].contents.length / 1024).toFixed(1);

      this.currentBundle = result.outputFiles[0].text;
      this.isBuilding = false;

      onLog(`Đóng gói thành công trong ${elapsed}ms (${bundleSizeKb} KB)`, 'success');
      onLog('Ứng dụng React Native đã sẵn sàng chạy trên Máy Ảo!', 'success');

      if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);

      return {
        success: true,
        bundleSizeKb,
        elapsed,
        appName
      };
    } catch (err) {
      this.isBuilding = false;
      if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);
      onLog(`Lỗi biên dịch: ${err.message}`, 'error');
      throw err;
    }
  }

  getBundle() {
    return this.currentBundle;
  }
}

module.exports = new StandaloneRunnerService();
