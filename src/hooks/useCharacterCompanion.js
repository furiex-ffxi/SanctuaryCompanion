import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import fallbackData from '../fallbackData.json';
import { D2SParserAdapter } from '../adapters/D2SParserAdapter';
import { calculateCharacterStats } from '../domain/entities/Character';
import { STORAGE_META } from '../domain/entities/Item';

import { InfiniteStashAdapter } from '../adapters/InfiniteStashAdapter';
import { emitToast } from './useToasts';

export function useCharacterCompanion() {
  const [charData, setCharData]     = useState(fallbackData);
  const [isSwapped, setIsSwapped]   = useState(false);
  const [activeTab, setActiveTab]   = useState('inventory');
  const [mainTab, setMainTab]       = useState('character'); // 'character' | 'stash'
  const [difficulty, setDifficulty] = useState('hell'); // 'normal' | 'nightmare' | 'hell'
  const [saveFiles, setSaveFiles]   = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [syncedAt, setSyncedAt]     = useState(null);
  const [syncing, setSyncing]       = useState(false);
  const [vaultItems, setVaultItems] = useState([]);
  const [vaultTotal, setVaultTotal] = useState(0);
  const [vaultNextCursor, setVaultNextCursor] = useState(null);
  const [vaultFacets, setVaultFacets] = useState({ slots: [], sets: [], categories: [] });
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState(null);
  const vaultFiltersRef = useRef({});
  const [sharedStash, setSharedStash] = useState(null);
  const [sharedStashTab, setSharedStashTab] = useState(0);
  const [sharedStashLoading, setSharedStashLoading] = useState(false);
  const [sharedStashError, setSharedStashError] = useState(null);
  const [isGameRunning, setIsGameRunning] = useState(false);

  const queryVault = useCallback(async (filters = {}, { append = false, cursor = null } = {}) => {
    vaultFiltersRef.current = filters;
    setVaultLoading(true);
    setVaultError(null);
    try {
      const result = await InfiniteStashAdapter.list(filters, { cursor, limit: 100 });
      setVaultItems((current) => append ? [...current, ...result.items] : result.items);
      setVaultTotal(result.total);
      setVaultNextCursor(result.nextCursor);
      return result;
    } catch (err) {
      setVaultError(err.message);
      throw err;
    } finally {
      setVaultLoading(false);
    }
  }, []);

  const refreshVaultFacets = useCallback(async () => {
    const facets = await InfiniteStashAdapter.facets();
    setVaultFacets(facets);
    return facets;
  }, []);

  const refreshVault = useCallback(async () => {
    const result = await queryVault(vaultFiltersRef.current);
    await refreshVaultFacets();
    return result;
  }, [queryVault, refreshVaultFacets]);

  const loadMoreVault = useCallback(() => {
    if (!vaultNextCursor || vaultLoading) return Promise.resolve();
    return queryVault(vaultFiltersRef.current, { append: true, cursor: vaultNextCursor });
  }, [queryVault, vaultNextCursor, vaultLoading]);

  const removeItemFromVault = useCallback(async (vaultId, reason = 'delete') => {
    await InfiniteStashAdapter.remove(vaultId, reason);
    await refreshVault();
  }, [refreshVault]);

  useEffect(() => {
    Promise.all([queryVault(), refreshVaultFacets()]).catch((err) => {
      console.error('Failed to load Infinite Stash:', err);
    });
  }, [queryVault, refreshVaultFacets]);

  // Poll server for D2R process status
  useEffect(() => {
    let isMounted = true;
    const checkGameStatus = async () => {
      try {
        const res = await fetch('/__d2r_status');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setIsGameRunning(data.isRunning);
        }
      } catch (err) {
        // Silently ignore network errors during status check
      }
    };
    checkGameStatus();
    const interval = setInterval(checkGameStatus, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Refresh shared stash file from server (.d2i)
  const refreshSharedStash = useCallback(async (filename) => {
    setSharedStashLoading(true);
    setSharedStashError(null);
    try {
      const stashData = await D2SParserAdapter.fetchSharedStash(filename || 'ModernSharedStashSoftCoreV2.d2i');
      setSharedStash(stashData);
    } catch (err) {
      console.error('Shared stash fetch error:', err);
      setSharedStashError(err.message);
    } finally {
      setSharedStashLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSharedStash('ModernSharedStashSoftCoreV2.d2i');
  }, [refreshSharedStash]);

  // Trigger safe backup on server
  const triggerSaveBackup = useCallback(async () => {
    try {
      const res = await fetch('/__d2s_backup');
      return await res.json();
    } catch (err) {
      console.error('Backup request failed:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Deposit item to vault with automatic safe backup & save file cleanup
  const depositItemToVault = useCallback(
    async (item, sourceName) => {
      if (isGameRunning) {
        emitToast('⛔ D2R is running — exit the game before moving items.', 'error');
        return;
      }
      // 1. Perform automated backup first
      const backup = await triggerSaveBackup();
      if (!backup?.success) {
        emitToast(`Backup failed; no files were changed. ${backup?.error || ''}`, 'error');
        return;
      }

      // Persist and journal the item before changing its source save. A failure can duplicate, never lose, the item.
      const label = sourceName === '__shared_stash__'
        ? `Shared Stash (${item._selectedFile || 'ModernSharedStashSoftCoreV2.d2i'})`
        : (sourceName || activeFile || charData?.header?.name || 'Uploaded Character');
      const entry = {
        vaultId: `stash_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        stashedAt: new Date().toISOString(),
        sourceSave: label,
        itemData: item,
      };
      try {
        await InfiniteStashAdapter.add(entry);
      } catch (err) {
        console.error('Failed to persist Infinite Stash item:', err);
        emitToast(`Vault persistence failed: ${err.message}. The source save was not changed.`, 'error');
        return;
      }
      let updatedChar = null;
      // 2. Remove item from .d2s save file on disk if depositing from active character file
      // Skip if item is coming from the shared stash (sourceName === '__shared_stash__')
      if (activeFile && sourceName !== '__shared_stash__') {
        try {
          const res = await D2SParserAdapter.removeItemFromSave(activeFile, item);
          if (res.success && res.char) {
            updatedChar = res.char;
            setCharData(res.char);
          }
          else throw new Error(res.error || 'D2SSharp did not confirm item removal');
        } catch (err) {
          console.error('Failed to update save file on disk:', err);
          emitToast(`Source save was not changed; the item remains safely recorded in the vault. ${err.message}`, 'error');
          return;
        }
      }

      // 3. Remove item from .d2i shared stash file on disk if item was in shared stash
      if (sourceName === '__shared_stash__') {
        try {
          const d2iRes = await D2SParserAdapter.removeItemFromSharedStash(item._selectedFile || null, item);
          if (!d2iRes.success) {
            console.error('removeItemFromSharedStash error detail:', d2iRes);
            emitToast('❌ Failed to remove from Shared Stash: ' + (d2iRes.error || 'unknown error'), 'error');
            return;
          }
          if (!d2iRes.itemRemoved) {
            console.warn('Item not matched in .d2i file:', item);
            emitToast('⚠️ Item not found in Shared Stash file (X:' + (item.position_x ?? 0) + ' Y:' + (item.position_y ?? 0) + ' ' + (item.type_name || item.type) + ')', 'error');
            return;
          }
          if (d2iRes.stash) {
            setSharedStash(d2iRes.stash);
          }
          if (d2iRes.itemBytesHex) {
            item.rawBytesHex = d2iRes.itemBytesHex;
          }
          try {
            await InfiniteStashAdapter.update(entry);
          } catch (updateError) {
            emitToast(`Item is safe in the vault, but raw-byte metadata update failed: ${updateError.message}`, 'error');
          }
        } catch (err) {
          emitToast('❌ Failed to update Shared Stash file: ' + err.message, 'error');
          return;
        }
      }

      // 4. Fallback state update for client-only / uploaded files
      if (!updatedChar) {
        setCharData((prev) => {
          if (!prev?.items) return prev;
          const newItems = prev.items.filter((i) => i !== item);
          return { ...prev, items: newItems };
        });
      }

      await refreshVault();
      emitToast(`📦 Stashed "${item.type_name || item.type}" → Infinite Stash`, 'success');
    },
    [activeFile, charData, triggerSaveBackup, isGameRunning, refreshVault]
  );

  // Withdraw item from Infinite Stash Vault back into active character's in-game Stash (.d2s)
  const withdrawItemFromVault = useCallback(
    async (vaultId, itemData) => {
      if (isGameRunning) {
        emitToast('⛔ D2R is running — exit the game before moving items.', 'error');
        return;
      }

      const backup = await triggerSaveBackup();
      if (!backup?.success) {
        emitToast(`Backup failed; no files were changed. ${backup?.error || ''}`, 'error');
        return;
      }

      if (!activeFile) {
        emitToast('Select a character save before withdrawing an item.', 'error');
        return;
      }
      try {
        const res = await D2SParserAdapter.addItemToSave(activeFile, itemData);
        if (!res.success || !res.char) throw new Error(res.error || 'D2SSharp did not confirm item placement');
        setCharData(res.char);
      } catch (err) {
        console.error('Failed to add item to save file:', err);
        emitToast(`Withdrawal failed; the item remains in the vault. ${err.message}`, 'error');
        return;
      }

      // Remove from Vault
      try {
        await removeItemFromVault(vaultId, 'withdraw');
      } catch (err) {
        emitToast(`Item was written to the save, but vault history update failed: ${err.message}`, 'error');
        return;
      }

      emitToast(`↩️ "${itemData.type_name || itemData.type}" → Personal Stash`, 'success');
    },
    [activeFile, triggerSaveBackup, isGameRunning, removeItemFromVault]
  );

  // Withdraw item from Infinite Stash Vault into Shared Stash (.d2i)
  const withdrawItemToSharedStash = useCallback(
    async (vaultId, itemData) => {
      if (isGameRunning) {
        emitToast('⛔ D2R is running — exit the game before moving items.', 'error');
        return;
      }

      const backup = await triggerSaveBackup();
      if (!backup?.success) {
        emitToast(`Backup failed; no files were changed. ${backup?.error || ''}`, 'error');
        return;
      }

      let targetTabIdx = 0;
      try {
        const res = await D2SParserAdapter.addItemToSharedStash(null, itemData);
        if (!res.success) {
          throw new Error(res.error || res.message || 'Server failed to add item to shared stash');
        }
        if (res.stash) {
          setSharedStash(res.stash);
          targetTabIdx = res.targetTabIdx ?? 0;
        }
      } catch (err) {
        emitToast('❌ Failed to write to Shared Stash: ' + err.message, 'error');
        return;
      }

      // Remove from Vault
      try {
        await removeItemFromVault(vaultId, 'withdraw');
      } catch (err) {
        emitToast(`Item was written to Shared Stash, but vault history update failed: ${err.message}`, 'error');
        return;
      }

      emitToast(`🪙 "${itemData.type_name || itemData.type}" → Shared Stash (Tab ${targetTabIdx + 1})`, 'success');
    },
    [triggerSaveBackup, isGameRunning, removeItemFromVault]
  );

  // Fetch list of files
  useEffect(() => {
    D2SParserAdapter.fetchList()
      .then((files) => {
        setSaveFiles(files);
        const preferred = files.find((f) => f.toLowerCase().includes('furisorc')) || files[0];
        if (preferred) setActiveFile(preferred);
      })
      .catch(() => {});
  }, []);

  // Refresh active file from server
  const refreshFromServer = useCallback(async (file) => {
    if (!file) return;
    setSyncing(true);
    try {
      const data = await D2SParserAdapter.fetchRefresh(file);
      setCharData(data);
      setSyncedAt(new Date());
      refreshSharedStash();
    } catch (err) {
      console.error('Refresh error:', err);
      alert('Could not refresh: ' + err.message);
    } finally {
      setSyncing(false);
    }
  }, [refreshSharedStash]);

  // HMR Hot Reload handling in Dev mode
  useEffect(() => {
    if (typeof import.meta.hot === 'undefined') return;
    const handler = (payload) => {
      if (payload.file !== activeFile) return;
      setCharData(payload.char);
      setSyncedAt(new Date());
      refreshSharedStash();
    };
    import.meta.hot.on('d2s:update', handler);
    return () => import.meta.hot.off('d2s:update', handler);
  }, [activeFile, refreshSharedStash]);

  useEffect(() => {
    if (activeFile) refreshFromServer(activeFile);
  }, [activeFile, refreshFromServer]);

  // Handle local file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = await D2SParserAdapter.parseBuffer(buf);
      setCharData(parsed);
      setActiveFile(null);
      setSyncedAt(new Date());
      refreshSharedStash();
    } catch (err) {
      console.error('Parse error:', err);
      alert('Error parsing save file: ' + err.message);
    }
  };

  const activeStats = useMemo(() => calculateCharacterStats(charData, isSwapped, difficulty), [charData, isSwapped, difficulty]);

  const storageItems = useMemo(() => {
    if (!charData?.items) return [];
    if (activeTab === 'cube') {
      const cube = charData.items.find((i) => i.type === 'box');
      return cube?.socketed_items || [];
    }
    const meta = STORAGE_META[activeTab];
    if (!meta) return [];
    return charData.items.filter((i) => i.location_id === 0 && i.alt_position_id === meta.altId);
  }, [charData, activeTab]);

  return {
    charData,
    isSwapped,
    setIsSwapped,
    activeTab,
    setActiveTab,
    mainTab,
    setMainTab,
    saveFiles,
    activeFile,
    setActiveFile,
    syncedAt,
    syncing,
    refreshFromServer,
    handleFileUpload,
    activeStats,
    storageItems,
    STORAGE_META,
    vaultItems,
    vaultTotal,
    vaultNextCursor,
    vaultFacets,
    vaultLoading,
    vaultError,
    queryVault,
    refreshVault,
    loadMoreVault,
    removeItemFromVault,
    depositItemToVault,
    withdrawItemFromVault,
    withdrawItemToSharedStash,
    triggerSaveBackup,
    sharedStash,
    setSharedStash,
    sharedStashTab,
    setSharedStashTab,
    sharedStashLoading,
    sharedStashError,
    refreshSharedStash,
    difficulty,
    setDifficulty,
    isGameRunning,
  };
}

