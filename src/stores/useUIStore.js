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

      vaultRealm: 'expansion',
      setVaultRealm: (realm) => set({ vaultRealm: realm }),

      vaultSearchQuery: '',
      setVaultSearchQuery: (query) => set({ vaultSearchQuery: query }),
      itemSearchDraft: { q: '', category: 'All', slot: 'All', setName: 'All', quality: 'All', minLevel: '', maxLevel: '', scope: 'all' },
      setItemSearchDraft: (draft) => set((state) => ({ itemSearchDraft: { ...state.itemSearchDraft, ...draft } })),
      itemSearchOpen: false,
      setItemSearchOpen: (open) => set({ itemSearchOpen: open }),
      itemSearchFiltersOpen: false,
      setItemSearchFiltersOpen: (open) => set({ itemSearchFiltersOpen: open }),

      autoSyncOnExit: true,
      setAutoSyncOnExit: (enabled) => set({ autoSyncOnExit: enabled }),
    }),
    {
      name: 'sc-ui-storage',
      partialize: (state) => ({
        difficulty: state.difficulty,
        isSwapped: state.isSwapped,
        sharedStashFile: state.sharedStashFile,
        sharedStashTab: state.sharedStashTab,
        activeFile: state.activeFile,
        vaultRealm: state.vaultRealm,
        autoSyncOnExit: state.autoSyncOnExit,
      }),
    }
  )
);
