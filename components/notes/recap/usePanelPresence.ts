import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { RecapPanelKind } from '@vaultstone/store';

// Presence-only coordination between the dock instance of a recap panel and a
// pop-out window editing the same panel. Mirrors the pattern in
// SessionNotesPanel.tsx: pop-out side announces hello + heartbeats + bye on
// unmount; dock side flips to read-only while a pop-out is active. Body sync
// is intentionally NOT done here — when the pop-out closes the dock refetches
// from its underlying store (DB or Zustand persist).

const PRESENCE_STALE_MS = 5_000;
const HEARTBEAT_MS = 2_000;

type Mode = 'dock' | 'popout';

type PresenceMessage =
  | { kind: 'hello'; from: 'popout' }
  | { kind: 'heartbeat'; from: 'popout' }
  | { kind: 'bye'; from: 'popout' };

function hasBroadcastChannel(): boolean {
  return Platform.OS === 'web'
    && typeof globalThis !== 'undefined'
    && typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel === 'function';
}

function channelName(panel: RecapPanelKind, sessionId: string): string {
  return `vaultstone-recap-presence-${panel}-${sessionId}`;
}

interface UsePanelPresenceResult {
  /** Dock-side: true while a pop-out window is alive for this panel. */
  popoutActive: boolean;
  /** Fires when a pop-out window closes; consumers can refetch their state. */
  onPopoutClosed: (cb: () => void) => () => void;
}

export function usePanelPresence(
  mode: Mode,
  panel: RecapPanelKind,
  sessionId: string | null,
): UsePanelPresenceResult {
  const [popoutActive, setPopoutActive] = useState(false);
  const lastSeenAt = useRef<number>(0);
  const closedListeners = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    if (!sessionId || !hasBroadcastChannel()) return;
    const bc = new BroadcastChannel(channelName(panel, sessionId));

    if (mode === 'dock') {
      bc.onmessage = (ev) => {
        const msg = ev.data as PresenceMessage;
        if (!msg || msg.from !== 'popout') return;
        if (msg.kind === 'hello' || msg.kind === 'heartbeat') {
          lastSeenAt.current = Date.now();
          setPopoutActive(true);
        } else if (msg.kind === 'bye') {
          setPopoutActive(false);
          closedListeners.current.forEach((cb) => cb());
        }
      };
    } else {
      const announce = (k: 'hello' | 'heartbeat') =>
        bc.postMessage({ kind: k, from: 'popout' } satisfies PresenceMessage);
      announce('hello');
      const t = setInterval(() => announce('heartbeat'), HEARTBEAT_MS);
      const onUnload = () =>
        bc.postMessage({ kind: 'bye', from: 'popout' } satisfies PresenceMessage);
      window.addEventListener('beforeunload', onUnload);
      return () => {
        clearInterval(t);
        window.removeEventListener('beforeunload', onUnload);
        onUnload();
        bc.close();
      };
    }

    return () => {
      bc.close();
    };
  }, [mode, panel, sessionId]);

  // Dock-side: detect pop-out windows that closed without firing 'bye'.
  useEffect(() => {
    if (mode !== 'dock' || !popoutActive) return;
    const t = setInterval(() => {
      if (Date.now() - lastSeenAt.current > PRESENCE_STALE_MS) {
        setPopoutActive(false);
        closedListeners.current.forEach((cb) => cb());
      }
    }, 1_000);
    return () => clearInterval(t);
  }, [mode, popoutActive]);

  function onPopoutClosed(cb: () => void) {
    closedListeners.current.add(cb);
    return () => { closedListeners.current.delete(cb); };
  }

  return { popoutActive, onPopoutClosed };
}

export function openRecapPopout(
  campaignId: string,
  sessionId: string,
  panel: RecapPanelKind,
) {
  if (Platform.OS !== 'web') return;
  const url = `/campaign/${campaignId}/recap-panel?session=${sessionId}&panel=${panel}`;
  const target = `vaultstone-recap-${panel}-${sessionId}`;
  window.open(url, target, 'width=640,height=720');
}
