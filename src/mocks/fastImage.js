import React from 'react';
import { Image } from 'react-native-web';

const FastImage = React.forwardRef((props, ref) => {
  const { source, resizeMode, ...rest } = props;
  const uri = typeof source === 'object' ? source.uri : source;

  return (
    <Image
      ref={ref}
      source={{ uri }}
      resizeMode={resizeMode}
      {...rest}
    />
  );
});

FastImage.resizeMode = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'stretch',
  center: 'center',
};

FastImage.priority = {
  low: 'low',
  normal: 'normal',
  high: 'high',
};

FastImage.cacheControl = {
  immutable: 'immutable',
  web: 'web',
  cacheOnly: 'cacheOnly',
};

FastImage.preload = () => {};
FastImage.clearMemoryCache = async () => {};
FastImage.clearDiskCache = async () => {};

export default FastImage;
