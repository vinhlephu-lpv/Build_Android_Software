import React from 'react';

const createSvgComponent = (tag) => {
  return React.forwardRef((props, ref) => {
    const { fill = 'none', stroke, strokeWidth, color, style, ...rest } = props;
    const finalStroke = stroke || (color ? color : undefined);
    return React.createElement(tag, {
      ref,
      fill,
      stroke: finalStroke,
      strokeWidth,
      style: { display: 'inline-block', verticalAlign: 'middle', ...style },
      ...rest
    });
  });
};

export const Svg = createSvgComponent('svg');
export const Path = createSvgComponent('path');
export const Circle = createSvgComponent('circle');
export const Rect = createSvgComponent('rect');
export const Line = createSvgComponent('line');
export const Polygon = createSvgComponent('polygon');
export const Polyline = createSvgComponent('polyline');
export const G = createSvgComponent('g');
export const Text = createSvgComponent('text');
export const TSpan = createSvgComponent('tspan');
export const Defs = createSvgComponent('defs');
export const LinearGradient = createSvgComponent('linearGradient');
export const RadialGradient = createSvgComponent('radialGradient');
export const Stop = createSvgComponent('stop');
export const ClipPath = createSvgComponent('clipPath');
export const Pattern = createSvgComponent('pattern');
export const Mask = createSvgComponent('mask');
export const Use = createSvgComponent('use');
export const Symbol = createSvgComponent('symbol');

export const SvgXml = ({ xml, ...props }) => {
  if (!xml) return null;
  return <div dangerouslySetInnerHTML={{ __html: xml }} {...props} />;
};

export const SvgUri = ({ uri, ...props }) => {
  return <img src={uri} alt="svg" {...props} />;
};

export default Svg;
