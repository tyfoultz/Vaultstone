/* global React, Ico */
const { useState: useSF } = React;

function Factions({ setScreen }) {
  const [selected, setSelected] = useSF('iron');
  const factions = window.VS_DATA.factions;
  const edges = window.VS_DATA.factionEdges;
  const sel = factions.find(f => f.id === selected);

  const pos = (id) => factions.find(f => f.id === id);
  const edgeColor = (t) => t === 'ally' ? 'rgba(78,200,192,0.6)' : t === 'enemy' ? 'rgba(224,86,106,0.6)' : 'rgba(110,107,130,0.4)';
  const edgeDash = (t) => t === 'neutral' ? '3 3' : 'none';

  return (
    <div className="main">
      <TopBar crumbs={['Factions', 'Relationship Graph']} actions={
        <>
          <button className="btn-ghost"><Ico name="filter" size={12} /> Layer</button>
          <button className="btn-primary"><Ico name="plus" size={12} /> New Faction</button>
        </>
      } />
      <div className="content" style={{ padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', height: '100%' }}>
          <div style={{ position: 'relative', background: 'radial-gradient(ellipse at center, #141422 0%, #0a0a14 80%)', overflow: 'hidden' }}>
            {/* background grid */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.08) 1px, transparent 1px)', backgroundSize: '32px 32px', opacity: 0.5 }} />

            {/* legend */}
            <div style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(17,17,25,0.85)', backdropFilter: 'blur(12px)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, fontSize: 11, color: 'var(--text-2)', display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>Relationship</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 18, height: 2, background: '#4ec8c0' }} /> Ally</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 18, height: 2, background: '#e0566a' }} /> Enemy</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 18, height: 2, background: '#6e6b82', borderTop: '1px dashed' }} /> Neutral</div>
            </div>

            {/* edges svg */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {edges.map(([a, b, t], i) => {
                const pa = pos(a), pb = pos(b);
                if (!pa || !pb) return null;
                return <line key={i} x1={pa.x + '%'} y1={pa.y + '%'} x2={pb.x + '%'} y2={pb.y + '%'}
                             stroke={edgeColor(t)} strokeWidth={2} strokeDasharray={edgeDash(t)} />;
              })}
            </svg>

            {/* faction nodes */}
            {factions.map(f => {
              const size = 40 + f.size * 3;
              return (
                <div key={f.id} onClick={() => setSelected(f.id)}
                     style={{ position: 'absolute', left: f.x + '%', top: f.y + '%', transform: 'translate(-50%, -50%)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-1)', border: `2px solid ${selected === f.id ? '#fff' : f.color}`, display: 'grid', placeItems: 'center', color: f.color, margin: '0 auto', boxShadow: selected === f.id ? `0 0 0 4px ${f.color}44, 0 8px 30px rgba(0,0,0,0.5)` : '0 4px 14px rgba(0,0,0,0.5)', transition: 'all .15s' }}>
                    <Ico name={f.sigil} size={size * 0.45} />
                  </div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 13, marginTop: 6, color: selected === f.id ? '#fff' : 'var(--text-2)', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{f.size} members</div>
                </div>
              );
            })}
          </div>

          <div style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--line)', padding: 20, overflowY: 'auto' }}>
            {sel && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-2)', border: `2px solid ${sel.color}`, display: 'grid', placeItems: 'center', color: sel.color }}>
                    <Ico name={sel.sigil} size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Faction</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500 }}>{sel.name}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Members</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500 }}>{sel.size}</div>
                  </div>
                  <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Influence</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500 }}>{sel.id === 'iron' ? 'High' : 'Medium'}</div>
                  </div>
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Motto</div>
                <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--text)', padding: '10px 14px', borderLeft: '2px solid ' + sel.color, marginBottom: 14 }}>
                  "{sel.id === 'iron' ? 'Let order outlast us all.' : sel.id === 'chalice' ? 'Burn the lies that bind us.' : sel.id === 'solar' ? 'The sun will rise again.' : 'The tide remembers.'}"
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Overview</div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                  Emerged in the wake of the Solar collapse. Originally a pact between survivors; now a ruthless political machine headquartered in Iron Keep.
                </p>

                <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '18px 0 8px' }}>Relationships</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {edges.filter(e => e[0] === sel.id || e[1] === sel.id).map((e, i) => {
                    const other = e[0] === sel.id ? e[1] : e[0];
                    const f = pos(other);
                    return (
                      <div key={i} onClick={() => setSelected(other)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />
                        <span style={{ flex: 1, color: 'var(--text)' }}>{f.name}</span>
                        <span className="tag" style={{ color: e[2] === 'ally' ? 'var(--player)' : e[2] === 'enemy' ? 'var(--danger)' : 'var(--text-3)', borderColor: 'currentColor', background: 'transparent' }}>{e[2].toUpperCase()}</span>
                      </div>
                    );
                  })}
                </div>

                <button className="btn-primary" style={{ width: '100%', marginTop: 18 }}>Open Full Entry</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TweaksPanel({ tweaks, setTweaks, onClose }) {
  const K = (name, children) => (
    <div className="tp-group">
      <div className="tp-label">{name}</div>
      {children}
    </div>
  );
  const accents = [
    ['#8b5cf6', 'Violet'],
    ['#4ec8c0', 'Teal'],
    ['#e6a255', 'Amber'],
    ['#e0566a', 'Crimson'],
    ['#6b8af0', 'Azure'],
  ];
  return (
    <div className="tweaks-panel">
      <div className="tp-head">
        <Ico name="gear" size={14} />
        <div className="tp-title">Tweaks</div>
        <button className="tp-close" onClick={onClose}><Ico name="x" size={14} /></button>
      </div>
      {K('Accent color',
        <div className="tp-swatches">
          {accents.map(([c, l]) => (
            <div key={c} className={'tp-swatch ' + (tweaks.accent === c ? 'active' : '')} style={{ background: c }} title={l}
                 onClick={() => { setTweaks({ ...tweaks, accent: c }); document.documentElement.style.setProperty('--accent', c); }} />
          ))}
        </div>
      )}
      {K('Sidebar density',
        <div className="tp-options">
          {['compact', 'cozy', 'comfortable'].map(d => (
            <button key={d} className={'tp-opt ' + (tweaks.sidebar === d ? 'active' : '')} onClick={() => setTweaks({ ...tweaks, sidebar: d })}>{d}</button>
          ))}
        </div>
      )}
      {K('Card grid density',
        <div className="tp-options">
          {[['cozy','Cozy'],['compact','Compact']].map(([k, l]) => (
            <button key={k} className={'tp-opt ' + (tweaks.density === k ? 'active' : '')} onClick={() => setTweaks({ ...tweaks, density: k })}>{l}</button>
          ))}
        </div>
      )}
      {K('Heading treatment',
        <div className="tp-options">
          {[['icon','With icon tile'],['plain','Plain serif']].map(([k, l]) => (
            <button key={k} className={'tp-opt ' + (tweaks.heading === k ? 'active' : '')} onClick={() => setTweaks({ ...tweaks, heading: k })}>{l}</button>
          ))}
        </div>
      )}
      {K('Map style',
        <div className="tp-options">
          {[['dark','Dark'],['parchment','Parchment'],['hex','Hex'],['tactical','Tactical']].map(([k, l]) => (
            <button key={k} className={'tp-opt ' + (tweaks.mapStyle === k ? 'active' : '')} onClick={() => setTweaks({ ...tweaks, mapStyle: k })}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Factions, TweaksPanel });
