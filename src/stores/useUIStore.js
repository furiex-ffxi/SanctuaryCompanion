import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUIStore = create(
  persist(
    (set) => ({
      mainTab: 'character',
      setMainTab: (tab) => set({ mainTab: tab }),

      activeTab: 'inventory',
      setActiveTab: (tab) => set({ activeTab: tab }),

      isSwapped: false,
      setIsSwapped: (updater) => set((state) => ({ 
        isSwapped: typeof updater === 'function' ? updater(state.isSwapped) : updater 
      })),

      difficulty: 'hell',
      setDifficulty: (diff) => set({ difficulty: diff }),

      sharedStashTab: 0,
      setSharedStashTab: (tab) => set({ sharedStashTab: tab }),

      activeFile: null,
      setActiveFile: (file) => set({ activeFile: file }),

      sharedStashFile: 'ModernSharedStashSoftCoreV2.d2i',
      setSharedStashFile: (file) => set({ sharedStashFile: file }),

      vaultSearchQuery: '',
      setVaultSearchQuery: (query) => set({ vaultSearchQuery: query }),
    }),
    {
      name: 'sc-ui-storage',
      partialize: (state) => ({
        difficulty: state.difficulty,
        isSwapped: state.isSwapped,
        sharedStashFile: state.sharedStashFile,
        sharedStashTab: state.sharedStashTab,
        activeFile: state.activeFile
      }),
    }
  )
);
