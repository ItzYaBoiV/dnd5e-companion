import { useState, useEffect, useRef } from "react";
import type { Character } from "@/types/dnd";
import { useCharacterStore } from "@/store/characterStore";
import { SectionHeader } from "@/components/common";
import { SpellAssist, spellDict, type SpellIssue } from "@/components/CharacterSheet/SpellAssist";

interface Props {
  character: Character;
}

export default function NotesTab({ character }: Props) {
  const { updateCharacterField } = useCharacterStore();

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Personality */}
        <div className="dnd-card space-y-3">
          <SectionHeader title="Personality" />
          <EditableTextArea
            label="Personality Traits"
            value={character.personalityTraits}
            onSave={(v) => updateCharacterField({ personalityTraits: v })}
            placeholder="How does your character act? What mannerisms do they have?"
          />
          <EditableTextArea
            label="Ideals"
            value={character.ideals}
            onSave={(v) => updateCharacterField({ ideals: v })}
            placeholder="What does your character believe in?"
          />
          <EditableTextArea
            label="Bonds"
            value={character.bonds}
            onSave={(v) => updateCharacterField({ bonds: v })}
            placeholder="Who or what does your character care about?"
          />
          <EditableTextArea
            label="Flaws"
            value={character.flaws}
            onSave={(v) => updateCharacterField({ flaws: v })}
            placeholder="What are your character's weaknesses?"
          />
        </div>

        {/* Appearance */}
        <div className="dnd-card space-y-3">
          <SectionHeader title="Appearance & Background" />
          <div className="grid grid-cols-2 gap-2">
            {([
              ["age",    "Age"],
              ["height","Height"],
              ["weight","Weight"],
              ["eyes",  "Eyes"],
              ["skin",  "Skin"],
              ["hair",  "Hair"],
            ] as [keyof Character, string][]).map(([field, label]) => (
              <EditableField
                key={field}
                label={label}
                value={character[field] as string}
                onSave={(v) => updateCharacterField({ [field]: v })}
              />
            ))}
          </div>
          <EditableTextArea
            label="Appearance"
            value={character.appearance}
            onSave={(v) => updateCharacterField({ appearance: v })}
            placeholder="What does your character look like?"
          />
        </div>
      </div>

      {/* Backstory */}
      <div className="dnd-card">
        <SectionHeader title="Backstory" />
        <EditableTextArea
          label=""
          value={character.backstory}
          onSave={(v) => updateCharacterField({ backstory: v })}
          placeholder="Tell your character's story..."
          rows={8}
        />
      </div>

      {/* Allies & Organizations */}
      <div className="dnd-card">
        <SectionHeader title="Allies & Organizations" />
        <EditableTextArea
          label=""
          value={character.allies}
          onSave={(v) => updateCharacterField({ allies: v })}
          placeholder="Friends, allies, enemies, organizations..."
          rows={4}
        />
      </div>

      {/* Session notes */}
      <div className="dnd-card">
        <SectionHeader title="Session Notes" />
        {character.notes.length === 0 ? (
          <p className="text-sm text-gray-600 italic">No notes yet.</p>
        ) : (
          <div className="space-y-3">
            {character.notes
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map((note) => (
                <div key={note.id} className="bg-gray-900 rounded p-3 border border-gray-700">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-semibold text-sm text-white">{note.title}</span>
                    <span className="text-xs text-gray-600">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline Editable Field ─────────────────────────────────────────
function EditableField({
  label, value, onSave,
}: {
  label: string; value: string; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(value);
  const localRef = useRef(local);
  const editingRef = useRef(editing);
  const onSaveRef = useRef(onSave);
  localRef.current = local;
  editingRef.current = editing;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  useEffect(() => {
    return () => {
      if (editingRef.current) onSaveRef.current(localRef.current);
    };
  }, []);

  const handleBlur = () => {
    onSave(local);
    setEditing(false);
  };

  return (
    <div>
      {label && <label className="dnd-label block mb-1">{label}</label>}
      {editing ? (
        <input
          type="text"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Enter" && handleBlur()}
          className="input-field w-full text-sm"
          spellCheck
          autoFocus
        />
      ) : (
        <button
          onClick={() => { setLocal(value); setEditing(true); }}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 transition-colors text-sm text-gray-300"
        >
          {value || <span className="text-gray-600 italic">Click to edit</span>}
        </button>
      )}
    </div>
  );
}

// ── Inline Editable TextArea ──────────────────────────────────────
function EditableTextArea({
  label, value, onSave, placeholder, rows = 3,
}: {
  label: string; value: string; onSave: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(value);
  const localRef = useRef(local);
  const editingRef = useRef(editing);
  const onSaveRef = useRef(onSave);
  localRef.current = local;
  editingRef.current = editing;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  useEffect(() => {
    return () => {
      if (editingRef.current) onSaveRef.current(localRef.current);
    };
  }, []);

  const handleBlur = () => {
    onSave(local);
    setEditing(false);
  };

  const applySpell = (issue: SpellIssue, replacement: string) => {
    setLocal((prev) => prev.slice(0, issue.start) + replacement + prev.slice(issue.end));
  };

  return (
    <div>
      {label && <label className="dnd-label block mb-1">{label}</label>}
      {editing ? (
        <>
          <textarea
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={handleBlur}
            rows={rows}
            className="input-field w-full resize-none text-sm"
            placeholder={placeholder}
            spellCheck={false}
            autoFocus
          />
          <SpellAssist
            text={local}
            dict={spellDict}
            editing={editing}
            onApply={applySpell}
          />
        </>
      ) : (
        <button
          onClick={() => { setLocal(value); setEditing(true); }}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 transition-colors text-sm text-gray-400 whitespace-pre-wrap min-h-[60px] leading-relaxed"
        >
          {value || <span className="italic text-gray-600">{placeholder ?? "Click to edit"}</span>}
        </button>
      )}
    </div>
  );
}
