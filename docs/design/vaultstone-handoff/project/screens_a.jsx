/* global React, Ico */
const { useState: useSL } = React;

function Dashboard({ setScreen }) {
  const [hasImage, setHasImage] = useSL(true);
  return (
    <div className="content">
      {/* HERO: campaign cover image */}
      <div className="camp-hero">
        <div className={'camp-hero-img ' + (hasImage ? '' : 'empty')}>
          {hasImage ? (
            <div className="camp-hero-placeholder">
              <div className="chp-inner">
                <Ico name="sparkle" size={12} />
                <span>Placeholder cover</span>
              </div>
            </div>
          ) : (
            <button className="camp-hero-empty" onClick={() => setHasImage(true)}>
              <Ico name="upload" size={18} />
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>Add a campaign cover</div>
                <div className="faint" style={{ fontSize: 12 }}>Drag an image here or click to upload · recommended 2100 × 900</div>
              </div>
            </button>
          )}
          <div className="camp-hero-scrim" />
          <div className="camp-hero-overlay">
            <div className="camp-hero-kicker">Campaign · 12 sessions · 4 players</div>
            <div className="camp-hero-title">Shadows Over Eldoria</div>
            <div className="camp-hero-sub"><span className="mark">Age of Fire</span> · 218 CY · Session 14 this Saturday</div>
          </div>
          <div className="camp-hero-actions">
            <button className="btn-ghost" onClick={() => setHasImage(!hasImage)}>
              <Ico name={hasImage ? 'pencil' : 'upload'} size={12} /> {hasImage ? 'Change cover' : 'Add cover'}
            </button>
            <button className="btn-primary"><Ico name="play" size={12} /> Start Session</button>
          </div>
        </div>
      </div>

      <div className="screen-pad" style={{ paddingTop: 24 }}>
        {/* QUICK-ACCESS: PARTY + NEXT SESSION */}
        <div className="home-pin-row">
          <div className="home-pin home-pin-party">
            <div className="hp-head">
              <div className="hp-kicker"><Ico name="users" size={12} /> The Party · Level 5</div>
              <button className="btn-ghost" onClick={() => setScreen('players')}>
                Manage Players <Ico name="arrowRight" size={11} />
              </button>
            </div>
            <div className="hp-party-grid">
              {window.VS_DATA.party.map(pc => {
                const pct = Math.round(pc.hp / pc.hpMax * 100);
                const hpCls = pct < 30 ? 'crit' : pct < 60 ? 'warn' : '';
                return (
                  <div key={pc.id} className="hp-pc" onClick={() => setScreen('players')}>
                    <div className="hp-pc-av" style={{ background: pc.color }}>{pc.initials}</div>
                    <div className="hp-pc-info">
                      <div className="hp-pc-name">{pc.name}</div>
                      <div className="hp-pc-class">{pc.race} · {pc.class.split(' (')[0]}</div>
                      <div className="hp-pc-stats">
                        <span><b>{pc.hp}</b>/{pc.hpMax} HP</span>
                        <span>AC {pc.ac}</span>
                      </div>
                      <div className="hp-hp-bar"><div className={'fill ' + hpCls} style={{ width: pct + '%' }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="home-pin home-pin-session">
            <div className="hp-head">
              <div className="hp-kicker"><Ico name="calendar" size={12} /> Next Session · Saturday 8 PM</div>
              <div className="hp-countdown">in 3 days</div>
            </div>
            <div className="hp-session-title">Session 14 — Into the Citadel</div>
            <div className="hp-session-sub">
              Party approaches the <span className="mention">Shattered Citadel</span>. Prep NPC: <span className="mention">Malakor</span>'s first appearance. 3 encounters drafted.
            </div>
            <div className="hp-session-chips">
              <div className="hpc"><Ico name="mapPin" size={10} /> Shattered Citadel</div>
              <div className="hpc"><Ico name="skull" size={10} /> Lord Malakor</div>
              <div className="hpc"><Ico name="swords" size={10} /> 3 encounters</div>
              <div className="hpc"><Ico name="dice" size={10} /> 2 skill checks</div>
            </div>
            <div className="hp-session-actions">
              <button className="btn-primary" style={{ flex: 1 }}><Ico name="play" size={12} /> Start Session</button>
              <button className="btn-ghost"><Ico name="scroll" size={12} /> Session Notes</button>
            </div>
          </div>
        </div>

        {/* OPENING DESCRIPTION */}
        <div className="camp-intro">
          <div className="camp-intro-label">Opening · Read-aloud</div>
          <div className="camp-intro-body">
            The Solar Kings are three generations dead. Their citadel sleeps in ruin on the cliffs of Northmarch, and the crown they wore has not been seen since the night of the Fall. In the grey years since, the <span className="mention">Iron Circle</span> has held the peace through discipline and fear — but rumors drift down from the Void Peaks of a regent with no shadow, and the <span className="mention">Order of the Burning Chalice</span> has begun to arm its novices.
            <br /><br />
            You are adventurers in a world that is quietly, politely, coming apart. The question is not whether something will break. The question is where you will be standing when it does.
          </div>
          <div className="camp-intro-meta">
            <span><Ico name="dice" size={11} /> D&D 5e</span>
            <span><Ico name="users" size={11} /> Level 4 party</span>
            <span><Ico name="clock" size={11} /> Edited 3h ago by you</span>
            <span className="grow" />
            <button className="btn-ghost" style={{ padding: '4px 10px' }}><Ico name="edit" size={11} /> Edit</button>
          </div>
        </div>

        {/* OVERARCHING WORLD INFO */}
        <div className="world-head">
          <h2 className="world-head-title">The World</h2>
          <div className="world-head-sub">Overarching lore — shared context for every session</div>
          <div className="grow" />
          <button className="btn-ghost"><Ico name="plus" size={12} /> Add Section</button>
        </div>

        <div className="world-grid">
          {[
            { icon: 'globe', title: 'Setting & Geography', body: 'Eldoria is a shattered continent ringed by storm-seas. Three regions remain inhabited: Northmarch (cold, feudal), Azure Coast (mercantile), Ember Wastes (lawless).', tag: 'Player-visible', visible: true, link: 'map' },
            { icon: 'crown', title: 'History in Brief', body: 'Three eras mark the chronicle. The Age of Ash ended with the Shattering. The Age of Fire rose with the Solar Kings and fell with their crown. The Age of Silence is now.', tag: 'Player-visible', visible: true, link: 'timeline' },
            { icon: 'shield', title: 'Powers & Factions', body: 'Six factions move the world. The Iron Circle holds the law. The Chalice holds the faith. The Kaedon Pact holds the coin. Others hold older things.', tag: 'Player-visible', visible: true, link: 'factions' },
            { icon: 'sparkle', title: 'Magic & Cosmology', body: 'Magic flows through leylines scarred by the Shattering. Spellcasters pay in memory. The Void is not a place but a hunger with a shape.', tag: 'Player-visible', visible: true },
            { icon: 'scroll', title: 'Themes & Tone', body: 'Quiet decay, moral ambiguity, inherited guilt. Horror is implied, not shown. Victories cost. No one is purely evil except the Void.', tag: 'GM Only', visible: false },
            { icon: 'dice', title: 'House Rules', body: 'Inspiration refreshes on a critical failure. Long rests require safety. Death saves are rolled in secret. Flanking gives advantage.', tag: 'Player-visible', visible: true },
          ].map((s, i) => (
            <div key={i} className="world-card" onClick={() => s.link && setScreen(s.link)}>
              <div className="world-card-head">
                <div className="world-card-icon"><Ico name={s.icon} size={18} /></div>
                <div className="grow">
                  <div className="world-card-title">{s.title}</div>
                  <div className={'world-card-vis ' + (s.visible ? 'player' : 'gm')}>
                    <Ico name={s.visible ? 'eye' : 'eyeOff'} size={10} /> {s.tag}
                  </div>
                </div>
                <button className="world-card-more"><Ico name="more" size={14} /></button>
              </div>
              <div className="world-card-body">{s.body}</div>
              {s.link && <div className="world-card-link">Open <Ico name="arrowRight" size={11} /></div>}
            </div>
          ))}
          <button className="world-card world-card-add">
            <Ico name="plusCircle" size={22} />
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 500, marginTop: 8 }}>New Section</div>
            <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>Pantheon, calendar, languages…</div>
          </button>
        </div>

        {/* LIVE / RECENT — kept but renamed and slightly tightened */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginTop: 32 }}>
          <div>
            <div className="npc-section">
              <h3><Ico name="clock" size={16} /> Since you were last here</h3>
              <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                {[
                  ['Kira edited', 'Shattered Citadel', '14 min ago', 'pencil'],
                  ['Lyra commented on', 'Siege of Northfall', '2h ago', 'scroll'],
                  ['You added pin to', 'Northmarch Region', 'Yesterday', 'mapPin'],
                  ['Thorn created', 'Whispering Woods', '2 days ago', 'tree'],
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6 }}>
                    <Ico name={r[3]} size={14} />
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <span className="faint">{r[0]}</span> <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>{r[1]}</span>
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>{r[2]}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="npc-section">
              <h3><Ico name="star" size={16} /> Pinned</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 8 }}>
                {[
                  { title: 'Shattered Citadel', kind: 'LOCATION', icon: 'castle', go: 'wiki' },
                  { title: 'Lord Malakor', kind: 'NPC — GM ONLY', icon: 'skull', go: 'npcs' },
                  { title: 'Chronicle of Eldoria', kind: 'TIMELINE', icon: 'hourglass', go: 'timeline' },
                  { title: 'The Iron Circle', kind: 'FACTION', icon: 'shield', go: 'factions' },
                ].map((p, i) => (
                  <div key={i} onClick={() => setScreen(p.go)} style={{ padding: 14, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
                      <Ico name={p.icon} size={18} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 500 }}>{p.title}</div>
                      <div className="faint" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{p.kind}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="npc-section">
              <h3><Ico name="zap" size={16} /> At a Glance</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['12','Locations','locations'],['18','NPCs','npcs'],['6','Factions','factions'],['14','Events','timeline']].map(s => (
                  <div key={s[1]} onClick={() => setScreen(s[2])} style={{ padding: 10, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 500 }}>{s[0]}</div>
                    <div className="faint" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s[1]}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="npc-section">
              <h3><Ico name="users" size={16} /> Presence</h3>
              {window.VS_DATA.presence.slice(0, 4).map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
                  <div className={'p ' + p.role} style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: '#fff', background: p.role === 'gm' ? 'linear-gradient(135deg, #b66bff, #6d3ac4)' : p.role === 'p1' ? 'linear-gradient(135deg, #4ec8c0, #2a7a75)' : p.role === 'p2' ? 'linear-gradient(135deg, #e6a255, #a86a2a)' : 'linear-gradient(135deg, #e0566a, #a03040)' }}>{p.initials}</div>
                  <div>{p.name}</div>
                  <div className="faint" style={{ fontSize: 10, marginLeft: 'auto' }}>● online</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Locations({ setScreen, tweaks }) {
  const [filter, setFilter] = useSL('all');
  const items = window.VS_DATA.locations;
  const showIcon = tweaks.heading === 'icon';

  return (
    <div className="content">
      <div className="screen-pad">
        <div className="page-head">
          {showIcon && <div className="page-icon"><Ico name="mapPin" size={26} /></div>}
          <div>
            <div className="page-title">Locations</div>
            <div className="page-sub">Collection · 12 pages · World-level</div>
          </div>
          <div className="page-actions">
            <button className="btn-primary"><Ico name="plus" size={12} /> New Location</button>
            <button className="btn-ghost"><Ico name="upload" size={12} /> Upload Map</button>
          </div>
        </div>

        <div className="filter-bar">
          {[['all','All'],['hasmap','Has Map'],['visible','Visible to Players'],['gm','GM Only'],['recent','Recently Edited']].map(([k,l]) => (
            <button key={k} className={'chip ' + (filter === k ? 'active' : '')} onClick={() => setFilter(k)}>{l}</button>
          ))}
          <div className="view-toggle">
            <button className="active" title="Grid"><Ico name="grip" size={12} /></button>
            <button title="List"><Ico name="scroll" size={12} /></button>
          </div>
        </div>

        <div className={'cards-grid'} style={tweaks.density === 'compact' ? { gridTemplateColumns: 'repeat(5, 1fr)' } : {}}>
          {items.map(it => (
            <div key={it.id} className={'card ' + (it.hero ? 'hero' : '')} onClick={() => setScreen('wiki')}>
              <div className="card-image">
                <div className="placeholder">{it.image ? `[ ${it.name} — hero ]` : ''}</div>
                <div className={'card-visibility ' + it.visibility}>
                  <Ico name={it.visibility === 'player' ? 'eye' : 'eyeOff'} size={12} />
                </div>
                {it.hero && <div className="grad" />}
              </div>
              <div className="card-body">
                <div className="card-kicker">
                  <div className="k-icon"><Ico name={it.icon} size={12} /></div>
                  <div className="k-meta">{it.updated || ''}</div>
                </div>
                <div className="card-title">{it.name}</div>
                <div className="card-desc">{it.desc}</div>
                {it.hero && (
                  <div className="card-tags" style={{ marginTop: 10 }}>
                    <span className="tag">REGION: {it.region.toUpperCase()}</span>
                    <span className="tag">POP: {it.pop}</span>
                    <span className="tag">{it.climate.toUpperCase()}</span>
                  </div>
                )}
                {!it.hero && it.tags && (
                  <div className="card-tags">
                    {it.tags.map(t => {
                      const cls = t === 'GM Only' ? 'gm' : t.toLowerCase().includes('danger') ? 'danger' : '';
                      return <span key={t} className={'tag ' + cls}>{t}</span>;
                    })}
                  </div>
                )}
                {it.progress != null && (
                  <>
                    <div className="card-progress-label"><span>Quest Progress</span><span>{it.progress}%</span></div>
                    <div className="card-progress"><div className="bar" style={{ width: it.progress + '%' }} /></div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, Locations });
