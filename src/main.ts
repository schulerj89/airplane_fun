import "./styles.css";
import { GameApp } from "./game";

const container = document.querySelector<HTMLDivElement>("#app");

if (!container) {
  throw new Error("Expected #app container");
}

const game = new GameApp(container);

window.addEventListener("beforeunload", () => {
  game.dispose();
});
