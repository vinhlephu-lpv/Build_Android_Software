import * as React from 'react';
import { View } from 'react-native-web';

export const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 }
};

export const SafeAreaInsetsContext = React.createContext(initialWindowMetrics.insets);
export const SafeAreaFrameContext = React.createContext(initialWindowMetrics.frame);

export function SafeAreaProvider({ children, initialMetrics = initialWindowMetrics, style }) {
  const insets = initialMetrics ? initialMetrics.insets : initialWindowMetrics.insets;
  const frame = initialMetrics ? initialMetrics.frame : initialWindowMetrics.frame;
  return (
    React.createElement(SafeAreaFrameContext.Provider, { value: frame },
      React.createElement(SafeAreaInsetsContext.Provider, { value: insets },
        React.createElement(View, { style: [{ flex: 1, width: '100%', height: '100%' }, style] }, children)
      )
    )
  );
}

export function useSafeAreaInsets() {
  const insets = React.useContext(SafeAreaInsetsContext);
  return insets || initialWindowMetrics.insets;
}

export function useSafeAreaFrame() {
  const frame = React.useContext(SafeAreaFrameContext);
  return frame || initialWindowMetrics.frame;
}

export function SafeAreaView({ style, children, ...rest }) {
  const insets = useSafeAreaInsets();
  return (
    React.createElement(View, {
      style: [{ paddingTop: insets.top, paddingBottom: insets.bottom, flex: 1, width: '100%', height: '100%' }, style],
      ...rest
    }, children)
  );
}

export const SafeAreaConsumer = SafeAreaInsetsContext.Consumer;

const defaultExport = {
  SafeAreaProvider,
  useSafeAreaInsets,
  useSafeAreaFrame,
  SafeAreaView,
  SafeAreaInsetsContext,
  SafeAreaFrameContext,
  SafeAreaConsumer,
  initialWindowMetrics
};

export default defaultExport;
