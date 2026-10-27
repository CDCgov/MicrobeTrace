import {
    getCustomNodeShapeVectorData,
    getMixedNodeShapeDataUri,
    MixedNodeShapeSegment,
    resolveNodeShapeKey
} from './node-shapes';

/** Build a node fill independently from its outline, using rendered border units. */
export function getNetworkNodeImage(
    shapeKey: string,
    color: string,
    opacity: number,
    borderColor: string,
    borderWidth: number,
    renderedDiameter: number,
    segments: MixedNodeShapeSegment[] = [],
    includeOutline = true
): string | undefined {
    const shape = resolveNodeShapeKey(shapeKey);
    const custom = getCustomNodeShapeVectorData(shape);
    if (!custom && segments.length < 2) return undefined;

    // SVG strokes use the icon's viewBox units, whereas native borders use graph units.
    const viewBox = custom?.viewBox.split(/\s+/).map(Number);
    const extent = viewBox ? Math.max(viewBox[2], viewBox[3]) : 300;
    const strokeWidth = Math.max(0, borderWidth) * extent / Math.max(1, renderedDiameter - borderWidth);
    return getMixedNodeShapeDataUri(
        shape, color, borderColor, strokeWidth, opacity, segments, null,
        {
            fillCanvas: !custom,
            includeStroke: Boolean(custom && includeOutline && borderWidth > 0),
            customShapePadding: 0,
            customShapeViewBoxPadding: 0,
            useNativeShapeClip: shape === 'star' || shape === 'vee',
            renderedSize: renderedDiameter
        }
    );
}

/** Only the colored fill is dimmed; SVG silhouette strokes retain their opacity. */
export function dimCustomNodeImage(image: string, multiplier: number): string {
    const svg = new DOMParser().parseFromString(
        decodeURIComponent(image.slice(image.indexOf(',') + 1)), 'image/svg+xml'
    );
    svg.querySelectorAll('[fill]:not([fill="none"])').forEach(element => {
        const opacity = Number(element.getAttribute('fill-opacity') ?? 1);
        element.setAttribute('fill-opacity', String(opacity * multiplier));
    });
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
}
