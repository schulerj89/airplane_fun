import { PlaneDefinition, PlaneId } from "./config";

interface HudState {
  health: number;
  maxHealth: number;
  score: number;
  wave: number;
  planeName: string;
  status: string;
}

export class UIController {
  private readonly root: HTMLElement;
  private readonly titleScreen: HTMLElement;
  private readonly selectionPanel: HTMLElement;
  private readonly description: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly waveValue: HTMLElement;
  private readonly healthValue: HTMLElement;
  private readonly planeValue: HTMLElement;
  private readonly statusValue: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly gameOverSummary: HTMLElement;
  private readonly launchButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly mobileControls: HTMLElement;

  constructor(
    container: HTMLElement,
    planeDefinitions: PlaneDefinition[],
    initialPlaneId: PlaneId,
    onLaunch: (planeId: PlaneId) => void,
    onRestart: () => void
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
            <p class="subtitle">Choose a fighter, roll down the runway, and survive escalating waves after takeoff.</p>
            <div class="plane-grid"></div>
            <div class="plane-description"></div>
            <button class="primary-button">Launch Mission</button>
          </div>
        </section>
        <section class="hud hidden" data-state="hud">
          <div><span>Plane</span><strong data-role="plane"></strong></div>
          <div><span>Status</span><strong data-role="status"></strong></div>
          <div><span>Hull</span><strong data-role="health"></strong></div>
          <div><span>Score</span><strong data-role="score"></strong></div>
          <div><span>Wave</span><strong data-role="wave"></strong></div>
        </section>
        <section class="game-over hidden" data-state="game-over">
          <div class="title-card compact">
            <p class="eyebrow">Mission failed</p>
            <h2>Rearm and relaunch</h2>
            <p class="summary"></p>
            <button class="secondary-button">Restart</button>
          </div>
        </section>
        <section class="mobile-controls hidden" data-state="controls">
          <div class="dpad">
            <button data-action="up">Up</button>
            <div class="dpad-row">
              <button data-action="left">Left</button>
              <button data-action="down">Down</button>
              <button data-action="right">Right</button>
            </div>
          </div>
          <button class="fire-button" data-action="fire">Fire</button>
        </section>
      </div>
    `;
    container.append(this.root);

    this.titleScreen = this.root.querySelector(".title-screen") as HTMLElement;
    this.selectionPanel = this.root.querySelector(".plane-grid") as HTMLElement;
    this.description = this.root.querySelector(".plane-description") as HTMLElement;
    this.hud = this.root.querySelector(".hud") as HTMLElement;
    this.scoreValue = this.root.querySelector('[data-role="score"]') as HTMLElement;
    this.waveValue = this.root.querySelector('[data-role="wave"]') as HTMLElement;
    this.healthValue = this.root.querySelector('[data-role="health"]') as HTMLElement;
    this.planeValue = this.root.querySelector('[data-role="plane"]') as HTMLElement;
    this.statusValue = this.root.querySelector('[data-role="status"]') as HTMLElement;
    this.gameOver = this.root.querySelector(".game-over") as HTMLElement;
    this.gameOverSummary = this.root.querySelector(".summary") as HTMLElement;
    this.launchButton = this.root.querySelector(".primary-button") as HTMLButtonElement;
    this.restartButton = this.root.querySelector(".secondary-button") as HTMLButtonElement;
    this.mobileControls = this.root.querySelector(".mobile-controls") as HTMLElement;

    let selectedPlaneId = initialPlaneId;

    const renderSelection = (): void => {
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
    this.launchButton.addEventListener("click", () => onLaunch(selectedPlaneId));
    this.restartButton.addEventListener("click", onRestart);
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
    this.root.dataset.phase = "title";
  }

  showGameplay(): void {
    this.titleScreen.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.gameOver.classList.add("hidden");
    this.mobileControls.classList.remove("hidden");
    this.root.dataset.phase = "playing";
  }

  showGameOver(score: number, wave: number): void {
    this.gameOver.classList.remove("hidden");
    this.mobileControls.classList.add("hidden");
    this.root.dataset.phase = "game-over";
    this.gameOverSummary.textContent = `Final score ${score}. Reached wave ${wave}.`;
  }

  updateHud(state: HudState): void {
    this.planeValue.textContent = state.planeName;
    this.statusValue.textContent = state.status;
    this.healthValue.textContent = `${state.health} / ${state.maxHealth}`;
    this.scoreValue.textContent = `${state.score}`;
    this.waveValue.textContent = `${state.wave}`;
  }
}
