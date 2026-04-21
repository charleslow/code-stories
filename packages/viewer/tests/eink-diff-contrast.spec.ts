import { test, expect } from '@playwright/test'

type Rgb = {
  r: number
  g: number
  b: number
}

function parseBrowserRgb(color: string): Rgb {
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) {
    throw new Error(`Unsupported browser color: ${color}`)
  }

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  }
}

function luminanceChannel(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * luminanceChannel(color.r) +
    0.7152 * luminanceChannel(color.g) +
    0.0722 * luminanceChannel(color.b)
  )
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

test('e-ink mode paints readable diff rows', async ({ page }) => {
  await page.goto('/?url=local-stories%2Feink-diff-smoke.json')

  await expect(page.locator('.diff-pre')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'E-ink' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'eink')

  const diffColors = await page.locator('.diff-line-added, .diff-line-removed').evaluateAll((rows) =>
    rows.map((row) => {
      const content = row.querySelector('.diff-content')
      const marker = row.querySelector('.diff-marker')
      if (!content || !marker) {
        throw new Error('Diff row is missing content or marker')
      }

      const rowStyle = window.getComputedStyle(row)
      const contentStyle = window.getComputedStyle(content)
      const markerStyle = window.getComputedStyle(marker)
      return {
        rowClass: row.className,
        backgroundColor: rowStyle.backgroundColor,
        contentColor: contentStyle.color,
        markerColor: markerStyle.color,
      }
    }),
  )

  for (const colors of diffColors) {
    const background = parseBrowserRgb(colors.backgroundColor)
    expect(
      contrastRatio(parseBrowserRgb(colors.contentColor), background),
      `${colors.rowClass} content should be readable`,
    ).toBeGreaterThanOrEqual(7)
    expect(
      contrastRatio(parseBrowserRgb(colors.markerColor), background),
      `${colors.rowClass} marker should be readable`,
    ).toBeGreaterThanOrEqual(7)
  }
})
