import { test, expect } from "@playwright/test"

declare global {
  interface Window {
    __AUDIO_DEBUG__?: {
      getState: () => {
        queueLength: number
        muted: boolean
        mode: string
        volume: number
        currentPhrase: string | null
        supported: boolean
      }
    }
  }
}

test.describe("Audio narration controls", () => {
  test("queues narration for alert events", async ({ page, request }) => {
    await page.goto("http://localhost:3000/")
    await page.waitForSelector("[data-audio-status]")

    await request.get("http://localhost:8000/__test/push_event?type=alert&msg=Test_alert")

    await page.waitForFunction(
      () => (window.__AUDIO_DEBUG__?.getState()?.queueLength ?? 0) >= 1,
      undefined,
      { timeout: 5000 },
    )

    const state = await page.evaluate(() => window.__AUDIO_DEBUG__?.getState())
    expect(state?.queueLength ?? 0).toBeGreaterThanOrEqual(1)

    const statusText = await page.locator("[data-audio-status]").innerText()
    expect(statusText).toContain("Audio Active")
  })
})


