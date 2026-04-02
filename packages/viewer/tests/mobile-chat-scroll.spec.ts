import { test, expect } from '@playwright/test'

test('mobile chat messages are not squished and container is scrollable', async ({ page }) => {
  // Load the first chapter of bentoml in forced-mobile mode
  await page.goto('/?url=local-stories%2Fbentoml.json&mobile=1')

  // Wait for the story to load
  await expect(page.locator('.mobile-tabs')).toBeVisible({ timeout: 10_000 })

  // Click the Chat tab
  await page.locator('.mobile-tab', { hasText: 'Chat' }).click()

  // Wait for chat messages to appear
  await expect(page.locator('.chat-message').first()).toBeVisible({ timeout: 10_000 })

  // Assert no message is squished: each element's rendered height must equal its scroll height
  const squished = await page.$$eval('.chat-message', (elements) =>
    elements.map((el, i) => {
      const rect = el.getBoundingClientRect()
      return {
        index: i,
        renderedHeight: rect.height,
        scrollHeight: el.scrollHeight,
        diff: Math.abs(rect.height - el.scrollHeight),
      }
    }).filter((m) => m.diff > 1)
  )
  expect(squished, `Squished messages found: ${JSON.stringify(squished)}`).toHaveLength(0)

  // Assert the chat-messages container is scrollable
  const scrollInfo = await page.$eval('.chat-messages', (el) => {
    const rect = el.getBoundingClientRect()
    return {
      scrollHeight: el.scrollHeight,
      renderedHeight: rect.height,
    }
  })
  expect(
    scrollInfo.scrollHeight,
    `chat-messages scrollHeight (${scrollInfo.scrollHeight}) must exceed rendered height (${scrollInfo.renderedHeight})`
  ).toBeGreaterThan(scrollInfo.renderedHeight)
})
