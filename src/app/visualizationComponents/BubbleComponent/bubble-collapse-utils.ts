export interface BubbleCollapseGroup {
  Xgroup: number;
  Ygroup: number;
  nodes: any[];
}

export function getBubbleCollapseGroupKey(Xgroup: number, Ygroup: number): string {
  return `${Xgroup}:${Ygroup}`;
}

function getBubbleAxisGroup(
  node: any,
  variable: string | undefined,
  categories: any[]
): number {
  if (!variable || variable === 'None') {
    return 0;
  }

  return categories.indexOf(node?.[variable]);
}

/**
 * Groups the currently visible source nodes into Bubble axis cells.
 * Axis categories are refreshed by Bubble before this runs, so a missing
 * category indicates stale/incomplete input and should not create an
 * off-canvas aggregate at index -1.
 */
export function groupVisibleNodesByBubbleAxes(
  nodes: any[],
  xVariable: string | undefined,
  yVariable: string | undefined,
  xCategories: any[],
  yCategories: any[]
): BubbleCollapseGroup[] {
  const groups = new Map<string, BubbleCollapseGroup>();

  (nodes || []).forEach(node => {
    const Xgroup = getBubbleAxisGroup(node, xVariable, xCategories);
    const Ygroup = getBubbleAxisGroup(node, yVariable, yCategories);

    if (Xgroup < 0 || Ygroup < 0) {
      return;
    }

    const key = getBubbleCollapseGroupKey(Xgroup, Ygroup);
    const group = groups.get(key);
    if (group) {
      group.nodes.push(node);
      return;
    }

    groups.set(key, {
      Xgroup,
      Ygroup,
      nodes: [node]
    });
  });

  return Array.from(groups.values());
}
