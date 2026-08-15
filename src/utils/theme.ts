export const colors = {
  bg: '#0A1220', // deep navy background
  surface: '#121D30',
  surfaceAlt: '#1A2740',
  border: '#25334D',

  // Brand gradient: blue -> green, matching the StockMate logo
  brandBlue: '#1D6FE0',
  brandBlueDark: '#12408F',
  brandGreen: '#22C55E',
  brandGreenDark: '#15803D',

  primary: '#22C55E', // green as the primary action color
  primaryDark: '#15803D',
  secondary: '#1D6FE0', // blue as secondary accent
  secondaryDark: '#12408F',

  success: '#22C55E',
  danger: '#E5484D',
  warning: '#F2B90C',

  text: '#F5F7FA',
  textMuted: '#9CA9C0',
  textFaint: '#5E6B84',
};

export const gradients = {
  brand: ['#1D6FE0', '#22C55E'] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};
