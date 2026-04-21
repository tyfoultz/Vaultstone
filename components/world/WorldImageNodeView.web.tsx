import { useEffect, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { getWorldImageSignedUrlById } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';

type SignedUrlEntry = { url: string; expiresAt: number };
const urlCache = new Map<string, SignedUrlEntry>();
const URL_TTL_MS = 50 * 60 * 1000; // refresh 10 min before 1-hour expiry

async function resolveUrl(imageId: string): Promise<string | null> {
  const cached = urlCache.get(imageId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await getWorldImageSignedUrlById(imageId);
  if (error || !data?.signedUrl) return null;
  urlCache.set(imageId, { url: data.signedUrl, expiresAt: Date.now() + URL_TTL_MS });
  return data.signedUrl;
}

export function WorldImageNodeView(props: NodeViewProps) {
  const { node, selected } = props;
  const imageId = node.attrs.imageId as string;
  const alt = (node.attrs.alt as string) ?? '';
  const width = (node.attrs.width as number) ?? 0;
  const height = (node.attrs.height as number) ?? 0;
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!imageId) {
      setLoading(false);
      setError(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    resolveUrl(imageId).then((url) => {
      if (cancelled) return;
      if (url) {
        setSrc(url);
      } else {
        setError(true);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [imageId]);

  const aspectRatio = width && height ? width / height : undefined;

  return (
    <NodeViewWrapper
      className={`world-image-wrapper${selected ? ' selected' : ''}`}
      data-drag-handle=""
    >
      {loading ? (
        <div className="world-image-loading" style={{ aspectRatio }}>
          <span className="world-image-loading-text">Loading image…</span>
        </div>
      ) : error || !src ? (
        <div className="world-image-error">
          <span className="world-image-error-icon">⚠</span>
          <span className="world-image-error-text">Image unavailable</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt || ''}
          className="world-image-img"
          style={{ aspectRatio }}
          draggable={false}
        />
      )}
      {alt ? <div className="world-image-caption">{alt}</div> : null}
    </NodeViewWrapper>
  );
}

export function worldImageStyles(): string {
  return `
    .world-image-wrapper {
      margin: ${spacing.md}px 0;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      cursor: default;
    }
    .world-image-wrapper.selected {
      outline: 2px solid ${colors.primary};
      outline-offset: 2px;
    }
    .world-image-img {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      object-fit: cover;
    }
    .world-image-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 120px;
      background: ${colors.surfaceContainerHigh};
      border-radius: 8px;
      border: 1px dashed ${colors.outlineVariant};
    }
    .world-image-loading-text {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 13px;
      color: ${colors.outline};
      font-style: italic;
    }
    .world-image-error {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 80px;
      background: ${colors.dangerContainer}22;
      border: 1px solid ${colors.hpDanger}33;
      border-radius: 8px;
      padding: 16px;
    }
    .world-image-error-icon {
      font-size: 18px;
      color: ${colors.hpDanger};
    }
    .world-image-error-text {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 13px;
      color: ${colors.hpDanger};
    }
    .world-image-caption {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 12px;
      color: ${colors.outline};
      text-align: center;
      padding: 6px 0 2px;
      font-style: italic;
    }
  `;
}
