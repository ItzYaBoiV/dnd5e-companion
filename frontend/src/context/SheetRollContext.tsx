import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AdvantageType } from "@/types/dnd";
import { disposeSheetDiceBox } from "@/lib/sheetDiceBoxController";

export type SheetRollVariant = "check" | "save" | "init";

export type SheetRollBannerState =
  | { phase: "idle" }
  | { phase: "rolling"; title: string; variant: SheetRollVariant; tossKey: number }
  | {
      phase: "animating";
      title: string;
      variant: SheetRollVariant;
      tossKey: number;
      result: Record<string, unknown>;
    }
  | {
      phase: "done";
      title: string;
      variant: SheetRollVariant;
      tossKey: number;
      result: Record<string, unknown>;
    };

export type SheetRollOpts = { priorD20?: number };

export type SheetRollFn = (advantage: AdvantageType, opts?: SheetRollOpts) => Promise<Record<string, unknown>>;

type Ctx = {
  advantage: AdvantageType;
  setAdvantage: (a: AdvantageType) => void;
  banner: SheetRollBannerState;
  dismissAppRoll: () => void;
  /** Called when 3D dice animation finishes (or is skipped for reduced motion). */
  notifySheetRollVisualComplete: () => void;
  runAppRoll: (title: string, variant: SheetRollVariant, rollFn: SheetRollFn) => Promise<Record<string, unknown>>;
  /** Re-run the last check/save immediately with advantage (two d20s, keep higher). No-op for initiative or if not on the done overlay. */
  rerollWithAdvantage: () => Promise<Record<string, unknown> | undefined>;
};

const SheetRollContext = createContext<Ctx | null>(null);

export function SheetRollProvider({ children }: { children: ReactNode }) {
  const [advantage, setAdvantage] = useState<AdvantageType>("normal");
  const [banner, setBanner] = useState<SheetRollBannerState>({ phase: "idle" });
  const tossKeyRef = useRef(0);
  const visualCompleteRef = useRef<(() => void) | null>(null);
  const rollCancelledRef = useRef(false);
  const lastRollRef = useRef<{ title: string; variant: SheetRollVariant; rollFn: SheetRollFn } | null>(null);

  const notifySheetRollVisualComplete = useCallback(() => {
    visualCompleteRef.current?.();
    visualCompleteRef.current = null;
  }, []);

  const dismissAppRoll = useCallback(() => {
    rollCancelledRef.current = true;
    notifySheetRollVisualComplete();
    disposeSheetDiceBox();
    setBanner({ phase: "idle" });
  }, [notifySheetRollVisualComplete]);

  const performSheetRoll = useCallback(
    async (
      title: string,
      variant: SheetRollVariant,
      rollFn: SheetRollFn,
      advForApi: AdvantageType,
      rollOpts?: SheetRollOpts,
    ): Promise<Record<string, unknown>> => {
      tossKeyRef.current += 1;
      const tossKey = tossKeyRef.current;
      rollCancelledRef.current = false;
      setBanner({ phase: "rolling", title, variant, tossKey });
      try {
        const res = await rollFn(advForApi, rollOpts);
        if (rollCancelledRef.current) {
          return res;
        }

        // Always run the 3D dice phase; `prefers-reduced-motion` only affects CSS (e.g. total reveal) in `SheetRollDiceStage`.

        const visualDone = new Promise<void>((resolve) => {
          visualCompleteRef.current = resolve;
        });

        setBanner({ phase: "animating", title, variant, tossKey, result: res });

        const failSafe = window.setTimeout(() => {
          notifySheetRollVisualComplete();
        }, 45_000);

        try {
          await visualDone;
        } finally {
          clearTimeout(failSafe);
        }

        if (!rollCancelledRef.current) {
          setBanner({ phase: "done", title, variant, tossKey, result: res });
        }
        return res;
      } catch (e) {
        notifySheetRollVisualComplete();
        disposeSheetDiceBox();
        setBanner({ phase: "idle" });
        throw e;
      }
    },
    [notifySheetRollVisualComplete],
  );

  const runAppRoll = useCallback(
    async (title: string, variant: SheetRollVariant, rollFn: SheetRollFn) => {
      lastRollRef.current = { title, variant, rollFn };
      return performSheetRoll(title, variant, rollFn, advantage, undefined);
    },
    [advantage, performSheetRoll],
  );

  const rerollWithAdvantage = useCallback(async () => {
    const last = lastRollRef.current;
    if (!last || (last.variant !== "check" && last.variant !== "save")) return undefined;
    if (banner.phase !== "done") return undefined;
    const priorD20 =
      banner.result.advantage === "normal" && typeof banner.result.roll === "number"
        ? banner.result.roll
        : undefined;
    setAdvantage("advantage");
    return performSheetRoll(
      last.title,
      last.variant,
      last.rollFn,
      "advantage",
      priorD20 !== undefined ? { priorD20 } : undefined,
    );
  }, [banner, performSheetRoll]);

  const value = useMemo(
    () => ({
      advantage,
      setAdvantage,
      banner,
      dismissAppRoll,
      notifySheetRollVisualComplete,
      runAppRoll,
      rerollWithAdvantage,
    }),
    [advantage, banner, dismissAppRoll, notifySheetRollVisualComplete, rerollWithAdvantage, runAppRoll],
  );

  return <SheetRollContext.Provider value={value}>{children}</SheetRollContext.Provider>;
}

export function useSheetRoll() {
  const ctx = useContext(SheetRollContext);
  if (!ctx) throw new Error("useSheetRoll must be used inside SheetRollProvider");
  return ctx;
}
