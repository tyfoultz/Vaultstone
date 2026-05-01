import { useMemo } from 'react';
import { usePagesStore } from '@vaultstone/store';
import type { WorldPage } from '@vaultstone/types';

import {
  KIND_COLOR,
  KIND_ICON,
  STRUCTURAL_FIELD_EDGES,
  type EdgeSource,
  type GraphNode,
  type RelationEdge,
} from './constants';

type Relationship = { targetPageId: string; type: string; note?: string };

const EMPTY_PAGES: WorldPage[] = [];

const RECIPROCAL_MAP: Record<string, string> = {
  ally: 'ally',
  rival: 'rival',
  enemy: 'enemy',
  friend: 'friend',
  family: 'family',
  lover: 'lover',
  employer: 'servant',
  servant: 'employer',
  mentor: 'student',
  student: 'mentor',
  master: 'master',
};

function edgeKey(sourceId: string, targetId: string, source: EdgeSource, label: string): string {
  return `${source}:${sourceId}:${targetId}:${label}`;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function isSymmetricRelType(type: string): boolean {
  return RECIPROCAL_MAP[type] === type;
}

export type RelationGraph = {
  nodes: GraphNode[];
  edges: RelationEdge[];
  nodeById: Map<string, GraphNode>;
};

export function useRelationGraph(worldId: string): RelationGraph {
  const allPages = usePagesStore((s) => s.byWorldId[worldId] ?? EMPTY_PAGES);

  return useMemo(() => {
    const pageMap = new Map<string, WorldPage>();
    for (const p of allPages) pageMap.set(p.id, p);

    const nodes: GraphNode[] = allPages.map((p) => ({
      id: p.id,
      title: p.title,
      pageKind: p.page_kind,
      color: KIND_COLOR[p.page_kind] ?? KIND_COLOR.custom,
      iconName: KIND_ICON[p.page_kind] ?? KIND_ICON.custom,
      sectionId: p.section_id,
    }));

    const nodeById = new Map<string, GraphNode>();
    for (const n of nodes) nodeById.set(n.id, n);

    const edges: RelationEdge[] = [];
    const seen = new Set<string>();
    const pairSourceSeen = new Set<string>();

    // Layer 1: Manual __relationships
    for (const page of allPages) {
      const fields = (page.structured_fields as Record<string, unknown>) ?? {};
      const rels: Relationship[] = Array.isArray(fields.__relationships)
        ? (fields.__relationships as Relationship[])
        : [];

      for (const rel of rels) {
        if (!nodeById.has(rel.targetPageId)) continue;

        const symmetric = isSymmetricRelType(rel.type);
        if (symmetric) {
          const pk = pairKey(page.id, rel.targetPageId);
          const dedupKey = `manual:${pk}:${rel.type}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
        }

        const ek = edgeKey(page.id, rel.targetPageId, 'manual', rel.type);
        if (seen.has(ek)) continue;
        seen.add(ek);

        pairSourceSeen.add(`manual:${pairKey(page.id, rel.targetPageId)}`);

        edges.push({
          id: ek,
          sourceId: page.id,
          targetId: rel.targetPageId,
          edgeSource: 'manual',
          label: rel.type,
          note: rel.note,
          directed: !symmetric,
        });
      }
    }

    // Layer 2: Structural page_ref fields
    for (const page of allPages) {
      const fields = (page.structured_fields as Record<string, unknown>) ?? {};

      for (const def of STRUCTURAL_FIELD_EDGES) {
        if (page.page_kind !== def.pageKind) continue;
        const targetId = typeof fields[def.fieldKey] === 'string' ? (fields[def.fieldKey] as string) : null;
        if (!targetId || !nodeById.has(targetId)) continue;

        const pk = pairKey(page.id, targetId);
        if (pairSourceSeen.has(`manual:${pk}`)) continue;

        const ek = edgeKey(page.id, targetId, 'structural', def.label);
        if (seen.has(ek)) continue;
        seen.add(ek);
        pairSourceSeen.add(`structural:${pk}`);

        edges.push({
          id: ek,
          sourceId: page.id,
          targetId: targetId,
          edgeSource: 'structural',
          label: def.label,
          directed: true,
        });
      }
    }

    // Layer 3: body_refs mentions
    for (const page of allPages) {
      const refs = page.body_refs ?? [];
      for (const targetId of refs) {
        if (!nodeById.has(targetId)) continue;

        const pk = pairKey(page.id, targetId);
        if (pairSourceSeen.has(`manual:${pk}`) || pairSourceSeen.has(`structural:${pk}`)) continue;

        const ek = edgeKey(page.id, targetId, 'mention', 'mentions');
        if (seen.has(ek)) continue;
        seen.add(ek);

        edges.push({
          id: ek,
          sourceId: page.id,
          targetId: targetId,
          edgeSource: 'mention',
          label: 'mentions',
          directed: true,
        });
      }
    }

    return { nodes, edges, nodeById };
  }, [allPages]);
}
