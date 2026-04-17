/* global React, Ico */
const { useState: useST } = React;

function Timeline({ setScreen }) {
  return (
    <div className="main">
      <TopBar crumbs={['Timeline', 'Chronicle of Eldoria']} actions={
        <>
          <button className="btn-ghost"><Ico name="share" size={12} /> Share</button>
          <button className="btn-ghost"><Ico name="more" size={12} /></button>
        </>
      } />
      <div className="content">
        <div className="tl-wrap">
          <div className="page-head">
            <div className="page-icon"><Ico name="hourglass" size={26} /></div>
            <div>
              <div className="page-title">Chronicle of Eldoria</div>
              <div className="page-sub" style={{ marginTop: 10, display: 'flex', gap: 18 }}>
                <span>14 events</span>
                <span>3 eras</span>
                <span>Edited 3h ago</span>
              </div>
            </div>
            <div className="page-actions">
              <button className="btn-primary"><Ico name="plus" size={12} /> Add Event</button>
              <button className="btn-ghost"><Ico name="scroll" size={12} /> Import from Recap</button>
            </div>
          </div>

          <div className="tl-cal-summary">
            <Ico name="calendar" size={14} />
            <span className="label">Calendar</span>
            <span className="cur">Era</span><span className="sep">›</span>
            <span className="cur">Year</span><span className="sep">›</span>
            <span className="cur">Season</span><span className="sep">›</span>
            <span className="cur">Day</span>
            <div style={{ flex: 1 }} />
            <button className="btn-ghost" style={{ padding: '4px 8px' }}><Ico name="filter" size={12} /> Filter</button>
          </div>

          <div className="tl-eras">
            {window.VS_DATA.timeline.map(e => (
              <div key={e.era} className={'tl-era ' + (e.active ? 'active' : '')}>
                {e.era}
                <span className="era-range">{e.range}</span>
              </div>
            ))}
          </div>

          <div className="tl-track">
            <div className="tl-axis" />
            {window.VS_DATA.events.map((ev, i) => (
              <React.Fragment key={ev.id}>
                {i === 2 && (
                  <div className="tl-era-marker"><span className="chip">Age of Fire</span></div>
                )}
                <div className={'tl-event ' + ev.side}>
                  <div className="tl-card-line" />
                  <div className="tl-axis-mark">
                    <div className="tl-date-mark"><Ico name={ev.icon} size={14} /></div>
                    <div className="tl-node" />
                  </div>
                  <div className="tl-card" onClick={() => setScreen('wiki')}>
                    <div className="tl-kicker">
                      {ev.date}
                      <span className="drag"><Ico name="drag" size={12} /></span>
                    </div>
                    <div className="tl-title">{ev.title}</div>
                    <div className="tl-desc">{ev.desc}</div>
                    <div className="tl-tags">
                      {ev.tags.map(([cls, label]) => (
                        <span key={label} className={'tl-tag ' + cls}>{label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NPC({ setScreen }) {
  return (
    <div className="main">
      <TopBar crumbs={['NPCs', 'Lord Malakor']} actions={
        <>
          <button className="btn-ghost"><Ico name="share" size={12} /> Share</button>
          <button className="btn-ghost"><Ico name="edit" size={12} /> Edit</button>
        </>
      } />
      <div className="content">
        <div className="npc-wrap">
          <div className="npc-head">
            <div className="npc-portrait">[ PORTRAIT ]</div>
            <div>
              <div className="npc-name-row">
                <h1 className="npc-name">Lord Malakor</h1>
                <span className="tag gm">GM ONLY</span>
              </div>
              <div className="npc-title">The Hollow Regent of the Shattered Citadel</div>
              <div className="npc-stats">
                <div className="npc-stat"><div className="ns-label">Species</div><div className="ns-value">Human (undying)</div></div>
                <div className="npc-stat"><div className="ns-label">Role</div><div className="ns-value">Antagonist</div></div>
                <div className="npc-stat"><div className="ns-label">Threat</div><div className="ns-value danger">Legendary</div></div>
                <div className="npc-stat"><div className="ns-label">First Seen</div><div className="ns-value">Session 9</div></div>
                <div className="npc-stat"><div className="ns-label">Status</div><div className="ns-value">Active</div></div>
              </div>
            </div>
            <div className="page-actions">
              <button className="btn-primary"><Ico name="link" size={12} /> Add to Scene</button>
            </div>
          </div>

          <div className="npc-columns">
            <div>
              <div className="npc-section">
                <h3><Ico name="scroll" size={16} /> Description</h3>
                <p>A gaunt figure in ceremonial plate, Malakor appears younger than his 200 years. Skin the color of bleached parchment. Eyes like cold embers. Speaks softly, always — as if any louder would wake something.</p>
                <p>Was declared dead in the <span className="mention">Fall of the Solar Crown</span>. Evidence from <span className="mention">Session 9</span> suggests otherwise.</p>
              </div>

              <div className="npc-section">
                <h3><Ico name="dice" size={16} /> Mannerisms & Voice</h3>
                <p>Trails off mid-sentence when distracted by shadows. Refers to the party collectively as "little lanterns." Never sits.</p>
              </div>

              <div className="npc-section">
                <h3><Ico name="skull" size={16} /> Secrets <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--warn)', letterSpacing: '0.12em', textTransform: 'uppercase', marginLeft: 'auto' }}>GM Only</span></h3>
                <div className="secret">
                  <div className="sec-label"><Ico name="warn" size={11} /> Revelation — Act 3</div>
                  <div className="sec-text">Malakor is not the original. The real Malakor died in 201. The figure the party sees is a memory-echo bound to the Citadel's stones — and if the Citadel falls, so does he.</div>
                </div>
                <div className="secret">
                  <div className="sec-label"><Ico name="warn" size={11} /> Hook — Session 14</div>
                  <div className="sec-text">Offers the party a deal: retrieve the Solar Crown from the Oubliette in exchange for safe passage. He plans to betray them.</div>
                </div>
              </div>

              <div className="npc-section">
                <h3><Ico name="book" size={16} /> Notes</h3>
                <p>If players ask about his ring, they roll Insight DC 18. Success: they notice it's identical to the one on the statue in Session 6.</p>
              </div>
            </div>

            <div>
              <div className="npc-section">
                <h3><Ico name="heart" size={16} /> Relationships</h3>
                <div className="rel-list">
                  {[
                    ['Solar Line','family','deceased','Family'],
                    ['The Iron Matriarch','enemy','SV','Ally of convenience'],
                    ['Sister Velia','ally','SV','Former confessor'],
                    ['Kira','neutral','KM','Has met 2× — suspicious'],
                    ['Lyra','enemy','LY','Attacked in S9'],
                  ].map((r, i) => (
                    <div key={i} className="rel-row" onClick={() => setScreen('npcs')}>
                      <div className={'rel-avatar ' + r[1]}>{r[2]}</div>
                      <div>
                        <div className="rel-name">{r[0]}</div>
                        <div className="rel-type">{r[3]}</div>
                      </div>
                      <Ico name="chev" size={12} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="npc-section">
                <h3><Ico name="mapPin" size={16} /> Locations</h3>
                <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'grid', gap: 6 }}>
                  <div className="subpage"><Ico name="castle" size={14} /> Shattered Citadel <span style={{ marginLeft: 'auto' }} className="faint">Home</span></div>
                  <div className="subpage"><Ico name="mapPin" size={14} /> Old Temple <span style={{ marginLeft: 'auto' }} className="faint">Origin</span></div>
                </div>
              </div>

              <div className="npc-section">
                <h3><Ico name="hourglass" size={16} /> Timeline</h3>
                <div style={{ fontSize: 12, display: 'grid', gap: 8 }}>
                  {[['201 CY','Declared dead'],['S9','First appearance'],['S12','Offered the deal'],['S14','Next scheduled']].map((t, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', width: 44 }}>{t[0]}</div>
                      <div>{t[1]}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Timeline, NPC });
