// Type shim for Metro's platform resolution. At bundle time Metro picks
// RecapDock.native.tsx or RecapDock.web.tsx; tsc reads this file so the
// import site stays platform-agnostic.

interface SessionMeta {
  id: string;
  summary: string | null;
  isLive: boolean;
}

export interface RecapDockProps {
  campaignId: string;
  session: SessionMeta;
  dmUserId: string;
  displayNameByUserId: Record<string, string>;
}

export function RecapDock(props: RecapDockProps): JSX.Element;
