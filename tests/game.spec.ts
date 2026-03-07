import { expect, test } from "@playwright/test";

test("title screen shows three airplane options", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByRole("heading", { name: "Airplane Fun" })).toBeVisible();
  await expect(page.locator("[data-plane-id]")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Launch Mission" })).toBeVisible();
  await expect(page.locator(".plane-stat-grid")).toBeVisible();
});

test("player can launch a mission and score points", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: /Wraith/i }).click();
  await page.getByRole("button", { name: "Launch Mission" }).click();
  await expect(page.locator('[data-state="hud"]')).toBeVisible();
  await expect(page.locator('[data-role="status"]')).toHaveText("Exploring");

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().chunkCount ?? 0);
    })
    .toBeGreaterThan(0);

  await page.evaluate(() => window.__airplaneFun?.spawnEnemyAhead());

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(140);
  }

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().score ?? 0);
    })
    .toBeGreaterThan(0);
});

test("game over flow allows restart", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: "Launch Mission" }).click();
  await page.evaluate(() => window.__airplaneFun?.destroyPlayer());
  await expect(page.locator('[data-state="game-over"]')).toBeVisible();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.locator('[data-state="hud"]')).toBeVisible();
  await expect(page.locator('[data-role="status"]')).toHaveText("Exploring");
});
