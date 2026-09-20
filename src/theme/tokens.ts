/**
 * Central design tokens. Everything visual derives from these values —
 * Ant Design's ConfigProvider theme (theme/antdTheme.ts) and the global CSS
 * variables (styles/global.css) mirror them.
 */
export const colors = {
  primary: '#0f6e8c',
  primaryHover: '#13839f',
  primaryActive: '#0b5670',
  primarySoft: '#e6f3f7',
  accent: '#2a78d6',
  success: '#0f9d58',
  successSoft: '#e6f6ee',
  warning: '#d98800',
  warningSoft: '#fff5e0',
  error: '#d64545',
  errorSoft: '#fdecec',
  info: '#2a78d6',
  infoSoft: '#e9f1fb',
  text: '#1a2733',
  textSecondary: '#5b6b7a',
  textMuted: '#8a97a4',
  border: '#e3e8ee',
  borderStrong: '#cbd4dd',
  surface: '#ffffff',
  surfaceMuted: '#f5f7fa',
  surfaceSubtle: '#fafbfc',
  sidebar: '#0e1f2b',
  sidebarText: '#c9d5df',
  sidebarActive: '#1a3a4d',
} as const;

/** Validated categorical palette for charts — assign in fixed order, never cycle. */
export const chartSeries = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

/** Sequential ramp (single hue, light -> dark) for magnitude encodings. */
export const chartSequential = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] as const;

export const chartStatus = {
  good: '#0f9d58',
  warning: '#d98800',
  serious: '#eb6834',
  critical: '#d64545',
} as const;

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;

export const shadows = {
  sm: '0 1px 2px rgba(16, 24, 40, 0.06)',
  md: '0 2px 8px rgba(16, 24, 40, 0.08)',
  lg: '0 8px 24px rgba(16, 24, 40, 0.12)',
  focus: '0 0 0 3px rgba(15, 110, 140, 0.25)',
} as const;

export const typography = {
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontMono: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  sizes: { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, xxl: 24, display: 30 },
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

export const breakpoints = { xs: 480, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 } as const;

export const layout = {
  sidebarWidth: 256,
  sidebarCollapsedWidth: 72,
  headerHeight: 60,
  contentMaxWidth: 1600,
} as const;
