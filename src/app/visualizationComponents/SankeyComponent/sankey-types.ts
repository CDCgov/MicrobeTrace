export type SankeyNode = {
    sourceLinks?: SankeyLink[],
    targetLinks?: SankeyLink[],
    value?: number,
    index?: number,
    name: string,
    depth?: number,
    height?: number,
    layer: number,
    x0?: number,
    x1?: number,
    y0?: number,
    y1?: number,
    color: string,
    node?: string | number
}

export type SankeyLink = {
    source: SankeyNode | number,
    target: SankeyNode | number,
    value?: number,
    y0?: number,
    y1?: number,
    width?: number,
    index?: number,
    opacity?: number,
}