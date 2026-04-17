/* global React, Ico */
const { useState: useSK } = React;

function Wiki({ setScreen }) {
  const [tab, setTab] = useSK('subpages');
  const [preview, setPreview] = useSK(null);

  const Mention = ({ type, children, id, deleted, player }) => {
    const cls = 'mention ' + (deleted ? 'deleted' : '') + ' ' + (player ? 'player' : '');
    return (
      <span className={cls} onMouseEnter={(e) => !deleted && setPreview({ id: id || children, x: e.clientX, y: e.clientY, children, type })}
            onMouseLeave={() => setPreview(null)} onClick={() => { if (id === 'npc') setScreen('npcs'); else if (id === 'event') setScreen('timeline'); }}>
        <svg className="m-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d={type === 'npc' ? 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' : type === 'event' ? 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2' : 'M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z'} /></svg>
        {children}
      </span>
    );
  };

  return (
    <div className="main">
      <TopBar crumbs={['Locations', 'Shattered Citadel']} actions={
        <>
          <button className="btn-ghost"><Ico name="share" size={12} /> Share</button>
          <button className="btn-ghost"><Ico name="more" size={12} /></button>
        </>
      } />
      <div className="content" style={{ padding: 0 }}>
        <div className="wiki-wrap">
          <div className="wiki-doc">
            <div className="takeover-banner">
              <Ico name="pencil" size={14} />
              <span><b>Kira</b> is editing this page — you're viewing read-only.</span>
              <button>Request Takeover</button>
            </div>

            <div className="wiki-doc-inner">
              <div className="wiki-head">
                <div className="wiki-icon"><Ico name="castle" size={36} /></div>
                <div style={{ flex: 1 }}>
                  <div className="wiki-title">Shattered Citadel</div>
                  <div className="wiki-meta">
                    <span className="m"><Ico name="mapPin" size={11} /> Location</span>
                    <span className="m"><Ico name="globe" size={11} /> World-level</span>
                    <span className="m player"><Ico name="eye" size={11} /> Visible to Players</span>
                    <span className="m"><Ico name="page" size={11} /> 3 sub-pages</span>
                  </div>
                </div>
              </div>

              <div className="infobox">
                <div className="info-cell">
                  <div className="ic-label">Region</div>
                  <div className="ic-value small">Northmarch</div>
                </div>
                <div className="info-cell">
                  <div className="ic-label">Population</div>
                  <div className="ic-value">8,000</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>souls</div>
                </div>
                <div className="info-cell">
                  <div className="ic-label">Climate</div>
                  <div className="ic-value small"><span className="tag" style={{ color: 'var(--player)', borderColor: 'rgba(78,200,192,0.3)', background: 'rgba(78,200,192,0.1)' }}>TEMPERATE</span></div>
                </div>
                <div className="info-cell">
                  <div className="ic-label">Ruler</div>
                  <div className="ruler-chip">Lord Malakor</div>
                </div>
              </div>

              <div className="tags-row">
                <span className="label">Tags</span>
                <span className="tag">ruined</span>
                <span className="tag">haunted</span>
                <span className="sep" />
                <span className="map-ref">Map reference · <a>Citadel Interior</a></span>
              </div>

              <h2 className="wiki-h2">Ancient History</h2>
              <p className="wiki-p lead">
                The foundations of the <Mention type="faction" id="faction">Order of the Burning Chalice</Mention> were laid during the zenith of the Third Era. It was once the beacon of sovereignty for the entire <Mention type="event" id="event">Siege of Northfall</Mention>.
              </p>

              <div className="blockquote">
                <div className="q">"The stones themselves bleed the memories of the fallen, a symphony of granite and ghost-light that refuses to dim even as the stars go cold."</div>
                <div className="attr">— <Mention type="npc" id="npc" player>Lord Malakor</Mention></div>
              </div>

              <p className="wiki-p">
                Travelers are warned to avoid the <Mention type="mapPin" deleted>Old Temple (deleted)</Mention>, as its essence has been reclaimed by the Void. The current architecture remains a skeletal reminder of what happens when ambition exceeds arcane capacity.
              </p>

              <div className="wiki-image">
                <div className="placeholder">[ CITADEL EXTERIOR — concept art placeholder · 16:9 ]</div>
                <div className="caption">The Citadel at dusk. Note the fissure through the west tower — widened considerably since the events of Session 9.</div>
              </div>

              <div className="inline-insert">
                <span className="insert-cursor">@</span>
                <div className="insert-menu">
                  <div className="im-head">Insert reference</div>
                  <div className="im-item selected"><Ico name="page" size={14} /> Page</div>
                  <div className="im-item"><Ico name="user" size={14} /> PC / NPC</div>
                  <div className="im-item"><Ico name="mapPin" size={14} /> Map Pin</div>
                  <div className="im-item"><Ico name="hourglass" size={14} /> Timeline Event</div>
                  <div className="im-item"><Ico name="shield" size={14} /> Faction</div>
                </div>
              </div>

              <h2 className="wiki-h2" style={{ marginTop: 80 }}>Current State</h2>
              <p className="wiki-p">
                In the aftermath of the <Mention type="event">Fall of the Solar Crown</Mention>, the citadel has become a place that feeds on memory. Those who linger too long find themselves speaking in voices not their own.
              </p>
            </div>
          </div>

          {preview && (
            <div className="mention-preview" style={{ left: Math.min(preview.x + 12, window.innerWidth - 300), top: preview.y + 12 }}>
              <div className="mp-kicker">{preview.type === 'npc' ? 'NPC · GM NOTES LINKED' : preview.type === 'event' ? 'TIMELINE EVENT · 115 CY' : 'REFERENCE'}</div>
              <div className="mp-title">{preview.children}</div>
              <div className="mp-desc">{preview.type === 'npc' ? 'The Hollow Regent. Appears as a gaunt figure in ceremonial plate. Believed dead since 201 CY.' : 'A bloody three-month stalemate between the Iron Lords and the Frost-kin.'}</div>
            </div>
          )}

          <div className="wiki-right">
            <div className="wiki-right-tabs">
              <button className={'wr-tab ' + (tab === 'subpages' ? 'active' : '')} onClick={() => setTab('subpages')}>Sub-pages</button>
              <button className={'wr-tab ' + (tab === 'backlinks' ? 'active' : '')} onClick={() => setTab('backlinks')}>Backlinks</button>
              <button className={'wr-tab ' + (tab === 'history' ? 'active' : '')} onClick={() => setTab('history')}>History</button>
            </div>
            <div className="wr-body">
              {tab === 'subpages' && (
                <>
                  <div className="subpage"><div className="sp-icon"><Ico name="castle" size={14} /></div>Great Hall<div className="sp-arrow"><Ico name="chev" size={12} /></div></div>
                  <div className="subpage gm"><div className="sp-icon"><Ico name="eyeOff" size={14} /></div>Cursed Oubliette<div className="sp-arrow"><Ico name="chev" size={12} /></div></div>
                  <div className="subpage"><div className="sp-icon"><Ico name="book" size={14} /></div>Sewers of Despair<div className="sp-arrow"><Ico name="chev" size={12} /></div></div>
                  <div className="subpage gm"><div className="sp-icon"><Ico name="scroll" size={14} /></div>Ancient Scripts<div className="sp-arrow"><Ico name="chev" size={12} /></div></div>
                  <div className="subpage-add"><Ico name="plus" size={12} /> Add sub-page</div>

                  <div className="backlinks">
                    <div className="backlinks-label">Linked from</div>
                    <div className="backlink"><div className="bl-title">Lord Malakor</div><div className="bl-type">NPC · 3 mentions</div></div>
                    <div className="backlink"><div className="bl-title">Fall of the Solar Crown</div><div className="bl-type">Timeline Event</div></div>
                    <div className="backlink"><div className="bl-title">Order of the Burning Chalice</div><div className="bl-type">Faction · 1 mention</div></div>
                  </div>
                </>
              )}
              {tab === 'backlinks' && (
                <div>
                  <div className="backlinks-label">17 places reference this page</div>
                  {['Lord Malakor (NPC)', 'Fall of the Solar Crown (Event)', 'Siege of Northfall (Event)', 'The Iron Circle (Faction)', 'Session 9 Recap (Session)', 'Northmarch Region (Location)'].map(b => (
                    <div key={b} className="backlink"><div className="bl-title">{b.split(' (')[0]}</div><div className="bl-type">{b.match(/\((.+)\)/)[1]}</div></div>
                  ))}
                </div>
              )}
              {tab === 'history' && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                  {[['Kira','now','editing'],['You','14:32','added infobox'],['Lyra','2h ago','fixed typo'],['You','yesterday','created page']].map((h, i) => (
                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                      <b>{h[0]}</b> <span className="faint">{h[1]}</span>
                      <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 2 }}>{h[2]}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="wiki-right-foot">
              <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }}><Ico name="upload" size={12} /> Export Archive</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Wiki });
