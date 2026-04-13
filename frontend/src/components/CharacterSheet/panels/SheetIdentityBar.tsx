import type { Character } from "@/types/dnd";
import { ALIGNMENT_LABELS } from "@/types/dnd";

interface Props {
  character: Character;
}

export default function SheetIdentityBar({ character }: Props) {
  const cls =
    character.computed?.classSummary || character.classSlug.replace(/-/g, " ");
  const race = character.subraceSlug
    ? `${character.subraceSlug.replace(/-/g, " ")} (${character.raceSlug.replace(/-/g, " ")})`
    : character.raceSlug.replace(/-/g, " ");

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2 px-3 py-3 border-b border-gray-700/90 bg-black/30 text-xs">
      <IdentityCell label="Character name" value={character.name} emphasis />
      <IdentityCell label="Class & level" value={`${cls} · ${character.level}`} />
      <IdentityCell label="Race" value={race} />
      <IdentityCell label="Background" value={character.backgroundSlug.replace(/-/g, " ")} />
      <IdentityCell label="Alignment" value={ALIGNMENT_LABELS[character.alignment]} />
      <IdentityCell label="Experience" value={String(character.experiencePoints)} />
    </div>
  );
}

function IdentityCell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6rem] font-display uppercase tracking-widest text-gray-500 leading-none mb-1">{label}</p>
      <p
        className={`text-sm leading-snug capitalize truncate ${
          emphasis ? "font-display font-bold text-dnd-gold" : "text-gray-200"
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
