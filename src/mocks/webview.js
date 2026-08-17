import React from 'react';

export const WebView = React.forwardRef((props, ref) => {
  const { source, style, onMessage, onLoad, ...rest } = props;
  const src = source?.uri || (source?.html ? `data:text/html;charset=utf-8,${encodeURIComponent(source.html)}` : '');

  return (
    <iframe
      ref={ref}
      src={src}
      style={{ border: 'none', width: '100%', height: '100%', ...style }}
      onLoad={onLoad}
      {...rest}
    />
  );
});

export default WebView;
