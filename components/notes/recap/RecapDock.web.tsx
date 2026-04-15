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
}

interface Props {
  campaignId: string;
  session: SessionMeta;
  dmUserId: string;
  displayNameByUserId: Record<string, string>;
}

const TITLES: Record<RecapPanelKind, string> = {
  recap: 'Recap',
  dmNotes: 'Your Session Notes',
  playerNotes: 'Player Notes',
};

export function RecapDock({ campaignId, session, dmUserId, displayNameByUserId }: Props) {
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
          publishedSummary={session.summary}
          isLive={session.isLive}
          mode="dock"
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
  }, [session.id, session.summary, session.isLive, dmUserId, displayNameByUserId]);

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
        className="mosaic-blueprint-theme vaultstone-mosaic"
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

// Mosaic's stock theme is light-mode Blueprint. Override to match Vaultstone's
// dark palette. Scoped under .vaultstone-mosaic-root so we don't pollute other
// surfaces if mosaic is ever used elsewhere.
const SCOPED_CSS = `
.vaultstone-mosaic-root { position: relative; }
.vaultstone-mosaic-root .mosaic { background: ${colors.background}; }
.vaultstone-mosaic-root .mosaic-window {
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: 10px;
  overflow: hidden;
  box-shadow: none;
}
.vaultstone-mosaic-root .mosaic-window-toolbar {
  background: ${colors.surface};
  border-bottom: 1px solid ${colors.border};
  box-shadow: none;
  height: 36px;
  padding: 0 8px;
  cursor: move;
}
.vaultstone-mosaic-root .mosaic-window-title {
  color: ${colors.textPrimary};
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding-left: 4px;
}
.vaultstone-mosaic-root .mosaic-window-controls .pt-button {
  background: transparent;
  color: ${colors.textSecondary};
  box-shadow: none;
  border: none;
}
.vaultstone-mosaic-root .mosaic-window-body {
  background: ${colors.surface};
  display: flex;
  flex-direction: column;
}
.vaultstone-mosaic-root .mosaic-window-body > * {
  flex: 1 1 auto;
  min-height: 0;
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
