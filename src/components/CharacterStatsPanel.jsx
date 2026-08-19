import React, { useMemo } from 'react';
import { useUIStore } from '../stores/useUIStore';
import { calculateCharacterStats } from '../domain/entities/Character';

const resColor = (v) => (v < 0 ? '#ff4444' : v >= 75 ? '#00ff00' : '#ffffff');
const fmtGold = (n) => (n || 0).toLocaleString();

export function CharacterStatsPanel({ charData }) {
  const isSwapped = useUIStore((state) => state.isSwapped);
  const difficulty = useUIStore((state) => state.difficulty);
  const setDifficulty = useUIStore((state) => state.setDifficulty);
  
  const activeStats = useMemo(() => calculateCharacterStats(charData, isSwapped, difficulty), [charData, isSwapped, difficulty]);

  const attrs = charData?.attributes || {};
  const level = attrs.level || charData?.header?.level || 1;
  const charClass = charData?.header?.class || 'Sorceress';
  const activeSets = activeStats?.activeSets || [];

  return (
    <div className="panel">
      <div className="char-title">
        <h2 className="char-name">{charData?.header?.name}</h2>
        <div className="char-class">Level {level} {charClass}</div>
      </div>

      <div className="panel-header">Attributes</div>
      {[
        ['Strength', activeStats?.strength ?? attrs.strength],
        ['Dexterity', activeStats?.dexterity ?? attrs.dexterity],
        ['Vitality', activeStats?.vitality ?? attrs.vitality],
        ['Energy', activeStats?.energy ?? attrs.energy],
      ].map(([k, v]) => (
        <div className="stat-row" key={k}>
          <span className="stat-label">{k}</span>
          <span className="stat-value">{v ?? 0}</span>
        </div>
      ))}

      <div className="panel-header" style={{ marginTop: 20 }}>Combat Stats</div>
      <div className="stat-row">
        <span className="stat-label">Magic Find</span>
        <span className="stat-value" style={{ color: '#00ff00' }}>{activeStats.mf}%</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Faster Cast Rate</span>
        <span className="stat-value">{activeStats.fcr}%</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Faster Hit Recovery</span>
        <span className="stat-value">{activeStats.fhr}%</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Gold (Inventory)</span>
        <span className="stat-value gold">{fmtGold(attrs.gold)}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Gold (Stash)</span>
        <span className="stat-value gold">{fmtGold(attrs.stashed_gold)}</span>
      </div>

      {activeSets.length > 0 && (
        <>
          <div className="panel-header" style={{ marginTop: 20 }}>Active Set Bonuses</div>
          <div className="active-sets-list">
            {activeSets.map((s, idx) => (
              <div key={idx} className="set-bonus-badge quality-set">
                <span className="set-name">{s.name} ({s.count} Pcs)</span>
                {s.bonuses?.map((b, i) => (
                  <div key={i} className="set-bonus-desc">{b}</div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="panel-header" style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Resistances</span>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          style={{
            background: '#1a1a1a',
            color: '#ffd700',
            border: '1px solid #ffd700',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: '0.9em',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <option value="normal">Normal</option>
          <option value="nightmare">Nightmare</option>
          <option value="hell">Hell</option>
        </select>
      </div>
      <div className="resist-grid">
        {[
          ['fire', 'Fire', activeStats.fr, activeStats.frTotal],
          ['cold', 'Cold', activeStats.cr, activeStats.crTotal],
          ['lightning', 'Lightning', activeStats.lr, activeStats.lrTotal],
          ['poison', 'Poison', activeStats.pr, activeStats.prTotal],
        ].map(([key, label, val, total]) => (
          <div key={key} className={`resist-card ${key}`}>
            <div className="resist-name">{label}</div>
            <div className="resist-value" style={{ color: resColor(val) }}>
              {val}%
              {total > val && (
                <span style={{ fontSize: '0.85em', opacity: 0.7, marginLeft: 4 }}>
                  ({total}%)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
