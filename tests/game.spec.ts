import { expect, test, type Page } from "@playwright/test";

async function setControl(page: Page, code: string, type: "keydown" | "keyup"): Promise<void> {
  await page.evaluate(
    ({ inputCode, inputType }) => {
      window.dispatchEvent(new KeyboardEvent(inputType, { code: inputCode, bubbles: true, cancelable: true }));
    },
    { inputCode: code, inputType: type }
  );
}

test("title screen shows three airplane options", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByRole("heading", { name: "Airplane Fun" })).toBeVisible();
  await expect(page.locator("[data-plane-id]")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Launch Mission" })).toBeVisible();
  await expect(page.locator(".plane-stat-grid")).toBeVisible();
});

test("player can accelerate down the runway, take off, and score points", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: /Wraith/i }).click();
  await page.getByRole("button", { name: "Launch Mission" }).click();
  await expect(page.locator('[data-state="hud"]')).toBeVisible();
  await expect(page.locator('[data-role="status"]')).toHaveText("Taxi");

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().chunkCount ?? 0);
    })
    .toBeGreaterThan(0);

  await setControl(page, "KeyW", "keydown");
  await setControl(page, "ArrowUp", "keydown");

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().speed ?? 0);
    })
    .toBeGreaterThanOrEqual(12);

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().airborne ?? false);
    })
    .toBeTruthy();

  await setControl(page, "ArrowUp", "keyup");
  await expect(page.locator('[data-role="status"]')).not.toHaveText("Taxi");

  await page.evaluate(() => window.__airplaneFun?.spawnEnemyAhead());

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(120);
  }

  await setControl(page, "KeyW", "keyup");

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().score ?? 0);
    })
    .toBeGreaterThan(0);
});

test("game over flow allows restart on the runway", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: "Launch Mission" }).click();
  await page.evaluate(() => window.__airplaneFun?.destroyPlayer());
  await expect(page.locator('[data-state="game-over"]')).toBeVisible();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.locator('[data-state="hud"]')).toBeVisible();
  await expect(page.locator('[data-role="status"]')).toHaveText("Taxi");
});
