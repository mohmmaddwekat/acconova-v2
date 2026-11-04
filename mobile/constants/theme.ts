// AccoNova Design System — matches resources/css/design-system.css
export const Colors = {
  accent: '#068CF0',
  accentHover: '#0570C7',
  accentSoft: 'rgba(6, 140, 240, 0.12)',
  accentStrong: '#045495',

  bg: '#f8fbff',
  bgSoft: '#E6F3FE',
  surface: '#ffffff',
  surfaceSoft: '#f8fbff',
  surfaceStrong: '#CDE8FE',

  line: '#CDE8FE',
  lineStrong: '#9CD1FC',

  text: '#011C32',
  textSoft: '#033863',
  textMuted: '#045495',
  textFaint: '#0570C7',

  inverseBg: '#011C32',
  inverseText: '#E6F3FE',

  success: '#22a06b',
  warning: '#d9a34f',
  danger: '#df6b70',
  info: '#068CF0',
};

export const Radius = {
  xs: 10,
  sm: 14,
  md: 20,
  lg: 28,
};

export const Shadow = {
  soft: {
    shadowColor: '#011C32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  panel: {
    shadowColor: '#011C32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 27,
    elevation: 6,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Semantic surfaces for status chips, banners and category tints
export const Tint = {
  successBg: '#DCFCE7',
  dangerBg: '#FEE2E2',
  warningBg: '#FEF3C7',
  infoBg: '#E0F2FE',
  purple: '#7C3AED',
  purpleBg: '#EDE9FE',
  overlay: 'rgba(1, 28, 50, 0.55)',
};

// Strong status colors with >= 4.5:1 contrast on white (used for text)
export const StatusText = {
  success: '#15803D',
  danger: '#B91C1C',
  warning: '#B45309',
};

export const Layout = {
  minTouch: 44,
  tabBarHeight: 64,
};
