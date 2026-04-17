/* global React, Ico */
const { useState: useSW } = React;

function WorldMap({ tweaks }) {
  const [selected, setSelected] = useSW(null);
  const [filter, setFilter] = useSW('all');
  const pins = window.VS_DATA.pins;
  const filtered = filter === 'all' ? pins : pins.filter(p => p.type === filter);

  return (
    <div className="main">
      <TopBar crumbs={['World Map', 'Northmarch Region']} actions={
        <>
          <button className="btn-ghost"><Ico name="mapPin" size={12} /> Place Pin</button>
          <button className="btn-ghost"><Ico name="share" size={12} /> Share</button>
        </>
      } />
      <div className="content" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="map-wrap">
          <div className="map-canvas">
            <div className={'map-bg ' + tweaks.mapStyle}></div>

            {/* Faint continental shapes */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: tweaks.mapStyle === 'parchment' ? 0.5 : 0.18 }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M20 25 Q 30 10, 50 18 Q 70 22, 80 35 Q 85 50, 78 65 Q 70 80, 50 82 Q 30 80, 22 65 Q 15 45, 20 25 Z" fill={tweaks.mapStyle === 'parchment' ? '#d4c4a4' : '#1a1a2e'} stroke={tweaks.mapStyle === 'parchment' ? '#3a2817' : '#2a2a45'} strokeWidth="0.3" />
              <path d="M35 48 Q 45 42, 55 48 Q 60 58, 50 65 Q 40 62, 35 48 Z" fill="none" stroke={tweaks.mapStyle === 'parchment' ? '#7a5833' : 'rgba(139,92,246,0.3)'} strokeWidth="0.2" strokeDasharray="1 1" />
              <text x="50" y="52" textAnchor="middle" fill={tweaks.mapStyle === 'parchment' ? '#3a2817' : 'rgba(230, 230, 240, 0.2)'} fontSize="3" fontFamily="var(--display)" fontStyle="italic">NORTHMARCH</text>
            </svg>

            <div className="map-filters">
              {[['all','All (23)'],['city','City (5)'],['landmark','Landmark (7)'],['npc','NPC (3)'],['faction','Faction HQ (2)'],['quest','Quest (6)']].map(([k,l]) => (
                <button key={k} className={'chip ' + (filter === k ? 'active' : '')} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>

            <div className="zoom-ctl">
              <button><Ico name="plus" size={14} /></button>
              <div className="zoom-label">78%</div>
              <button><Ico name="chevDown" size={14} /></button>
              <div style={{ height: 1, background: 'var(--line)', margin: '2px 4px' }} />
              <button title="Layers"><Ico name="layers" size={14} /></button>
              <button title="Search"><Ico name="search" size={14} /></button>
            </div>

            {filtered.map(p => (
              <div key={p.id} className={'pin ' + p.type + (selected === p.id ? ' selected' : '') + (p.id === 'malakor' ? ' pulse' : '')}
                   style={{ left: p.x + '%', top: p.y + '%' }}
                   onClick={() => setSelected(p.id)}>
                <div className="pin-dot">
                  <Ico name={p.type === 'city' ? 'castle' : p.type === 'landmark' ? 'mountain' : p.type === 'npc' ? 'user' : p.type === 'faction' ? 'shield' : 'star'} size={12} />
                </div>
                <div className="pin-label">{p.label}</div>
              </div>
            ))}
          </div>

          <div className="map-sidepanel">
            <div className="map-sp-head">Sub-maps</div>
            <div className="submap-list">
              <div className="submap citadel"><div className="sm-bg"></div><div className="sm-label">Citadel</div></div>
              <div className="submap under"><div className="sm-bg"></div><div className="sm-label">Underdark</div></div>
              <div className="submap docks"><div className="sm-bg"></div><div className="sm-label">Docks</div></div>
              <div className="submap" style={{ borderStyle: 'dashed', color: 'var(--text-3)' }}>
                <Ico name="plus" size={16} /> <div className="sm-label" style={{ fontSize: 9 }}>Add</div>
              </div>
            </div>

            {selected ? (() => {
              const p = pins.find(x => x.id === selected);
              return (
                <div className="pin-preview">
                  <div className="pp-kicker">{p.type.toUpperCase()} · NORTHMARCH</div>
                  <div className="pp-title">{p.label}</div>
                  <div className="pp-desc">{p.id === 'malakor' ? 'The Hollow Regent. Believed dead; evidence suggests otherwise.' : p.id === 'citadel' ? 'Ruined seat of the Solar Kings. High danger.' : 'Click to open wiki entry for this location.'}</div>
                  <div className="pp-meta">
                    <span className="tag player">PLAYER-VISIBLE</span>
                    {p.id === 'malakor' && <span className="tag danger">GM ONLY</span>}
                  </div>
                  <div className="pp-actions">
                    <button className="btn-primary" style={{ flex: 1 }}>Open Entry</button>
                    <button className="btn-ghost"><Ico name="more" size={12} /></button>
                  </div>
                </div>
              );
            })() : (
              <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '16px 0', lineHeight: 1.6 }}>
                <div className="map-sp-head" style={{ marginTop: 8 }}>Pin legend</div>
                {[['city','City'],['landmark','Landmark'],['npc','NPC location'],['faction','Faction HQ'],['quest','Quest marker']].map(([k,l]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <div className={'pin ' + k} style={{ position: 'relative', transform: 'none' }}>
                      <div className="pin-dot" style={{ width: 18, height: 18 }}>
                        <Ico name={k === 'city' ? 'castle' : k === 'landmark' ? 'mountain' : k === 'npc' ? 'user' : k === 'faction' ? 'shield' : 'star'} size={8} />
                      </div>
                    </div>
                    <span>{l}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }} className="map-sp-head">
                  Tip
                </div>
                <div>Click anywhere on the map to drop a new pin. Click a pin to see its details and jump to the wiki entry.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { WorldMap });
