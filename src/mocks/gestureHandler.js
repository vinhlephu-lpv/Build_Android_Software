import React from 'react';
import { View, ScrollView as RNScrollView, FlatList as RNFlatList, TouchableOpacity } from 'react-native-web';

export const GestureHandlerRootView = React.forwardRef((props, ref) => (
  <View ref={ref} style={[{ flex: 1 }, props.style]} {...props} />
));

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
};

const createHandlerComponent = () => {
  return React.forwardRef((props, ref) => {
    const { children, ...rest } = props;
    return <View ref={ref} {...rest}>{children}</View>;
  });
};

export const PanGestureHandler = createHandlerComponent();
export const TapGestureHandler = createHandlerComponent();
export const LongPressGestureHandler = createHandlerComponent();
export const PinchGestureHandler = createHandlerComponent();
export const RotationGestureHandler = createHandlerComponent();
export const FlingGestureHandler = createHandlerComponent();
export const ForceTouchGestureHandler = createHandlerComponent();
export const NativeViewGestureHandler = createHandlerComponent();

export const ScrollView = RNScrollView;
export const FlatList = RNFlatList;
export const RectButton = TouchableOpacity;
export const BorderlessButton = TouchableOpacity;
export const BaseButton = TouchableOpacity;
export const RawButton = TouchableOpacity;

export const Gesture = {
  Pan: () => ({ onBegin: () => Gesture.Pan(), onUpdate: () => Gesture.Pan(), onEnd: () => Gesture.Pan(), minDistance: () => Gesture.Pan() }),
  Tap: () => ({ numberOfTaps: () => Gesture.Tap(), onEnd: () => Gesture.Tap() }),
  LongPress: () => ({ minDuration: () => Gesture.LongPress(), onEnd: () => Gesture.LongPress() }),
  Pinch: () => ({ onUpdate: () => Gesture.Pinch(), onEnd: () => Gesture.Pinch() }),
  Rotation: () => ({ onUpdate: () => Gesture.Rotation(), onEnd: () => Gesture.Rotation() }),
  Fling: () => ({ direction: () => Gesture.Fling(), onEnd: () => Gesture.Fling() }),
  Race: (...gestures) => Gesture.Pan(),
  Simultaneous: (...gestures) => Gesture.Pan(),
  Exclusive: (...gestures) => Gesture.Pan(),
};

export const GestureDetector = ({ gesture, children }) => {
  return <>{children}</>;
};

export default {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
  LongPressGestureHandler,
  PinchGestureHandler,
  RotationGestureHandler,
  FlingGestureHandler,
  ForceTouchGestureHandler,
  NativeViewGestureHandler,
  State,
  Directions,
  ScrollView,
  FlatList,
  RectButton,
  BorderlessButton,
  BaseButton,
  Gesture,
  GestureDetector,
};
