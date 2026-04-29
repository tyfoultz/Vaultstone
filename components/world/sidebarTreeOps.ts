import type { WorldPage } from '@vaultstone/types';

export type MovePageInput = {
  pageId: string;
  newSectionId: string;
  newParentId: string | null;
  newSortOrder: number;
};

function getSiblings(page: WorldPage, allPages: WorldPage[]): WorldPage[] {
  return allPages
    .filter(
      (p) =>
        p.section_id === page.section_id &&
        (p.parent_page_id ?? null) === (page.parent_page_id ?? null) &&
        !p.deleted_at,
    )
    .sort((a, b) => a.sort_order - b.sort_order);
}

function getChildrenOf(parentId: string, sectionId: string, allPages: WorldPage[]): WorldPage[] {
  return allPages
    .filter((p) => p.parent_page_id === parentId && p.section_id === sectionId && !p.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getPageDepth(page: WorldPage, allPages: WorldPage[]): number {
  const byId = new Map(allPages.map((p) => [p.id, p]));
  let depth = 0;
  let current = page;
  while (current.parent_page_id) {
    depth++;
    const parent = byId.get(current.parent_page_id);
    if (!parent) break;
    current = parent;
  }
  return depth;
}

export function computeIndent(page: WorldPage, allPages: WorldPage[]): MovePageInput | null {
  const siblings = getSiblings(page, allPages);
  const idx = siblings.findIndex((s) => s.id === page.id);
  if (idx <= 0) return null;
  if (getPageDepth(page, allPages) >= 5) return null;

  const prevSibling = siblings[idx - 1];
  const prevChildren = getChildrenOf(prevSibling.id, page.section_id, allPages);
  const newSortOrder = (prevChildren.at(-1)?.sort_order ?? -1) + 1;

  return {
    pageId: page.id,
    newSectionId: page.section_id,
    newParentId: prevSibling.id,
    newSortOrder,
  };
}

export function computeOutdent(page: WorldPage, allPages: WorldPage[]): MovePageInput | null {
  if (!page.parent_page_id) return null;
  const byId = new Map(allPages.map((p) => [p.id, p]));
  const parent = byId.get(page.parent_page_id);
  if (!parent) return null;

  const parentSiblings = getSiblings(parent, allPages);
  const parentIdx = parentSiblings.findIndex((s) => s.id === parent.id);
  const newSortOrder =
    parentIdx < parentSiblings.length - 1
      ? parent.sort_order + 1
      : (parentSiblings.at(-1)?.sort_order ?? 0) + 1;

  return {
    pageId: page.id,
    newSectionId: page.section_id,
    newParentId: parent.parent_page_id ?? null,
    newSortOrder,
  };
}

export function computeMoveUp(
  page: WorldPage,
  allPages: WorldPage[],
): [MovePageInput, MovePageInput] | null {
  const siblings = getSiblings(page, allPages);
  const idx = siblings.findIndex((s) => s.id === page.id);
  if (idx <= 0) return null;

  const prev = siblings[idx - 1];
  return [
    {
      pageId: page.id,
      newSectionId: page.section_id,
      newParentId: page.parent_page_id ?? null,
      newSortOrder: prev.sort_order,
    },
    {
      pageId: prev.id,
      newSectionId: prev.section_id,
      newParentId: prev.parent_page_id ?? null,
      newSortOrder: page.sort_order,
    },
  ];
}

export function computeMoveDown(
  page: WorldPage,
  allPages: WorldPage[],
): [MovePageInput, MovePageInput] | null {
  const siblings = getSiblings(page, allPages);
  const idx = siblings.findIndex((s) => s.id === page.id);
  if (idx < 0 || idx >= siblings.length - 1) return null;

  const next = siblings[idx + 1];
  return [
    {
      pageId: page.id,
      newSectionId: page.section_id,
      newParentId: page.parent_page_id ?? null,
      newSortOrder: next.sort_order,
    },
    {
      pageId: next.id,
      newSectionId: next.section_id,
      newParentId: next.parent_page_id ?? null,
      newSortOrder: page.sort_order,
    },
  ];
}

export type DropPosition = 'before' | 'child' | 'after';

export function computeDropMove(
  draggedPage: WorldPage,
  targetPage: WorldPage,
  position: DropPosition,
  allPages: WorldPage[],
): MovePageInput | null {
  if (draggedPage.id === targetPage.id) return null;

  switch (position) {
    case 'child': {
      const children = getChildrenOf(targetPage.id, targetPage.section_id, allPages);
      return {
        pageId: draggedPage.id,
        newSectionId: targetPage.section_id,
        newParentId: targetPage.id,
        newSortOrder: (children.at(-1)?.sort_order ?? -1) + 1,
      };
    }
    case 'before': {
      return {
        pageId: draggedPage.id,
        newSectionId: targetPage.section_id,
        newParentId: targetPage.parent_page_id ?? null,
        newSortOrder: targetPage.sort_order,
      };
    }
    case 'after': {
      const siblings = getSiblings(targetPage, allPages);
      const idx = siblings.findIndex((s) => s.id === targetPage.id);
      const nextSibling = siblings[idx + 1];
      return {
        pageId: draggedPage.id,
        newSectionId: targetPage.section_id,
        newParentId: targetPage.parent_page_id ?? null,
        newSortOrder: nextSibling
          ? targetPage.sort_order + 1
          : targetPage.sort_order + 1,
      };
    }
  }
}

export function isDescendant(
  pageId: string,
  potentialAncestorId: string,
  allPages: WorldPage[],
): boolean {
  const byId = new Map(allPages.map((p) => [p.id, p]));
  let current = byId.get(pageId);
  while (current?.parent_page_id) {
    if (current.parent_page_id === potentialAncestorId) return true;
    current = byId.get(current.parent_page_id);
  }
  return false;
}
