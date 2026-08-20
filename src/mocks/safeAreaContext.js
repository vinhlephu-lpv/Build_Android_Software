import * as React from 'react';
import { View } from 'react-native-web';

export const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 820 },
  insets: { top: 38, left: 0, right: 0, bottom: 16 }
};

export const SafeAreaInsetsContext = React.createContext(initialWindowMetrics.insets);
export const SafeAreaFrameContext = React.createContext(initialWindowMetrics.frame);

export function SafeAreaProvider({ children, initialMetrics = initialWindowMetrics, style }) {
  const insets = initialMetrics ? (initialMetrics.insets || initialWindowMetrics.insets) : initialWindowMetrics.insets;
  const frame = initialMetrics ? (initialMetrics.frame || initialWindowMetrics.frame) : initialWindowMetrics.frame;
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

export function SafeAreaView({ style, children, edges, ...rest }) {
  const insets = useSafeAreaInsets();

  const applyTop = !edges || edges.includes('top');
  const applyBottom = !edges || edges.includes('bottom');
  const applyLeft = !edges || edges.includes('left');
  const applyRight = !edges || edges.includes('right');

  const safeStyle = {
    paddingTop: applyTop ? insets.top : 0,
    paddingBottom: applyBottom ? insets.bottom : 0,
    paddingLeft: applyLeft ? insets.left : 0,
    paddingRight: applyRight ? insets.right : 0,
    flex: 1,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box'
  };

  return (
    React.createElement(View, {
      style: [safeStyle, style],
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
