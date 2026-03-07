export class InputController {
  private readonly keys = new Set<string>();
  private readonly buttons = new Set<string>();

  constructor() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.clearAll);
  }

  isPressed(action: string): boolean {
    return this.keys.has(action) || this.buttons.has(action);
  }

  bindButton(element: HTMLElement, action: string): void {
    const activate = (event: Event): void => {
      event.preventDefault();
      this.buttons.add(action);
    };
    const deactivate = (event: Event): void => {
      event.preventDefault();
      this.buttons.delete(action);
    };

    element.addEventListener("pointerdown", activate);
    element.addEventListener("pointerup", deactivate);
    element.addEventListener("pointercancel", deactivate);
    element.addEventListener("pointerleave", deactivate);
    element.addEventListener("click", (event) => {
      event.preventDefault();
      this.buttons.add(action);
      window.setTimeout(() => {
        this.buttons.delete(action);
      }, 120);
    });
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.clearAll);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const action = this.mapKey(event.code);
    if (action) {
      event.preventDefault();
      this.keys.add(action);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const action = this.mapKey(event.code);
    if (action) {
      event.preventDefault();
      this.keys.delete(action);
    }
  };

  private readonly clearAll = (): void => {
    this.keys.clear();
    this.buttons.clear();
  };

  private mapKey(code: string): string | null {
    switch (code) {
      case "ArrowLeft":
      case "KeyA":
        return "left";
      case "ArrowRight":
      case "KeyD":
        return "right";
      case "ArrowUp":
      case "KeyW":
        return "up";
      case "ArrowDown":
      case "KeyS":
        return "down";
      case "Space":
      case "KeyJ":
        return "fire";
      default:
        return null;
    }
  }
}
