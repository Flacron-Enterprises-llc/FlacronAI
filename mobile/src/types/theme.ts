export type ColorScheme = 'light' | 'dark';

export interface ColorPalette {
  /** Brand primary (logo orange #FD4403) and its interaction states. */
  primary: string;
  primaryHover: string;
  primarySoft: string;
  /** Brand secondary (logo navy #002A64). */
  navy: string;
  /** Semantic surface/text roles — mirrors frontend/src/index.css :root tokens. */
  ink: string;
  background: string;
  surface: string;
  border: string;
  muted: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface Radii {
  btn: number;
  card: number;
}

export interface TypographyScale {
  fontFamily: {
    display: string;
    displayMedium: string;
    body: string;
    bodyMedium: string;
    bodySemiBold: string;
  };
  size: {
    caption: number;
    body: number;
    subtitle: number;
    title: number;
    heading: number;
  };
}

export interface Theme {
  scheme: ColorScheme;
  colors: ColorPalette;
  spacing: Spacing;
  radii: Radii;
  typography: TypographyScale;
}
