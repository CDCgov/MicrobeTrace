export type SankeyNode = {
    sourceLinks?: SankeyLink[],
    targetLinks?: SankeyLink[],
    value?: number,
    index: number,
    id?: string,
    depth?: number,
    height?: number,
    layer?: number,
    x0?: number,
    x1?: number,
    y0?: number,
    y1?: number,
}

export type SankeyLink = {
    source: SankeyNode | string,
    target: SankeyNode | string,
    value?: number,
    y0?: number,
    y1?: number,
    width?: number,
    index?: number,
}