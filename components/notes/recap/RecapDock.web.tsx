import { useCallback, useMemo } from 'react';
import {
  Mosaic, MosaicWindow,
  type MosaicNode,
} from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';

import { colors } from '@vaultstone/ui';
import {
  useRecapLayoutStore, DEFAULT_RECAP_LAYOUT,
  type RecapPanelKind, type RecapMosaicNode,
} from '@vaultstone/store';

import { RecapEditorPanel } from './RecapEditorPanel';
import { DmNotesPanel } from './DmNotesPanel';
import { PlayerNotesPanel } from './PlayerNotesPanel';
import { openRecapPopout } from './usePanelPresence';

interface SessionMeta {
  id: string;
  summary: string | null;
  isLive: boolean;
  label?: string;
}

interface Props {
  campaignId: string;
  session: SessionMeta;
  dmUserId: string;
  displayNameByUserId: Record<string, string>;
  onSummaryPublished?: (sessionId: string, nextSummary: string) => void;
}

const TITLES: Record<RecapPanelKind, string> = {
  recap: 'Recap',
  dmNotes: 'Your Session Notes',
  playerNotes: 'Player Notes',
};

export function RecapDock({ campaignId, session, dmUserId, displayNameByUserId, onSummaryPublished }: Props) {
  const layout = useRecapLayoutStore((s) => s.layout);
  const setLayout = useRecapLayoutStore((s) => s.setLayout);
  const resetLayout = useRecapLayoutStore((s) => s.resetLayout);

  // Mosaic's MosaicNode<T> is structurally identical to our RecapMosaicNode;
  // the dual type is just so the store doesn't depend on the web-only library.
  const value = layout as unknown as MosaicNode<RecapPanelKind>;

  const renderBody = useCallback((id: RecapPanelKind) => {
    if (id === 'recap') {
      return (
        <RecapEditorPanel
          sessionId={session.id}
          campaignId={campaignId}
          sessionLabel={session.label}
          publishedSummary={session.summary}
          isLive={session.isLive}
          mode="dock"
          onPublished={onSummaryPublished}
        />
      );
    }
    if (id === 'dmNotes') {
      return (
        <DmNotesPanel
          sessionId={session.id}
          userId={dmUserId}
          mode="dock"
        />
      );
    }
    return (
      <PlayerNotesPanel
        sessionId={session.id}
        isLive={session.isLive}
        excludeUserId={dmUserId}
        displayNameByUserId={displayNameByUserId}
      />
    );
  }, [session.id, session.summary, session.isLive, dmUserId, displayNameByUserId, onSummaryPublished]);

  const renderToolbarControls = useCallback((id: RecapPanelKind) => {
    return (
      <button
        type="button"
        title="Open in new window"
        onClick={() => openRecapPopout(campaignId, session.id, id)}
        style={popoutBtnStyle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 3h7v7" />
          <path d="M21 3l-9 9" />
          <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
        </svg>
      </button>
    );
  }, [campaignId, session.id]);

  const themeStyle = useMemo(() => ({
    height: '100%', width: '100%',
    // Override mosaic's default theme so it matches our dark palette.
    ['--mosaic-bg' as never]: colors.background,
    ['--mosaic-tile-bg' as never]: colors.surface,
    ['--mosaic-border' as never]: colors.border,
  }), []);

  return (
    <div style={themeStyle as React.CSSProperties} className="vaultstone-mosaic-root">
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />
      <button
        type="button"
        onClick={resetLayout}
        style={resetBtnStyle}
        title="Reset panel layout"
      >
        Reset layout
      </button>
      <Mosaic<RecapPanelKind>
        value={value}
        onChange={(next) => setLayout(next as RecapMosaicNode ?? DEFAULT_RECAP_LAYOUT)}
        renderTile={(id, path) => (
          <MosaicWindow<RecapPanelKind>
            path={path}
            title={TITLES[id]}
            toolbarControls={renderToolbarControls(id)}
          >
            {renderBody(id)}
          </MosaicWindow>
        )}
        className="vaultstone-mosaic"
      />
    </div>
  );
}

const popoutBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: colors.textSecondary,
  cursor: 'pointer',
  padding: '4px 6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const resetBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 10,
  background: colors.surface,
  color: colors.textSecondary,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  cursor: 'pointer',
};

// Mosaic's stock CSS ships light-mode defaults in its base `.mosaic-window`
// rules — `background: white` on the toolbar and body, light gray on hover.
// We drop the `mosaic-blueprint-theme` class entirely (the theme's 3-class
// selectors were beating 2-class overrides) and scope our own rules under
// `.vaultstone-mosaic-root .mosaic-window ...` so they match the base rules'
// 2-class specificity via an extra root class = 3 classes and always win.
const SCOPED_CSS = `
.vaultstone-mosaic-root { position: relative; }
.vaultstone-mosaic-root .mosaic,
.vaultstone-mosaic-root .mosaic-root {
  background: ${colors.background};
}
.vaultstone-mosaic-root .mosaic-tile {
  background: transparent;
}
.vaultstone-mosaic-root .mosaic-window,
.vaultstone-mosaic-root .mosaic-preview {
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: 10px;
  overflow: hidden;
  box-shadow: none;
}
.vaultstone-mosaic-root .mosaic-window .mosaic-window-toolbar,
.vaultstone-mosaic-root .mosaic-preview .mosaic-window-toolbar {
  background: ${colors.surface};
  border-bottom: 1px solid ${colors.border};
  box-shadow: none;
  height: 36px;
  padding: 0 8px;
}
.vaultstone-mosaic-root .mosaic-window .mosaic-window-toolbar.draggable:hover,
.vaultstone-mosaic-root .mosaic-preview .mosaic-window-toolbar.draggable:hover {
  background: ${colors.surface};
  filter: brightness(1.15);
}
.vaultstone-mosaic-root .mosaic-window .mosaic-window-title,
.vaultstone-mosaic-root .mosaic-preview .mosaic-window-title {
  color: ${colors.textPrimary};
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding-left: 8px;
}
.vaultstone-mosaic-root .mosaic-window .mosaic-window-body,
.vaultstone-mosaic-root .mosaic-preview .mosaic-window-body {
  background: ${colors.surface};
  display: flex;
  flex-direction: column;
}
.vaultstone-mosaic-root .mosaic-window .mosaic-window-body > *,
.vaultstone-mosaic-root .mosaic-preview .mosaic-window-body > * {
  flex: 1 1 auto;
  min-height: 0;
}
.vaultstone-mosaic-root .mosaic-window .mosaic-window-body-overlay,
.vaultstone-mosaic-root .mosaic-preview .mosaic-window-body-overlay {
  background: ${colors.background};
}
.vaultstone-mosaic-root .mosaic-window .mosaic-window-additional-actions-bar,
.vaultstone-mosaic-root .mosaic-preview .mosaic-window-additional-actions-bar {
  background: ${colors.surface};
}
.vaultstone-mosaic-root textarea,
.vaultstone-mosaic-root input {
  background: ${colors.background};
  color: ${colors.textPrimary};
  caret-color: ${colors.textPrimary};
}
.vaultstone-mosaic-root textarea::placeholder,
.vaultstone-mosaic-root input::placeholder {
  color: ${colors.textSecondary};
}
.vaultstone-mosaic-root .mosaic-split {
  background: transparent;
}
.vaultstone-mosaic-root .mosaic-split:hover .mosaic-split-line {
  background: ${colors.brand};
}
.vaultstone-mosaic-root .mosaic-split.-row {
  width: 6px;
  margin: 0 -3px;
}
.vaultstone-mosaic-root .mosaic-split.-column {
  height: 6px;
  margin: -3px 0;
}
.vaultstone-mosaic-root .mosaic-split-line {
  background: ${colors.border};
  position: absolute;
  inset: 0;
}
.vaultstone-mosaic-root .mosaic-drop-target .drop-target {
  background: ${colors.brand}33;
  border: 2px dashed ${colors.brand};
}
.vaultstone-mosaic-root .mosaic-zero-state {
  background: ${colors.surface};
  color: ${colors.textSecondary};
}
`;
