import { useState } from "react";
import type { Character } from "@/types/dnd";
import { useCharacterStore } from "@/store/characterStore";
import { HPBar } from "@/components/common";
import { Heart, Plus, Minus, Skull } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  character: Character;
}

export default function HitPoints({ character }: Props) {
  const { changeHp, recordDeathSave, stabilize } = useCharacterStore();
  const [amount, setAmount] = useState("1");
  const [tempAmount, setTempAmount] = useState("0");

  const isDowned    = character.currentHp === 0 && !character.isStabilized;
  const isStabilized = character.isStabilized;
  const hpPct       = Math.round((character.currentHp / character.maxHp) * 100);

  const handleDamage = () => {
    const n = parseInt(amount, 10);
    if (n > 0) changeHp("damage", n);
  };

  const handleHeal = () => {
    const n = parseInt(amount, 10);
    if (n > 0) changeHp("heal", n);
  };

  const handleTemp = () => {
    const n = parseInt(tempAmount, 10);
    if (n > 0) changeHp("temporary", n);
  };

  return (
    <div className="space-y-3">
      <p className="text-[0.65rem] font-display uppercase tracking-widest text-gray-500 border-b border-gray-700 pb-1">
        Hit points & healing
      </p>

      {/* HP Display */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className={clsx(
                "text-5xl font-display font-bold",
                hpPct > 50 ? "text-green-400" :
                hpPct > 25 ? "text-yellow-400" : "text-red-400"
              )}
            >
              {character.currentHp}
            </span>
            <span className="text-gray-500 text-2xl font-display">/ {character.maxHp}</span>
          </div>
          {character.temporaryHp > 0 && (
            <p className="text-blue-400 text-sm font-display">
              +{character.temporaryHp} temporary
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Heart
            size={20}
            className={clsx(
              hpPct > 50 ? "text-green-400" :
              hpPct > 25 ? "text-yellow-400" : "text-red-400",
              hpPct <= 0 && "animate-pulse"
            )}
            fill="currentColor"
          />
          <span className="text-sm text-gray-500">{hpPct}%</span>
        </div>
      </div>

      <HPBar
        current={character.currentHp}
        max={character.maxHp}
        temp={character.temporaryHp}
      />

      {/* Controls */}
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          max="999"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input-field w-20 text-center font-mono text-lg"
        />
        <button
          onClick={handleDamage}
          className="flex-1 flex items-center justify-center gap-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded py-2 font-display font-semibold text-sm transition-colors"
        >
          <Minus size={14} />
          Damage
        </button>
        <button
          onClick={handleHeal}
          className="flex-1 flex items-center justify-center gap-1 bg-green-950 hover:bg-green-900 border border-green-800 text-green-300 rounded py-2 font-display font-semibold text-sm transition-colors"
        >
          <Plus size={14} />
          Heal
        </button>
      </div>

      {/* Temp HP */}
      <div className="flex gap-2 items-center">
        <input
          type="number"
          min="0"
          max="999"
          value={tempAmount}
          onChange={(e) => setTempAmount(e.target.value)}
          className="input-field w-20 text-center font-mono"
        />
        <button
          onClick={handleTemp}
          className="flex-1 bg-blue-950 hover:bg-blue-900 border border-blue-800 text-blue-300 rounded py-2 font-display font-semibold text-sm transition-colors"
        >
          Add Temp HP
        </button>
      </div>

      {/* Hit Dice */}
      <div className="pt-2 border-t border-gray-700 space-y-2">
        <div className="flex items-center justify-between">
          <span className="dnd-label">Hit dice (total)</span>
          <span className="font-display font-bold text-white">
            {character.hitDiceMax - character.hitDiceUsed}
            <span className="text-gray-500">/{character.hitDiceMax}</span>
          </span>
        </div>
        {character.computed.isMulticlass && character.computed.classLevelsDetailed.length > 0 ? (
          <div className="space-y-1 text-xs text-gray-400">
            {character.computed.classLevelsDetailed.map((r) => (
              <div key={r.id} className="flex justify-between gap-2">
                <span className="capitalize text-gray-300">
                  d{r.hitDie} {r.classSlug.replace(/-/g, " ")}
                </span>
                <span>
                  {r.hitDiceAvailable}/{r.levels} left
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">Primary die: d{character.hitDieType}</p>
        )}
      </div>

      {/* Death Saves (shown when downed) */}
      {(isDowned || isStabilized) && (
        <DeathSaves character={character} onStabilize={stabilize} onSave={recordDeathSave} />
      )}
    </div>
  );
}

// ── Death Saves ───────────────────────────────────────────────────
interface DeathSavesProps {
  character:   Character;
  onStabilize: () => void;
  onSave:      (result: "success" | "failure", natural20?: boolean) => void;
}

function DeathSaves({ character, onStabilize, onSave }: DeathSavesProps) {
  const { deathSaveSuccesses, deathSaveFailures, isStabilized } = character;

  return (
    <div className="mt-3 p-3 bg-gray-900 rounded-lg border border-gray-700 space-y-3">
      <div className="flex items-center gap-2 text-red-400">
        <Skull size={16} />
        <span className="font-display font-bold text-sm uppercase tracking-wider">
          {isStabilized ? "Stabilized" : "Death Saves"}
        </span>
      </div>

      {!isStabilized && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {/* Successes */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Successes</p>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={clsx(
                      "w-5 h-5 rounded-full border-2",
                      i < deathSaveSuccesses
                        ? "bg-green-500 border-green-400"
                        : "border-gray-600"
                    )}
                  />
                ))}
              </div>
            </div>
            {/* Failures */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Failures</p>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={clsx(
                      "w-5 h-5 rounded-full border-2",
                      i < deathSaveFailures
                        ? "bg-red-500 border-red-400"
                        : "border-gray-600"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onSave("success")}
              className="flex-1 py-1.5 bg-green-950 hover:bg-green-900 border border-green-800 text-green-300 rounded text-xs font-display font-semibold transition-colors"
            >
              Success
            </button>
            <button
              onClick={() => onSave("success", true)}
              className="flex-1 py-1.5 bg-green-900 hover:bg-green-800 border border-green-700 text-green-200 rounded text-xs font-display font-semibold transition-colors"
            >
              Nat 20 (Revive)
            </button>
            <button
              onClick={() => onSave("failure")}
              className="flex-1 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded text-xs font-display font-semibold transition-colors"
            >
              Failure
            </button>
          </div>

          <button
            onClick={onStabilize}
            className="w-full py-1.5 bg-blue-950 hover:bg-blue-900 border border-blue-800 text-blue-300 rounded text-xs font-display font-semibold transition-colors"
          >
            Stabilize (Medicine / Healer's Kit)
          </button>
        </>
      )}
    </div>
  );
}
