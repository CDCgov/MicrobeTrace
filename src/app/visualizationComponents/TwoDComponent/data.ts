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

export interface GraphData {
    nodes: NodeDatum[];
    links: LinkDatum[];
}