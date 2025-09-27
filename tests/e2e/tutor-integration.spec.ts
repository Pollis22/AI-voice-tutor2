import { test, expect } from "@playwright/test";

test.describe("Tutor integration", () => {
  test("start, switch, stop", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#page-title")).toContainText("JIE Mastery Tutor");

    await page.selectOption("#age-range", "g6_8");
    await page.selectOption("#subject", "math");

    await page.click("#start-btn");
    await expect(page.locator("elevenlabs-convai")).toBeVisible();

    await page.selectOption("#age-range", "g9_12");
    await page.click("#switch-btn");
    await expect(page.locator("elevenlabs-convai")).toBeVisible();

    await page.click("#end-btn");
    await expect(page.locator("elevenlabs-convai")).toHaveCount(0);
  });
});