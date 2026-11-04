import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Shape =
  | { p: string }
  | { c: [number, number, number] }
  | { r: [number, number, number, number, number] };

const ICONS = {
  home: [{ p: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }, { p: 'M9 22V12h6v10' }],
  file: [{ p: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }, { p: 'M14 2v6h6' }],
  fileUp: [{ p: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }, { p: 'M14 2v6h6' }, { p: 'M12 18v-6' }, { p: 'M9 15l3-3 3 3' }],
  fileDown: [{ p: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }, { p: 'M14 2v6h6' }, { p: 'M12 12v6' }, { p: 'M9 15l3 3 3-3' }],
  plus: [{ p: 'M12 5v14M5 12h14' }],
  check: [{ p: 'M20 6L9 17l-5-5' }],
  checkSquare: [{ p: 'M9 11l3 3L22 4' }, { p: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' }],
  more: [{ c: [12, 5, 1] }, { c: [12, 12, 1] }, { c: [12, 19, 1] }],
  users: [{ p: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }, { c: [9, 7, 4] }, { p: 'M23 21v-2a4 4 0 0 0-3-3.87' }, { p: 'M16 3.13a4 4 0 0 1 0 7.75' }],
  barChart: [{ p: 'M18 20V10M12 20V4M6 20v-6' }],
  bell: [{ p: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }, { p: 'M13.73 21a2 2 0 0 1-3.46 0' }],
  chat: [{ p: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }],
  chevronLeft: [{ p: 'M15 18l-6-6 6-6' }],
  chevronRight: [{ p: 'M9 18l6-6-6-6' }],
  chevronDown: [{ p: 'M6 9l6 6 6-6' }],
  backspace: [{ p: 'M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z' }, { p: 'M18 9l-6 6' }, { p: 'M12 9l6 6' }],
  close: [{ p: 'M18 6L6 18M6 6l12 12' }],
  search: [{ c: [11, 11, 8] }, { p: 'M21 21l-4.35-4.35' }],
  banknote: [{ r: [2, 6, 20, 12, 2] }, { c: [12, 12, 2.5] }],
  logout: [{ p: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }, { p: 'M16 17l5-5-5-5' }, { p: 'M21 12H9' }],
  eye: [{ p: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }, { c: [12, 12, 3] }],
  eyeOff: [
    { p: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' },
    { p: 'M1 1l22 22' },
  ],
  wifiOff: [{ p: 'M1 1l22 22' }, { p: 'M16.72 11.06A10.94 10.94 0 0 1 19 12.55' }, { p: 'M5 12.55a10.94 10.94 0 0 1 5.17-2.39' }, { p: 'M10.71 5.05A16 16 0 0 1 22.58 9' }, { p: 'M1.42 9a15.91 15.91 0 0 1 4.7-2.88' }, { p: 'M8.53 16.11a6 6 0 0 1 6.95 0' }, { p: 'M12 20h.01' }],
  user: [{ p: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }, { c: [12, 7, 4] }],
  calendar: [{ r: [3, 4, 18, 18, 2] }, { p: 'M16 2v4M8 2v4M3 10h18' }],
  mail: [{ p: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' }, { p: 'M22 6l-10 7L2 6' }],
  lock: [{ r: [3, 11, 18, 11, 2] }, { p: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  trendUp: [{ p: 'M23 6l-9.5 9.5-5-5L1 18' }, { p: 'M17 6h6v6' }],
  trendDown: [{ p: 'M23 18l-9.5-9.5-5 5L1 6' }, { p: 'M17 18h6v-6' }],
  card: [{ r: [2, 5, 20, 14, 2] }, { p: 'M2 10h20' }],
  clock: [{ c: [12, 12, 10] }, { p: 'M12 6v6l4 2' }],
  alertCircle: [{ c: [12, 12, 10] }, { p: 'M12 8v4' }, { p: 'M12 16h.01' }],
  chevronUp: [{ p: 'M18 15l-6-6-6 6' }],
  arrowDownLeft: [{ p: 'M17 7L7 17' }, { p: 'M17 17H7V7' }],
  arrowUpRight: [{ p: 'M7 17L17 7' }, { p: 'M7 7h10v10' }],
  globe: [{ c: [12, 12, 10] }, { p: 'M2 12h20' }, { p: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' }],
  sun: [{ c: [12, 12, 4] }, { p: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' }],
  moon: [{ p: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }],
  monitor: [{ r: [2, 3, 20, 14, 2] }, { p: 'M8 21h8M12 17v4' }],
  refresh: [{ p: 'M23 4v6h-6' }, { p: 'M1 20v-6h6' }, { p: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }],
  dollar: [{ p: 'M12 1v22' }, { p: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' }],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = '#011C32', strokeWidth = 2 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {(ICONS[name] as Shape[]).map((s, i) => {
        if ('p' in s) return <Path key={i} d={s.p} />;
        if ('c' in s) return <Circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} />;
        return <Rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} />;
      })}
    </Svg>
  );
}
