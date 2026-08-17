import * as RNWeb from 'react-native-web';
import React from 'react';

export * from 'react-native-web';

export const ReactNativeVersion = {
  version: { major: 0, minor: 87, patch: 0, prerelease: null },
  major: 0,
  minor: 87,
  patch: 0,
  prerelease: null,
  getVersionString: () => '0.87.0',
};

export const TextInput = React.forwardRef(({ style, value, defaultValue, ...props }, ref) => {
  const textVal = String(value !== undefined ? value : (defaultValue !== undefined ? defaultValue : ''));
  const charLength = Math.max(textVal.length || 1, 1);
  return (
    <RNWeb.TextInput
      ref={ref}
      size={charLength}
      style={[
        { minWidth: 0, maxWidth: '100%' },
        style
      ]}
      value={value}
      defaultValue={defaultValue}
      {...props}
    />
  );
});

export const SafeAreaView = React.forwardRef(({ style, children, ...props }, ref) => {
  return (
    <RNWeb.View
      ref={ref}
      style={[{ paddingTop: 0, paddingBottom: 0, flex: 1, width: '100%', height: '100%' }, style]}
      {...props}
    >
      {children}
    </RNWeb.View>
  );
});

export const Platform = {
  ...RNWeb.Platform,
  OS: 'android',
  select: (obj) => {
    if (obj.android !== undefined) return obj.android;
    if (obj.native !== undefined) return obj.native;
    if (obj.default !== undefined) return obj.default;
    return obj.web;
  },
  isTesting: false,
};

export const Dimensions = {
  get: (dim) => {
    const isLand = typeof window !== 'undefined' && window.innerWidth > 500;
    const w = isLand ? 840 : 390;
    const h = isLand ? 380 : 820;
    return {
      width: w,
      height: h,
      scale: 3.0,
      fontScale: 1.0,
    };
  },
  set: () => {},
  addEventListener: (type, handler) => ({ remove: () => {} }),
  removeEventListener: () => {}
};

export const PixelRatio = {
  get: () => 3.0,
  getFontScale: () => 1.0,
  getPixelSizeForLayoutSize: (layoutSize) => Math.round(layoutSize * 3.0),
  roundToNearestPixel: (layoutSize) => Math.round(layoutSize * 3.0) / 3.0,
};

export const BackHandler = {
  exitApp: () => console.log('[Android] BackHandler.exitApp()'),
  addEventListener: (event, handler) => {
    window.addEventListener('android_back', handler);
    return { remove: () => window.removeEventListener('android_back', handler) };
  },
  removeEventListener: (event, handler) => {
    window.removeEventListener('android_back', handler);
  }
};

export const ToastAndroid = {
  SHORT: 2000,
  LONG: 3500,
  TOP: 1,
  BOTTOM: 2,
  CENTER: 3,
  show: (message, duration) => {
    const toast = document.createElement('div');
    toast.className = 'android-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration || 2000);
  },
  showWithGravity: (message, duration, gravity) => {
    ToastAndroid.show(message, duration);
  }
};

export const PermissionsAndroid = {
  PERMISSIONS: {
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
    BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
    BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
    BLUETOOTH_ADVERTISE: 'android.permission.BLUETOOTH_ADVERTISE',
    CAMERA: 'android.permission.CAMERA',
    READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  check: async () => true,
  request: async () => 'granted',
  requestMultiple: async (permissions) => {
    const res = {};
    for (const p of permissions) res[p] = 'granted';
    return res;
  }
};

export const requireNativeComponent = (viewName) => {
  return function NativeComponentMock(props) {
    return React.createElement(RNWeb.View, props);
  };
};

export const NativeModules = new Proxy({}, {
  get: () => new Proxy({}, {
    get: () => (...args) => Promise.resolve({})
  })
});

export const NativeEventEmitter = class {
  addListener() { return { remove: () => {} }; }
  removeAllListeners() {}
};

export const DeviceEventEmitter = {
  addListener: () => ({ remove: () => {} }),
  removeAllListeners: () => {},
  emit: () => {}
};

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
  removeEventListener: () => {}
};

export const Alert = {
  alert: (title, message, buttons) => {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n${message || ''}`);
    }
  }
};

export const Vibration = {
  vibrate: () => {},
  cancel: () => {}
};

export const UIManager = {
  ...(RNWeb.UIManager || {}),
  getViewManagerConfig: (name) => ({
    Commands: {},
    Constants: {},
    NativeProps: {},
    directEventTypes: {}
  }),
  hasViewManagerConfig: (name) => false,
  dispatchViewManagerCommand: () => {},
  setLayoutAnimationEnabledExperimental: () => {},
  measure: (node, callback) => callback && callback(0, 0, 0, 0, 0, 0),
  measureInWindow: (node, callback) => callback && callback(0, 0, 0, 0),
};

export const I18nManager = {
  isRTL: false,
  doLeftAndRightSwapInRTL: false,
  allowRTL: () => {},
  forceRTL: () => {},
  swapLeftAndRightInRTL: () => {},
  getConstants: () => ({
    isRTL: false,
    doLeftAndRightSwapInRTL: false,
  }),
};

export const Keyboard = {
  addListener: () => ({ remove: () => {} }),
  removeListener: () => {},
  removeAllListeners: () => {},
  dismiss: () => {},
  isVisible: () => false,
  metrics: () => null
};

export const Appearance = {
  getColorScheme: () => 'light',
  addChangeListener: () => ({ remove: () => {} }),
  removeChangeListener: () => {},
  setColorScheme: () => {}
};

export const AccessibilityInfo = {
  addEventListener: () => ({ remove: () => {} }),
  announceForAccessibility: () => {},
  isBoldTextEnabled: async () => false,
  isGrayscaleEnabled: async () => false,
  isInvertColorsEnabled: async () => false,
  isReduceMotionEnabled: async () => false,
  isReduceTransparencyEnabled: async () => false,
  isScreenReaderEnabled: async () => false,
  setAccessibilityFocus: () => {}
};

const defaultExport = {
  ...RNWeb,
  ReactNativeVersion,
  TextInput,
  SafeAreaView,
  Platform,
  Dimensions,
  PixelRatio,
  BackHandler,
  ToastAndroid,
  PermissionsAndroid,
  requireNativeComponent,
  NativeModules,
  NativeEventEmitter,
  DeviceEventEmitter,
  AppState,
  Alert,
  Vibration,
  UIManager,
  I18nManager,
  Keyboard,
  Appearance,
  AccessibilityInfo
};

export default defaultExport;
