import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { D2SParserAdapter } from '../adapters/D2SParserAdapter';
import { STORAGE_META } from '../domain/entities/Item';

import { InfiniteStashAdapter } from '../adapters/InfiniteStashAdapter';
import { emitToast } from './useToasts';
import { getItemDisplayName } from '../components/ItemSprite';

import { useUIStore } from '../stores/useUIStore';

const DEFAULT_SHARED_STASH_FILE = 'ModernSharedStashSoftCoreV2.d2i';

function isSharedStashBasename(filename) {
  return typeof filename === 'string'
    && filename.length > 0
    && !filename.includes('/')
    && !filename.includes('\\')
    && filename.toLowerCase().endsWith('.d2i');
}

export function useCharacterCompanion() {
  const activeFile = useUIStore((state) => state.activeFile);
  const setActiveFile = useUIStore((state) => state.setActiveFile);
  const sharedStashFile = useUIStore((state) => state.sharedStashFile);
  const setSharedStashFile = useUIStore((state) => state.setSharedStashFile);
  const activeTab = useUIStore((state) => state.activeTab);

  const [charData, setCharData]     = useState(null);
  const [saveFiles, setSaveFiles]   = useState([]);
  const [syncedAt, setSyncedAt]     = useState(null);
  const [syncing, setSyncing]       = useState(false);
  const [loadError, setLoadError]   = useState(null);
  
  const [vaultFilters, setVaultFilters] = useState(null);

  const {
    data: vaultData,
    fetchNextPage,
    hasNextPage,
    isFetching: vaultLoading,
    error: vaultErrorObj,
  } = useInfiniteQuery({
    queryKey: ['vault', vaultFilters],
    queryFn: ({ pageParam = null }) => InfiniteStashAdapter.list(vaultFilters || {}, { cursor: pageParam, limit: 100 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: vaultFilters !== null,
  });

  const vaultItems = useMemo(() => vaultData ? vaultData.pages.flatMap(p => p.items) : [], [vaultData]);
  const vaultTotal = vaultData ? vaultData.pages[0]?.total ?? 0 : 0;
  const vaultNextCursor = hasNextPage ? vaultData.pages[vaultData.pages.length - 1].nextCursor : null;
  const vaultError = vaultErrorObj ? vaultErrorObj.message : null;

  const { data: vaultCountData, error: vaultCountErrorObj } = useQuery({
    queryKey: ['vaultCount'],
    queryFn: async () => {
      const res = await InfiniteStashAdapter.count();
      return res.total;
    }
  });
  const vaultCount = vaultCountData ?? null;
  const vaultCountError = vaultCountErrorObj?.message ?? null;

  const { data: vaultFacetsData } = useQuery({
    queryKey: ['vaultFacets'],
    queryFn: () => InfiniteStashAdapter.facets(),
  });
  const vaultFacets = vaultFacetsData ?? { slots: [], sets: [], categories: [] };

  const queryClient = useQueryClient();

  const queryVault = useCallback(async (filters = {}) => {
    setVaultFilters(filters);
  }, []);

  const loadMoreVault = useCallback(() => {
    if (hasNextPage && !vaultLoading) {
      return fetchNextPage();
    }
    return Promise.resolve();
  }, [hasNextPage, vaultLoading, fetchNextPage]);

  const refreshVault = useCallback(async () => {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['vault'] }),
      queryClient.invalidateQueries({ queryKey: ['vaultCount'] }),
      queryClient.invalidateQueries({ queryKey: ['vaultFacets'] })
    ]);
  }, [queryClient]);

  const removeMutation = useMutation({
    mutationFn: ({ vaultId, reason }) => InfiniteStashAdapter.remove(vaultId, reason),
    onSuccess: () => refreshVault(),
  });

  const removeItemFromVault = useCallback(async (vaultId, reason = 'delete') => {
    await removeMutation.mutateAsync({ vaultId, reason });
  }, [removeMutation]);

  const transferInFlight = useRef(new Set());
  const [movingItemKeys, setMovingItemKeys] = useState(() => new Set());
  const itemLabel = useCallback((item) => getItemDisplayName(item) || item?.type_name || item?.type || 'item', []);
  const vaultMountedRef = useRef(true);
  const { data: sharedStashData, error: sharedStashErrorObj, isFetching: sharedStashLoading, refetch: refreshSharedStashQuery } = useQuery({
    queryKey: ['sharedStash', sharedStashFile],
    queryFn: async () => {
      if (!isSharedStashBasename(sharedStashFile)) {
        throw new Error('Shared stash file must be a .d2i basename');
      }
      return await D2SParserAdapter.fetchSharedStash(sharedStashFile);
    },
    enabled: !!sharedStashFile,
  });

  const sharedStash = sharedStashData ?? null;
  const sharedStashLoadedFile = sharedStashData ? sharedStashFile : null;
  const sharedStashError = sharedStashErrorObj?.message ?? null;

  // Compatibility no-ops for components that still try to set these manually
  const setSharedStashLoadedFile = useCallback(() => {}, []);
  const setSharedStashError = useCallback(() => {}, []);

  const refreshSharedStash = useCallback(async (filename) => {
    if (filename !== undefined) {
      useUIStore.getState().setSharedStashFile(filename);
    }
    return refreshSharedStashQuery();
  }, [refreshSharedStashQuery]);

  // We no longer need setSharedStash since it's driven by React Query. 
  // However, local optimistic updates in mutations will update the query cache.
  const setSharedStash = useCallback((updater) => {
    queryClient.setQueryData(['sharedStash', sharedStashFile], updater);
  }, [queryClient, sharedStashFile]);

  useEffect(() => {
    if (!sharedStashFile) {
      useUIStore.getState().setSharedStashFile(DEFAULT_SHARED_STASH_FILE);
    }
  }, [sharedStashFile]);

  const [isGameRunning, setIsGameRunning] = useState(false);

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

  // Trigger safe backup on server
  const triggerSaveBackup = useCallback(async (files = []) => {
    try {
      const params = new URLSearchParams();
      for (const file of files) if (file) params.append('file', file);
      const query = params.toString();
      const res = await fetch(`/__d2s_backup${query ? `?${query}` : ''}`);
      return await res.json();
    } catch (err) {
      console.error('Backup request failed:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const depositMutation = useMutation({
    mutationFn: async ({ item, sourceName }) => {
      const itemId = item?.id ?? item?.item_seed;
      const transferKey = `deposit:${sourceName || activeFile || 'uploaded'}:${itemId ?? item?.rawBytesHex ?? ''}`;
      if (transferInFlight.current.has(transferKey)) return;
      transferInFlight.current.add(transferKey);
      setMovingItemKeys((current) => new Set(current).add(transferKey));
      try {
        if (isGameRunning) {
          emitToast('D2R is running - exit the game before moving items.', 'error');
          return;
        }
        if (sourceName === '__shared_stash__' && sharedStashFile !== sharedStashLoadedFile) {
          emitToast('Shared Stash is not ready for edits; refresh the selected file first.', 'error');
          return;
        }
        // 1. Perform automated backup first
        const backup = await triggerSaveBackup(sourceName === '__shared_stash__' ? [sharedStashFile] : [activeFile]);
        if (!backup?.success) {
          emitToast(`Backup failed; no files were changed. ${backup?.error || ''}`, 'error');
          return;
        }

        // Persist and journal the item before changing its source save. A failure can duplicate, never lose, the item.
        const label = sourceName === '__shared_stash__'
          ? `Shared Stash (${sharedStashFile || DEFAULT_SHARED_STASH_FILE})`
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
          if (err.status === 409 && sourceName === '__shared_stash__' && sharedStashFile) {
            try {
              const reconciled = await D2SParserAdapter.removeItemFromSharedStash(sharedStashFile, item);
              if (reconciled.success && reconciled.itemRemoved) {
                if (reconciled.stash) setSharedStash(reconciled.stash);
                emitToast(`Reconciled “${itemLabel(item)}” and removed the duplicate from Shared Stash`, 'success');
                return;
              }
            } catch (reconcileError) {
              console.error('Failed to reconcile existing vault item:', reconcileError);
            }
          }
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

        // 3. Remove item from the selected shared stash. Browser uploads are local-only.
        if (sourceName === '__shared_stash__') {
          if (!sharedStashFile) {
            setSharedStash((current) => current ? {
              ...current,
              pages: (current.pages || []).map((page) => ({
                ...page,
                items: (page.items || []).filter((candidate) => item.id != null ? candidate.id !== item.id : candidate !== item),
              })),
            } : current);
          } else {
            try {
              const d2iRes = await D2SParserAdapter.removeItemFromSharedStash(sharedStashFile, item);
              if (!d2iRes.success) {
                console.error('removeItemFromSharedStash error detail:', d2iRes);
                emitToast('Failed to remove from Shared Stash: ' + (d2iRes.error || 'unknown error'), 'error');
                return;
              }
              if (!d2iRes.itemRemoved) {
                console.warn('Item not matched in .d2i file:', item);
                emitToast(`Item not found in Shared Stash file (X:${item.position_x ?? 0} Y:${item.position_y ?? 0} ${itemLabel(item)})`, 'error');
                return;
              }
              if (d2iRes.stash) setSharedStash(d2iRes.stash);
              if (d2iRes.itemBytesHex) item.rawBytesHex = d2iRes.itemBytesHex;
              try {
                await InfiniteStashAdapter.update(entry);
              } catch (updateError) {
                emitToast(`Item is safe in the vault, but raw-byte metadata update failed: ${updateError.message}`, 'error');
              }
            } catch (err) {
              emitToast('Failed to update Shared Stash file: ' + err.message, 'error');
              return;
            }
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

        emitToast(`Moved “${itemLabel(item)}” to Infinite Stash`, 'success');
      } finally {
        transferInFlight.current.delete(transferKey);
        setMovingItemKeys((current) => { const next = new Set(current); next.delete(transferKey); return next; });
      }
    },
    onSuccess: () => refreshVault(),
  });

  const depositItemToVault = useCallback(async (item, sourceName) => {
    await depositMutation.mutateAsync({ item, sourceName });
  }, [depositMutation]);

  const withdrawMutation = useMutation({
    mutationFn: async ({ vaultId, itemData }) => {
      if (isGameRunning) {
        emitToast('D2R is running - exit the game before moving items.', 'error');
        return;
      }

      if (!activeFile) {
        emitToast('Select a character save before withdrawing an item.', 'error');
        return;
      }

      const backup = await triggerSaveBackup([activeFile]);
      if (!backup?.success) {
        emitToast(`Backup failed; no files were changed. ${backup?.error || ''}`, 'error');
        return;
      }

      // 1. Intent phase
      try {
        await InfiniteStashAdapter.markPendingWithdraw(vaultId, 'withdraw');
      } catch (err) {
        emitToast(`Withdraw intent failed: ${err.message}`, 'error');
        return;
      }

      let actionSuccess = false;
      try {
        const res = await D2SParserAdapter.addItemToSave(activeFile, itemData);
        if (!res.success || !res.char) throw new Error(res.error || 'D2SSharp did not confirm item placement');
        setCharData(res.char);
        actionSuccess = true;
      } catch (err) {
        console.error('Failed to add item to save file:', err);
        emitToast(`Withdrawal failed; the item is pending recovery in the Vault. ${err.message}`, 'error');
        // Do not revert intent automatically; favor recoverable duplicate.
      }

      if (actionSuccess) {
        try {
          await removeItemFromVault(vaultId, 'withdraw');
          emitToast(`Moved “${itemLabel(itemData)}” to Personal Stash`, 'success');
        } catch (err) {
          emitToast(`Item was written to the save, but vault history update failed: ${err.message}`, 'error');
        }
      }
    },
    onSuccess: () => refreshVault(),
  });

  const withdrawItemFromVault = useCallback(async (vaultId, itemData) => {
    const key = `withdraw:${vaultId}`;
    if (transferInFlight.current.has(key)) return;
    transferInFlight.current.add(key);
    setMovingItemKeys((current) => new Set(current).add(key));
    try { await withdrawMutation.mutateAsync({ vaultId, itemData }); }
    finally {
      transferInFlight.current.delete(key);
      setMovingItemKeys((current) => { const next = new Set(current); next.delete(key); return next; });
    }
  }, [withdrawMutation]);

  const withdrawToSharedStashMutation = useMutation({
    mutationFn: async ({ vaultId, itemData }) => {
      if (isGameRunning) {
        emitToast('D2R is running - exit the game before moving items.', 'error');
        return;
      }
      if (!sharedStashFile || sharedStashLoadedFile !== sharedStashFile) {
        emitToast('Select a loaded disk-backed Shared Stash before withdrawing from the vault.', 'error');
        return;
      }

      const backup = await triggerSaveBackup([sharedStashFile]);
      if (!backup?.success) {
        emitToast(`Backup failed; no files were changed. ${backup?.error || ''}`, 'error');
        return;
      }

      // 1. Intent phase
      try {
        await InfiniteStashAdapter.markPendingWithdraw(vaultId, 'withdraw');
      } catch (err) {
        emitToast(`Withdraw intent failed: ${err.message}`, 'error');
        return;
      }

      let targetTabIdx = 0;
      let actionSuccess = false;
      try {
        const res = await D2SParserAdapter.addItemToSharedStash(sharedStashFile, itemData);
        if (!res.success) {
          throw new Error(res.error || res.message || 'Server failed to add item to shared stash');
        }
        if (res.stash) {
          setSharedStash(res.stash);
          targetTabIdx = res.targetTabIdx ?? 0;
        }
        actionSuccess = true;
      } catch (err) {
        emitToast('Failed to write to Shared Stash; item is pending recovery. ' + err.message, 'error');
        // Do not revert automatically.
      }

      // 3. Commit: Remove from Vault
      if (actionSuccess) {
        try {
          await removeItemFromVault(vaultId, 'withdraw');
          emitToast(`Moved “${itemLabel(itemData)}” to Shared Stash (Tab ${targetTabIdx + 1})`, 'success');
        } catch (err) {
          emitToast(`Item was written to Shared Stash, but vault history update failed: ${err.message}`, 'error');
        }
      }
    },
    onSuccess: () => refreshVault(),
  });

  const withdrawItemToSharedStash = useCallback(async (vaultId, itemData) => {
    const key = `withdraw:${vaultId}`;
    if (transferInFlight.current.has(key)) return;
    transferInFlight.current.add(key);
    setMovingItemKeys((current) => new Set(current).add(key));
    try { await withdrawToSharedStashMutation.mutateAsync({ vaultId, itemData }); }
    finally {
      transferInFlight.current.delete(key);
      setMovingItemKeys((current) => { const next = new Set(current); next.delete(key); return next; });
    }
  }, [withdrawToSharedStashMutation]);

  const recoverMutation = useMutation({
    mutationFn: async (vaultId) => {
      await InfiniteStashAdapter.recover(vaultId);
    },
    onSuccess: () => {
      refreshVault();
      emitToast('Item recovered successfully', 'success');
    },
    onError: (err) => {
      emitToast(`Failed to recover item: ${err.message}`, 'error');
    }
  });

  const recoverItemFromVault = useCallback(async (vaultId) => {
    await recoverMutation.mutateAsync(vaultId);
  }, [recoverMutation]);

  // Fetch list of files
  useEffect(() => {
    D2SParserAdapter.fetchList()
      .then((files) => {
        if (!vaultMountedRef.current) return;
        setSaveFiles(files);
        // If the store already has a valid activeFile, keep it
        if (activeFile && files.includes(activeFile)) return;
        const preferred = files.find((f) => f.toLowerCase().includes('furisorc')) || files[0];
        if (preferred) setActiveFile(preferred);
      })
      .catch(() => {});
  }, [activeFile, setActiveFile]);

  // Refresh active file from server
  const refreshFromServer = useCallback(async (file) => {
    if (!file) return;
    setSyncing(true);
    try {
      const data = await D2SParserAdapter.fetchRefresh(file);
      setCharData(data);
      setSyncedAt(new Date());
      refreshSharedStash();
      return data;
    } catch (err) {
      console.error('Refresh error:', err);
      setLoadError(`Could not load ${file}: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, [refreshSharedStash]);

  // HMR Hot Reload handling in Dev mode
  useEffect(() => {
    if (typeof import.meta.hot === 'undefined'
      || typeof import.meta.hot.on !== 'function'
      || typeof import.meta.hot.off !== 'function') return;
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
    saveFiles,
    syncedAt,
    syncing,
    refreshFromServer,
    handleFileUpload,
    storageItems,
    STORAGE_META,
    loadError,
    vaultItems,
    vaultTotal,
    vaultCount,
    vaultCountError,
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
    recoverItemFromVault,
    triggerSaveBackup,
    sharedStash,
    setSharedStash,
    sharedStashLoadedFile,
    setSharedStashLoadedFile,
    setSharedStashError,
    sharedStashLoading,
    sharedStashError,
    refreshSharedStash,
    isGameRunning,
    movingItemKeys,
  };
}

