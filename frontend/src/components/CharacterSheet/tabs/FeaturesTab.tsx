import { useState } from "react";
import type { Character } from "@/types/dnd";
import { useCharacterStore } from "@/store/characterStore";
import { SectionHeader } from "@/components/common";
import { Plus, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  character: Character;
}

const SOURCE_COLORS: Record<string, string> = {
  class:      "bg-blue-950 border-blue-800 text-blue-300",
  race:       "bg-green-950 border-green-800 text-green-300",
  background: "bg-amber-950 border-amber-800 text-amber-300",
  feat:       "bg-purple-950 border-purple-800 text-purple-300",
  custom:     "bg-gray-800 border-gray-600 text-gray-300",
};

export default function FeaturesTab({ character }: Props) {
  const { addFeature } = useCharacterStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newFeature, setNewFeature] = useState({ name: "", description: "", source: "custom" });

  const bySource = character.features.reduce<Record<string, typeof character.features>>(
    (acc, f) => {
      const key = f.source ?? "custom";
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    },
    {}
  );

  const handleAddFeature = async () => {
    if (!newFeature.name.trim()) return;
    setBusy(true);
    try {
      await addFeature({
        name: newFeature.name.trim(),
        description: newFeature.description.trim() || undefined,
        source: newFeature.source || "custom",
      });
      setShowAddForm(false);
      setNewFeature({ name: "", description: "", source: "custom" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-dnd-gold text-lg">
          Features & Traits ({character.features.length})
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={15} />
          Add Feature
        </button>
      </div>

      {showAddForm && (
        <div className="dnd-card space-y-3">
          <SectionHeader title="Add Custom Feature" />
          <input
            type="text"
            placeholder="Feature name"
            value={newFeature.name}
            onChange={(e) => setNewFeature((p) => ({ ...p, name: e.target.value }))}
            className="input-field w-full"
            spellCheck
          />
          <textarea
            placeholder="Description..."
            value={newFeature.description}
            onChange={(e) => setNewFeature((p) => ({ ...p, description: e.target.value }))}
            className="input-field w-full h-24 resize-none"
            spellCheck
          />
          <select
            value={newFeature.source}
            onChange={(e) => setNewFeature((p) => ({ ...p, source: e.target.value }))}
            className="input-field"
          >
            <option value="class">Class</option>
            <option value="race">Race</option>
            <option value="background">Background</option>
            <option value="feat">Feat</option>
            <option value="custom">Custom</option>
          </select>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void handleAddFeature()} className="btn-primary text-sm">
              {busy ? "…" : "Add"}
            </button>
            <button onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {character.features.length === 0 ? (
        <div className="dnd-card text-center py-8">
          <Zap size={32} className="text-gray-700 mx-auto mb-2" />
          <p className="text-gray-500 font-display">No features yet</p>
          <p className="text-gray-600 text-xs mt-1">
            Features are added automatically during character creation.
            You can also add custom features above.
          </p>
        </div>
      ) : (
        Object.entries(bySource).map(([source, features]) => (
          <div key={source} className="dnd-card space-y-2">
            <SectionHeader
              title={source.charAt(0).toUpperCase() + source.slice(1)}
            />
            {features.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function FeatureCard({ feature }: { feature: any }) {
  const [expanded, setExpanded] = useState(false);
  const color = SOURCE_COLORS[feature.source] ?? SOURCE_COLORS.custom;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-800 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
        )}
        <span className="font-display font-semibold text-white flex-1">{feature.name}</span>

        {/* Uses tracker */}
        {feature.usesMax !== null && (
          <div className="flex items-center gap-1">
            {Array.from({ length: feature.usesMax }).map((_: unknown, i: number) => (
              <div
                key={i}
                className={clsx(
                  "w-3 h-3 rounded-full border",
                  i >= (feature.uses ?? 0)
                    ? "bg-dnd-gold border-yellow-500"
                    : "bg-gray-700 border-gray-600"
                )}
              />
            ))}
            <span className="text-xs text-gray-500 ml-1">
              {feature.usesMax - (feature.uses ?? 0)}/{feature.usesMax}
            </span>
          </div>
        )}

        {feature.recharge && (
          <span className={clsx("text-xs px-2 py-0.5 rounded border font-display", color)}>
            {feature.recharge.replace("_", " ")}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-gray-900 border-t border-gray-700">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {feature.description}
          </p>
        </div>
      )}
    </div>
  );
}
