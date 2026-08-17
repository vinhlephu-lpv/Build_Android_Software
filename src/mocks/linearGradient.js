import React from 'react';
import { View } from 'react-native-web';

export default function LinearGradient({ colors = [], start = { x: 0, y: 0 }, end = { x: 0, y: 1 }, style, children, ...props }) {
  const colorStr = colors.join(', ');
  const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI) + 90);
  const bg = colors.length > 1 ? `linear-gradient(${angle}deg, ${colorStr})` : (colors[0] || 'transparent');

  return (
    <View style={[{ background: bg }, style]} {...props}>
      {children}
    </View>
  );
}
