/* global React, Ico */
const { useState: useSS, useEffect: useES } = React;

// ============= SHELL =============
function Rail({ screen, setScreen, tweaks }) {
  const items = [
    { id: 'dashboard', icon: 'sparkle', label: 'Home' },
    { id: 'players', icon: 'user', label: 'Players' },
    { id: 'locations', icon: 'mapPin', label: 'Locations' },
    { id: 'map', icon: 'globe', label: 'World Map' },
    { id: 'wiki', icon: 'book', label: 'Lore Wiki' },
    { id: 'timeline', icon: 'hourglass', label: 'Timeline' },
    { id: 'npcs', icon: 'skull', label: 'NPCs' },
    { id: 'factions', icon: 'shield', label: 'Factions' },
  ];
  return (
    <div className="rail">
      <div className="logo" title="Vaultstone">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12l4 6-10 13L2 9Z"/>
          <path d="M12 3v19" />
          <path d="M2 9h20" />
        </svg>
      </div>
      {items.map(it => (
        <button key={it.id} className={'nav-item ' + (screen === it.id ? 'active' : '')} onClick={() => setScreen(it.id)}>
          <Ico name={it.icon} size={18} />
          <span className="nav-tip">{it.label}</span>
        </button>
      ))}
      <div className="spacer" />
      <button className="nav-item" title="Settings">
        <Ico name="gear" size={18} />
        <span className="nav-tip">Settings</span>
      </button>
      <div className="avatar" title="You (GM)">VS</div>
    </div>
  );
}

function Sidebar({ screen, setScreen, tweaks }) {
  const trees = {
    dashboard: { label: 'Overview', groups: [
      { label: 'General', items: [{ icon: 'sparkle', label: 'Campaign Home', active: true }, { icon: 'scroll', label: 'Session Log', count: 12 }] },
      { label: 'Party', items: [{ icon: 'user', label: 'Players', count: 4 }] },
      { label: 'Quick Access', items: [{ icon: 'star', label: 'Pinned', count: 4 }, { icon: 'clock', label: 'Recent' }] },
    ]},
    players: { label: 'Party', groups: [
      { label: 'Characters', items: [
        { icon: 'user', label: 'Kira Vex — Rogue', active: true },
        { icon: 'user', label: 'Thorn Greenbough — Druid' },
        { icon: 'user', label: 'Lyra Dawnmere — Cleric' },
        { icon: 'user', label: 'Brann Stonefist — Fighter' },
      ]},
      { label: 'Shared', items: [
        { icon: 'scroll', label: 'Party Notes', count: 4 },
        { icon: 'star', label: 'Shared Inventory' },
        { icon: 'calendar', label: 'Session Schedule' },
      ]},
      { label: 'Cross-links', items: [
        { icon: 'sparkle', label: 'Campaign Home' },
        { icon: 'skull', label: 'NPCs' },
      ]},
    ]},
    locations: { label: 'Atlas', groups: [
      { label: 'Regions', items: [
        { icon: 'mapPin', label: 'Locations', count: 12, active: true, sub: [
          { label: 'Shattered Citadel' }, { label: 'Whispering Woods' }, { label: 'Port of Kaedon' }, { label: 'Iron Keep' }, { label: 'Emberport' },
        ]},
      ]},
      { label: 'References', items: [
        { icon: 'users', label: 'NPCs & Characters', count: 18 },
        { icon: 'shield', label: 'Factions', count: 6 },
        { icon: 'hourglass', label: 'Timeline' },
      ]},
    ]},
    map: { label: 'Atlas', groups: [
      { label: 'Geography', items: [
        { icon: 'globe', label: 'World Map', active: true },
        { icon: 'mapPin', label: 'Northmarch' },
        { icon: 'mapPin', label: 'Azure Coast' },
        { icon: 'mapPin', label: 'Ember Wastes' },
      ]},
      { label: 'Layers', items: [
        { icon: 'eye', label: 'Player-visible pins' },
        { icon: 'eyeOff', label: 'GM-only pins' },
        { icon: 'flag', label: 'Faction claims' },
      ]},
    ]},
    wiki: { label: 'Lore Wiki', groups: [
      { label: 'Entries', items: [
        { icon: 'castle', label: 'Shattered Citadel', active: true },
        { icon: 'tree', label: 'The Backwood' },
        { icon: 'crown', label: 'Solar Dynasty' },
        { icon: 'fire', label: 'Order of the Burning Chalice' },
      ]},
      { label: 'Categories', items: [
        { icon: 'user', label: 'NPCs', count: 18 },
        { icon: 'users', label: 'Players', count: 4 },
        { icon: 'shield', label: 'Factions', count: 6 },
      ]},
    ]},
    timeline: { label: 'Chronicle', groups: [
      { label: 'Records', items: [
        { icon: 'hourglass', label: 'Chronicle of Eldoria', active: true },
        { icon: 'scroll', label: 'Regional Epochs' },
        { icon: 'crown', label: 'Dynastic Records' },
      ]},
      { label: 'Cross-links', items: [
        { icon: 'mapPin', label: 'Locations' },
        { icon: 'user', label: 'NPCs' },
        { icon: 'shield', label: 'Factions' },
      ]},
    ]},
    npcs: { label: 'Cast', groups: [
      { label: 'Antagonists', items: [
        { icon: 'skull', label: 'Lord Malakor', active: true },
        { icon: 'user', label: 'The Iron Matriarch' },
      ]},
      { label: 'Allies', items: [
        { icon: 'user', label: 'Sister Velia' },
        { icon: 'user', label: 'Tam the Ferryman' },
      ]},
      { label: 'Party', items: [
        { icon: 'user', label: 'Kira (Rogue)' },
        { icon: 'user', label: 'Thorn (Druid)' },
        { icon: 'user', label: 'Lyra (Cleric)' },
      ]},
    ]},
    factions: { label: 'Factions', groups: [
      { label: 'Active', items: [
        { icon: 'shield', label: 'The Iron Circle', active: true },
        { icon: 'fire', label: 'Order of the Burning Chalice' },
        { icon: 'crown', label: 'Solar Remnants' },
        { icon: 'anchor', label: 'Kaedon Pact' },
      ]},
      { label: 'Background', items: [
        { icon: 'sparkle', label: 'Children of Void' },
        { icon: 'mountain', label: 'Frost-kin' },
      ]},
    ]},
  };
  const tree = trees[screen] || trees.locations;

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <div className="brand">Vaultstone<span className="dot">.</span></div>
        <div className="campaign-switch">
          <div className="c-icon"><Ico name="crown" size={12} /></div>
          <div className="c-label">
            <div className="l1">Campaign</div>
            <div className="l2">Shadows Over Eldoria</div>
          </div>
          <Ico name="chevDown" size={12} />
        </div>
      </div>
      <div className="search">
        <Ico name="search" size={13} />
        <input placeholder={'Search ' + (window.VS_DATA.campaign.world) + '…'} />
        <span className="kbd">⌘K</span>
      </div>
      <div className="nav-tree">
        {tree.groups.map((g, gi) => (
          <div key={gi} className="nav-group">
            <div className="nav-group-label">{g.label}</div>
            {g.items.map((it, ii) => (
              <React.Fragment key={ii}>
                <div className={'nav-row ' + (it.active ? 'active' : '')} onClick={() => { if (screen === 'locations' && it.label === 'NPCs & Characters') setScreen('npcs'); if (it.label === 'Timeline') setScreen('timeline'); if (it.label === 'Factions') setScreen('factions'); if (it.label === 'Players' || it.label === 'Party Notes') setScreen('players'); if (it.label === 'Campaign Home') setScreen('dashboard'); if (it.label === 'NPCs') setScreen('npcs'); }}>
                  <Ico name={it.icon} size={14} />
                  <span className="n-label">{it.label}</span>
                  {it.count != null && <span className="n-count">{it.count}</span>}
                </div>
                {it.sub && (
                  <div className="nav-child">
                    {it.sub.map((s, si) => (
                      <div key={si} className={'nav-row ' + (si === 0 ? 'active' : '')}>
                        <span className="n-label">{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <button className="btn-primary"><Ico name="plus" size={12} /> New Entry</button>
      </div>
    </div>
  );
}

function TopBar({ crumbs, actions }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? 'cur' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="save-state"><span className="dot" /> Saved 14:32</div>
      <div className="spacer" />
      <div className="presence">
        {window.VS_DATA.presence.slice(0, 4).map(p => (
          <div key={p.id} className={'p ' + p.role} title={p.name}>{p.initials}</div>
        ))}
        <div className="more">+2</div>
      </div>
      {actions}
    </div>
  );
}

Object.assign(window, { Rail, Sidebar, TopBar });
