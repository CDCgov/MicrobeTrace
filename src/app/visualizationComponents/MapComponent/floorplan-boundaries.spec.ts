import {
    cleanFloorplanPolygonVertices,
    floorplanAppendedSegmentHasIntersection,
    floorplanClosingSegmentHasIntersection,
    floorplanPointInPolygon,
    floorplanPolygonHasSelfIntersections,
    floorplanPolygonSignedArea,
    normalizeFloorplanBoundaryLabel,
    randomPointInFloorplanPolygon,
    triangulateFloorplanPolygon,
    validateFloorplanPolygon
} from './floorplan-boundaries';

describe('floorplan boundary geometry', () => {
    it('normalizes labels for field-value matching', () => {
        expect(normalizeFloorplanBoundaryLabel('  Lab A  ')).toBe('lab a');
        expect(normalizeFloorplanBoundaryLabel(null)).toBe('');
    });

    it('removes closing duplicates and unnecessary collinear points', () => {
        const cleaned = cleanFloorplanPolygonVertices([
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 0, y: 0 }
        ]);

        expect(cleaned).toEqual([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 }
        ]);
    });

    it('detects self-intersecting boundaries', () => {
        expect(floorplanPolygonHasSelfIntersections([
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 10, y: 0 }
        ])).toBeTrue();
    });

    it('detects a crossing before an appended polygon segment is placed', () => {
        const openBoundary = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 }
        ];

        expect(floorplanAppendedSegmentHasIntersection(openBoundary, { x: 5, y: -5 })).toBeTrue();
        expect(floorplanAppendedSegmentHasIntersection(openBoundary, { x: 0, y: 10 })).toBeFalse();
    });

    it('detects a crossing in the implied polygon closing segment', () => {
        expect(floorplanClosingSegmentHasIntersection([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 0, y: 10 },
            { x: 10, y: 10 }
        ])).toBeTrue();

        expect(floorplanClosingSegmentHasIntersection([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 }
        ])).toBeFalse();
    });

    it('triangulates a concave polygon without changing its area', () => {
        const polygon = [
            { x: 0, y: 0 },
            { x: 8, y: 0 },
            { x: 8, y: 8 },
            { x: 4, y: 4 },
            { x: 0, y: 8 }
        ];
        const triangles = triangulateFloorplanPolygon(polygon);
        const triangleArea = triangles.reduce((sum, triangle) => {
            return sum + Math.abs(floorplanPolygonSignedArea(triangle));
        }, 0);

        expect(triangles.length).toBe(3);
        expect(triangleArea).toBeCloseTo(Math.abs(floorplanPolygonSignedArea(polygon)), 8);
    });

    it('samples random points inside concave polygons', () => {
        const polygon = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 3 },
            { x: 3, y: 3 },
            { x: 3, y: 10 },
            { x: 0, y: 10 }
        ];

        for (let i = 0; i < 100; i++) {
            expect(floorplanPointInPolygon(randomPointInFloorplanPolygon(polygon), polygon)).toBeTrue();
        }
    });

    it('rejects boundaries outside the image', () => {
        expect(() => validateFloorplanPolygon([
            { x: 0, y: 0 },
            { x: 12, y: 0 },
            { x: 0, y: 5 }
        ], { minX: 0, minY: 0, maxX: 10, maxY: 10 }))
            .toThrowError('Keep every boundary point inside the uploaded image.');
    });

    it('rejects non-finite and degenerate polygons', () => {
        const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
        expect(() => validateFloorplanPolygon([
            { x: 0, y: 0 },
            { x: Number.NaN, y: 5 },
            { x: 5, y: 0 }
        ], bounds)).toThrowError('Boundary points must contain finite coordinates.');

        expect(() => validateFloorplanPolygon([
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 10, y: 0 }
        ], bounds)).toThrowError('Boundary area must be greater than zero.');
    });

    it('includes points on polygon edges in containment checks', () => {
        const polygon = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 }
        ];

        expect(floorplanPointInPolygon({ x: 5, y: 0 }, polygon)).toBeTrue();
        expect(floorplanPointInPolygon({ x: 11, y: 5 }, polygon)).toBeFalse();
    });
});
