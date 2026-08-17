import React from 'react';
import { FlatList } from 'react-native-web';

export const FlashList = React.forwardRef((props, ref) => {
  const { estimatedItemSize, ...rest } = props;
  return <FlatList ref={ref} {...rest} />;
});

export const MasonryFlashList = FlashList;
export const createAutoLayoutView = () => {};

export default FlashList;
