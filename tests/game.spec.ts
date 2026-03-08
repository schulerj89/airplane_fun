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
  await expect(page.getByLabel("Debug panel")).toBeVisible();
  await expect(page.locator('[data-role="status"]')).toHaveText("Taxi");
  await expect
    .poll(async () => page.locator('[data-role="debug-fps"]').textContent())
    .not.toBe("0");

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

  await page.evaluate(() => window.__airplaneFun?.spawnEnemyAhead(12, 0, 0, 0));

  for (let index = 0; index < 18; index += 1) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
  }

  await setControl(page, "KeyW", "keyup");

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().score ?? 0);
    }, { timeout: 15000 })
    .toBeGreaterThan(0);
});

test("enemy pursuit logic uses intercepts and close-pass offsets instead of a fixed tail anchor", async ({ page }) => {
  await page.goto("/?e2e=1");
  const farBehindPlan = await page.evaluate(() => window.__airplaneFun?.previewEnemyPursuit(28, 22, 0, 16, 1));
  const closePlan = await page.evaluate(() => window.__airplaneFun?.previewEnemyPursuit(9, 3, 0, 16, -1));
  const enemyAheadPlan = await page.evaluate(() => window.__airplaneFun?.previewEnemyPursuit(12, -8, 0, 16, 1));

  expect(farBehindPlan?.forwardOffset).toBeGreaterThan(12);
  expect(farBehindPlan?.lateralTarget).toBeGreaterThan(0);
  expect(closePlan?.closePass).toBeTruthy();
  expect(closePlan?.lateralTarget).toBeLessThan(0);
  expect(enemyAheadPlan?.forwardOffset).toBeLessThan(4);
});

test("pause freezes play and start over resets the run", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: "Launch Mission" }).click();

  await setControl(page, "KeyW", "keydown");
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().speed ?? 0);
    })
    .toBeGreaterThanOrEqual(8);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused")).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().phase ?? "missing");
    })
    .toBe("paused");

  const pausedSpeed = await page.evaluate(() => window.__airplaneFun?.getSnapshot().speed ?? 0);
  await page.waitForTimeout(250);
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().speed ?? 0);
    })
    .toBe(pausedSpeed);

  await page.getByRole("button", { name: "Start Over" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.locator('[data-role="status"]')).toHaveText("Taxi");
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().speed ?? -1);
    })
    .toBe(0);
  await setControl(page, "KeyW", "keyup");
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
