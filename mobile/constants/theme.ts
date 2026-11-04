// AccoNova Design System — mirrors backend/resources/css/design-system.css (light and dark).
export type ThemeMode = 'light' | 'dark';

const LIGHT = {
  colors: {
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
  },
  // Tinted fills for chips, banners and icon tiles, derived from the semantic colors.
  tint: {
    successBg: '#E3F5EC',
    dangerBg: '#FBEAEB',
    warningBg: '#FAF1DF',
    infoBg: '#E6F3FE',
    purple: '#045495',
    purpleBg: '#E6F3FE',
    overlay: 'rgba(1, 20, 35, 0.55)',
  },
  // Darker shades of the semantic hues for text on light surfaces (>= 4.5:1).
  status: { success: '#177A52', danger: '#B5444A', warning: '#8F6416' },
};

const DARK = {
  colors: {
    accent: '#38A3FA',
    accentHover: '#6ABAF8',
    accentSoft: 'rgba(56, 163, 250, 0.14)',
    accentStrong: '#6ABAF8',

    bg: '#011423',
    bgSoft: '#011C32',
    surface: '#011C32',
    surfaceSoft: '#033863',
    surfaceStrong: '#045495',

    line: '#033863',
    lineStrong: '#045495',

    text: '#E6F3FE',
    textSoft: '#CDE8FE',
    textMuted: '#9CD1FC',
    textFaint: '#6ABAF8',

    inverseBg: '#38A3FA',
    inverseText: '#011423',

    success: '#43c99a',
    warning: '#e0ad55',
    danger: '#f07d84',
    info: '#38A3FA',
  },
  tint: {
    successBg: 'rgba(67, 201, 154, 0.16)',
    dangerBg: 'rgba(240, 125, 132, 0.16)',
    warningBg: 'rgba(224, 173, 85, 0.16)',
    infoBg: 'rgba(56, 163, 250, 0.16)',
    purple: '#9CD1FC',
    purpleBg: 'rgba(56, 163, 250, 0.16)',
    overlay: 'rgba(1, 10, 18, 0.7)',
  },
  status: { success: '#43c99a', danger: '#f07d84', warning: '#e0ad55' },
};

/** Shared mutable objects: applyTheme() swaps their values so every import sees the active palette. */
export const Colors = { ...LIGHT.colors };
export const Tint = { ...LIGHT.tint };
export const StatusText = { ...LIGHT.status };

export function applyTheme(mode: ThemeMode): void {
  const palette = mode === 'dark' ? DARK : LIGHT;
  Object.assign(Colors, palette.colors);
  Object.assign(Tint, palette.tint);
  Object.assign(StatusText, palette.status);
}

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
    elevation: 2,
  },
  panel: {
    shadowColor: '#011C32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 27,
    elevation: 5,
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

export const Layout = {
  minTouch: 44,
  tabBarHeight: 64,
};

/** Type scale: body copy never goes below 14, captions and badges never below 12. */
export const Type = {
  caption: 12,
  body: 14,
  bodyLg: 16,
  title: 18,
  display: 28,
};
