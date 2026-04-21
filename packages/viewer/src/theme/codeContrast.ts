import type { PrismTheme } from 'prism-react-renderer';

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type Rgba = Rgb & {
  a: number;
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

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

function compositeOver(foreground: Rgba, background: Rgb): Rgb {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
  };
}

function luminanceChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
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

export function getContrastRatio(foreground: string, background: string): number | null {
  const foregroundColor = parseColor(foreground);
  const backgroundColor = parseColor(background);
  if (!foregroundColor || !backgroundColor) return null;

  const opaqueWhite = { r: 255, g: 255, b: 255 };
  const backgroundRgb = compositeOver(backgroundColor, opaqueWhite);
  const foregroundRgb = compositeOver(foregroundColor, backgroundRgb);

  const foregroundLuminance = relativeLuminance(foregroundRgb);
  const backgroundLuminance = relativeLuminance(backgroundRgb);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function amplifyColorContrast(
  foreground: string,
  { backgroundColor, minContrastRatio }: ContrastOptions,
): string {
  const foregroundRgb = parseColor(foreground);
  const backgroundRgb = parseColor(backgroundColor);
  if (!foregroundRgb || !backgroundRgb) return foreground;

  const currentContrast = getContrastRatio(foreground, backgroundColor);
  if (currentContrast !== null && currentContrast >= minContrastRatio) return foreground;

  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  const blackContrast = getContrastRatio(toHex(black), backgroundColor) ?? 0;
  const whiteContrast = getContrastRatio(toHex(white), backgroundColor) ?? 0;
  const target = blackContrast >= whiteContrast ? black : white;

  let low = 0;
  let high = 1;
  for (let i = 0; i < 16; i += 1) {
    const amount = (low + high) / 2;
    const mixed = toHex(mixRgb(foregroundRgb, target, amount));
    const mixedContrast = getContrastRatio(mixed, backgroundColor) ?? 0;
    if (mixedContrast >= minContrastRatio) {
      high = amount;
    } else {
      low = amount;
    }
  }

  const adjusted = toHex(mixRgb(foregroundRgb, target, high));
  const adjustedContrast = getContrastRatio(adjusted, backgroundColor) ?? 0;
  return adjustedContrast >= minContrastRatio ? adjusted : toHex(target);
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
