import { useState } from "react";
import type { Character } from "@/types/dnd";
import { useCharacterStore } from "@/store/characterStore";
import { SheetRollProvider } from "@/context/SheetRollContext";
import AbilityScores from "../panels/AbilityScores";
import CombatStats from "../panels/CombatStats";
import RollsCheatsheet from "../panels/RollsCheatsheet";
import { LevelUpPanel } from "../panels/LevelUpPanel";
import HitPoints from "../panels/HitPoints";
import SkillList from "../panels/SkillList";
import SavingThrows from "../panels/SavingThrows";
import ConditionTracker from "../panels/ConditionTracker";
import SheetIdentityBar from "../panels/SheetIdentityBar";
import SheetRollToolbar from "../panels/SheetRollToolbar";
import { SheetRollDiceStage } from "../panels/SheetRollDiceStage";
import { SectionHeader } from "@/components/common";
import { Moon, Sun } from "lucide-react";

interface Props {
  character: Character;
}

export default function MainTab({ character }: Props) {
  return (
    <SheetRollProvider>
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 pb-12">
        <div className="relative rounded-lg border-2 border-amber-950/45 bg-[#141210] shadow-lg overflow-visible mb-6 ring-1 ring-black/40">
          <SheetIdentityBar character={character} />
          <SheetRollToolbar />
          <SheetRollDiceStage />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:divide-x divide-gray-700/80">
            <aside className="lg:col-span-2 p-2 sm:p-3 border-b lg:border-b-0 border-gray-700/80 bg-black/20">
              <p className="text-[0.6rem] font-display uppercase tracking-widest text-gray-500 mb-2 lg:hidden">
                Abilities
              </p>
              <AbilityScores character={character} />
            </aside>
            <section className="lg:col-span-4 p-2 sm:p-3 border-b lg:border-b-0 border-gray-700/80 bg-[#0f0e0c]/90 min-h-0">
              <div className="lg:max-h-[min(72vh,54rem)] lg:overflow-y-auto lg:pr-1 space-y-5">
                <SavingThrows character={character} />
                <SkillList character={character} />
              </div>
            </section>
            <section className="lg:col-span-6 p-2 sm:p-3 space-y-4 bg-black/15">
              <HitPoints character={character} />
              <CombatStats character={character} />
            </section>
          </div>
        </div>

        <div className="space-y-4">
          <LevelUpPanel character={character} />
          <RollsCheatsheet character={character} />

          <div className="dnd-card flex items-center justify-between">
            <div>
              <p className="font-display font-bold text-sm text-gray-200">Inspiration</p>
              <p className="text-xs text-gray-500">Your DM can award inspiration for great moments</p>
            </div>
            <div
              className={`w-9 h-9 rounded-full border-2 cursor-pointer transition-all ${
                character.inspiration
                  ? "bg-dnd-gold border-yellow-400 shadow-[0_0_12px_rgba(212,172,13,0.45)]"
                  : "border-gray-600 bg-gray-900"
              }`}
              title={character.inspiration ? "Inspired" : "No inspiration"}
            />
          </div>

          <ConditionTracker character={character} />
          <RestSection character={character} />
          <ProficiencyList character={character} />
        </div>
      </div>
    </SheetRollProvider>
  );
}

function RestSection({ character }: { character: Character }) {
  const { takeRest } = useCharacterStore();
  const [shortOpen, setShortOpen] = useState(false);
  const [diceCount, setDiceCount] = useState("1");
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  const rows = character.computed.classLevelsDetailed ?? [];
  const isMc = character.computed.isMulticlass && rows.length > 1;
  const totalAvail = rows.reduce((s, r) => s + r.hitDiceAvailable, 0);

  const runShort = async () => {
    const n = Math.max(0, parseInt(diceCount, 10) || 0);
    if (n === 0) {
      await takeRest("short", 0);
      setShortOpen(false);
      return;
    }
    if (n > totalAvail) {
      alert(`You only have ${totalAvail} hit dice available.`);
      return;
    }
    if (isMc) {
      const hitDiceFrom = rows
        .map((r) => ({
          characterClassLevelId: r.id,
          amount: parseInt(alloc[r.id] ?? "0", 10) || 0,
        }))
        .filter((x) => x.amount > 0);
      const sum = hitDiceFrom.reduce((s, x) => s + x.amount, 0);
      if (sum !== n) {
        alert(
          `Say how many dice to spend from each class (they must add up to ${n}). Right now they add up to ${sum}.`,
        );
        return;
      }
      await takeRest("short", n, hitDiceFrom);
    } else {
      await takeRest("short", n);
    }
    setShortOpen(false);
    setAlloc({});
  };

  return (
    <div className="dnd-card">
      <SectionHeader title="Rest" />
      {!shortOpen ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShortOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-950 hover:bg-blue-900 border border-blue-800 text-blue-300 rounded py-2.5 font-display font-semibold text-sm transition-colors"
          >
            <Moon size={15} />
            Short Rest
          </button>
          <button
            type="button"
            onClick={() => takeRest("long")}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 rounded py-2.5 font-display font-semibold text-sm transition-colors"
          >
            <Sun size={15} />
            Long Rest
          </button>
        </div>
      ) : (
        <div className="space-y-3 border-t border-gray-700 pt-3 mt-2">
          <p className="text-xs text-gray-500">
            Spend hit dice to heal (roll each die + Constitution). Multiclass: say how many dice from each class.
          </p>
          <label className="dnd-label block">How many hit dice to spend?</label>
          <input
            type="number"
            min={0}
            max={totalAvail}
            value={diceCount}
            onChange={(e) => setDiceCount(e.target.value)}
            className="input-field w-24 text-sm"
          />
          {isMc && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Dice per class (must match total above):</p>
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-300 w-40 shrink-0 capitalize">
                    d{r.hitDie} {r.classSlug.replace(/-/g, " ")}
                  </span>
                  <span className="text-gray-600 text-xs">{r.hitDiceAvailable} left</span>
                  <input
                    type="number"
                    min={0}
                    max={r.hitDiceAvailable}
                    value={alloc[r.id] ?? ""}
                    placeholder="0"
                    onChange={(e) => setAlloc((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    className="input-field w-16 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={runShort} className="btn-primary text-sm">
              Roll & heal
            </button>
            <button
              type="button"
              onClick={() => {
                setShortOpen(false);
                setAlloc({});
              }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProficiencyList({ character }: { character: Character }) {
  const sections = [
    { label: "Armor", items: character.armorProficiencies },
    { label: "Weapons", items: character.weaponProficiencies },
    { label: "Tools", items: character.toolProficiencies },
    { label: "Languages", items: character.languages },
  ].filter((s) => s.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="dnd-card space-y-3">
      <SectionHeader title="Proficiencies & languages" />
      {sections.map(({ label, items }) => (
        <div key={label}>
          <p className="dnd-label mb-1">{label}</p>
          <p className="text-sm text-gray-300 capitalize">
            {items.map((item) => item.replace(/-/g, " ")).join(", ")}
          </p>
        </div>
      ))}
    </div>
  );
}
