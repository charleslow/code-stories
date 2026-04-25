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

  describe('createContrastAmplifiedTheme background tint rules', () => {
    const opts = { backgroundColor: EINK_BACKGROUND, minContrastRatio: EINK_MIN_CONTRAST };

    function makeTheme(styles: Array<{ types: string[]; color: string }>) {
      return createContrastAmplifiedTheme(
        {
          plain: { color: '#24292f', backgroundColor: '#ffffff' },
          styles: styles.map(({ types, color }) => ({ types, style: { color } })),
        },
        opts,
      );
    }

    it('applies background tint to colorful non-punctuation tokens', () => {
      // #cf222e is a vivid red (keyword color in github theme)
      const theme = makeTheme([{ types: ['keyword'], color: '#cf222e' }]);
      expect(theme.styles[0].style.backgroundColor).toBeDefined();
    });

    it('suppresses background tint for grey-ish comment colors', () => {
      // #6e7781 is the github theme comment color — low saturation grey
      const theme = makeTheme([{ types: ['comment'], color: '#6e7781' }]);
      expect(theme.styles[0].style.backgroundColor).toBeUndefined();
    });

    it('suppresses background tint for punctuation tokens', () => {
      const theme = makeTheme([{ types: ['punctuation'], color: '#cf222e' }]);
      expect(theme.styles[0].style.backgroundColor).toBeUndefined();
    });

    it('applies background tint when types is empty (empty types are not treated as punctuation)', () => {
      const theme = makeTheme([{ types: [], color: '#cf222e' }]);
      expect(theme.styles[0].style.backgroundColor).toBeDefined();
    });

    it('suppresses background tint when all types are punctuation, even in a mixed list', () => {
      const theme = makeTheme([{ types: ['punctuation', 'punctuation'], color: '#cf222e' }]);
      expect(theme.styles[0].style.backgroundColor).toBeUndefined();
    });

    it('applies background tint when types contains non-punctuation alongside punctuation', () => {
      const theme = makeTheme([{ types: ['operator', 'punctuation'], color: '#cf222e' }]);
      expect(theme.styles[0].style.backgroundColor).toBeDefined();
    });
  });
});
