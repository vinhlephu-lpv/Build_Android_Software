import React from 'react';
import { View } from 'react-native-web';

export const enableScreens = (shouldEnable = true) => {};
export const enableFreeze = (shouldEnable = true) => {};
export const screensEnabled = () => true;

export const Screen = React.forwardRef(({ active, activityState, style, children, enabled = true, ...props }, ref) => {
  const isHidden = (activityState === 0) || (active === 0) || (props.visible === false);
  return (
    <View
      ref={ref}
      style={[
        { flex: 1, width: '100%', height: '100%' },
        style,
        isHidden ? { display: 'none' } : undefined
      ]}
      aria-hidden={isHidden}
      {...props}
    >
      {children}
    </View>
  );
});

export const ScreenContainer = React.forwardRef(({ style, children, hasTwoPages, ...props }, ref) => (
  <View ref={ref} style={[{ flex: 1, width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }, style]} {...props}>
    {children}
  </View>
));

export const ScreenStack = React.forwardRef(({ style, children, ...props }, ref) => (
  <View ref={ref} style={[{ flex: 1, width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }, style]} {...props}>
    {children}
  </View>
));

export const ScreenStackHeaderConfig = (props) => null;
export const ScreenStackHeaderSubview = (props) => null;
export const ScreenStackHeaderBackButtonImage = (props) => null;
export const ScreenStackHeaderRightView = (props) => null;
export const ScreenStackHeaderLeftView = (props) => null;
export const ScreenStackHeaderTitleView = (props) => null;
export const ScreenStackHeaderCenterView = (props) => null;
export const ScreenStackHeaderSearchBarView = (props) => null;
export const SearchBar = (props) => null;
export const FullWindowOverlay = ({ children }) => <>{children}</>;

export const NativeScreen = Screen;
export const NativeScreenContainer = ScreenContainer;
export const NativeScreenNavigationContainer = ScreenContainer;

export const shouldUseActivityState = true;

export default {
  enableScreens,
  enableFreeze,
  screensEnabled,
  Screen,
  ScreenContainer,
  ScreenStack,
  NativeScreen,
  NativeScreenContainer,
  NativeScreenNavigationContainer,
  FullWindowOverlay,
};
