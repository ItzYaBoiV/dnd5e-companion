import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LoadingSpinner, formatModifier } from "@/components/common";
import { ABILITY_NAMES, ABILITY_LABELS } from "@/types/dnd";
import { clsx } from "clsx";

export default function MonstersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [monsters, setMonsters] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [filterType, setFilterType]   = useState("");
  const [filterCr, setFilterCr]       = useState("");
  const [selected, setSelected]       = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const slug = (location.state as { openMonsterSlug?: string } | null)?.openMonsterSlug?.trim();
    if (!slug) return;
    navigate(".", { replace: true, state: {} });
    setLoadingDetail(true);
    fetch(`/api/monsters/${slug}`)
      .then((res) => res.json())
      .then((data) => setSelected(data))
      .catch(() => setSelected(null))
      .finally(() => setLoadingDetail(false));
  }, [location.state, navigate]);

  const doSearch = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)     params.set("search", search);
    if (filterType) params.set("type", filterType);
    if (filterCr)   params.set("cr", filterCr);
    const res = await fetch(`/api/monsters?${params}`);
    setMonsters(await res.json());
    setLoading(false);
  };

  useEffect(() => { doSearch(); }, []);

  const openDetail = async (slug: string) => {
    setLoadingDetail(true);
    const res = await fetch(`/api/monsters/${slug}`);
    setSelected(await res.json());
    setLoadingDetail(false);
  };

  const CR_OPTIONS = ["0","1/8","1/4","1/2","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"];
  const TYPE_OPTIONS = ["aberration","beast","celestial","construct","dragon","elemental","fey","fiend","giant","humanoid","monstrosity","ooze","plant","undead"];

  return (
    <div className="flex h-full">
      {/* Monster list */}
      <div className={clsx("flex flex-col border-r border-gray-800 transition-all", selected ? "w-80" : "flex-1")}>
        {/* Search bar */}
        <div className="p-3 border-b border-gray-800 bg-dnd-dark space-y-2">
          <h1 className="font-display font-bold text-xl text-dnd-gold">Monster Manual</h1>
          <div className="flex gap-1">
            <input type="text" placeholder="Search..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="input-field flex-1 text-sm" spellCheck={false} />
            <button onClick={doSearch} className="btn-primary text-sm px-3">Go</button>
          </div>
          <div className="flex gap-1">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field text-xs flex-1">
              <option value="">All Types</option>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
            <select value={filterCr} onChange={(e) => setFilterCr(e.target.value)} className="input-field text-xs w-24">
              <option value="">All CR</option>
              {CR_OPTIONS.map((cr) => <option key={cr} value={cr}>CR {cr}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-600">{monsters.length} monsters</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {loading ? <LoadingSpinner /> : (
            <div>
              {monsters.map((m) => (
                <button key={m.slug} onClick={() => openDetail(m.slug)}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2 border-b border-gray-800 hover:bg-gray-800 transition-colors text-left",
                    selected?.slug === m.slug && "bg-gray-800"
                  )}>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm text-white truncate">{m.name}</p>
                    <p className="text-xs text-gray-500 capitalize truncate">{m.size} {m.type}{m.subtype ? ` (${m.subtype})` : ""}</p>
                  </div>
                  <div className="flex flex-col items-end text-xs flex-shrink-0">
                    <span className={clsx("font-display font-bold", crColor(m.challengeRating))}>CR {m.challengeRating}</span>
                    <span className="text-gray-600">{m.hitPoints} HP</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stat block detail */}
      {selected && (
        <div className="flex-1 overflow-auto p-4">
          {loadingDetail ? <LoadingSpinner /> : <MonsterStatBlock monster={selected} onClose={() => setSelected(null)} />}
        </div>
      )}
    </div>
  );
}

// ── Monster Stat Block ────────────────────────────────────────────
function MonsterStatBlock({ monster: m, onClose }: { monster: any; onClose: () => void }) {
  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="font-display font-bold text-2xl text-dnd-red">{m.name}</h2>
          <p className="text-gray-400 text-sm italic capitalize">
            {m.size} {m.type}{m.subtype ? ` (${m.subtype})` : ""}, {m.alignment}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
      </div>

      <div className="border-t-2 border-dnd-red my-2" />

      {/* AC, HP, Speed */}
      <div className="space-y-0.5 text-sm">
        <p><span className="font-bold text-dnd-red">Armor Class</span> <span className="text-gray-200">{m.armorClass}{m.armorDesc ? ` (${m.armorDesc})` : ""}</span></p>
        <p><span className="font-bold text-dnd-red">Hit Points</span> <span className="text-gray-200">{m.hitPoints} ({m.hitDice})</span></p>
        <p><span className="font-bold text-dnd-red">Speed</span> <span className="text-gray-200">{formatSpeed(m.speed)}</span></p>
      </div>

      <div className="border-t-2 border-dnd-red my-2" />

      {/* Ability scores */}
      <div className="grid grid-cols-6 gap-1 text-center">
        {ABILITY_NAMES.map((ability) => (
          <div key={ability} className="bg-gray-900 rounded p-1.5">
            <p className="text-xs font-display font-bold text-dnd-red">{ABILITY_LABELS[ability].abbr}</p>
            <p className="text-sm font-bold text-white">{m[ability]}</p>
            <p className="text-xs text-gray-400">{formatModifier(Math.floor((m[ability] - 10) / 2))}</p>
          </div>
        ))}
      </div>

      <div className="border-t-2 border-dnd-red my-2" />

      {/* Stats */}
      <div className="space-y-1 text-sm">
        {buildSaveString(m) && <p><span className="font-bold text-dnd-red">Saving Throws</span> <span className="text-gray-200">{buildSaveString(m)}</span></p>}
        {buildSkillString(m) && <p><span className="font-bold text-dnd-red">Skills</span> <span className="text-gray-200">{buildSkillString(m)}</span></p>}
        {m.damageResistances   && <p><span className="font-bold text-dnd-red">Damage Resistances</span> <span className="text-gray-200">{m.damageResistances}</span></p>}
        {m.damageImmunities    && <p><span className="font-bold text-dnd-red">Damage Immunities</span> <span className="text-gray-200">{m.damageImmunities}</span></p>}
        {m.conditionImmunities && <p><span className="font-bold text-dnd-red">Condition Immunities</span> <span className="text-gray-200">{m.conditionImmunities}</span></p>}
        <p><span className="font-bold text-dnd-red">Senses</span> <span className="text-gray-200">{m.senses}</span></p>
        <p><span className="font-bold text-dnd-red">Languages</span> <span className="text-gray-200">{m.languages || "—"}</span></p>
        <p><span className="font-bold text-dnd-red">Challenge</span> <span className={clsx("font-bold", crColor(m.challengeRating))}>{m.challengeRating}</span> <span className="text-gray-400">({m.xp.toLocaleString()} XP)</span></p>
      </div>

      <div className="border-t-2 border-dnd-red my-2" />

      {/* Special abilities */}
      {m.specialAbilities?.length > 0 && (
        <div className="space-y-2 mb-3">
          {m.specialAbilities.map((sa: any, i: number) => (
            <p key={i} className="text-sm text-gray-300">
              <span className="font-bold italic text-white">{sa.name}.</span>{" "}{sa.desc}
            </p>
          ))}
        </div>
      )}

      {/* Actions */}
      {m.actions?.length > 0 && (
        <>
          <h3 className="font-display font-bold text-dnd-red border-b border-dnd-red pb-0.5 mb-2">Actions</h3>
          <div className="space-y-2 mb-3">
            {m.actions.map((a: any, i: number) => (
              <div key={i} className="text-sm">
                <p className="text-gray-300">
                  <span className="font-bold italic text-white">{a.name}.</span>{" "}
                  <span className="text-gray-400 text-xs">
                    {a.attack_bonus !== undefined && `+${a.attack_bonus} to hit. `}
                    {a.damage?.map((d: any) => `${d.damage_dice}${d.damage_bonus ? formatModifier(d.damage_bonus) : ""} ${d.damage_type?.name ?? ""}`).join(", ")}
                    {a.dc && ` DC ${a.dc.dc_value} ${a.dc.dc_type?.name ?? ""} save.`}
                  </span>{" "}
                  {a.desc}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Reactions */}
      {m.reactions?.length > 0 && (
        <>
          <h3 className="font-display font-bold text-dnd-red border-b border-dnd-red pb-0.5 mb-2">Reactions</h3>
          <div className="space-y-2 mb-3">
            {m.reactions.map((r: any, i: number) => (
              <p key={i} className="text-sm text-gray-300">
                <span className="font-bold italic text-white">{r.name}.</span>{" "}{r.desc}
              </p>
            ))}
          </div>
        </>
      )}

      {/* Legendary actions */}
      {m.legendaryActions?.length > 0 && (
        <>
          <h3 className="font-display font-bold text-dnd-red border-b border-dnd-red pb-0.5 mb-2">Legendary Actions</h3>
          <div className="space-y-2">
            {m.legendaryActions.map((la: any, i: number) => (
              <p key={i} className="text-sm text-gray-300">
                <span className="font-bold italic text-white">{la.name}.</span>{" "}{la.desc}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────
function crColor(cr: string) {
  const n = parseCr(cr);
  if (n <= 0.5) return "text-green-400";
  if (n <= 3)   return "text-yellow-400";
  if (n <= 9)   return "text-orange-400";
  return "text-red-400";
}

function parseCr(cr: string) {
  if (cr === "1/8") return 0.125;
  if (cr === "1/4") return 0.25;
  if (cr === "1/2") return 0.5;
  return parseFloat(cr) || 0;
}

function formatSpeed(speed: Record<string, number>) {
  return Object.entries(speed)
    .map(([type, ft]) => type === "walk" ? `${ft} ft.` : `${type} ${ft} ft.`)
    .join(", ");
}

function buildSaveString(m: any) {
  const parts: string[] = [];
  if (m.strengthSave     !== null && m.strengthSave     !== undefined) parts.push(`Str ${formatModifier(m.strengthSave)}`);
  if (m.dexteritySave    !== null && m.dexteritySave    !== undefined) parts.push(`Dex ${formatModifier(m.dexteritySave)}`);
  if (m.constitutionSave !== null && m.constitutionSave !== undefined) parts.push(`Con ${formatModifier(m.constitutionSave)}`);
  if (m.intelligenceSave !== null && m.intelligenceSave !== undefined) parts.push(`Int ${formatModifier(m.intelligenceSave)}`);
  if (m.wisdomSave       !== null && m.wisdomSave       !== undefined) parts.push(`Wis ${formatModifier(m.wisdomSave)}`);
  if (m.charismaSave     !== null && m.charismaSave     !== undefined) parts.push(`Cha ${formatModifier(m.charismaSave)}`);
  return parts.join(", ");
}

function buildSkillString(m: any) {
  if (!m.skills || Object.keys(m.skills).length === 0) return "";
  return Object.entries(m.skills as Record<string, number>)
    .map(([skill, bonus]) => `${skill.charAt(0).toUpperCase() + skill.slice(1)} ${formatModifier(bonus)}`)
    .join(", ");
}
