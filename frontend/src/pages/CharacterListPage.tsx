import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Sword, Heart, Star, Trash2 } from "lucide-react";
import { characterApi } from "@/services/api";
import type { CharacterSummary } from "@/types/dnd";
import { LoadingSpinner, EmptyState, HPBar } from "@/components/common";

export default function CharacterListPage() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    characterApi.list()
      .then(setCharacters)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6 sm:mb-8">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-dnd-gold tracking-wide break-words">
            Your Characters
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {characters.length} character{characters.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => navigate("/characters/new")}
          className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto text-sm sm:text-base py-2.5 sm:py-2"
        >
          <Plus size={18} className="shrink-0" />
          <span className="truncate">New Character</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4 mb-6 text-red-300 text-sm">
          {error}
        </div>
      )}

      {characters.length === 0 ? (
        <EmptyState
          icon={<Sword size={48} />}
          title="No characters yet"
          message="Create your first character to begin your adventure."
          action={
            <button
              onClick={() => navigate("/characters/new")}
              className="btn-primary flex items-center gap-2 mt-2"
            >
              <Plus size={16} />
              Create Character
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {characters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              onOpen={() => navigate(`/characters/${char.id}`)}
              onDeleted={() => setCharacters((prev) => prev.filter((c) => c.id !== char.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterCard({
  character,
  onOpen,
  onDeleted,
}: {
  character: CharacterSummary;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const hpPct = Math.round((character.currentHp / character.maxHp) * 100);

  const handleDelete = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `Delete "${character.name}" permanently? This cannot be undone. They will also be removed from any play sessions.`,
      )
    ) {
      return;
    }
    try {
      await characterApi.delete(character.id);
      onDeleted();
    } catch (err) {
      alert(String(err));
    }
  };

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onOpen}
        className="dnd-card w-full text-left hover:border-gray-500 transition-all hover:shadow-lg hover:shadow-black/30 pr-12 sm:pr-14"
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-gray-600 bg-gray-900">
            {character.tokenPortraitUrl ? (
              <img src={character.tokenPortraitUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-gray-600">—</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-bold text-lg sm:text-xl text-white group-hover:text-dnd-gold transition-colors break-words text-left">
              {character.name}
            </h2>
            <p className="text-gray-400 text-xs sm:text-sm capitalize text-left mt-0.5">
              Level {character.level} {character.raceSlug} {character.classSlug}
            </p>
          </div>
          <div className="flex items-center gap-1 text-dnd-gold shrink-0 pt-0.5" title={`Level ${character.level}`}>
            <Star size={14} className="shrink-0" />
            <span className="font-display font-bold text-sm tabular-nums">{character.level}</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 flex items-center gap-1">
              <Heart size={11} />
              HP
            </span>
            <span className={hpPct > 50 ? "text-green-400" : hpPct > 25 ? "text-yellow-400" : "text-red-400"}>
              {character.currentHp} / {character.maxHp}
            </span>
          </div>
          <HPBar current={character.currentHp} max={character.maxHp} />
        </div>

        <p className="text-xs text-gray-600 mt-3">
          Last updated {new Date(character.updatedAt).toLocaleDateString()}
        </p>
      </button>
      <button
        type="button"
        onClick={handleDelete}
        className="absolute top-3 right-3 p-2 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/50 opacity-80 hover:opacity-100 transition-all z-10 bg-dnd-dark/90 md:bg-transparent"
        title="Delete character"
        aria-label={`Delete ${character.name}`}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}
