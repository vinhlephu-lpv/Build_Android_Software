import React from 'react';

export default function Slider({
  value = 0,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  onValueChange,
  onSlidingComplete,
  disabled = false,
  style,
  minimumTrackTintColor = '#ffffff',
  maximumTrackTintColor = 'rgba(255, 255, 255, 0.45)',
  thumbTintColor = '#ffffff',
  ...props
}) {
  const [val, setVal] = React.useState(value);

  React.useEffect(() => {
    setVal(value);
  }, [value]);

  const min = minimumValue;
  const max = maximumValue;
  const percentage = max > min ? ((val - min) / (max - min)) * 100 : 0;

  const handleChange = (e) => {
    const newVal = parseFloat(e.target.value);
    setVal(newVal);
    if (onValueChange) onValueChange(newVal);
  };

  const handleComplete = (e) => {
    const newVal = parseFloat(e.target.value);
    if (onSlidingComplete) onSlidingComplete(newVal);
  };

  const trackBg = `linear-gradient(to right, ${minimumTrackTintColor} 0%, ${minimumTrackTintColor} ${percentage}%, ${maximumTrackTintColor} ${percentage}%, ${maximumTrackTintColor} 100%)`;

  return (
    <div style={{ width: '100%', padding: '6px 0', display: 'flex', alignItems: 'center', ...style }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 'any'}
        value={val}
        disabled={disabled}
        onChange={handleChange}
        onMouseUp={handleComplete}
        onTouchEnd={handleComplete}
        className="rn-custom-slider"
        style={{
          width: '100%',
          height: '4px',
          borderRadius: '2px',
          appearance: 'none',
          WebkitAppearance: 'none',
          background: trackBg,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          margin: 0,
        }}
        {...props}
      />
      <style>{`
        .rn-custom-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          border: none;
          margin-top: 0px;
        }
        .rn-custom-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
