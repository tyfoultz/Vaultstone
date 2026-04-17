/* global React, Ico */
const { useState: useSF } = React;

// ============= PLAYERS SCREEN =============
function mod(val) {
  const m = Math.floor((val - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}

function PCCard({ pc, showIcon }) {
  const hpPct = Math.round(pc.hp / pc.hpMax * 100);
  const hpCls = hpPct < 30 ? 'crit' : hpPct < 60 ? 'warn' : '';
  return (
    <div className="pc-card">
      <div className="pc-top">
        <div className="pc-portrait" style={{ background: pc.color }}>{pc.initials}</div>
        <div className="pc-headline">
          <div className="pc-name-row">
            <div className="pc-name">{pc.name}</div>
            <div className="pc-player">played by {pc.player}</div>
            <div className="pc-level-badge"><Ico name="zap" size={10} /> Lv {pc.level}</div>
          </div>
          <div className="pc-subline">{pc.race} · {pc.class} · {pc.alignment} · {pc.bg}</div>
          <div className="pc-subline" style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
            XP {pc.xp.toLocaleString()} / {pc.xpNext.toLocaleString()}
          </div>
        </div>
        <div className="pc-actions">
          <button className="btn-ghost" title="View full sheet"><Ico name="scroll" size={12} /> Sheet</button>
          <button className="btn-ghost" title="Message player"><Ico name="edit" size={12} /></button>
          <button className="btn-ghost" title="More"><Ico name="more" size={12} /></button>
        </div>
      </div>

      <div className="pc-vitals">
        <div className="pc-vital">
          <div className="pv-lbl">Hit Points</div>
          <div className="pv-val">{pc.hp} <span className="pv-max">/ {pc.hpMax}</span></div>
          <div className="pv-bar"><div className={'fill ' + hpCls} style={{ width: hpPct + '%' }} /></div>
        </div>
        <div className="pc-vital">
          <div className="pv-lbl">Armor Class</div>
          <div className="pv-val">{pc.ac}</div>
        </div>
        <div className="pc-vital">
          <div className="pv-lbl">Speed</div>
          <div className="pv-val">{pc.speed}<span className="pv-max"> ft</span></div>
        </div>
        <div className="pc-vital">
          <div className="pv-lbl">Passive Perception</div>
          <div className="pv-val">{pc.passive}</div>
        </div>
      </div>

      <div className="pc-stats">
        {['STR','DEX','CON','INT','WIS','CHA'].map(a => (
          <div key={a} className={'pc-abil ' + (pc.saves.includes(a) ? 'save' : '')} title={pc.saves.includes(a) ? a + ' save proficiency' : a}>
            <div className="pa-lbl">{a}</div>
            <div className="pa-val">{pc.stats[a]}</div>
            <div className="pa-mod">({mod(pc.stats[a])})</div>
          </div>
        ))}
      </div>

      <div className="pc-body">
        <div className="pc-col">
          <h4><Ico name="sparkle" size={11} /> Character Hooks</h4>
          <div className="pc-hook-list">
            {pc.hooks.map((h, i) => <div key={i} className="pc-hook">{h}</div>)}
          </div>
        </div>
        <div className="pc-col">
          <h4><Ico name="scroll" size={11} /> Notable Inventory</h4>
          <div className="pc-inv-list">
            {pc.inventory.map((it, i) => <div key={i} className="pc-inv">{it}</div>)}
          </div>
        </div>
      </div>

      {pc.status.length > 0 && (
        <div className="pc-status-row">
          <span className="pcs-lbl">Active Status</span>
          {pc.status.map((s, i) => <span key={i} className="pc-status-chip">{s}</span>)}
        </div>
      )}
      {pc.status.length === 0 && (
        <div className="pc-status-row">
          <span className="pcs-lbl">Active Status</span>
          <span className="pc-status-chip ok"> No conditions</span>
        </div>
      )}

      <div className="pc-foot">
        <span><Ico name="clock" size={11} /> Edited 2h ago</span>
        <span className="grow" style={{ flex: 1 }} />
        <span className="pcf-link">Full sheet <Ico name="arrowRight" size={11} /></span>
        <span style={{ color: 'var(--text-4)' }}>{pc.sheetLink}</span>
      </div>
    </div>
  );
}

function Players({ setScreen, tweaks }) {
  const [noteDraft, setNoteDraft] = useSF('');
  const showIcon = tweaks.heading === 'icon';
  const party = window.VS_DATA.party;
  const notes = window.VS_DATA.partyNotes;

  const totalXP = party.reduce((s, p) => s + p.xp, 0);
  const avgLevel = (party.reduce((s, p) => s + p.level, 0) / party.length).toFixed(1);
  const totalHP = party.reduce((s, p) => s + p.hp, 0);
  const maxHP = party.reduce((s, p) => s + p.hpMax, 0);

  return (
    <div className="content">
      <div className="screen-pad">
        <div className="page-head">
          {showIcon && <div className="page-icon"><Ico name="users" size={26} /></div>}
          <div>
            <div className="page-title">Players</div>
            <div className="page-sub">Party roster · {party.length} characters · {window.VS_DATA.campaign.name}</div>
          </div>
          <div className="page-actions">
            <button className="btn-ghost"><Ico name="upload" size={12} /> Import Sheet</button>
            <button className="btn-primary"><Ico name="plus" size={12} /> Add Character</button>
          </div>
        </div>

        <div className="pl-summary">
          <div className="pl-stat">
            <div className="pls-num">{party.length}</div>
            <div className="pls-lbl">Characters</div>
          </div>
          <div className="pl-stat">
            <div className="pls-num">{avgLevel}</div>
            <div className="pls-lbl">Avg Level</div>
          </div>
          <div className="pl-stat">
            <div className="pls-num">{totalHP}<span style={{ color: 'var(--text-3)', fontSize: 14 }}> / {maxHP}</span></div>
            <div className="pls-lbl">Party HP</div>
          </div>
          <div className="pl-stat">
            <div className="pls-num">{(totalXP / 1000).toFixed(1)}k</div>
            <div className="pls-lbl">Total XP</div>
          </div>
        </div>

        <div className="players-screen">
          <div className="players-main">
            {party.map(pc => <PCCard key={pc.id} pc={pc} showIcon={showIcon} />)}
          </div>

          <div className="pn-panel">
            <div className="pn-head">
              <h3><Ico name="scroll" size={15} /> Party Notes</h3>
              <span className="pn-count">{notes.length}</span>
            </div>
            <div className="pn-list">
              {notes.map(n => (
                <div key={n.id} className={'pn-note ' + n.color}>
                  <div className="pn-meta">
                    <span className="pn-author">{n.author}</span>
                    <span className="pn-time">{n.time}</span>
                  </div>
                  <div className="pn-body">{n.body}</div>
                </div>
              ))}
            </div>
            <div className="pn-compose">
              <textarea
                placeholder="Drop a note for the whole party — plans, reminders, loose threads…"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
              />
              <div className="pn-compose-row">
                <span className="faint" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>@mention · /secret</span>
                <span className="grow" />
                <button className="btn-ghost" style={{ padding: '4px 10px' }}>Secret</button>
                <button className="btn-primary" style={{ padding: '4px 12px' }}>Post</button>
              </div>
            </div>

            <div className="pn-section">
              <h4><Ico name="calendar" size={11} /> Upcoming</h4>
              <div className="pn-quick">
                <div className="pn-quick-row">
                  <Ico name="play" size={11} />
                  <div className="grow"><b>Session 14</b> — Into the Citadel</div>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>Sat 8pm</span>
                </div>
                <div className="pn-quick-row">
                  <Ico name="dice" size={11} />
                  <div className="grow">Level-up check — party hits Lv 6</div>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>~2 sessions</span>
                </div>
              </div>
            </div>

            <div className="pn-section">
              <h4><Ico name="zap" size={11} /> Shared Resources</h4>
              <div className="pn-quick">
                <div className="pn-quick-row"><Ico name="sparkle" size={11} /><div className="grow">Inspiration available</div><b>2</b></div>
                <div className="pn-quick-row"><Ico name="star" size={11} /><div className="grow">Party gold</div><b>1,240 gp</b></div>
                <div className="pn-quick-row"><Ico name="scroll" size={11} /><div className="grow">Shared rations</div><b>14 days</b></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Players });
