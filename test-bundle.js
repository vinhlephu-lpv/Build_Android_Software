const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const flowRemoveTypes = require('flow-remove-types');

// Mock for react-native internal libraries
const mocksPlugin = {
  name: 'rn-mocks',
  setup(build) {
    build.onResolve({ filter: /^react-native\/Libraries\// }, (args) => {
      if (args.path.includes('openURLInBrowser')) {
        return { path: path.join(__dirname, 'src', 'mocks', 'openURLInBrowser.js') };
      }
      return { path: path.join(__dirname, 'src', 'mocks', 'emptyModule.js') };
    });

    build.onLoad({ filter: /\.(js|jsx)$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      if (source.includes('@flow') || source.includes('export type') || source.includes('import type') || source.includes('type ') || source.includes(': ')) {
        try {
          const transformed = flowRemoveTypes(source, { pretty: true }).toString();
          return { contents: transformed, loader: 'jsx' };
        } catch (e) {}
      }
      return { contents: source, loader: 'jsx' };
    });
  }
};

async function testBuild() {
  const projectPath = 'd:\\My_Software\\ExampleApp';
  const entryFile = path.join(projectPath, 'App.tsx');
  const tempEntry = path.join(__dirname, 'temp-entry.jsx');

  const wrapperCode = `
import React from 'react';
import { AppRegistry } from 'react-native';
import App from '${entryFile.replace(/\\/g, '/')}';

AppRegistry.registerComponent('ExampleApp', () => App);
const rootTag = document.getElementById('root');
AppRegistry.runApplication('ExampleApp', {
  initialProps: {},
  rootTag
});
`;

  fs.writeFileSync(tempEntry, wrapperCode, 'utf8');

  try {
    const result = await esbuild.build({
      entryPoints: [tempEntry],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'RNApp',
      plugins: [mocksPlugin],
      resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
      loader: {
        '.js': 'jsx',
        '.jsx': 'jsx',
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.png': 'dataurl',
        '.jpg': 'dataurl',
        '.svg': 'dataurl'
      },
      alias: {
        'react-native': path.join(__dirname, 'src', 'mocks', 'reactNativeWrapper.js'),
        'react-native-safe-area-context': path.join(projectPath, 'node_modules', 'react-native-safe-area-context', 'lib', 'module', 'index.js')
      },
      nodePaths: [
        path.join(projectPath, 'node_modules'),
        path.join(__dirname, 'node_modules')
      ],
      define: {
        'process.env.NODE_ENV': '"development"',
        '__DEV__': 'true',
        'global': 'window'
      }
    });

    console.log('🎉🎉🎉 BUNDLE SUCCESS! Generated bundle size:', (result.outputFiles[0].contents.length / 1024).toFixed(1), 'KB');
    if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);
  } catch (err) {
    console.error('❌ Bundle Error:', err);
    if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);
  }
}

testBuild();
