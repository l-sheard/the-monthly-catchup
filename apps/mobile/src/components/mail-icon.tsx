import Svg, { Path, Rect } from 'react-native-svg';

/** A plain outline envelope glyph — used for the inbox link in the web top bar (app-tabs.web.tsx). */
export function MailIcon({ size = 18, color = '#5C7268' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth={2} />
      <Path d="M3 6l9 7 9-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
