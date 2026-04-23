import type { PrismTheme } from 'prism-react-renderer';

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type Rgba = Rgb & {
  a: number;
};

type Hsl = {
  h: number;
  s: number;
  l: number;
};

type ContrastOptions = {
  backgroundColor: string;
  minContrastRatio: number;
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(color: string): Rgba | null {
  const hex = color.trim().replace(/^#/, '');
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: 1,
    };
  }

  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }

  if (hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255,
    };
  }

  return null;
}

function parseRgbColor(color: string): Rgba | null {
  const match = color.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;

  const parts = match[1].split(',').map((part) => part.trim());
  const [r, g, b] = parts.map((part) => Number.parseFloat(part));
  if (![r, g, b].every(Number.isFinite)) return null;

  const a = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
  if (!Number.isFinite(a)) return null;

  return { r, g, b, a: Math.max(0, Math.min(1, a)) };
}

function parseColor(color: string): Rgba | null {
  if (color.trim().startsWith('#')) return parseHexColor(color);
  return parseRgbColor(color);
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function compositeOver(foreground: Rgba, background: Rgb): Rgb {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
  };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h /= 6;

  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return {
    r: Math.round(hue2rgb(h + 1 / 3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1 / 3) * 255),
  };
}

function luminanceChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * luminanceChannel(color.r) +
    0.7152 * luminanceChannel(color.g) +
    0.0722 * luminanceChannel(color.b)
  );
}

// background must be opaque; foreground may be transparent
export function getContrastRatio(foreground: string, background: string): number | null {
  const foregroundColor = parseColor(foreground);
  const backgroundColor = parseColor(background);
  if (!foregroundColor || !backgroundColor) return null;

  const foregroundRgb = compositeOver(foregroundColor, backgroundColor);

  const foregroundLuminance = relativeLuminance(foregroundRgb);
  const backgroundLuminance = relativeLuminance(backgroundColor);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function amplifyColorContrast(
  foreground: string,
  { backgroundColor, minContrastRatio }: ContrastOptions,
): string {
  const foregroundRgba = parseColor(foreground);
  const backgroundRgb = parseColor(backgroundColor);
  if (!foregroundRgba || !backgroundRgb) return foreground;

  const currentContrast = getContrastRatio(foreground, backgroundColor);
  if (currentContrast !== null && currentContrast >= minContrastRatio) return foreground;

  const composited = compositeOver(foregroundRgba, backgroundRgb);
  const hsl = rgbToHsl(composited);
  const backgroundLuminance = relativeLuminance(backgroundRgb);
  const lTarget = backgroundLuminance > 0.5 ? 0 : 1;
  const lAdjusted = (t: number) => hsl.l + (lTarget - hsl.l) * t;

  let low = 0;
  let high = 1;
  for (let i = 0; i < 12; i += 1) {
    const t = (low + high) / 2;
    const candidate = toHex(hslToRgb({ ...hsl, l: lAdjusted(t) }));
    const ratio = getContrastRatio(candidate, backgroundColor) ?? 0;
    if (ratio >= minContrastRatio) {
      high = t;
    } else {
      low = t;
    }
  }

  const adjusted = toHex(hslToRgb({ ...hsl, l: lAdjusted(high) }));
  const adjustedContrast = getContrastRatio(adjusted, backgroundColor) ?? 0;
  return adjustedContrast >= minContrastRatio
    ? adjusted
    : backgroundLuminance > 0.5 ? '#000000' : '#ffffff';
}

export function createContrastAmplifiedTheme(
  baseTheme: PrismTheme,
  options: ContrastOptions,
): PrismTheme {
  return {
    plain: {
      ...baseTheme.plain,
      color: amplifyColorContrast(baseTheme.plain.color ?? '#24292f', options),
      backgroundColor: options.backgroundColor,
    },
    styles: baseTheme.styles.map((themeStyle) => ({
      ...themeStyle,
      style: {
        ...themeStyle.style,
        color: typeof themeStyle.style.color === 'string'
          ? amplifyColorContrast(themeStyle.style.color, options)
          : themeStyle.style.color,
      },
    })),
  };
}
