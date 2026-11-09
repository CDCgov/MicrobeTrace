export interface NetworkDistanceDisplaySettings {
    distanceMetric: string;
    distanceDisplayFormat: string;
}

export function isNetworkFlagEnabled(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return typeof value === 'string' && ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
}

/** Display switches never turn an undirected record into a directed link. */
export function getNetworkLinkExtremities(link: any, showArrows: unknown, showBidirectional: unknown): { head: 'arrow' | 'none'; tail: 'arrow' | 'none' } {
    const directed = isNetworkFlagEnabled(showArrows) && isNetworkFlagEnabled(link?.directed);
    return {
        head: directed ? 'arrow' : 'none',
        tail: directed && isNetworkFlagEnabled(showBidirectional) && isNetworkFlagEnabled(link?.bidirectional) ? 'arrow' : 'none',
    };
}

export function hasVisibleNetworkLinkDistance(link: any): boolean {
    if (!link?.hasDistance) return false;
    if (!link.distanceOrigin) return true;
    const origins = link.origin ?? link.Origin;
    return Array.isArray(origins) ? origins.includes(link.distanceOrigin) : origins === link.distanceOrigin;
}

/** Shared by both network views; callers retain their own label-size and precision settings. */
export function formatNetworkLinkDistance(value: unknown, display: NetworkDistanceDisplaySettings, decimalLength?: number): string {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value ?? '');
    if (display.distanceMetric.toLowerCase() === 'snps') return String(Math.round(number));
    const percentage = display.distanceMetric.toLowerCase() === 'tn93' && display.distanceDisplayFormat.toLowerCase() === 'percentage';
    const displayed = percentage ? number * 100 : number;
    const text = decimalLength === undefined || decimalLength === null || Number.isNaN(Number(decimalLength))
        ? displayed.toFixed(3).replace(/\.?0+$/, '')
        : displayed.toFixed(Math.max(0, Math.floor(Number(decimalLength))));
    return percentage ? `${text}%` : text;
}

export function formatNetworkLinkDistanceLabel(link: any, display: NetworkDistanceDisplaySettings, decimalLength?: number): string {
    if (!hasVisibleNetworkLinkDistance(link)) return '';
    const value = link.distance;
    if (typeof value !== 'number' && Number.isNaN(parseFloat(value))) return String(value ?? '');
    // Preserve the 2D convention: zero SNP counts are meaningful, zero TN93 labels are suppressed.
    if (display.distanceMetric.toLowerCase() !== 'snps' && Number(value) === 0) return '';
    return formatNetworkLinkDistance(value, display, decimalLength);
}
