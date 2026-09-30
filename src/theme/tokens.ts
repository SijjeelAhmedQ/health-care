/**
 * Central design tokens. Everything visual derives from these values —
 * Ant Design's ConfigProvider theme (theme/antdTheme.ts) and the global CSS
 * variables (styles/global.css) mirror them.
 *
 * The language: cool neutral surfaces that disappear, one confident azure (#0780d8) that
 * carries every action, a sky-to-azure gradient that only ever means "the AI", and status
 * colours used with words and icons — never colour alone.
 */
export const colors = {
  primary: '#0780d8',
  primaryHover: '#1a96e2',
  primaryActive: '#0668b0',
  primarySoft: '#e8f4fd',
  accent: '#148fde',
  accentSoft: '#e6f6fe',
  success: '#0f9d63',
  successSoft: '#e5f7ee',
  warning: '#d97706',
  warningSoft: '#fff4e0',
  error: '#e5484d',
  errorSoft: '#fdeced',
  info: '#0284c7',
  infoSoft: '#e6f4fb',
  ink: '#0b1020',
  text: '#1b2133',
  textSecondary: '#5d6478',
  textMuted: '#8c93a6',
  border: '#e8eaf1',
  borderStrong: '#d3d7e3',
  surface: '#ffffff',
  surfaceMuted: '#f4f5fa',
  surfaceSubtle: '#f9fafc',
  sidebar: '#ffffff',
  sidebarText: '#5d6478',
  sidebarActive: '#0780d8',
} as const;

/** Validated categorical palette for charts — assign in fixed order, never cycle. */
export const chartSeries = [
  '#0780d8', // 1 azure
  '#f97316', // 2 orange
  '#14b8a6', // 3 teal
  '#eab308', // 4 yellow
  '#ec4899', // 5 pink
  '#16a34a', // 6 green
  '#64748b', // 7 slate (no second blue: it would read as series 1)
  '#ef4444', // 8 red
] as const;

/** Sequential ramp (single hue, light -> dark) for magnitude encodings. */
export const chartSequential = ['#e6f4fd', '#c3e5fb', '#8fd0f7', '#39bbf4', '#1a96e2', '#0780d8', '#055fa1'] as const;

export const chartStatus = {
  good: '#0f9d63',
  warning: '#d97706',
  serious: '#f97316',
  critical: '#e5484d',
} as const;

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const shadows = {
  sm: '0 1px 2px rgba(11, 16, 32, 0.04), 0 2px 8px rgba(11, 16, 32, 0.04)',
  md: '0 2px 6px rgba(11, 16, 32, 0.04), 0 10px 28px rgba(11, 16, 32, 0.07)',
  lg: '0 8px 20px rgba(11, 16, 32, 0.07), 0 28px 56px rgba(11, 16, 32, 0.12)',
  focus: '0 0 0 3px rgba(7, 128, 216, 0.22)',
} as const;

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontDisplay: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  sizes: { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, xxl: 24, display: 30 },
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

export const breakpoints = { xs: 480, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 } as const;

export const layout = {
  sidebarWidth: 264,
  sidebarCollapsedWidth: 80,
  headerHeight: 64,
  contentMaxWidth: 1600,
} as const;
