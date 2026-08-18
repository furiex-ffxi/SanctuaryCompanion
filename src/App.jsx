import React from 'react';
import { useCharacterCompanion } from './hooks/useCharacterCompanion';
import { useToasts } from './hooks/useToasts';
import { CharacterStatsPanel } from './components/CharacterStatsPanel';
import { EquipmentPanel } from './components/EquipmentPanel';
import { StorageGrid } from './components/StorageGrid';
import { InfiniteStashPanel } from './components/InfiniteStashPanel';
import { SharedStashPanel } from './components/SharedStashPanel';
import { GlobalItemSearch } from './components/GlobalItemSearch';
import { containsCanonicalItem, planItemSearchNavigation } from './domain/search/itemSearchNavigation';


import './App.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught an error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#ff6666' }}>
          <h2>Warning: Something went wrong rendering Sanctuary Companion</h2>
          <pre style={{ textAlign: 'left', background: '#111', padding: 20, borderRadius: 6, overflowX: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <button className="btn-d2r" onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainContent />
    </ErrorBoundary>
  );
}

function MainContent() {
  const {
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
    loadError,
    refreshFromServer,
    handleFileUpload,
    activeStats,
    storageItems,
    STORAGE_META,
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
    triggerSaveBackup,
    sharedStash,
    sharedStashLoading,
    sharedStashError,
    refreshSharedStash,
    setSharedStash,
    sharedStashFile,
    setSharedStashFile,
    sharedStashLoadedFile,
    setSharedStashLoadedFile,
    setSharedStashError,
    sharedStashTab,
    setSharedStashTab,
    difficulty,
    setDifficulty,
    isGameRunning,
  } = useCharacterCompanion();

  const { toasts, addToast, dismissToast } = useToasts();
  const [searchHighlight, setSearchHighlight] = React.useState(null);
  const [vaultSearchQuery, setVaultSearchQuery] = React.useState('');
  const searchNavigationRef = React.useRef(0);

  // Sync tab selection with URL hash (#character, #inventory, #char-stash, #stash, #cube, #skills, #shared-stash, #infinite-stash)
  React.useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (!hash) return;

      if (['shared-stash', 'shared_stash', 'shared'].includes(hash)) {
        setMainTab('shared_stash');
      } else if (['infinite-stash', 'infinite_stash', 'vault', 'infinite', 'stash'].includes(hash)) {
        setMainTab('stash');
      } else if (['character', 'inventory', 'char-stash', 'char_stash', 'cube', 'skills'].includes(hash)) {
        setMainTab('character');
        const targetSub = ['char-stash', 'char_stash'].includes(hash) ? 'stash' : (hash === 'character' ? 'inventory' : hash);
        setActiveTab(targetSub);
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [setMainTab, setActiveTab]);

  const handleNavClick = (mTab, subTab) => {
    setMainTab(mTab);
    if (mTab === 'shared_stash') {
      window.history.pushState(null, '', '#shared-stash');
    } else if (mTab === 'stash') {
      window.history.pushState(null, '', '#infinite-stash');
    } else if (mTab === 'character') {
      const targetSub = subTab || activeTab || 'inventory';
      setActiveTab(targetSub);
      const hashLabel = targetSub === 'stash' ? 'char-stash' : targetSub;
      window.history.pushState(null, '', `#${hashLabel}`);
    }
  };

  const handleSearchSelect = async (result) => {
    const navigationId = ++searchNavigationRef.current;
    const plan = planItemSearchNavigation(result);
    setSearchHighlight(plan.highlight);
    window.setTimeout(() => setSearchHighlight((current) => current === result.identity ? null : current), 3500);
    if (result.sourceKind === 'character') {
      const refreshed = await refreshFromServer(plan.filename);
      if (navigationId !== searchNavigationRef.current) return;
      setActiveFile(plan.filename);
      setMainTab('character');
      setActiveTab(plan.subTab);
      if (plan.useAlternateWeapons) setIsSwapped(true);
      window.history.pushState(null, '', `#${result.navigation.subTab === 'stash' ? 'char-stash' : result.navigation.subTab || 'inventory'}`);
      if (!containsCanonicalItem(refreshed, result.identity)) addToast('That search result is stale; the item is no longer in the save.', 'error');
    } else if (result.sourceKind === 'sharedStash') {
      if (!plan.filename) {
        addToast('That Shared Stash search result has no filename.', 'error');
        return;
      }
      setSharedStashFile(plan.filename);
      const refreshed = await refreshSharedStash(plan.filename);
      if (navigationId !== searchNavigationRef.current) return;
      if (!refreshed) {
        addToast(`Could not load Shared Stash file ${plan.filename}.`, 'error');
        return;
      }
      const stale = !containsCanonicalItem(refreshed, result.identity);
      setSharedStashTab(plan.pageIndex ?? 0);
      setMainTab('shared_stash');
      window.history.pushState(null, '', '#shared-stash');
      addToast(stale
        ? 'That Shared Stash search result is stale; the item is no longer in the save.'
        : `Shared Stash: ${result.preview.displayName} is on Tab ${(result.pageIndex ?? 0) + 1}.`, stale ? 'error' : 'info');
    } else {
      setVaultSearchQuery(result.preview.displayName);
      setMainTab('stash');
      window.history.pushState(null, '', '#infinite-stash');
    }
  };
  return (
    <div className="app-container">
      <header>
        <div className="header-left">
          <h1>Sanctuary Companion</h1>
          <div className="subtitle">Diablo II: Resurrected - Live Character &amp; Stash Vault</div>
          
          <nav className="main-nav-tabs">
            <button
              className={`main-nav-btn ${mainTab === 'character' ? 'active' : ''}`}
              onClick={() => handleNavClick('character')}
            >
              Character Inspector
            </button>
            <button
              className={`main-nav-btn ${mainTab === 'shared_stash' ? 'active' : ''}`}
              onClick={() => handleNavClick('shared_stash')}
            >
              Shared Stash
            </button>
            <button
              className={`main-nav-btn ${mainTab === 'stash' ? 'active' : ''}`}
              onClick={() => handleNavClick('stash')}
              title={vaultCountError ? `Could not load Infinite Stash count: ${vaultCountError}` : undefined}
            >
              Infinite Stash ({vaultCount ?? (vaultCountError ? '?' : '…')})
            </button>
          </nav>
          {loadError && <div className="error-banner" role="alert">{loadError}</div>}
          {!charData && !loadError && <div className="loading-banner">Loading {activeFile || 'character save'}...</div>}
        </div>

        <div className="controls-row">
          <GlobalItemSearch sharedFile={sharedStashFile || ""} onSelect={handleSearchSelect} />
          {saveFiles.length > 0 && (
            <select
              className="header-control save-picker"
              value={activeFile || ''}
              onChange={(e) => setActiveFile(e.target.value)}
            >
              {saveFiles.map((f) => (
                <option key={f} value={f}>
                  {f.replace('.d2s', '')}
                </option>
              ))}
            </select>
          )}

          <div className="file-input-wrapper" title="Or load any .d2s file manually">
            <button className="header-control btn-d2r btn-secondary">Browse...</button>
            <input type="file" accept=".d2s" onChange={handleFileUpload} />
          </div>

          {syncedAt && (
            <span className="header-control sync-badge">
              Synced {syncedAt.toLocaleTimeString()}
            </span>
          )}

          {isGameRunning ? (
            <span className="header-control game-running-badge" title="Game is running - save/stash edits are locked">
              Game Running (Locked)
            </span>
          ) : (
            <span className="header-control game-idle-badge" title="Game is closed - full save/stash edit access active">
              Game Closed (Unlocked)
            </span>
          )}

          <button
            className={`header-control btn-d2r btn-refresh ${syncing ? 'spinning' : ''}`}
            title="Refresh from disk"
            onClick={() => refreshFromServer(activeFile)}
            disabled={!activeFile || syncing}
          >
            {syncing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      {isGameRunning && (
        <div className="game-running-warning-banner">
          <strong>Diablo II: Resurrected is currently running!</strong> Save files and Infinite Stash operations are disabled to prevent data corruption. Exit to the main menu or close D2R to enable moving items.
        </div>
      )}

      {mainTab === 'stash' ? (
        <InfiniteStashPanel
          vaultItems={vaultItems}
          vaultTotal={vaultTotal}
          vaultNextCursor={vaultNextCursor}
          vaultFacets={vaultFacets}
          vaultLoading={vaultLoading}
          vaultError={vaultError}
          onQuery={queryVault}
          onRefresh={refreshVault}
          onLoadMore={loadMoreVault}
          onRemove={removeItemFromVault}
          onBackupTrigger={triggerSaveBackup}
          isGameRunning={isGameRunning}
          onWithdraw={withdrawItemFromVault}
          onWithdrawShared={withdrawItemToSharedStash}
          highlightIdentity={searchHighlight}
          searchQuery={vaultSearchQuery}
          onSearchQueryChange={setVaultSearchQuery}
        />
      ) : mainTab === 'shared_stash' ? (
        <SharedStashPanel
          sharedStash={sharedStash}
          sharedStashLoading={sharedStashLoading}
          sharedStashError={sharedStashError}
          refreshSharedStash={refreshSharedStash}
          depositItemToVault={depositItemToVault}
          setSharedStash={setSharedStash}
          sharedStashFile={sharedStashFile}
          setSharedStashFile={setSharedStashFile}
          sharedStashLoadedFile={sharedStashLoadedFile}
          setSharedStashLoadedFile={setSharedStashLoadedFile}
          setSharedStashError={setSharedStashError}
          sharedStashTab={sharedStashTab}
          setSharedStashTab={setSharedStashTab}
          highlightIdentity={searchHighlight}
          isGameRunning={isGameRunning}
        />
      ) : (
        <div className="dashboard-grid">
          {/* Left Panel: Stats */}
          <CharacterStatsPanel charData={charData} activeStats={activeStats} difficulty={difficulty} setDifficulty={setDifficulty} />

          {/* Right Section */}
          <div className="visualizer-main">
            {/* Equipment layout */}
            <EquipmentPanel
              charData={charData}
              isSwapped={isSwapped}
              setIsSwapped={setIsSwapped}
              onDeposit={depositItemToVault}
            />

            {/* Storage / Skills tabs */}
            <div className="panel">
              <div className="inventory-tabs">
                {[
                  ['inventory', 'Inventory'],
                  ['stash', 'Stash'],
                  ['cube', 'Cube'],
                  ['skills', 'Skills'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`inv-tab ${activeTab === id ? 'active' : ''}`}
                    onClick={() => handleNavClick('character', id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'skills' ? (
                <div className="skills-grid">
                  {charData?.skills
                    ?.filter((s) => s.points > 0)
                    .map((skill, idx) => (
                      <div key={idx} className="skill-card">
                        <div className="skill-icon-placeholder">
                          {skill.name
                            .split(' ')
                            .map((w) => w[0])
                            .join('')
                            .slice(0, 3)
                            .toUpperCase()}
                        </div>
                        <div className="skill-details">
                          <div className="skill-name">{skill.name}</div>
                          <div className="skill-points">{skill.points} pts</div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <StorageGrid
                  highlightIdentity={searchHighlight}
                  meta={{
                    ...(STORAGE_META[activeTab] || STORAGE_META.inventory),
                    onDeposit: depositItemToVault,
                  }}
                  items={storageItems}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast notification container */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-dismiss" onClick={() => dismissToast(t.id)} aria-label="Dismiss">x</button>
          </div>
        ))}
      </div>
    </div>
  );
}
