import { create } from "zustand";

type ModalType = "hp-change" | "short-rest" | "long-rest" | "add-spell" | "add-item" | "death-save" | "roll-dice" | null;
type SheetTab = "main" | "spells" | "inventory" | "features" | "notes";

interface UIStore {
  activeTab:    SheetTab;
  activeModal:  ModalType;
  sidebarOpen:  boolean;
  setTab:       (tab: SheetTab) => void;
  openModal:    (modal: ModalType) => void;
  closeModal:   () => void;
  toggleSidebar:() => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeTab:   "main",
  activeModal: null,
  sidebarOpen: true,
  setTab:      (activeTab) => set({ activeTab }),
  openModal:   (activeModal) => set({ activeModal }),
  closeModal:  () => set({ activeModal: null }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
