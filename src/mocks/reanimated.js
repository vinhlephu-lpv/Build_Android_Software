import React from 'react';
import { View, Text, Image, ScrollView, Animated as RNAnimated } from 'react-native-web';

export const useSharedValue = (init) => {
  const ref = React.useRef({ value: init });
  return ref.current;
};

export const useDerivedValue = (fn) => {
  return { value: fn() };
};

export const useAnimatedStyle = (fn) => {
  try {
    return fn();
  } catch (e) {
    return {};
  }
};

export const withTiming = (toValue, config, callback) => {
  if (callback) callback(true);
  return toValue;
};

export const withSpring = (toValue, config, callback) => {
  if (callback) callback(true);
  return toValue;
};

export const withSequence = (...animations) => animations[animations.length - 1];
export const withRepeat = (animation, count, reverse) => animation;
export const withDelay = (delay, animation) => animation;

export const interpolate = (value, input = [0, 1], output = [0, 1]) => {
  if (input[1] === input[0]) return output[0];
  const ratio = (value - input[0]) / (input[1] - input[0]);
  return output[0] + ratio * (output[1] - output[0]);
};

export const Extrapolate = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
export const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };

export const runOnJS = (fn) => fn;
export const runOnUI = (fn) => fn;

export const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  quad: (t) => t * t,
  cubic: (t) => t * t * t,
  bezier: () => (t) => t,
  in: (fn) => fn,
  out: (fn) => fn,
  inOut: (fn) => fn,
};

export const Animated = {
  View: React.forwardRef((props, ref) => <View ref={ref} {...props} />),
  Text: React.forwardRef((props, ref) => <Text ref={ref} {...props} />),
  Image: React.forwardRef((props, ref) => <Image ref={ref} {...props} />),
  ScrollView: React.forwardRef((props, ref) => <ScrollView ref={ref} {...props} />),
  createAnimatedComponent: (Component) => Component,
};

export const FadeIn = { duration: () => FadeIn, delay: () => FadeIn };
export const FadeOut = { duration: () => FadeOut, delay: () => FadeOut };
export const SlideInDown = { duration: () => SlideInDown, delay: () => SlideInDown };
export const SlideInUp = { duration: () => SlideInUp, delay: () => SlideInUp };
export const SlideInLeft = { duration: () => SlideInLeft, delay: () => SlideInLeft };
export const SlideInRight = { duration: () => SlideInRight, delay: () => SlideInRight };

export default {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  withDelay,
  interpolate,
  Extrapolate,
  Extrapolation,
  runOnJS,
  runOnUI,
  Easing,
  Animated,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideInUp,
  SlideInLeft,
  SlideInRight,
};
