import {
  AUDIO_MIX_OPTIONS,
  CAMERA_ZOOM_OPTIONS,
  DEBUG_VIEW_OPTIONS,
  GameModeDefinition,
  GameModeId,
  GameSettings,
  PlaneDefinition,
  PlaneId
} from "./config";

interface HudState {
  health: number;
  maxHealth: number;
  score: number;
  wave: number;
  planeName: string;
  status: string;
  speed: number;
  altitude: number;
}

interface DebugState {
  fps: number;
  frameTimeMs: number;
  memoryUsageMb: number | null;
  drawCalls: number;
  triangles: number;
  chunkCount: number;
  enemyCount: number;
  projectileCount: number;
}

export class UIController {
  private readonly root: HTMLElement;
  private readonly titleScreen: HTMLElement;
  private readonly selectionPanel: HTMLElement;
  private readonly description: HTMLElement;
  private readonly modePanel: HTMLElement;
  private readonly modeDescription: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly waveValue: HTMLElement;
  private readonly healthValue: HTMLElement;
  private readonly planeValue: HTMLElement;
  private readonly statusValue: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly altitudeValue: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly gameOverSummary: HTMLElement;
  private readonly launchButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly startOverButton: HTMLButtonElement;
  private readonly mobileControls: HTMLElement;
  private readonly gameTools: HTMLElement;
  private readonly pauseBanner: HTMLElement;
  private readonly fpsValue: HTMLElement;
  private readonly frameTimeValue: HTMLElement;
  private readonly memoryValue: HTMLElement;
  private readonly drawCallsValue: HTMLElement;
  private readonly trianglesValue: HTMLElement;
  private readonly chunkCountValue: HTMLElement;
  private readonly enemyCountValue: HTMLElement;
  private readonly projectileCountValue: HTMLElement;
  private readonly settingButtons: Record<keyof GameSettings, HTMLButtonElement>;

  constructor(
    container: HTMLElement,
    planeDefinitions: PlaneDefinition[],
    modeDefinitions: GameModeDefinition[],
    initialPlaneId: PlaneId,
    initialModeId: GameModeId,
    initialSettings: GameSettings,
    onLaunch: (planeId: PlaneId, modeId: GameModeId) => void,
    onRestart: () => void,
    onPauseToggle: () => void,
    onStartOver: () => void,
    onCycleSetting: (settingId: keyof GameSettings) => void
  ) {
    this.root = document.createElement("div");
    this.root.className = "game-shell";
    this.root.innerHTML = `
      <div class="backdrop"></div>
      <div class="viewport">
        <div class="scene-wrap">
          <canvas class="game-canvas" aria-label="Airplane Fun game"></canvas>
        </div>
        <section class="title-screen" data-state="title">
          <div class="title-card">
            <p class="eyebrow">Voxel air combat</p>
            <h1>Airplane Fun</h1>
            <p class="subtitle">Launch from the runway, build speed, rotate into the climb, and clear hostile fighters across the streamed voxel sky.</p>
            <div class="mode-grid"></div>
            <div class="mode-description"></div>
            <div class="plane-grid"></div>
            <div class="plane-description"></div>
            <button class="primary-button">Launch Mission</button>
          </div>
        </section>
        <section class="hud hidden" data-state="hud">
          <div><span>Plane</span><strong data-role="plane"></strong></div>
          <div><span>Status</span><strong data-role="status"></strong></div>
          <div><span>Speed</span><strong data-role="speed"></strong></div>
          <div><span>Altitude</span><strong data-role="altitude"></strong></div>
          <div><span>Hull</span><strong data-role="health"></strong></div>
          <div><span>Score</span><strong data-role="score"></strong></div>
          <div><span>Threat</span><strong data-role="wave"></strong></div>
        </section>
        <section class="game-tools hidden" data-state="tools">
          <div class="pause-banner hidden">Paused</div>
          <div class="tool-actions">
            <button class="secondary-button" type="button" data-role="pause-toggle">Pause</button>
            <button class="secondary-button" type="button" data-role="start-over">Start Over</button>
          </div>
          <div class="debug-panel" aria-label="Debug panel">
            <div data-debug-detail="core"><span>FPS</span><strong data-role="debug-fps"></strong></div>
            <div data-debug-detail="core"><span>Frame</span><strong data-role="debug-frame-time"></strong></div>
            <div data-debug-detail="extended"><span>Memory</span><strong data-role="debug-memory"></strong></div>
            <div data-debug-detail="extended"><span>Draw Calls</span><strong data-role="debug-draw-calls"></strong></div>
            <div data-debug-detail="extended"><span>Triangles</span><strong data-role="debug-triangles"></strong></div>
            <div data-debug-detail="core"><span>Chunks</span><strong data-role="debug-chunks"></strong></div>
            <div data-debug-detail="core"><span>Enemies</span><strong data-role="debug-enemies"></strong></div>
            <div data-debug-detail="extended"><span>Shots</span><strong data-role="debug-projectiles"></strong></div>
          </div>
          <div class="settings-panel" aria-label="Settings panel">
            <h3>Settings</h3>
            <div class="settings-grid">
              <button class="setting-button" type="button" data-setting-id="audioMix"></button>
              <button class="setting-button" type="button" data-setting-id="cameraZoom"></button>
              <button class="setting-button" type="button" data-setting-id="debugView"></button>
            </div>
          </div>
        </section>
        <section class="game-over hidden" data-state="game-over">
          <div class="title-card compact">
            <p class="eyebrow">Hull lost</p>
            <h2>Rearm and relaunch</h2>
            <p class="summary"></p>
            <button class="secondary-button" type="button" data-role="game-over-restart">Restart</button>
          </div>
        </section>
        <section class="mobile-controls hidden" data-state="controls">
          <div class="control-stack">
            <div class="dpad">
              <button data-action="up">Pitch Up</button>
              <div class="dpad-row">
                <button data-action="left">Yaw Left</button>
                <button data-action="down">Pitch Down</button>
                <button data-action="right">Yaw Right</button>
              </div>
            </div>
            <div class="throttle-row">
              <button data-action="throttle-up">Throttle +</button>
              <button data-action="throttle-down">Throttle -</button>
            </div>
          </div>
          <div class="control-stack">
            <div class="control-hint">W/S throttle, arrows pitch, A/D yaw, P pause, R restart</div>
            <button class="fire-button" data-action="fire">Fire</button>
          </div>
        </section>
      </div>
    `;
    container.append(this.root);

    this.titleScreen = this.root.querySelector(".title-screen") as HTMLElement;
    this.selectionPanel = this.root.querySelector(".plane-grid") as HTMLElement;
    this.description = this.root.querySelector(".plane-description") as HTMLElement;
    this.modePanel = this.root.querySelector(".mode-grid") as HTMLElement;
    this.modeDescription = this.root.querySelector(".mode-description") as HTMLElement;
    this.hud = this.root.querySelector(".hud") as HTMLElement;
    this.scoreValue = this.root.querySelector('[data-role="score"]') as HTMLElement;
    this.waveValue = this.root.querySelector('[data-role="wave"]') as HTMLElement;
    this.healthValue = this.root.querySelector('[data-role="health"]') as HTMLElement;
    this.planeValue = this.root.querySelector('[data-role="plane"]') as HTMLElement;
    this.statusValue = this.root.querySelector('[data-role="status"]') as HTMLElement;
    this.speedValue = this.root.querySelector('[data-role="speed"]') as HTMLElement;
    this.altitudeValue = this.root.querySelector('[data-role="altitude"]') as HTMLElement;
    this.gameOver = this.root.querySelector(".game-over") as HTMLElement;
    this.gameOverSummary = this.root.querySelector(".summary") as HTMLElement;
    this.launchButton = this.root.querySelector(".primary-button") as HTMLButtonElement;
    this.restartButton = this.root.querySelector('[data-role="game-over-restart"]') as HTMLButtonElement;
    this.pauseButton = this.root.querySelector('[data-role="pause-toggle"]') as HTMLButtonElement;
    this.startOverButton = this.root.querySelector('[data-role="start-over"]') as HTMLButtonElement;
    this.mobileControls = this.root.querySelector(".mobile-controls") as HTMLElement;
    this.gameTools = this.root.querySelector(".game-tools") as HTMLElement;
    this.pauseBanner = this.root.querySelector(".pause-banner") as HTMLElement;
    this.fpsValue = this.root.querySelector('[data-role="debug-fps"]') as HTMLElement;
    this.frameTimeValue = this.root.querySelector('[data-role="debug-frame-time"]') as HTMLElement;
    this.memoryValue = this.root.querySelector('[data-role="debug-memory"]') as HTMLElement;
    this.drawCallsValue = this.root.querySelector('[data-role="debug-draw-calls"]') as HTMLElement;
    this.trianglesValue = this.root.querySelector('[data-role="debug-triangles"]') as HTMLElement;
    this.chunkCountValue = this.root.querySelector('[data-role="debug-chunks"]') as HTMLElement;
    this.enemyCountValue = this.root.querySelector('[data-role="debug-enemies"]') as HTMLElement;
    this.projectileCountValue = this.root.querySelector('[data-role="debug-projectiles"]') as HTMLElement;
    this.settingButtons = {
      audioMix: this.root.querySelector('[data-setting-id="audioMix"]') as HTMLButtonElement,
      cameraZoom: this.root.querySelector('[data-setting-id="cameraZoom"]') as HTMLButtonElement,
      debugView: this.root.querySelector('[data-setting-id="debugView"]') as HTMLButtonElement
    };

    let selectedPlaneId = initialPlaneId;
    let selectedModeId = initialModeId;

    const renderSelection = (): void => {
      this.modePanel.innerHTML = "";
      for (const mode of modeDefinitions) {
        const button = document.createElement("button");
        button.className = mode.id === selectedModeId ? "mode-option active" : "mode-option";
        button.type = "button";
        button.dataset.modeId = mode.id;
        button.innerHTML = `
          <strong>${mode.name}</strong>
          <span>${mode.tagline}</span>
        `;
        button.addEventListener("click", () => {
          selectedModeId = mode.id;
          renderSelection();
        });
        this.modePanel.append(button);
      }

      const selectedMode = modeDefinitions.find((mode) => mode.id === selectedModeId);
      if (selectedMode) {
        this.modeDescription.innerHTML = `
          <h2>${selectedMode.name}</h2>
          <p>${selectedMode.description}</p>
        `;
      }

      this.selectionPanel.innerHTML = "";
      for (const plane of planeDefinitions) {
        const button = document.createElement("button");
        button.className = plane.id === selectedPlaneId ? "plane-option active" : "plane-option";
        button.type = "button";
        button.dataset.planeId = plane.id;
        button.innerHTML = `
          <strong>${plane.name}</strong>
          <span>${plane.role}</span>
          <span>Speed ${plane.speed}</span>
          <span>Hull ${plane.maxHealth}</span>
          <span>Damage ${plane.damage}</span>
        `;
        button.addEventListener("click", () => {
          selectedPlaneId = plane.id;
          renderSelection();
        });
        this.selectionPanel.append(button);
      }

      const selectedPlane = planeDefinitions.find((plane) => plane.id === selectedPlaneId);
      if (selectedPlane) {
        this.description.innerHTML = `
          <h2>${selectedPlane.name}</h2>
          <p>${selectedPlane.tagline}</p>
          <div class="plane-stat-grid">
            <div><span>Role</span><strong>${selectedPlane.role}</strong></div>
            <div><span>Ability</span><strong>${selectedPlane.abilityName}</strong></div>
            <div><span>Speed</span><strong>${selectedPlane.speed}</strong></div>
            <div><span>Hull</span><strong>${selectedPlane.maxHealth}</strong></div>
            <div><span>Damage</span><strong>${selectedPlane.damage}</strong></div>
            <div><span>Cooldown</span><strong>${selectedPlane.fireCooldown.toFixed(2)}s</strong></div>
          </div>
          <p><strong>Ability:</strong> ${selectedPlane.abilityDescription}</p>
        `;
      }
    };

    renderSelection();
    this.launchButton.addEventListener("click", () => onLaunch(selectedPlaneId, selectedModeId));
    this.restartButton.addEventListener("click", onRestart);
    this.pauseButton.addEventListener("click", onPauseToggle);
    this.startOverButton.addEventListener("click", onStartOver);
    for (const [settingId, button] of Object.entries(this.settingButtons) as [keyof GameSettings, HTMLButtonElement][]) {
      button.addEventListener("click", () => onCycleSetting(settingId));
    }
    this.updateSettings(initialSettings);
    this.updatePauseState(false);
  }

  get canvas(): HTMLCanvasElement {
    return this.root.querySelector(".game-canvas") as HTMLCanvasElement;
  }

  get controlButtons(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll("[data-action]"));
  }

  showTitle(): void {
    this.titleScreen.classList.remove("hidden");
    this.hud.classList.add("hidden");
    this.gameOver.classList.add("hidden");
    this.mobileControls.classList.add("hidden");
    this.gameTools.classList.add("hidden");
    this.updatePauseState(false);
    this.root.dataset.phase = "title";
  }

  showGameplay(): void {
    this.titleScreen.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.gameOver.classList.add("hidden");
    this.mobileControls.classList.remove("hidden");
    this.gameTools.classList.remove("hidden");
    this.root.dataset.phase = "playing";
  }

  showGameOver(score: number, wave: number): void {
    this.gameOver.classList.remove("hidden");
    this.mobileControls.classList.add("hidden");
    this.gameTools.classList.add("hidden");
    this.updatePauseState(false);
    this.root.dataset.phase = "game-over";
    this.gameOverSummary.textContent = `Final score ${score}. Survived threat level ${wave}.`;
  }

  updateHud(state: HudState): void {
    this.planeValue.textContent = state.planeName;
    this.statusValue.textContent = state.status;
    this.speedValue.textContent = `${state.speed}`;
    this.altitudeValue.textContent = `${state.altitude}`;
    this.healthValue.textContent = `${state.health} / ${state.maxHealth}`;
    this.scoreValue.textContent = `${state.score}`;
    this.waveValue.textContent = `${state.wave}`;
  }

  updatePauseState(paused: boolean): void {
    this.pauseButton.textContent = paused ? "Resume" : "Pause";
    this.pauseBanner.classList.toggle("hidden", !paused);
    this.root.dataset.paused = paused ? "true" : "false";
  }

  updateDebug(state: DebugState): void {
    this.fpsValue.textContent = `${state.fps}`;
    this.frameTimeValue.textContent = `${state.frameTimeMs.toFixed(1)} ms`;
    this.memoryValue.textContent = state.memoryUsageMb === null ? "n/a" : `${state.memoryUsageMb.toFixed(1)} MB`;
    this.drawCallsValue.textContent = `${state.drawCalls}`;
    this.trianglesValue.textContent = `${state.triangles}`;
    this.chunkCountValue.textContent = `${state.chunkCount}`;
    this.enemyCountValue.textContent = `${state.enemyCount}`;
    this.projectileCountValue.textContent = `${state.projectileCount}`;
  }

  updateSettings(settings: GameSettings): void {
    this.settingButtons.audioMix.textContent = `Audio: ${this.getOptionLabel(AUDIO_MIX_OPTIONS, settings.audioMix)}`;
    this.settingButtons.cameraZoom.textContent = `Camera: ${this.getOptionLabel(CAMERA_ZOOM_OPTIONS, settings.cameraZoom)}`;
    this.settingButtons.debugView.textContent = `Debug: ${this.getOptionLabel(DEBUG_VIEW_OPTIONS, settings.debugView)}`;
    this.root.dataset.debugView = settings.debugView;
  }

  private getOptionLabel<T extends string>(options: { id: T; label: string }[], value: T): string {
    return options.find((option) => option.id === value)?.label ?? value;
  }
}
