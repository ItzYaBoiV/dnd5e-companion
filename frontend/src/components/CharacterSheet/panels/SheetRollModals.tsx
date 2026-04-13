type HintProps = {
  open: boolean;
  title: string;
  lines: string[];
  onClose: () => void;
};

export function SheetRollHintModal({ open, title, lines, onClose }: HintProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-[#12110f] border border-amber-900/35 rounded-lg shadow-2xl max-w-md w-full p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="roll-hint-title"
      >
        <h3 id="roll-hint-title" className="font-display font-bold text-dnd-gold text-lg">
          {title}
        </h3>
        <ul className="space-y-2 text-sm text-stone-300 leading-relaxed list-disc pl-4">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <button type="button" className="btn-primary w-full text-sm" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

