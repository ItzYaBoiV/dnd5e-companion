const SELECTOR = "#sheet-dice-box-root";

let box: import("@3d-dice/dice-box-threejs").default | null = null;

/** Serialize rolls so React StrictMode / overlapping effects cannot corrupt one shared DiceBox. */
let rollChain: Promise<void> = Promise.resolve();

function enqueueRoll(task: () => Promise<void>): Promise<void> {
  const next = rollChain.then(() => task());
  rollChain = next.catch(() => undefined);
  return next;
}

/** DiceBox reads `clientWidth` / `clientHeight` at init; wait until the portal host has layout. */
async function waitForHostLayout(el: HTMLElement, maxFrames = 90): Promise<void> {
  for (let i = 0; i < maxFrames; i++) {
    if (el.clientWidth >= 32 && el.clientHeight >= 32) return;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
}

function assetPath(): string {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}dice-three/`;
}

/**
 * Runs a physics roll that settles on the predetermined values from the sheet API.
 * Reuses one DiceBox while the host DOM stays mounted; call `disposeSheetDiceBox` when the host is removed.
 */
export async function runSheetDiceRoll(notation: string): Promise<void> {
  return enqueueRoll(async () => {
    const el = document.querySelector(SELECTOR);
    if (!el || !(el instanceof HTMLElement)) {
      throw new Error("Dice host #sheet-dice-box-root not found in DOM");
    }

    const { default: DiceBoxCtor } = await import("@3d-dice/dice-box-threejs");

    await waitForHostLayout(el);

    if (!box) {
      box = new DiceBoxCtor(SELECTOR, {
        assetPath: assetPath(),
        sounds: false,
        // Default from library readme — avoids rare theme/surface mismatches.
        theme_surface: "green-felt",
        theme_material: "plastic",
        theme_colorset: "white",
        theme_texture: "",
        // Default-ish toss; only a modest gravity bump so dice settle sooner without wild throws.
        gravity_multiplier: 440,
        light_intensity: 0.78,
        strength: 0.92,
        shadows: true,
      });
      await box.initialize();
    } else {
      box.clearDice();
    }

    await box.roll(notation);
  });
}

export function disposeSheetDiceBox(): void {
  if (!box) return;
  try {
    box.clearDice();
  } catch {
    /* ignore */
  }
  try {
    const canvas = box.renderer?.domElement;
    if (canvas?.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    box.renderer?.dispose();
  } catch {
    /* ignore */
  }
  box = null;
}
