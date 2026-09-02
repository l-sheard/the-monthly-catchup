import Svg, { Circle, Path } from 'react-native-svg';

/** A plain outline person glyph — used for the "Account" link in the web top bar (app-tabs.web.tsx). */
export function PersonIcon({ size = 18, color = '#5C7268' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={2} />
      <Path d="M4 21c0-4.4183 3.5817-8 8-8s8 3.5817 8 8" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
