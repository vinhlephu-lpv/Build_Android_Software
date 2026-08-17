import * as React from 'react';

// Expose React globally for components compiled with classic JSX transform
if (typeof window !== 'undefined') {
  window.React = React;
  window.global = window;
  window.process = window.process || { env: { NODE_ENV: 'development' } };
  window.__DEV__ = true;
}

if (typeof globalThis !== 'undefined') {
  globalThis.React = React;
  globalThis.global = globalThis;
  globalThis.process = globalThis.process || { env: { NODE_ENV: 'development' } };
  globalThis.__DEV__ = true;
}

export { React };
