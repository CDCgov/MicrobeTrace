export type NetworkSubsetFilterTarget = 'node' | 'link';

export type NetworkSubsetFilterOperator =
  | 'contains'
  | 'equals'
  | 'not-equals'
  | 'starts-with'
  | 'ends-with'
  | 'less-than'
  | 'less-than-or-equal'
  | 'greater-than'
  | 'greater-than-or-equal';

export interface NetworkSubsetFilterRule {
  target: NetworkSubsetFilterTarget;
  field: string;
  operator: NetworkSubsetFilterOperator;
  value: string | number;
}

export interface NetworkSubsetFilterState {
  node: NetworkSubsetFilterRule | null;
  link: NetworkSubsetFilterRule | null;
}

export const NETWORK_SUBSET_FILTER_OPERATOR_OPTIONS: Array<{ label: string; value: NetworkSubsetFilterOperator }> = [
  { label: 'contains', value: 'contains' },
  { label: 'equals', value: 'equals' },
  { label: 'does not equal', value: 'not-equals' },
  { label: 'starts with', value: 'starts-with' },
  { label: 'ends with', value: 'ends-with' },
  { label: 'less than', value: 'less-than' },
  { label: 'less than or equal to', value: 'less-than-or-equal' },
  { label: 'greater than', value: 'greater-than' },
  { label: 'greater than or equal to', value: 'greater-than-or-equal' },
];

const OPERATOR_LABELS = NETWORK_SUBSET_FILTER_OPERATOR_OPTIONS.reduce((labels, option) => {
  labels[option.value] = option.label;
  return labels;
}, {} as Record<NetworkSubsetFilterOperator, string>);

const VALID_OPERATORS = new Set<NetworkSubsetFilterOperator>(
  NETWORK_SUBSET_FILTER_OPERATOR_OPTIONS.map(option => option.value)
);

export function createEmptyNetworkSubsetFilter(): NetworkSubsetFilterState {
  return {
    node: null,
    link: null,
  };
}

export function normalizeNetworkSubsetFilterState(input: any): NetworkSubsetFilterState {
  return {
    node: normalizeNetworkSubsetFilterRule(input?.node, 'node'),
    link: normalizeNetworkSubsetFilterRule(input?.link, 'link'),
  };
}

export function isNetworkSubsetRuleActive(rule: NetworkSubsetFilterRule | null | undefined): rule is NetworkSubsetFilterRule {
  if (!rule) {
    return false;
  }

  const value = rule.value;

  return !!rule.field
    && rule.field !== 'None'
    && VALID_OPERATORS.has(rule.operator)
    && value !== null
    && value !== undefined
    && String(value).trim().length > 0;
}

export function hasActiveNetworkSubsetFilter(state: NetworkSubsetFilterState | null | undefined): boolean {
  return isNetworkSubsetRuleActive(state?.node) || isNetworkSubsetRuleActive(state?.link);
}

export function evaluateNetworkSubsetRule(record: any, rule: NetworkSubsetFilterRule): boolean {
  const values = normalizeRecordValues(record?.[rule.field]);
  const expectedText = normalizeText(rule.value);
  const expectedNumber = toNumber(rule.value);

  switch (rule.operator) {
    case 'contains':
      return values.some(value => normalizeText(value).includes(expectedText));
    case 'equals':
      return values.some(value => valuesAreEqual(value, rule.value));
    case 'not-equals':
      return values.every(value => !valuesAreEqual(value, rule.value));
    case 'starts-with':
      return values.some(value => normalizeText(value).startsWith(expectedText));
    case 'ends-with':
      return values.some(value => normalizeText(value).endsWith(expectedText));
    case 'less-than':
      return expectedNumber !== null && values.some(value => compareNumber(value, expectedNumber, (a, b) => a < b));
    case 'less-than-or-equal':
      return expectedNumber !== null && values.some(value => compareNumber(value, expectedNumber, (a, b) => a <= b));
    case 'greater-than':
      return expectedNumber !== null && values.some(value => compareNumber(value, expectedNumber, (a, b) => a > b));
    case 'greater-than-or-equal':
      return expectedNumber !== null && values.some(value => compareNumber(value, expectedNumber, (a, b) => a >= b));
    default:
      return false;
  }
}

export function applyNetworkSubsetVisibility(
  nodes: any[] = [],
  links: any[] = [],
  state: NetworkSubsetFilterState = createEmptyNetworkSubsetFilter()
): { visibleNodes: number; visibleLinks: number } {
  const subsetFilter = normalizeNetworkSubsetFilterState(state);
  const nodeRule = isNetworkSubsetRuleActive(subsetFilter.node) ? subsetFilter.node : null;
  const linkRule = isNetworkSubsetRuleActive(subsetFilter.link) ? subsetFilter.link : null;
  const nodeMatches = new Set<string>();
  const incidentNodeIds = new Set<string>();
  let visibleLinks = 0;

  if (!nodeRule && !linkRule) {
    nodes.forEach(node => node._subsetVisible = true);
    links.forEach(link => link._subsetVisible = true);

    return {
      visibleNodes: nodes.length,
      visibleLinks: links.length,
    };
  }

  nodes.forEach(node => {
    const nodeId = getNodeId(node);
    const matches = !nodeRule || evaluateNetworkSubsetRule(node, nodeRule);

    if (matches) {
      nodeMatches.add(nodeId);
    }
  });

  links.forEach(link => {
    const sourceId = getEndpointId(link?.source);
    const targetId = getEndpointId(link?.target);
    const endpointsMatchNodeRule = nodeMatches.has(sourceId) && nodeMatches.has(targetId);
    const matchesLinkRule = !linkRule || evaluateNetworkSubsetRule(link, linkRule);
    const subsetVisible = endpointsMatchNodeRule && matchesLinkRule;

    link._subsetVisible = subsetVisible;

    if (subsetVisible) {
      visibleLinks++;
      incidentNodeIds.add(sourceId);
      incidentNodeIds.add(targetId);
    }
  });

  let visibleNodes = 0;
  nodes.forEach(node => {
    const nodeId = getNodeId(node);
    const subsetVisible = linkRule
      ? nodeMatches.has(nodeId) && incidentNodeIds.has(nodeId)
      : nodeMatches.has(nodeId);

    node._subsetVisible = subsetVisible;

    if (subsetVisible) {
      visibleNodes++;
    }
  });

  return {
    visibleNodes,
    visibleLinks,
  };
}

export function describeNetworkSubsetFilter(
  state: NetworkSubsetFilterState | null | undefined,
  titleize: (field: string) => string = field => field
): string {
  const subsetFilter = normalizeNetworkSubsetFilterState(state);

  return [subsetFilter.node, subsetFilter.link]
    .filter(isNetworkSubsetRuleActive)
    .map(rule => describeNetworkSubsetFilterRule(rule, titleize))
    .join('; ');
}

function normalizeNetworkSubsetFilterRule(input: any, target: NetworkSubsetFilterTarget): NetworkSubsetFilterRule | null {
  if (!input || input.target && input.target !== target) {
    return null;
  }

  const operator = VALID_OPERATORS.has(input.operator)
    ? input.operator
    : 'contains';

  const rule: NetworkSubsetFilterRule = {
    target,
    field: String(input.field || ''),
    operator,
    value: input.value ?? '',
  };

  return isNetworkSubsetRuleActive(rule) ? rule : null;
}

function describeNetworkSubsetFilterRule(
  rule: NetworkSubsetFilterRule,
  titleize: (field: string) => string
): string {
  const targetLabel = rule.target === 'node' ? 'Node' : 'Link';
  const operatorLabel = OPERATOR_LABELS[rule.operator] || rule.operator;

  return `${targetLabel} ${titleize(rule.field)} ${operatorLabel} ${rule.value}`;
}

function normalizeRecordValues(value: any): any[] {
  if (Array.isArray(value)) {
    return value.length > 0 ? value : [''];
  }

  return [value];
}

function normalizeText(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().toLowerCase();
}

function valuesAreEqual(left: any, right: any): boolean {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);

  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber === rightNumber;
  }

  return normalizeText(left) === normalizeText(right);
}

function compareNumber(value: any, expected: number, compare: (actual: number, expected: number) => boolean): boolean {
  const actual = toNumber(value);

  return actual !== null && compare(actual, expected);
}

function toNumber(value: any): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getNodeId(node: any): string {
  return getEndpointId(node?._id ?? node?.id);
}

function getEndpointId(endpoint: any): string {
  if (endpoint === null || endpoint === undefined) {
    return '';
  }

  if (typeof endpoint === 'object') {
    return getEndpointId(endpoint._id ?? endpoint.id ?? endpoint.data?.id);
  }

  return String(endpoint);
}
