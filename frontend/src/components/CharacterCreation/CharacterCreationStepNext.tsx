import { clsx } from "clsx";
import type { ReactNode } from "react";

/** Sits just above the App mobile bottom tab bar (same as `--bottom-nav-h` in AppShell). */
export const CREATION_MOBILE_CTA_BOTTOM = "calc(4.75rem + env(safe-area-inset-bottom, 0px))" as const;
const BOTTOM_OFFSET = CREATION_MOBILE_CTA_BOTTOM;

type Props = {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Extra classes for the desktop in-flow button */
  className?: string;
  /** Desktop top padding (default pt-2) */
  desktopPtClass?: "pt-2" | "pt-4";
};

/**
 * Renders the primary "Next" control twice: in-flow for md+; fixed above the app bottom nav on small screens
 * (where `100vh` scroll + browser chrome often hides the natural foot of the form).
 */
export function CharacterCreationStepNext({
  label,
  onClick,
  disabled,
  className,
  desktopPtClass = "pt-2",
}: Props) {
  return (
    <>
      <div
        className={clsx("hidden w-full flex-col sm:flex-row md:flex", "justify-stretch sm:justify-end", desktopPtClass)}
      >
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={clsx(
            "btn-primary w-full min-h-[48px] px-8 sm:w-auto disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          {label}
        </button>
      </div>
      <div
        className="fixed left-0 right-0 z-30 p-2 md:hidden"
        style={{ bottom: BOTTOM_OFFSET }}
      >
        <div className="overflow-hidden rounded-xl border border-stone-800/90 bg-[#0d0c0b] shadow-2xl ring-1 ring-black/40">
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={clsx(
              "btn-primary min-h-[52px] w-full touch-manipulation px-4 py-3.5 text-center text-base font-display font-semibold leading-snug text-white",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
          >
            {label}
          </button>
        </div>
      </div>
    </>
  );
}
