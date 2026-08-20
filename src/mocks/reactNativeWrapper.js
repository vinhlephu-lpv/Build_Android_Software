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

/**
 * Authentic Android Material Design & iOS Shadow Computation
 */
export function computeElevationShadow(styleObj) {
  if (!styleObj || typeof styleObj !== 'object') return styleObj;
  
  if (Array.isArray(styleObj)) {
    return styleObj.map(s => computeElevationShadow(s));
  }

  const res = { ...styleObj };

  // Android Material Design Elevation Shadow
  if (typeof res.elevation === 'number' && res.elevation > 0) {
    const e = res.elevation;
    
    // Material 2/3 Dual-layer Ambient + Key light shadow formulas
    const ambY = Math.max(0.5, (e * 0.45)).toFixed(1);
    const ambBlur = Math.max(1, (e * 1.4)).toFixed(1);
    const ambAlpha = Math.min(0.22, (0.06 + e * 0.014)).toFixed(3);

    const keyY = Math.max(1, (e * 0.75)).toFixed(1);
    const keyBlur = Math.max(2, (e * 1.8)).toFixed(1);
    const keyAlpha = Math.min(0.34, (0.12 + e * 0.02)).toFixed(3);

    let rgb = '0, 0, 0';
    const rawColor = res.shadowColor;
    if (rawColor && typeof rawColor === 'string' && rawColor.startsWith('#')) {
      const h = rawColor.replace('#', '');
      const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16) || 0;
      const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16) || 0;
      const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16) || 0;
      rgb = `${r}, ${g}, ${b}`;
    }

    res.boxShadow = `0px ${ambY}px ${ambBlur}px rgba(${rgb}, ${ambAlpha}), 0px ${keyY}px ${keyBlur}px rgba(${rgb}, ${keyAlpha})`;
  } else if (res.shadowColor || res.shadowOffset || res.shadowOpacity || res.shadowRadius) {
    // iOS Shadow properties
    const offsetX = res.shadowOffset?.width || 0;
    const offsetY = res.shadowOffset?.height || 0;
    const radius = res.shadowRadius || (res.shadowOffset ? 3 : 0);
    const opacity = res.shadowOpacity !== undefined ? res.shadowOpacity : 0.2;
    
    let rgb = '0, 0, 0';
    const rawColor = res.shadowColor;
    if (rawColor && typeof rawColor === 'string' && rawColor.startsWith('#')) {
      const h = rawColor.replace('#', '');
      const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16) || 0;
      const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16) || 0;
      const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16) || 0;
      rgb = `${r}, ${g}, ${b}`;
    }

    res.boxShadow = `${offsetX}px ${offsetY}px ${radius * 2}px rgba(${rgb}, ${opacity})`;
  }

  return res;
}

export const StyleSheet = {
  ...RNWeb.StyleSheet,
  create: (styles) => {
    const computed = {};
    for (const key in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) {
        computed[key] = computeElevationShadow(styles[key]);
      }
    }
    return RNWeb.StyleSheet.create(computed);
  }
};

export const View = React.forwardRef(({ style, ...props }, ref) => {
  const transformed = computeElevationShadow(style);
  return <RNWeb.View ref={ref} style={transformed} {...props} />;
});

export const TouchableOpacity = React.forwardRef(({ style, ...props }, ref) => {
  const transformed = computeElevationShadow(style);
  return <RNWeb.TouchableOpacity ref={ref} style={transformed} {...props} />;
});

export const Text = React.forwardRef(({ style, ...props }, ref) => {
  const transformed = computeElevationShadow(style);
  return (
    <RNWeb.Text
      ref={ref}
      style={[
        {
          fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
          letterSpacing: '-0.012em'
        },
        transformed
      ]}
      {...props}
    />
  );
});

export const Pressable = React.forwardRef(({ style, ...props }, ref) => {
  const transformed = typeof style === 'function' 
    ? (state) => computeElevationShadow(style(state))
    : computeElevationShadow(style);
  return <RNWeb.Pressable ref={ref} style={transformed} {...props} />;
});

export const TextInput = React.forwardRef(({ style, value, defaultValue, onFocus, onBlur, ...props }, ref) => {
  const textVal = String(value !== undefined ? value : (defaultValue !== undefined ? defaultValue : ''));
  const charLength = Math.max(textVal.length || 1, 1);
  const transformed = computeElevationShadow(style);

  const handleFocus = (e) => {
    if (typeof window !== 'undefined') {
      window.postMessage({ type: 'open_keyboard' }, '*');
    }
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e) => {
    if (onBlur) onBlur(e);
  };

  return (
    <RNWeb.TextInput
      ref={ref}
      size={charLength}
      style={[
        { minWidth: 0, maxWidth: '100%' },
        transformed
      ]}
      value={value}
      defaultValue={defaultValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    />
  );
});

/**
 * React Native core SafeAreaView (on Android, renders edge-to-edge with transparent status bar overlay)
 */
export const SafeAreaView = React.forwardRef(({ style, children, ...props }, ref) => {
  const transformed = computeElevationShadow(style);
  return (
    <RNWeb.View
      ref={ref}
      style={[
        {
          flex: 1,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box'
        },
        transformed
      ]}
      {...props}
    >
      {children}
    </RNWeb.View>
  );
});

export const StatusBar = function StatusBarComponent(props) {
  React.useEffect(() => {
    if (props && props.barStyle) {
      StatusBar.setBarStyle(props.barStyle);
    }
  }, [props?.barStyle]);
  return null;
};

StatusBar.setBarStyle = (style) => {
  if (typeof window !== 'undefined') {
    window.postMessage({ type: 'set_status_bar_style', style }, '*');
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'set_status_bar_style', style }, '*');
    }
  }
};
StatusBar.setBackgroundColor = () => {};
StatusBar.setTranslucent = () => {};
StatusBar.setHidden = () => {};
StatusBar.currentHeight = 38;

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

/**
 * Authentic Android Material Design 3 Toast
 */
export const ToastAndroid = {
  SHORT: 2000,
  LONG: 3500,
  TOP: 1,
  BOTTOM: 2,
  CENTER: 3,
  show: (message, duration = 2000) => {
    if (typeof window !== 'undefined') {
      window.postMessage({
        type: 'android_toast',
        message: String(message || ''),
        duration: typeof duration === 'number' ? duration : 2000
      }, '*');
    }
  },
  showWithGravity: (message, duration, gravity) => {
    ToastAndroid.show(message, duration);
  }
};

/**
 * Authentic Android Material Design 3 Alert Dialog
 */
export const Alert = {
  alert: (title, message, buttons = [{ text: 'ĐỒNG Ý' }]) => {
    if (typeof window !== 'undefined') {
      window.postMessage({
        type: 'material_alert',
        title: String(title || 'Thông báo'),
        message: String(message || ''),
        buttons: Array.isArray(buttons) && buttons.length > 0 ? buttons : [{ text: 'ĐỒNG Ý' }]
      }, '*');
    }
  }
};

/**
 * Android Gboard Virtual Keyboard Management
 */
const keyboardListeners = new Map();

export const Keyboard = {
  addListener: (eventType, handler) => {
    if (!keyboardListeners.has(eventType)) {
      keyboardListeners.set(eventType, new Set());
    }
    keyboardListeners.get(eventType).add(handler);

    const windowHandler = (e) => {
      if (e.data && e.data.type === eventType) {
        handler(e.data.payload || {});
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('message', windowHandler);
    }
    return {
      remove: () => {
        if (keyboardListeners.has(eventType)) {
          keyboardListeners.get(eventType).delete(handler);
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('message', windowHandler);
        }
      }
    };
  },
  removeListener: (eventType, handler) => {
    if (keyboardListeners.has(eventType)) {
      keyboardListeners.get(eventType).delete(handler);
    }
  },
  removeAllListeners: (eventType) => {
    if (eventType) keyboardListeners.delete(eventType);
    else keyboardListeners.clear();
  },
  dismiss: () => {
    if (typeof document !== 'undefined' && document.activeElement) {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined') {
      window.postMessage({ type: 'dismiss_keyboard' }, '*');
    }
  },
  isVisible: () => {
    if (typeof window !== 'undefined' && window.__isKeyboardVisible) {
      return true;
    }
    return false;
  },
  metrics: () => null
};

/**
 * KeyboardAvoidingView with automatic translateY and padding animation
 */
export const KeyboardAvoidingView = React.forwardRef(({ behavior = 'padding', keyboardVerticalOffset = 0, style, children, ...props }, ref) => {
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);

  React.useEffect(() => {
    const subShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.height || 245);
    });
    const subHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const transformStyle = React.useMemo(() => {
    if (keyboardHeight <= 0) return {};
    const offset = Math.max(0, keyboardHeight - keyboardVerticalOffset);
    if (behavior === 'position') {
      return { transform: `translateY(-${offset}px)` };
    }
    if (behavior === 'height') {
      return { maxHeight: `calc(100% - ${offset}px)` };
    }
    // Default: padding
    return { paddingBottom: `${offset}px` };
  }, [behavior, keyboardHeight, keyboardVerticalOffset]);

  return (
    <RNWeb.View
      ref={ref}
      style={[{ flex: 1, width: '100%', transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }, transformStyle, style]}
      {...props}
    >
      {children}
    </RNWeb.View>
  );
});

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
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  TextInput,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
  ToastAndroid,
  Alert,
  Platform,
  Dimensions,
  PixelRatio,
  BackHandler,
  PermissionsAndroid,
  requireNativeComponent,
  NativeModules,
  NativeEventEmitter,
  DeviceEventEmitter,
  AppState,
  Vibration,
  UIManager,
  I18nManager,
  Appearance,
  AccessibilityInfo
};

export default defaultExport;
