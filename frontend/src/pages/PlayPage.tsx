import { useEffect, useState } from "react";
import { useSessionStore } from "@/store/sessionStore";
import type { Combatant, PlayerRollInfo, DmRollInfo } from "@/store/sessionStore";
import { characterApi } from "@/services/api";
import type { CharacterSummary } from "@/types/dnd";
import { LoadingSpinner, formatModifier, HPBar, Modal } from "@/components/common";
import { Plus, Sword, Shield, Zap, RefreshCw, SkipForward, X, ChevronDown, ChevronRight, Skull } from "lucide-react";
import { clsx } from "clsx";

type PlayTab = "setup" | "combat" | "rolls";

export default function PlayPage() {
  const { sessions, activeSession, loadSessions, loadSession, createSession, deleteSession } = useSessionStore();
  const [tab, setTab]             = useState<PlayTab>("setup");
  const [creatingName, setCreatingName] = useState("");
  const [showCreate, setShowCreate]     = useState(false);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleCreate = async () => {
    if (!creatingName.trim()) return;
    const session = await createSession(creatingName.trim());
    setShowCreate(false);
    setCreatingName("");
    await loadSession(session.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 bg-dnd-dark flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-dnd-gold">DM Play Mode</h1>
          <p className="text-xs text-gray-500">dnd5e.d20madjd.quest/play</p>
        </div>
        <div className="flex gap-2">
          {activeSession && (
            <>
              {(["setup","combat","rolls"] as PlayTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={clsx(
                    "px-3 py-1.5 rounded font-display font-semibold text-sm capitalize transition-colors",
                    tab === t ? "bg-dnd-red text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
                  )}
                >
                  {t === "rolls" ? "Roll Helper" : t}
                </button>
              ))}
            </>
          )}
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1 text-sm">
            <Plus size={14} /> New Session
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        {!activeSession ? (
          <SessionPicker
            sessions={sessions}
            onSelect={(id) => { loadSession(id); setTab("setup"); }}
            onDelete={deleteSession}
          />
        ) : (
          <>
            {tab === "setup"  && <SetupTab />}
            {tab === "combat" && <CombatTab />}
            {tab === "rolls"  && <RollHelperTab />}
          </>
        )}
      </div>

      {showCreate && (
        <Modal title="New Session" onClose={() => setShowCreate(false)}
          footer={
            <>
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreate} disabled={!creatingName.trim()} className="btn-primary">Create</button>
            </>
          }
        >
          <input
            type="text" value={creatingName} onChange={(e) => setCreatingName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Session name (e.g. 'The Lost Mine - Session 3')"
            className="input-field w-full" spellCheck autoFocus
          />
        </Modal>
      )}
    </div>
  );
}

// ── Session Picker ────────────────────────────────────────────────
function SessionPicker({ sessions, onSelect, onDelete }: {
  sessions: any[]; onSelect: (id: string) => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display font-bold text-lg text-gray-300 mb-4">Select a Session</h2>
      {sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No sessions yet — create one above.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="dnd-card flex items-center justify-between hover:border-gray-500 cursor-pointer"
              onClick={() => onSelect(s.id)}>
              <div>
                <p className="font-display font-bold text-white">{s.name}</p>
                <p className="text-xs text-gray-500">{s.characters?.length ?? 0} characters · {s.status}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                className="text-gray-600 hover:text-red-400 transition-colors">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Setup Tab ─────────────────────────────────────────────────────
function SetupTab() {
  const { activeSession, partyCharacters, addCharacter, removeCharacter } = useSessionStore();
  const [allChars, setAllChars]   = useState<CharacterSummary[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [selectedChar, setSelectedChar] = useState("");

  useEffect(() => {
    characterApi.list().then(setAllChars).catch(console.error);
  }, []);

  const addedIds = new Set(activeSession?.characters.map((c) => c.characterId) ?? []);

  const handleAdd = () => {
    if (!selectedChar) return;
    addCharacter(selectedChar, playerName || "Player");
    setSelectedChar("");
    setPlayerName("");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="dnd-card">
        <h2 className="font-display font-bold text-dnd-gold mb-1">{activeSession?.name}</h2>
        <p className="text-xs text-gray-500 mb-4">Add your kids' characters to this session.</p>

        <div className="flex gap-2 mb-4">
          <select value={selectedChar} onChange={(e) => setSelectedChar(e.target.value)} className="input-field flex-1 text-sm">
            <option value="">Select character...</option>
            {allChars.filter((c) => !addedIds.has(c.id)).map((c) => (
              <option key={c.id} value={c.id}>{c.name} (Lvl {c.level} {c.classSlug})</option>
            ))}
          </select>
          <input type="text" placeholder="Player name" value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="input-field w-32 text-sm" spellCheck />
          <button onClick={handleAdd} disabled={!selectedChar} className="btn-primary text-sm px-3">Add</button>
        </div>

        {partyCharacters.length === 0 ? (
          <p className="text-gray-600 text-sm italic">No characters in this session yet.</p>
        ) : (
          <div className="space-y-2">
            {partyCharacters.map((char) => {
              const sc = activeSession?.characters.find((c) => c.characterId === char.id);
              return (
                <div key={char.id} className="flex items-center justify-between bg-gray-900 rounded p-3">
                  <div>
                    <p className="font-display font-bold text-white">{char.name}</p>
                    <p className="text-xs text-gray-500 capitalize">
                      {sc?.playerName} · Level {char.level} {char.raceSlug} {char.classSlug}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={char.currentHp > 0 ? "text-green-400" : "text-red-400"}>
                      {char.currentHp}/{char.maxHp} HP
                    </span>
                    <button onClick={() => removeCharacter(char.id)} className="text-gray-600 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {partyCharacters.length > 0 && <StartCombatPanel />}
    </div>
  );
}

// ── Start Combat Panel ────────────────────────────────────────────
function StartCombatPanel() {
  const { partyCharacters, startCombat } = useSessionStore();
  const [combatName, setCombatName] = useState("Encounter 1");
  const [initiatives, setInitiatives] = useState<Record<string, number>>({});
  const [monsters, setMonsters] = useState<{ slug: string; label: string; hp: number; ac: number; initiative: number }[]>([]);
  const [monsterSearch, setMonsterSearch] = useState("");
  const [monsterResults, setMonsterResults] = useState<any[]>([]);

  const searchMonsters = async () => {
    const res = await fetch(`/api/monsters?search=${encodeURIComponent(monsterSearch)}`);
    const data = await res.json();
    setMonsterResults(data.slice(0, 10));
  };

  const addMonster = (m: any, count = 1) => {
    for (let i = 1; i <= count; i++) {
      setMonsters((prev) => [...prev, {
        slug: m.slug, label: `${m.name}${count > 1 ? ` ${i}` : ""}`,
        hp: m.hitPoints, ac: m.armorClass,
        initiative: Math.floor(Math.random() * 20) + 1,
      }]);
    }
  };

  const autoRollPlayerInitiatives = () => {
    const next: Record<string, number> = {};
    for (const char of partyCharacters) {
      const dex = char.computed?.modifiers?.dexterity ?? 0;
      next[char.id] = Math.floor(Math.random() * 20) + 1 + dex;
    }
    setInitiatives(next);
  };

  const handleStart = async () => {
    const combatants = [
      ...partyCharacters.map((char) => ({
        type: "player" as const,
        characterId: char.id,
        label: char.name,
        initiative: initiatives[char.id] ?? 10,
        maxHp: char.maxHp,
        armorClass: char.computed.armorClass,
      })),
      ...monsters.map((m) => ({
        type: "monster" as const,
        monsterSlug: m.slug,
        label: m.label,
        initiative: m.initiative,
        maxHp: m.hp,
        armorClass: m.ac,
      })),
    ];
    await startCombat(combatName, combatants);
  };

  return (
    <div className="dnd-card space-y-4">
      <h3 className="font-display font-bold text-dnd-gold">Start Combat</h3>
      <input type="text" value={combatName} onChange={(e) => setCombatName(e.target.value)}
        className="input-field w-full text-sm" placeholder="Combat name" spellCheck />

      {/* Player initiatives */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="dnd-label">Player Initiatives (roll d20 + DEX mod)</p>
          <button onClick={autoRollPlayerInitiatives} className="btn-ghost text-xs px-2 py-1 min-h-0">
            Auto-roll all
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {partyCharacters.map((char) => (
            <div key={char.id} className="flex items-center gap-2">
              <span className="text-sm text-gray-300 flex-1">{char.name}</span>
              <span className="text-xs text-gray-600">
                {formatModifier(char.computed.modifiers.dexterity)}
              </span>
              <input type="number" className="input-field w-16 text-center text-sm"
                value={initiatives[char.id] ?? ""}
                onChange={(e) => setInitiatives((p) => ({ ...p, [char.id]: parseInt(e.target.value) || 0 }))}
                placeholder="20" />
            </div>
          ))}
        </div>
      </div>

      {/* Monster search */}
      <div>
        <p className="dnd-label mb-2">Add Monsters</p>
        <div className="flex gap-2 mb-2">
          <input type="text" value={monsterSearch} onChange={(e) => setMonsterSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchMonsters()}
            className="input-field flex-1 text-sm" placeholder="Search monsters..." spellCheck={false} />
          <button onClick={searchMonsters} className="btn-secondary text-sm">Search</button>
        </div>
        {monsterResults.length > 0 && (
          <div className="max-h-40 overflow-auto space-y-1">
            {monsterResults.map((m) => (
              <div key={m.slug} className="flex items-center justify-between px-2 py-1 hover:bg-gray-800 rounded">
                <span className="text-sm text-white">{m.name}</span>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>CR {m.challengeRating}</span>
                  <span>{m.hitPoints} HP</span>
                  <span>AC {m.armorClass}</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((n) => (
                    <button key={n} onClick={() => addMonster(m, n)}
                      className="w-6 h-6 text-xs bg-gray-700 hover:bg-dnd-red rounded transition-colors">
                      ×{n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {monsters.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="mb-1 flex items-center justify-between">
              <span className="dnd-label">Selected Monsters ({monsters.length})</span>
              <button
                onClick={() => setMonsters([])}
                className="btn-ghost text-xs px-2 py-1 min-h-0 text-red-300 hover:text-red-200"
              >
                Clear all
              </button>
            </div>
            {monsters.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-red-300 flex-1">{m.label}</span>
                <span className="text-gray-500">{m.hp} HP · AC {m.ac}</span>
                <input type="number" className="input-field w-16 text-center text-xs"
                  value={m.initiative}
                  onChange={(e) => setMonsters((prev) => prev.map((x, j) => j === i ? { ...x, initiative: parseInt(e.target.value) || 0 } : x))} />
                <button onClick={() => setMonsters((p) => p.filter((_, j) => j !== i))}
                  className="text-gray-600 hover:text-red-400"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={handleStart} className="btn-primary w-full flex items-center justify-center gap-2">
        <Sword size={16} /> Start Combat
      </button>
    </div>
  );
}

// ── Combat Tab ────────────────────────────────────────────────────
function CombatTab() {
  const { activeCombat, nextRound, endCombat, damageCombatant, healCombatant, updateCombatant } = useSessionStore();
  const [dmgInputs, setDmgInputs] = useState<Record<string, string>>({});
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [collapsedMonsterGroups, setCollapsedMonsterGroups] = useState<Record<string, boolean>>({});

  if (!activeCombat) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Sword size={40} className="mx-auto mb-3 opacity-30" />
        <p className="font-display">No active combat — start one in Setup.</p>
      </div>
    );
  }

  const sorted = [...activeCombat.combatants].sort((a, b) => b.initiative - a.initiative);
  const alive = sorted.filter((c) => c.isAlive);
  const alivePlayers = alive.filter((c) => c.type === "player").length;
  const aliveMonsters = alive.filter((c) => c.type === "monster").length;
  const current = sorted[0] ?? null;
  const selectedCombatant = sorted.find((c) => c.id === selectedCombatantId) ?? null;

  const groupKeyFor = (c: Combatant) => {
    if (c.type !== "monster") return null;
    if (c.monsterSlug) return `slug:${c.monsterSlug}`;
    const normalized = c.label.replace(/\s+\d+$/, "").trim().toLowerCase();
    return `label:${normalized}`;
  };

  useEffect(() => {
    if (!current) return;
    setSelectedCombatantId((prev) => prev ?? current.id);
  }, [current?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inEditable = !!target && (target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select");
      if (inEditable) return;
      if (!selectedCombatant) return;

      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        void nextRound();
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        void damageCombatant(selectedCombatant.id, 5);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        void healCombatant(selectedCombatant.id, 5);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCombatant, nextRound, damageCombatant, healCombatant]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="sticky top-0 z-20 bg-dnd-darker/90 backdrop-blur-sm py-2 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="dnd-card py-2 px-3">
            <p className="dnd-label">Current Turn</p>
            <p className="font-display text-sm text-white truncate">{current?.label ?? "—"}</p>
          </div>
          <div className="dnd-card py-2 px-3">
            <p className="dnd-label">Players Alive</p>
            <p className="font-display text-sm text-blue-300">{alivePlayers}</p>
          </div>
          <div className="dnd-card py-2 px-3">
            <p className="dnd-label">Monsters Alive</p>
            <p className="font-display text-sm text-red-300">{aliveMonsters}</p>
          </div>
        </div>

        {/* Round counter */}
        <div className="dnd-card flex items-center justify-between">
          <div>
            <span className="dnd-label">Round</span>
            <span className="font-display font-bold text-3xl text-dnd-gold ml-3">{activeCombat.round}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={nextRound} className="btn-primary flex items-center gap-2">
              <SkipForward size={15} /> Next Round
            </button>
            <button onClick={endCombat} className="btn-secondary flex items-center gap-2 text-sm">
              End Combat
            </button>
          </div>
        </div>
      </div>

      {/* Turn order */}
      <div className="space-y-2">
        {sorted.map((c, idx) => {
          const gk = groupKeyFor(c);
          const prev = idx > 0 ? sorted[idx - 1] : null;
          const prevGk = prev ? groupKeyFor(prev) : null;
          const firstInGroup = gk !== null && gk !== prevGk;
          const groupMembers = gk ? sorted.filter((x) => groupKeyFor(x) === gk) : [];
          const collapsed = gk ? !!collapsedMonsterGroups[gk] : false;

          if (gk && !firstInGroup && collapsed) return null;

          return (
            <div key={c.id} className="space-y-1">
              {firstInGroup && groupMembers.length > 1 && (
                <button
                  onClick={() => setCollapsedMonsterGroups((p) => ({ ...p, [gk]: !collapsed }))}
                  className="w-full text-left px-2 py-1 text-xs rounded border border-gray-800 bg-dnd-dark text-gray-400 hover:text-gray-200"
                >
                  {collapsed ? "▶" : "▼"} {c.monsterSlug ?? c.label.replace(/\s+\d+$/, "")} ({groupMembers.length})
                </button>
              )}
              {(collapsed && firstInGroup) ? null : (
                <CombatantRow
                  combatant={c}
                  isFirst={idx === 0}
                  isSelected={selectedCombatantId === c.id}
                  onSelect={() => setSelectedCombatantId(c.id)}
                  dmgInput={dmgInputs[c.id] ?? ""}
                  onDmgChange={(v) => setDmgInputs((p) => ({ ...p, [c.id]: v }))}
                  onDamage={(forcedAmount) => {
                    const amount = forcedAmount ?? (parseInt(dmgInputs[c.id] ?? "0", 10) || 0);
                    if (amount <= 0) return;
                    damageCombatant(c.id, amount);
                    setDmgInputs((p) => ({ ...p, [c.id]: "" }));
                  }}
                  onHeal={(forcedAmount) => {
                    const amount = forcedAmount ?? (parseInt(dmgInputs[c.id] ?? "0", 10) || 0);
                    if (amount <= 0) return;
                    healCombatant(c.id, amount);
                    setDmgInputs((p) => ({ ...p, [c.id]: "" }));
                  }}
                  onToggleCondition={(cond) => {
                    const has = c.conditions.includes(cond);
                    updateCombatant(c.id, { conditions: has ? c.conditions.filter((x) => x !== cond) : [...c.conditions, cond] });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CombatantRow({ combatant: c, isFirst, isSelected, onSelect, dmgInput, onDmgChange, onDamage, onHeal, onToggleCondition }: {
  combatant: Combatant; isFirst: boolean;
  isSelected: boolean;
  onSelect: () => void;
  dmgInput: string; onDmgChange: (v: string) => void;
  onDamage: (amount?: number) => void; onHeal: (amount?: number) => void;
  onToggleCondition: (c: string) => void;
}) {
  const [expanded, setExpanded] = useState(isFirst);
  const hpPct = Math.round((c.currentHp / c.maxHp) * 100);
  const CONDITIONS = ["blinded","charmed","frightened","grappled","incapacitated","paralyzed","poisoned","prone","restrained","stunned"];
  const amount = parseInt(dmgInput || "0", 10) || 0;
  const applyQuickDamage = (n: number) => onDamage(n);
  const applyQuickHeal = (n: number) => onHeal(n);

  return (
    <div className={clsx(
      "border rounded-lg overflow-hidden transition-all",
      isFirst ? "border-dnd-gold shadow-[0_0_8px_rgba(212,172,13,0.2)]" : "border-gray-700",
      isSelected && "ring-1 ring-blue-500/40",
      !c.isAlive && "opacity-50"
    )} onClick={onSelect}>
      <div className={clsx(
        "flex items-center gap-3 px-3 py-2",
        isFirst ? "bg-dnd-dark/90 ring-1 ring-dnd-gold/20" : "bg-dnd-dark"
      )}>
        {/* Initiative */}
        <span className={clsx(
          "w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm flex-shrink-0",
          c.type === "player" ? "bg-blue-900 text-blue-200" : "bg-red-900 text-red-200"
        )}>
          {c.initiative}
        </span>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-white truncate">{c.label}</span>
            {c.type === "monster" && <Skull size={12} className="text-red-400 flex-shrink-0" />}
            {isFirst && <span className="text-[10px] px-1.5 py-0.5 rounded bg-dnd-gold/20 border border-dnd-gold/40 text-dnd-gold">TURN</span>}
            {c.isConcentrating && <span title="Concentrating"><Zap size={12} className="text-yellow-400" /></span>}
            {c.conditions.map((cond) => (
              <span key={cond} className="text-xs px-1.5 py-0.5 bg-red-950 border border-red-800 text-red-300 rounded font-display">
                {cond}
              </span>
            ))}
          </div>
          <HPBar current={c.currentHp} max={c.maxHp} temp={c.temporaryHp} />
        </div>

        {/* HP */}
        <span className={clsx(
          "font-display font-bold text-sm w-20 text-right flex-shrink-0",
          hpPct > 50 ? "text-green-400" : hpPct > 25 ? "text-yellow-400" : "text-red-400"
        )}>
          {c.currentHp}/{c.maxHp}
        </span>

        {/* AC */}
        <span className="text-xs text-gray-500 flex-shrink-0 flex items-center gap-1">
          <Shield size={11} />{c.armorClass}
        </span>

        {/* Damage/Heal */}
        <input type="number" min="0" value={dmgInput}
          onChange={(e) => onDmgChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") amount >= 0 && onDamage(); }}
          className="input-field w-16 text-center text-sm flex-shrink-0" placeholder="amt" />
        <button onClick={() => onDamage()} title="Damage"
          className="w-7 h-7 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded text-sm font-bold flex-shrink-0">
          −
        </button>
        <button onClick={() => onHeal()} title="Heal"
          className="w-7 h-7 bg-green-950 hover:bg-green-900 border border-green-800 text-green-300 rounded text-sm font-bold flex-shrink-0">
          +
        </button>

        <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-white flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-2 pt-1 bg-gray-900 border-t border-gray-800">
          <div className="mb-2 flex flex-wrap gap-1">
            <button onClick={() => applyQuickDamage(1)} className="text-xs px-2 py-0.5 rounded border border-red-900 text-red-300 hover:bg-red-950">-1</button>
            <button onClick={() => applyQuickDamage(5)} className="text-xs px-2 py-0.5 rounded border border-red-900 text-red-300 hover:bg-red-950">-5</button>
            <button onClick={() => applyQuickDamage(10)} className="text-xs px-2 py-0.5 rounded border border-red-900 text-red-300 hover:bg-red-950">-10</button>
            <button onClick={() => applyQuickHeal(5)} className="text-xs px-2 py-0.5 rounded border border-green-900 text-green-300 hover:bg-green-950">+5</button>
            <button onClick={() => applyQuickHeal(10)} className="text-xs px-2 py-0.5 rounded border border-green-900 text-green-300 hover:bg-green-950">+10</button>
          </div>
          <p className="dnd-label mb-1">Conditions</p>
          <div className="flex flex-wrap gap-1">
            {CONDITIONS.map((cond) => (
              <button key={cond} onClick={() => onToggleCondition(cond)}
                className={clsx(
                  "text-xs px-2 py-0.5 rounded border font-display capitalize transition-colors",
                  c.conditions.includes(cond)
                    ? "bg-red-950 border-red-700 text-red-300"
                    : "border-gray-700 text-gray-500 hover:border-gray-500"
                )}>
                {cond}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Roll Helper Tab ───────────────────────────────────────────────
function RollHelperTab() {
  const { rollSummary, refreshRolls } = useSessionStore();

  useEffect(() => { refreshRolls(); }, [refreshRolls]);

  if (!rollSummary) return <LoadingSpinner />;

  if (!rollSummary.inCombat) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="font-display text-lg">No active combat.</p>
        <p className="text-sm mt-1">Start a combat encounter to see roll helpers.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
      {/* Player roll cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-blue-400 text-lg">Players Roll</h2>
          <button onClick={refreshRolls} className="text-gray-500 hover:text-white">
            <RefreshCw size={14} />
          </button>
        </div>
        {rollSummary.playerRolls.map((p) => <PlayerRollCard key={p.characterId} info={p} />)}
      </div>

      {/* DM roll cards */}
      <div className="space-y-3">
        <h2 className="font-display font-bold text-red-400 text-lg">You Roll (DM)</h2>
        {rollSummary.dmRolls.map((d) => <DmRollCard key={d.combatantId} info={d as DmRollInfo} />)}
        {rollSummary.dmRolls.length === 0 && (
          <p className="text-gray-500 text-sm italic">No monsters in combat.</p>
        )}
      </div>
    </div>
  );
}

function PlayerRollCard({ info }: { info: PlayerRollInfo }) {
  const hpPct = Math.round((info.currentHp / info.maxHp) * 100);
  return (
    <div className="dnd-card border-blue-900">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-bold text-white">{info.characterName}</span>
        <span className={clsx("text-sm font-display font-bold",
          hpPct > 50 ? "text-green-400" : hpPct > 25 ? "text-yellow-400" : "text-red-400")}>
          {info.currentHp}/{info.maxHp} HP
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <RollLine label="Melee Attack"  roll={`d20${formatModifier(info.keyRolls.attacks.melee.bonus)}`} />
        <RollLine label="Ranged Attack" roll={`d20${formatModifier(info.keyRolls.attacks.ranged.bonus)}`} />
        {info.keyRolls.attacks.spell && (
          <RollLine label={info.keyRolls.attacks.spell.label} roll={`d20${formatModifier(info.keyRolls.attacks.spell.bonus)} | DC ${info.keyRolls.attacks.spell.dc}`} />
        )}
        <RollLine label="Perception" roll={String(info.passivePerception)} note="passive" />
        {Object.entries(info.keyRolls.skills).map(([skill, bonus]) => (
          <RollLine key={skill} label={skill.charAt(0).toUpperCase() + skill.slice(1)} roll={`d20${formatModifier(bonus)}`} />
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-700 grid grid-cols-2 gap-1 text-xs">
        <p className="dnd-label col-span-2">Saving Throws</p>
        {Object.entries(info.keyRolls.saves).map(([ability, save]) => (
          <RollLine key={ability} label={ability.slice(0,3).toUpperCase()} roll={`d20${formatModifier(save.bonus)}`}
            note={save.proficient ? "prof" : ""} />
        ))}
      </div>
    </div>
  );
}

function DmRollCard({ info }: { info: DmRollInfo }) {
  const hpPct = Math.round((info.currentHp / info.maxHp) * 100);
  return (
    <div className="dnd-card border-red-900">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-bold text-white">{info.label}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">AC {info.armorClass}</span>
          <span className={clsx("font-display font-bold",
            hpPct > 50 ? "text-green-400" : hpPct > 25 ? "text-yellow-400" : "text-red-400")}>
            {info.currentHp}/{info.maxHp} HP
          </span>
        </div>
      </div>
      <div className="space-y-1">
        {info.actions.slice(0, 5).map((action, i) => (
          <div key={i} className="bg-gray-900 rounded px-2 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-display font-semibold text-white">{action.name}</span>
              <div className="flex items-center gap-2 text-xs font-mono">
                {action.attackBonus !== null && (
                  <span className="text-dnd-gold">d20{formatModifier(action.attackBonus)}</span>
                )}
                {action.damageDice && (
                  <span className="text-red-300">
                    {action.damageDice}{action.damageBonus ? formatModifier(action.damageBonus) : ""} {action.damageType}
                  </span>
                )}
                {action.saveDc && (
                  <span className="text-yellow-400">DC {action.saveDc} {action.saveType}</span>
                )}
              </div>
            </div>
            {action.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{action.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RollLine({ label, roll, note }: { label: string; roll: string; note?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}{note && <span className="text-gray-600 ml-1">({note})</span>}</span>
      <span className="font-mono text-dnd-gold font-bold">{roll}</span>
    </div>
  );
}
