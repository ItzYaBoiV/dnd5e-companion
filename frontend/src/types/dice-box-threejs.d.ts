declare module "@3d-dice/dice-box-threejs" {
  import type * as THREE from "three";

  export default class DiceBox {
    constructor(selector: string, options?: Record<string, unknown>);
    container: HTMLElement;
    renderer: THREE.WebGLRenderer;
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    clearDice(): void;
  }
}
