// import { GraphNodeShape } from '@unovis/ts';

export interface NodeDatum {
    id: string;
    label: string;
    site: string;
    selected: boolean;
    // Include other properties that your nodes might need
}

export interface LinkDatum {
    source: string;
    target: string;
    value: number;
    chapter: string;
    // Include other properties that your links might need
}

interface GraphPanelConfig {
    nodes: (string | number)[];
    label?: string;
    labelPosition?: string;
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

export interface GraphData {
    nodes: NodeDatum[];
    links: LinkDatum[];
    panels?: GraphPanelConfig[];
}

// Sample data for nodes and links
export const nodes: NodeDatum[] = [
    { id: '1', label: 'Node 1', site: 'siteA', selected: false },
    { id: '2', label: 'Node 2', site: 'siteA', selected: false },
    { id: '3', label: 'Node 3', site: 'siteB', selected: false },
    { id: '4', label: 'Node 4', site: 'siteB', selected: false }
];

export const links: LinkDatum[] = [
    { source: '1', target: '2', value: 10, chapter: 'Chapter 1' },
    { source: '1', target: '3', value: 15, chapter: 'Chapter 2' },
    { source: '2', target: '4', value: 20, chapter: 'Chapter 3' }
];

export const data: GraphData = {
    nodes,
    links
};
