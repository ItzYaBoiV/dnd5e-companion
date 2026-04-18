import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSheetRoll } from "@/context/SheetRollContext";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { runSheetDiceRoll, disposeSheetDiceBox } from "@/lib/sheetDiceBoxController";
import { sheetRollToDiceNotation } from "@/lib/sheetDiceNotation";
import { buildSheetRollLearningLines } from "@/lib/rollExplain";

function hasAdvantageOrDisadvantage(adv: unknown): boolean {
  return adv === "advantage" || adv === "disadvantage";
}

/** Human-friendly middle term so we avoid “17 + +4” in the equation line. */
function formatBonusInSum(bonus: number): string {
  return bonus >= 0 ? `+ ${bonus}` : `− ${Math.abs(bonus)}`;
}

export function SheetRollDiceStage() {
  const { banner, advantage, dismissAppRoll, notifySheetRollVisualComplete, rerollWithAdvantage } =
    useSheetRoll();
  const [rerollBusy, setRerollBusy] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalEl(document.body);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const fn = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const rollTossKey = banner.phase === "idle" ? 0 : banner.tossKey;

  useEffect(() => {
    if (banner.phase === "idle" || banner.phase === "rolling" || banner.phase === "animating") {
      setShowOutcome(false);
      return;
    }
    if (reduceMotion) {
      setShowOutcome(true);
      return;
    }
    const id = window.setTimeout(() => setShowOutcome(true), 420);
    return () => clearTimeout(id);
  }, [banner.phase, rollTossKey, reduceMotion]);

  useEffect(() => {
    if (banner.phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissAppRoll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [banner.phase, dismissAppRoll]);

  // Defer starting the dice physics to the next macrotask so React Strict Mode’s effect
  // cleanup can clearTimeout before `runSheetDiceRoll` runs. Otherwise two mounts queue
  // two `box.roll()` calls (looks like one d20, then a second batch with 2d20 for advantage).
  useEffect(() => {
    if (banner.phase !== "animating") return;
    const { result } = banner;

    let cancelled = false;
    const tid = window.setTimeout(() => {
      if (cancelled) return;
      void (async () => {
        try {
          const notation = sheetRollToDiceNotation(result);
          await runSheetDiceRoll(notation);
        } catch (e) {
          console.error("Dice roll animation failed:", e);
        } finally {
          if (!cancelled) notifySheetRollVisualComplete();
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [banner.phase, rollTossKey, notifySheetRollVisualComplete]);

  useEffect(() => {
    if (banner.phase === "idle") {
      disposeSheetDiceBox();
      setRerollBusy(false);
    }
  }, [banner.phase]);

  if (banner.phase === "idle" || !portalEl) return null;

  const { phase, title, variant } = banner;
  const result = phase === "done" || phase === "animating" ? banner.result : null;

  const advFromResult = result ? hasAdvantageOrDisadvantage(result.advantage) : false;
  const roll = result && typeof result.roll === "number" ? result.roll : null;
  const d1 = result && typeof result.d1 === "number" ? result.d1 : undefined;
  const d2 = result && typeof result.d2 === "number" ? result.d2 : undefined;
  const bonus = result && typeof result.bonus === "number" ? result.bonus : 0;
  const total = result && typeof result.total === "number" ? result.total : null;

  const bonusWord =
    variant === "init" ? "initiative" : variant === "save" ? "save" : "modifier";

  const showWorking = phase === "rolling" || phase === "animating";

  const showRollMath =
    (phase === "animating" || phase === "done") &&
    result != null &&
    typeof result.roll === "number" &&
    typeof result.total === "number";

  const learningLines = buildSheetRollLearningLines({
    variant,
    title,
    advantage,
    result: phase === "rolling" ? null : result,
  });

  const overlay = (
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-roll-overlay-title"
      aria-live="polite"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 border-0 bg-stone-950/82 backdrop-blur-md cursor-default p-0"
        aria-label="Dismiss roll"
        onClick={dismissAppRoll}
      />

      {/* Full-viewport WebGL host — keep *above* backdrop but not covered by a full-screen UI layer (stacking / compositor quirks).
          Keep this node stable across tosses: `sheetDiceBoxController` attaches a singleton canvas to `#sheet-dice-box-root`. */}
      <div
        id="sheet-dice-box-root"
        className="pointer-events-none absolute inset-0 z-[10] flex min-h-[40vh] w-full items-center justify-center px-2"
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[16] flex flex-col items-center px-4 pt-14">
        <p
          id="sheet-roll-overlay-title"
          className="max-w-[min(90vw,28rem)] text-center font-display text-[0.7rem] uppercase tracking-[0.2em] text-amber-200/90 drop-shadow-md"
        >
          {title}
        </p>

        {learningLines.length > 0 && (
          <div
            className="pointer-events-auto mt-4 max-w-[min(92vw,26rem)] space-y-2 text-left text-[0.78rem] leading-snug text-stone-400"
            aria-label="How this roll works"
          >
            <p className="text-[0.65rem] font-display uppercase tracking-[0.18em] text-stone-500">
              How this roll works
            </p>
            {learningLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        {showWorking && (
          <p className="mt-5 text-sm text-stone-400 font-display tracking-wide">
            {phase === "rolling" ? "Resolving roll…" : "Rolling dice…"}
          </p>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[16] flex flex-col items-center px-4 pb-10">
        {phase === "done" && total != null && (
          <div
            className={clsx(
              "text-center",
              showOutcome && !reduceMotion && "roll-overlay-total-reveal",
              !showOutcome && !reduceMotion && "opacity-0",
            )}
          >
            <p
              className={clsx(
                "font-display font-bold tabular-nums text-parchment drop-shadow-[0_2px_24px_rgba(0,0,0,0.9)]",
                advFromResult ? "text-5xl sm:text-6xl" : "text-6xl sm:text-7xl",
              )}
            >
              <span className="text-dnd-gold">{total}</span>
            </p>
          </div>
        )}

        {showRollMath && roll != null && total != null && (
          <div className="pointer-events-auto mt-4 w-full max-w-md rounded-lg border border-stone-700/70 bg-stone-950/90 px-4 py-3 text-left shadow-lg backdrop-blur-sm">
            <p className="mb-2 font-display text-[0.65rem] uppercase tracking-[0.16em] text-amber-200/75">
              Roll breakdown
            </p>

            {result.advantage === "advantage" && d1 != null && d2 != null && (
              <div className="mb-3 space-y-1.5 border-b border-stone-700/50 pb-3 text-[0.8rem] text-stone-300">
                <p className="font-display text-[0.7rem] text-emerald-400/90">Advantage — roll 2d20, use the higher</p>
                <p className="font-mono tabular-nums">
                  First d20: <span className="text-stone-100">{d1}</span>
                  <span className="text-stone-600"> · </span>
                  Second d20: <span className="text-stone-100">{d2}</span>
                </p>
                <p className="text-stone-400">
                  Kept <span className="font-mono text-dnd-gold">{roll}</span> for this roll.
                </p>
              </div>
            )}

            {result.advantage === "disadvantage" && d1 != null && d2 != null && (
              <div className="mb-3 space-y-1.5 border-b border-stone-700/50 pb-3 text-[0.8rem] text-stone-300">
                <p className="font-display text-[0.7rem] text-amber-600/90">Disadvantage — roll 2d20, use the lower</p>
                <p className="font-mono tabular-nums">
                  First d20: <span className="text-stone-100">{d1}</span>
                  <span className="text-stone-600"> · </span>
                  Second d20: <span className="text-stone-100">{d2}</span>
                </p>
                <p className="text-stone-400">
                  Kept <span className="font-mono text-dnd-gold">{roll}</span> for this roll.
                </p>
              </div>
            )}

            {result.advantage !== "advantage" && result.advantage !== "disadvantage" && (
              <p className="mb-3 border-b border-stone-700/50 pb-3 font-mono text-[0.85rem] text-stone-300 tabular-nums">
                d20 result: <span className="text-dnd-gold">{roll}</span>
              </p>
            )}

            <p className="font-mono text-[0.9rem] leading-relaxed text-stone-200 tabular-nums">
              <span className="text-stone-400">{roll}</span>
              <span className="text-stone-500"> {formatBonusInSum(bonus)} </span>
              <span className="text-stone-500">({bonusWord})</span>
              <span className="text-stone-500"> = </span>
              <span className="font-display text-lg text-dnd-gold">{total}</span>
            </p>
            <p className="mt-2 text-[0.72rem] leading-snug text-stone-500">
              {variant === "check" && "Skill check: d20 plus your skill modifier (ability, proficiency, or expertise)."}
              {variant === "save" && "Saving throw: d20 plus your save bonus for that ability."}
              {variant === "init" && "Initiative: d20 plus the initiative modifier on your sheet (often Dex-based)."}
            </p>
          </div>
        )}

        {phase === "done" && (variant === "check" || variant === "save") && (
          <button
            type="button"
            disabled={rerollBusy}
            onClick={() => {
              void (async () => {
                setRerollBusy(true);
                try {
                  await rerollWithAdvantage();
                } catch (e) {
                  alert(e instanceof Error ? e.message : String(e));
                } finally {
                  setRerollBusy(false);
                }
              })();
            }}
            className="pointer-events-auto mt-4 rounded-lg border border-amber-800/60 bg-amber-950/35 px-4 py-2.5 font-display text-[0.75rem] uppercase tracking-[0.14em] text-amber-100/95 shadow-md transition-colors hover:bg-amber-900/45 hover:border-amber-600/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {rerollBusy ? "Rolling…" : "Roll again with advantage"}
          </button>
        )}

        <p className="mt-6 text-[0.65rem] text-stone-600 font-display">
          Click outside or Esc to close
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismissAppRoll();
        }}
        className="pointer-events-auto absolute right-3 top-3 z-[30] rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-800/80 hover:text-stone-200"
        aria-label="Dismiss roll"
      >
        <X size={22} />
      </button>
    </div>
  );

  return createPortal(overlay, portalEl);
}
