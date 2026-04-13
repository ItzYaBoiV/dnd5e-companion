// ── Shared utility components ─────────────────────────────────────
// Each is self-contained; no cross-dependencies between them.

import { clsx } from "clsx";
import { ReactNode } from "react";

// ── formatModifier ────────────────────────────────────────────────
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// ── ModifierBadge ─────────────────────────────────────────────────
interface ModifierBadgeProps {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ModifierBadge({ value, size = "md", className }: ModifierBadgeProps) {
  const color = value > 0 ? "text-green-400" : value < 0 ? "text-red-400" : "text-gray-300";
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-xl" };
  return (
    <span className={clsx("font-display font-bold", color, sizes[size], className)}>
      {formatModifier(value)}
    </span>
  );
}

// ── StatBox ───────────────────────────────────────────────────────
interface StatBoxProps {
  label:     string;
  value:     ReactNode;
  sub?:      ReactNode;
  className?: string;
  onClick?:  () => void;
}

export function StatBox({ label, value, sub, className, onClick }: StatBoxProps) {
  return (
    <div
      className={clsx(
        "dnd-card flex flex-col items-center justify-center text-center gap-1 select-none",
        onClick && "cursor-pointer hover:border-gray-500 transition-colors",
        className
      )}
      onClick={onClick}
    >
      <span className="dnd-label">{label}</span>
      <span className="dnd-value">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

// ── HPBar ─────────────────────────────────────────────────────────
interface HPBarProps {
  current: number;
  max:     number;
  temp?:   number;
}

export function HPBar({ current, max, temp = 0 }: HPBarProps) {
  const pct     = Math.min(100, (current / max) * 100);
  const tempPct = Math.min(100 - pct, (temp / max) * 100);
  const color =
    pct > 50 ? "bg-green-500" :
    pct > 25 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
      <div className="flex h-full">
        <div
          className={clsx("hp-bar transition-all duration-300", color)}
          style={{ width: `${pct}%` }}
        />
        {temp > 0 && (
          <div
            className="hp-bar bg-blue-400"
            style={{ width: `${tempPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ── ProficiencyDot ────────────────────────────────────────────────
interface ProficiencyDotProps {
  proficient: boolean;
  expertise?: boolean;
}

export function ProficiencyDot({ proficient, expertise }: ProficiencyDotProps) {
  if (expertise) {
    return (
      <span className="w-3 h-3 rounded-full bg-dnd-gold border-2 border-yellow-300 flex-shrink-0 inline-block" />
    );
  }
  return (
    <span
      className={clsx(
        "w-3 h-3 rounded-full border-2 flex-shrink-0 inline-block",
        proficient ? "bg-dnd-gold border-dnd-gold" : "border-gray-600"
      )}
    />
  );
}

// ── DiceChip ──────────────────────────────────────────────────────
interface DiceChipProps {
  expression: string; // "1d20+5"
  label?:     string;
  onClick?:   () => void;
}

export function DiceChip({ expression, label, onClick }: DiceChipProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded",
        "bg-gray-800 border border-gray-600 hover:border-dnd-red",
        "text-xs font-mono text-dnd-gold transition-colors",
        onClick && "cursor-pointer"
      )}
      title={label}
    >
      {expression}
    </button>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────
interface SectionHeaderProps {
  title:    string;
  action?:  ReactNode;
  className?: string;
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={clsx("flex items-center justify-between mb-3", className)}>
      <h3 className="font-display font-bold text-sm tracking-widest uppercase text-dnd-gold border-b border-dnd-gold pb-0.5">
        {title}
      </h3>
      {action}
    </div>
  );
}

// ── SpellLevelBadge ───────────────────────────────────────────────
interface SpellLevelBadgeProps {
  level: number;
}

const SPELL_LEVEL_COLORS = [
  "bg-gray-700 text-gray-300",   // cantrip
  "bg-blue-900 text-blue-300",   // 1
  "bg-teal-900 text-teal-300",   // 2
  "bg-green-900 text-green-300", // 3
  "bg-yellow-900 text-yellow-300", // 4
  "bg-orange-900 text-orange-300", // 5
  "bg-red-900 text-red-300",     // 6
  "bg-purple-900 text-purple-300", // 7
  "bg-pink-900 text-pink-300",   // 8
  "bg-indigo-900 text-indigo-200", // 9
];

export function SpellLevelBadge({ level }: SpellLevelBadgeProps) {
  return (
    <span
      className={clsx(
        "spell-level-badge font-display font-bold text-xs",
        SPELL_LEVEL_COLORS[level] ?? SPELL_LEVEL_COLORS[0]
      )}
    >
      {level === 0 ? "C" : level}
    </span>
  );
}

// ── LoadingSpinner ────────────────────────────────────────────────
export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-center justify-center p-8", className)}>
      <div className="w-8 h-8 border-2 border-dnd-red border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?:    ReactNode;
  title:    string;
  message?: string;
  action?:  ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      {icon && <div className="text-gray-600 mb-2">{icon}</div>}
      <h3 className="font-display font-bold text-gray-300">{title}</h3>
      {message && <p className="text-sm text-gray-500 max-w-xs">{message}</p>}
      {action}
    </div>
  );
}

// ── ConditionBadge ────────────────────────────────────────────────
interface ConditionBadgeProps {
  name:     string;
  onRemove: () => void;
}

export function ConditionBadge({ name, onRemove }: ConditionBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-950 border border-red-800 rounded text-xs text-red-300 font-display">
      {name}
      <button
        onClick={onRemove}
        className="ml-1 text-red-500 hover:text-red-300 transition-colors"
        title="Remove condition"
      >
        ×
      </button>
    </span>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────
interface ModalProps {
  title:    string;
  onClose:  () => void;
  children: ReactNode;
  footer?:  ReactNode;
  /** Wide scrollable panel for maps, long stories, etc. */
  wide?:    boolean;
}

export function Modal({ title, onClose, children, footer, wide }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={clsx(
          "bg-dnd-dark border border-gray-700 rounded-xl shadow-2xl w-full flex flex-col my-auto",
          wide
            ? "max-w-5xl max-h-[min(92vh,880px)] min-h-0"
            : "max-w-md max-h-[min(92vh,720px)] min-h-0",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <h2 className="font-display font-bold text-lg text-dnd-gold pr-2">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none shrink-0"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto min-h-0 flex-1 overscroll-contain">
          {children}
        </div>
        {footer && (
          <div className="px-5 py-4 border-t border-gray-700 flex gap-2 justify-end shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}
