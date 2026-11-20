import { formatNetworkLinkDistance, formatNetworkLinkDistanceLabel, getNetworkLinkExtremities } from './network-link-presentation';

describe('Network link presentation', () => {
    const percentage = { distanceMetric: 'tn93', distanceDisplayFormat: 'percentage' };
    const decimal = { ...percentage, distanceDisplayFormat: 'decimal' };
    const snps = { ...percentage, distanceMetric: 'snps' };
    const distanceLink = (distance: any) => ({ distance, hasDistance: true, distanceOrigin: 'sequences', origin: ['sequences'] });

    it('formats TN93 percentages consistently while keeping the stored distance unchanged', () => {
        const link = distanceLink(0.015);
        expect(formatNetworkLinkDistanceLabel(link, percentage, 3)).toBe('1.500%');
        expect(formatNetworkLinkDistance(link.distance, percentage)).toBe('1.5%');
        expect(formatNetworkLinkDistanceLabel(link, decimal, 4)).toBe('0.0150');
        expect(link.distance).toBe(0.015);
    });

    it('accepts numeric strings and shows SNP counts as integers, including zero', () => {
        expect(formatNetworkLinkDistanceLabel(distanceLink('0.015'), percentage, 2)).toBe('1.50%');
        expect(formatNetworkLinkDistanceLabel(distanceLink(5), snps, 3)).toBe('5');
        expect(formatNetworkLinkDistanceLabel(distanceLink('5.6'), snps, 3)).toBe('6');
        expect(formatNetworkLinkDistanceLabel(distanceLink(0), snps, 3)).toBe('0');
        expect(formatNetworkLinkDistanceLabel(distanceLink(0), decimal, 3)).toBe('');
    });

    it('suppresses labels when the distance is unavailable or its origin is filtered out', () => {
        expect(formatNetworkLinkDistanceLabel({ ...distanceLink(0.015), hasDistance: false }, percentage, 3)).toBe('');
        expect(formatNetworkLinkDistanceLabel({ ...distanceLink(0.015), origin: ['contacts'] }, percentage, 3)).toBe('');
        expect(formatNetworkLinkDistanceLabel({ ...distanceLink(0.015), origin: ['contacts', 'sequences'] }, percentage, 3)).toBe('1.500%');
        expect(formatNetworkLinkDistanceLabel({ ...distanceLink(0.015), origin: undefined }, percentage, 3)).toBe('');
    });

    it('keeps nonnumeric distance annotations as text', () => {
        expect(formatNetworkLinkDistanceLabel(distanceLink('unknown'), percentage, 3)).toBe('unknown');
    });

    it('never adds arrowheads to undirected links when arrows are enabled', () => {
        for (const directed of [false, undefined, null, 0, '0', 'false', 'no']) {
            expect(getNetworkLinkExtremities({ directed, bidirectional: true }, true, true)).toEqual({ head: 'none', tail: 'none' });
        }
    });

    it('requires both the display switch and each record direction flag', () => {
        const forward = { head: 'arrow', tail: 'none' } as const;
        expect(getNetworkLinkExtremities({ directed: true }, true, true)).toEqual(forward);
        expect(getNetworkLinkExtremities({ directed: true, bidirectional: true }, true, false)).toEqual(forward);
        expect(getNetworkLinkExtremities({ directed: ' YES ', bidirectional: '1' }, 'true', 'y')).toEqual({ head: 'arrow', tail: 'arrow' });
        expect(getNetworkLinkExtremities({ directed: true, bidirectional: true }, false, true)).toEqual({ head: 'none', tail: 'none' });
    });
});
