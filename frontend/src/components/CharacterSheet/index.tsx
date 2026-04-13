import type { Character } from "@/types/dnd";
import MainTab from "./tabs/MainTab";
import SpellsTab from "./tabs/SpellsTab";
import InventoryTab from "./tabs/InventoryTab";
import FeaturesTab from "./tabs/FeaturesTab";
import NotesTab from "./tabs/NotesTab";

interface Props {
  character: Character;
  activeTab: "main" | "spells" | "inventory" | "features" | "notes";
}

export default function CharacterSheet({ character, activeTab }: Props) {
  switch (activeTab) {
    case "main":      return <MainTab character={character} />;
    case "spells":    return <SpellsTab character={character} />;
    case "inventory": return <InventoryTab character={character} />;
    case "features":  return <FeaturesTab character={character} />;
    case "notes":     return <NotesTab character={character} />;
  }
}
