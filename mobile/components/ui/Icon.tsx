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
