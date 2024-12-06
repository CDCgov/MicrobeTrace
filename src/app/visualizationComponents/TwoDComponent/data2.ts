// import { GraphNodeShape } from '@unovis/ts';

export type NodeDatum2 = {
  id: string;
  group: string;
  label: string;
  // shape: GraphNodeShape;
}

export type LinkDatum2 = {
  source: string;
  target: string;
}

export type GraphPanelConfig = {
  nodes: (string | number)[];
  label?: string;
  borderColor?: string;
  borderWidth?: number;
  padding?: number;
  dashedOutline?: boolean;
  sideIconSymbol?: string;
  sideIconFontSize?: string;
  sideIconSymbolColor?: string;
  // sideIconShape?: GraphNodeShape;
  sideIconShapeSize?: number;
  sideIconShapeStroke?: string;
  sideIconCursor?: string;
}

export const nodes: NodeDatum2[] = [
  // { id: 'node1', group: 'group1', label: 'Node 1', shape: GraphNodeShape.Circle },
  // { id: 'node2', group: 'group1', label: 'Node 2', shape: GraphNodeShape.Circle },
  // { id: 'node3', group: 'group2', label: 'Node 3', shape: GraphNodeShape.Square },
  // { id: 'node4', group: 'group2', label: 'Node 4', shape: GraphNodeShape.Square },
];

export const links: LinkDatum2[] = [
  { source: 'node1', target: 'node2' },
  { source: 'node3', target: 'node4' },
  { source: 'node1', target: 'node3' },
  { source: 'node2', target: 'node4' },
];

export const panels: GraphPanelConfig[] = [
  {
    nodes: ['node1', 'node2'],
    label: 'Group 1',
    borderColor: '#E3116C',
    borderWidth: 2,
    padding: 10,
    dashedOutline: true,
    sideIconSymbol: '⚽',
    // sideIconShape: GraphNodeShape.Circle,
    sideIconShapeStroke: '#777',
    sideIconCursor: 'pointer',
    sideIconFontSize: '24px',
    sideIconShapeSize: 50,
  },
  {
    nodes: ['node3', 'node4'],
    label: 'Group 2',
    borderColor: '#00A1E4',
    borderWidth: 2,
    padding: 10,
    dashedOutline: true,
    sideIconSymbol: '🏀',
    // sideIconShape: GraphNodeShape.Square,
    sideIconShapeStroke: '#777',
    sideIconCursor: 'pointer',
    sideIconFontSize: '24px',
    sideIconShapeSize: 50,
  },
];