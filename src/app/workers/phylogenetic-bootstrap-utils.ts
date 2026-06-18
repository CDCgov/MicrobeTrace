export interface BootstrapTreeNode {
  id?: string;
  children?: BootstrapTreeNode[];
  [key: string]: any;
}

export interface BootstrapTreeSplit {
  key: string;
  node: BootstrapTreeNode;
  leafIds: string[];
}

export const BOOTSTRAP_SPLIT_SEPARATOR = '\u001f';
export const BOOTSTRAP_MAX_REPLICATES = 1000;
export const BOOTSTRAP_DEFAULT_STABILITY_TOLERANCE_PERCENT = 0.5;

const BOOTSTRAP_LABEL_PATTERN = /^(?:\d+(?:\.\d+)?%|(?:0(?:\.\d+)?|1(?:\.0+)?))$/;

function sortedUniqueTaxa(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  Array.from(values).forEach(value => {
    const id = String(value ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    output.push(id);
  });

  return output.sort();
}

function compareSortedStrings(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

export function splitKeyFromSortedTaxa(taxa: string[]): string {
  return taxa.join(BOOTSTRAP_SPLIT_SEPARATOR);
}

export function splitTaxaFromKey(key: string): string[] {
  if (!key) return [];
  return key.split(BOOTSTRAP_SPLIT_SEPARATOR).filter(Boolean);
}

export function canonicalSplitKey(splitTaxa: Iterable<unknown>, allTaxa: Iterable<unknown>): string | null {
  const all = sortedUniqueTaxa(allTaxa);
  const allSet = new Set(all);
  const selected = sortedUniqueTaxa(splitTaxa).filter(id => allSet.has(id));

  if (all.length < 4 || selected.length < 2 || selected.length > all.length - 2) {
    return null;
  }

  const selectedSet = new Set(selected);
  const complement = all.filter(id => !selectedSet.has(id));
  if (complement.length < 2) {
    return null;
  }

  let canonical = selected;
  if (complement.length < selected.length) {
    canonical = complement;
  } else if (complement.length === selected.length && compareSortedStrings(complement, selected) < 0) {
    canonical = complement;
  }

  return splitKeyFromSortedTaxa(canonical);
}

export function collectLeafIds(root: BootstrapTreeNode | null | undefined): string[] {
  if (!root) return [];
  const children = Array.isArray(root.children) ? root.children : [];

  if (!children.length) {
    const id = String(root.id ?? '').trim();
    return id ? [id] : [];
  }

  const leaves: string[] = [];
  children.forEach(child => leaves.push(...collectLeafIds(child)));
  return sortedUniqueTaxa(leaves);
}

export function collectTreeSplitEntries(
  root: BootstrapTreeNode | null | undefined,
  allLeafIds?: string[],
): BootstrapTreeSplit[] {
  if (!root) return [];

  const allTaxa = sortedUniqueTaxa(allLeafIds?.length ? allLeafIds : collectLeafIds(root));
  const entries: BootstrapTreeSplit[] = [];

  const visit = (node: BootstrapTreeNode, isRoot: boolean): string[] => {
    const children = Array.isArray(node.children) ? node.children : [];
    if (!children.length) {
      const id = String(node.id ?? '').trim();
      return id ? [id] : [];
    }

    const leafIds = sortedUniqueTaxa(children.flatMap(child => visit(child, false)));
    if (!isRoot) {
      const key = canonicalSplitKey(leafIds, allTaxa);
      if (key) {
        entries.push({ key, node, leafIds });
      }
    }

    return leafIds;
  };

  visit(root, true);
  return entries;
}

export function collectTreeSplitKeys(
  root: BootstrapTreeNode | null | undefined,
  allLeafIds?: string[],
): string[] {
  return Array.from(new Set(collectTreeSplitEntries(root, allLeafIds).map(entry => entry.key))).sort();
}

export function countMatchingTreeSplits(
  root: BootstrapTreeNode | null | undefined,
  baseSplitKeys: string[],
  allLeafIds?: string[],
): Record<string, number> {
  const baseSet = new Set(baseSplitKeys);
  const matched = new Set<string>();
  const counts: Record<string, number> = {};
  baseSplitKeys.forEach(key => { counts[key] = 0; });

  collectTreeSplitEntries(root, allLeafIds).forEach(entry => {
    if (baseSet.has(entry.key) && !matched.has(entry.key)) {
      matched.add(entry.key);
      counts[entry.key] = (counts[entry.key] ?? 0) + 1;
    }
  });

  return counts;
}

export function mergeSplitCounts(
  target: Record<string, number>,
  source: Record<string, number>,
  splitKeys: string[],
): void {
  splitKeys.forEach(key => {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0);
  });
}

export function buildSupportSnapshot(
  splitKeys: string[],
  splitCounts: Record<string, number>,
  replicates: number,
): Record<string, number> {
  const snapshot: Record<string, number> = {};
  const denominator = Math.max(1, replicates);

  splitKeys.forEach(key => {
    snapshot[key] = ((splitCounts[key] ?? 0) / denominator) * 100;
  });

  return snapshot;
}

export function isSupportStable(
  splitKeys: string[],
  previous: Record<string, number>,
  current: Record<string, number>,
  tolerancePercent: number = BOOTSTRAP_DEFAULT_STABILITY_TOLERANCE_PERCENT,
): boolean {
  if (!splitKeys.length) return false;
  const tolerance = Math.max(0, Number(tolerancePercent) || 0);
  return splitKeys.every(key => Math.abs((current[key] ?? 0) - (previous[key] ?? 0)) <= tolerance);
}

export function supportPercentBySplitKey(
  splitKeys: string[],
  splitCounts: Record<string, number>,
  replicates: number,
): Record<string, number> {
  return buildSupportSnapshot(splitKeys, splitCounts, replicates);
}

export function normalizeBootstrapReplicateCount(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(BOOTSTRAP_MAX_REPLICATES, Math.max(1, parsed));
}

export function normalizeBootstrapDecimalLength(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(3, Math.max(0, parsed));
}

export function formatBootstrapSupportPercent(value: unknown, decimalLength: unknown): string {
  const bounded = normalizeBootstrapSupportPercentValue(value);
  return `${bounded.toFixed(normalizeBootstrapDecimalLength(decimalLength))}%`;
}

export function normalizeBootstrapSupportPercentValue(value: unknown): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

export function formatBootstrapSupportDecimal(value: unknown): string {
  return String(normalizeBootstrapSupportPercentValue(value) / 100);
}

export function looksLikeBootstrapLabel(value: unknown): boolean {
  return BOOTSTRAP_LABEL_PATTERN.test(String(value ?? '').trim());
}

export function clearBootstrapInternalLabels(root: BootstrapTreeNode | null | undefined): void {
  if (!root) return;
  const children = Array.isArray(root.children) ? root.children : [];
  if (children.length && looksLikeBootstrapLabel(root.id)) {
    root.id = '';
  }
  children.forEach(child => clearBootstrapInternalLabels(child));
}

export function applyBootstrapSupportToTree(
  root: BootstrapTreeNode | null | undefined,
  supportBySplitKey: Record<string, number>,
  allLeafIds?: string[],
): void {
  if (!root) return;

  clearBootstrapInternalLabels(root);
  collectTreeSplitEntries(root, allLeafIds).forEach(entry => {
    if (Object.prototype.hasOwnProperty.call(supportBySplitKey, entry.key)) {
      entry.node.id = formatBootstrapSupportDecimal(supportBySplitKey[entry.key]);
    }
  });
}
