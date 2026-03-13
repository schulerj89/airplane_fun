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
  await expect(page.locator("[data-mode-id]")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Launch Mission" })).toBeVisible();
  await expect(page.locator(".plane-stat-grid")).toBeVisible();
});

test("title screen can be reached again from debug and standard play", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Debug Sandbox/i }).click();
  await page.getByRole("button", { name: "Launch Mission" }).click();
  await expect(page.locator('[data-state="hud"]')).toBeVisible();

  await page.getByRole("button", { name: "Title Screen" }).first().click();
  await expect(page.getByRole("heading", { name: "Airplane Fun" })).toBeVisible();

  await page.getByRole("button", { name: /Standard Mission/i }).click();
  await page.getByRole("button", { name: "Launch Mission" }).click();
  await expect(page.locator('[data-state="hud"]')).toBeVisible();

  await setControl(page, "KeyT", "keydown");
  await expect(page.getByRole("heading", { name: "Airplane Fun" })).toBeVisible();
});

test("debug sandbox stays flat, tree-free, and limited to parked target dummies", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Debug Sandbox/i }).click();
  await page.getByRole("button", { name: "Launch Mission" }).click();

  await expect(page.locator('[data-state="hud"]')).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().selectedModeId ?? "missing");
    })
    .toBe("debug");
  await expect(page.locator('[data-role="status"]')).toHaveText("Debug Taxi");

  await page.waitForTimeout(3200);
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().enemyCount ?? -1);
    })
    .toBe(2);

  const sampledHeights = await page.evaluate(() => [
    window.__airplaneFun?.sampleTerrainHeight(0, 0) ?? -999,
    window.__airplaneFun?.sampleTerrainHeight(18, 24) ?? -999,
    window.__airplaneFun?.sampleTerrainHeight(-24, -18) ?? -999
  ]);
  expect(new Set(sampledHeights).size).toBe(1);
  expect(sampledHeights[0]).toBe(1);

  await page.evaluate(() => window.__airplaneFun?.spawnEnemyAhead(12, 0, 0, 12));
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().enemyCount ?? -1);
    })
    .toBe(2);

  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getEnemyTelemetry()[0]?.speed ?? -1);
    })
    .toBe(0);

  const initialTelemetry = await page.evaluate(() => window.__airplaneFun?.getEnemyTelemetry()[0]);
  await page.waitForTimeout(600);
  const parkedTelemetry = await page.evaluate(() => window.__airplaneFun?.getEnemyTelemetry()[0]);

  expect(parkedTelemetry?.distance).toBeCloseTo(initialTelemetry?.distance ?? 0, 2);
  expect(parkedTelemetry?.forwardDistance).toBeCloseTo(initialTelemetry?.forwardDistance ?? 0, 2);
  expect(parkedTelemetry?.lateralDistance).toBeCloseTo(initialTelemetry?.lateralDistance ?? 0, 2);
});

test("reverse control backs the plane up on the runway", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: "Launch Mission" }).click();

  await setControl(page, "KeyX", "keydown");
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().speed ?? 0);
    })
    .toBeLessThan(0);
  await expect(page.locator('[data-role="status"]')).toHaveText("Reverse");
  await setControl(page, "KeyX", "keyup");
});

test("settings cycle audio, camera, and debug detail levels", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: "Launch Mission" }).click();

  const audioButton = page.locator('[data-setting-id="audioMix"]');
  const cameraButton = page.locator('[data-setting-id="cameraZoom"]');
  const debugButton = page.locator('[data-setting-id="debugView"]');

  await expect(audioButton).toHaveText("Audio: Full");
  await expect(cameraButton).toHaveText("Camera: Standard");
  await expect(debugButton).toHaveText("Debug: Full");

  await audioButton.click();
  await cameraButton.click();
  await debugButton.click();

  await expect(audioButton).toHaveText("Audio: Reduced");
  await expect(cameraButton).toHaveText("Camera: Wide");
  await expect(debugButton).toHaveText("Debug: Compact");
  await expect(page.locator('[data-role="debug-memory"]')).toBeHidden();
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getSnapshot().settings ?? null);
    })
    .toEqual({
      audioMix: "reduced",
      cameraZoom: "wide",
      debugView: "compact"
    });

  await debugButton.click();
  await expect(debugButton).toHaveText("Debug: Hidden");
  await expect(page.getByLabel("Debug panel")).toBeHidden();
});

test("audio debug controls expose sound state and test cues", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: "Launch Mission" }).click();

  await page.getByRole("button", { name: "Test Explosion" }).click();
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getAudioDebugState().lastEvent ?? "missing");
    })
    .toBe("explosion");
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__airplaneFun?.getAudioDebugState().contextState ?? "missing");
    })
    .not.toBe("uninitialized");
  await expect(page.locator('[data-role="audio-status"]')).toContainText("explosion");
});

test("debug tools overlay stays inside the viewport on mobile", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: "Launch Mission" }).click();

  const boxes = await page.evaluate(() => {
    const tools = document.querySelector('[data-state="tools"]')?.getBoundingClientRect();
    const controls = document.querySelector('[data-state="controls"]')?.getBoundingClientRect();
    return {
      toolsTop: tools?.top ?? -1,
      toolsBottom: tools?.bottom ?? -1,
      controlsTop: controls?.top ?? -1,
      viewportHeight: window.innerHeight
    };
  });

  expect(boxes.toolsTop).toBeGreaterThanOrEqual(0);
  expect(boxes.toolsBottom).toBeLessThanOrEqual(boxes.viewportHeight);
  expect(boxes.toolsBottom).toBeLessThanOrEqual(boxes.controlsTop - 8);

  await page.close();
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
