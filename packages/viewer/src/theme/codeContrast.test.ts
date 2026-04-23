import { describe, expect, it } from 'vitest';
import { themes } from 'prism-react-renderer';
import {
  amplifyColorContrast,
  createContrastAmplifiedTheme,
  getContrastRatio,
} from './codeContrast';

const EINK_BACKGROUND = '#ffffff';
const EINK_MIN_CONTRAST = 7;

describe('code contrast amplification', () => {
  it('darkens low-contrast colors until they meet the target ratio', () => {
    const adjusted = amplifyColorContrast('#9ca3af', {
      backgroundColor: EINK_BACKGROUND,
      minContrastRatio: EINK_MIN_CONTRAST,
    });

    expect(getContrastRatio(adjusted, EINK_BACKGROUND)).toBeGreaterThanOrEqual(EINK_MIN_CONTRAST);
  });

  it('composites translucent foreground colors over the background before measuring contrast', () => {
    const contrast = getContrastRatio('rgba(0, 0, 0, 0.5)', EINK_BACKGROUND);

    expect(contrast).toBeCloseTo(3.95, 1);
  });

  it('amplifies translucent foreground colors based on their composited contrast', () => {
    const adjusted = amplifyColorContrast('rgba(17, 24, 39, 0.35)', {
      backgroundColor: EINK_BACKGROUND,
      minContrastRatio: EINK_MIN_CONTRAST,
    });

    expect(getContrastRatio(adjusted, EINK_BACKGROUND)).toBeGreaterThanOrEqual(EINK_MIN_CONTRAST);
  });

  it('keeps already contrastive colors unchanged', () => {
    const adjusted = amplifyColorContrast('#111111', {
      backgroundColor: EINK_BACKGROUND,
      minContrastRatio: EINK_MIN_CONTRAST,
    });

    expect(adjusted).toBe('#111111');
  });

  it('amplifies every parseable Prism token color in the derived theme', () => {
    const theme = createContrastAmplifiedTheme(themes.github, {
      backgroundColor: EINK_BACKGROUND,
      minContrastRatio: EINK_MIN_CONTRAST,
    });

    for (const tokenStyle of theme.styles) {
      const color = tokenStyle.style.color;
      if (typeof color !== 'string') continue;

      expect(getContrastRatio(color, EINK_BACKGROUND)).toBeGreaterThanOrEqual(EINK_MIN_CONTRAST);
    }
  });
});
