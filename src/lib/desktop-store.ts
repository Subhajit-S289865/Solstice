import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_DESKTOP,
  type DesktopSettings,
  type NativeFolder,
  type NativeMonitor,
} from "./native";

export interface DesktopState {
  attached: boolean;
  settings: DesktopSettings;
  folders: NativeFolder[];
  monitors: NativeMonitor[];
  folderTotal: number;
  setAttached: (v: boolean) => void;
  patchSettings: (patch: Partial<DesktopSettings>) => void;
  setSettings: (s: DesktopSettings) => void;
  setFolders: (f: NativeFolder[]) => void;
  setMonitors: (m: NativeMonitor[]) => void;
  setFolderTotal: (n: number) => void;
}

export const useDesktopStore = create<DesktopState>()(
  persist(
    (set) => ({
      attached: false,
      settings: DEFAULT_DESKTOP,
      folders: [],
      monitors: [],
      folderTotal: 0,
      setAttached: (attached) => set({ attached }),
      patchSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch, hotkeys: { ...s.settings.hotkeys, ...(patch.hotkeys ?? {}) } } })),
      setSettings: (settings) => set({ settings }),
      setFolders: (folders) => set({ folders }),
      setMonitors: (monitors) => set({ monitors }),
      setFolderTotal: (folderTotal) => set({ folderTotal }),
    }),
    {
      name: "solstice-desktop",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (s) => ({ settings: s.settings }),
      skipHydration: true,
    },
  ),
);
