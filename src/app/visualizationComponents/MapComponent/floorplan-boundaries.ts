export interface FloorplanBoundaryPoint {
    x: number;
    y: number;
}

export interface FloorplanBoundary {
    id: string;
    label: string;
    vertices: FloorplanBoundaryPoint[];
}

export interface FloorplanBoundaryBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export type FloorplanTriangle = [FloorplanBoundaryPoint, FloorplanBoundaryPoint, FloorplanBoundaryPoint];

const EPSILON = 1e-8;

export function normalizeFloorplanBoundaryLabel(value: any): string {
    return String(value ?? '').trim().toLowerCase();
}

export function floorplanPointsEqual(a: FloorplanBoundaryPoint, b: FloorplanBoundaryPoint): boolean {
    return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function cross(a: FloorplanBoundaryPoint, b: FloorplanBoundaryPoint, c: FloorplanBoundaryPoint): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: FloorplanBoundaryPoint, start: FloorplanBoundaryPoint, end: FloorplanBoundaryPoint): boolean {
    if (Math.abs(cross(start, end, point)) > EPSILON) {
        return false;
    }

    return point.x >= Math.min(start.x, end.x) - EPSILON
        && point.x <= Math.max(start.x, end.x) + EPSILON
        && point.y >= Math.min(start.y, end.y) - EPSILON
        && point.y <= Math.max(start.y, end.y) + EPSILON;
}

function segmentOrientation(a: FloorplanBoundaryPoint, b: FloorplanBoundaryPoint, c: FloorplanBoundaryPoint): number {
    const value = cross(a, b, c);
    if (Math.abs(value) <= EPSILON) {
        return 0;
    }
    return value > 0 ? 1 : -1;
}

export function floorplanSegmentsIntersect(
    a1: FloorplanBoundaryPoint,
    a2: FloorplanBoundaryPoint,
    b1: FloorplanBoundaryPoint,
    b2: FloorplanBoundaryPoint
): boolean {
    const o1 = segmentOrientation(a1, a2, b1);
    const o2 = segmentOrientation(a1, a2, b2);
    const o3 = segmentOrientation(b1, b2, a1);
    const o4 = segmentOrientation(b1, b2, a2);

    if (o1 !== o2 && o3 !== o4) {
        return true;
    }

    return (o1 === 0 && pointOnSegment(b1, a1, a2))
        || (o2 === 0 && pointOnSegment(b2, a1, a2))
        || (o3 === 0 && pointOnSegment(a1, b1, b2))
        || (o4 === 0 && pointOnSegment(a2, b1, b2));
}

/**
 * Returns true when appending a point to an open boundary would make the new
 * segment cross any earlier, non-adjacent segment.
 */
export function floorplanAppendedSegmentHasIntersection(
    vertices: FloorplanBoundaryPoint[],
    candidate: FloorplanBoundaryPoint
): boolean {
    if (!Array.isArray(vertices) || vertices.length < 2 || !candidate) {
        return false;
    }

    const segmentStart = vertices[vertices.length - 1];
    if (floorplanPointsEqual(segmentStart, candidate)) {
        return true;
    }

    for (let i = 0; i < vertices.length - 1; i++) {
        // The preceding segment shares segmentStart and is expected to touch it.
        if (i === vertices.length - 2) {
            continue;
        }
        if (floorplanSegmentsIntersect(segmentStart, candidate, vertices[i], vertices[i + 1])) {
            return true;
        }
    }
    return false;
}

/**
 * Returns true when the implied closing segment from the last point back to
 * the first would cross an existing, non-adjacent segment.
 */
export function floorplanClosingSegmentHasIntersection(vertices: FloorplanBoundaryPoint[]): boolean {
    if (!Array.isArray(vertices) || vertices.length < 4) {
        return false;
    }

    const closingStart = vertices[vertices.length - 1];
    const closingEnd = vertices[0];
    for (let i = 1; i < vertices.length - 2; i++) {
        if (floorplanSegmentsIntersect(closingStart, closingEnd, vertices[i], vertices[i + 1])) {
            return true;
        }
    }
    return false;
}

export function floorplanPolygonSignedArea(vertices: FloorplanBoundaryPoint[]): number {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const current = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
}

export function cleanFloorplanPolygonVertices(vertices: FloorplanBoundaryPoint[]): FloorplanBoundaryPoint[] {
    const finiteVertices = (Array.isArray(vertices) ? vertices : [])
        .map(vertex => ({ x: Number(vertex?.x), y: Number(vertex?.y) }))
        .filter(vertex => Number.isFinite(vertex.x) && Number.isFinite(vertex.y));

    const deduplicated: FloorplanBoundaryPoint[] = [];
    finiteVertices.forEach(vertex => {
        if (!deduplicated.length || !floorplanPointsEqual(vertex, deduplicated[deduplicated.length - 1])) {
            deduplicated.push(vertex);
        }
    });

    if (deduplicated.length > 1 && floorplanPointsEqual(deduplicated[0], deduplicated[deduplicated.length - 1])) {
        deduplicated.pop();
    }

    let cleaned = deduplicated;
    let changed = true;
    while (changed && cleaned.length > 3) {
        changed = false;
        const nextVertices: FloorplanBoundaryPoint[] = [];
        for (let i = 0; i < cleaned.length; i++) {
            const previous = cleaned[(i - 1 + cleaned.length) % cleaned.length];
            const current = cleaned[i];
            const next = cleaned[(i + 1) % cleaned.length];
            if (Math.abs(cross(previous, current, next)) <= EPSILON && pointOnSegment(current, previous, next)) {
                changed = true;
                continue;
            }
            nextVertices.push(current);
        }
        cleaned = nextVertices;
    }

    return cleaned;
}

export function floorplanPolygonHasSelfIntersections(vertices: FloorplanBoundaryPoint[]): boolean {
    const count = vertices.length;
    if (count < 4) {
        return false;
    }

    for (let i = 0; i < count; i++) {
        const a1 = vertices[i];
        const a2 = vertices[(i + 1) % count];
        for (let j = i + 1; j < count; j++) {
            const adjacent = j === i
                || j === (i + 1) % count
                || i === (j + 1) % count;
            if (adjacent) {
                continue;
            }

            const b1 = vertices[j];
            const b2 = vertices[(j + 1) % count];
            if (floorplanSegmentsIntersect(a1, a2, b1, b2)) {
                return true;
            }
        }
    }

    return false;
}

export function floorplanPointInPolygon(point: FloorplanBoundaryPoint, vertices: FloorplanBoundaryPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const start = vertices[j];
        const end = vertices[i];
        if (pointOnSegment(point, start, end)) {
            return true;
        }

        const crossesRay = (end.y > point.y) !== (start.y > point.y)
            && point.x < ((start.x - end.x) * (point.y - end.y)) / (start.y - end.y) + end.x;
        if (crossesRay) {
            inside = !inside;
        }
    }
    return inside;
}

function pointInTriangle(
    point: FloorplanBoundaryPoint,
    a: FloorplanBoundaryPoint,
    b: FloorplanBoundaryPoint,
    c: FloorplanBoundaryPoint
): boolean {
    const c1 = cross(a, b, point);
    const c2 = cross(b, c, point);
    const c3 = cross(c, a, point);
    return c1 >= -EPSILON && c2 >= -EPSILON && c3 >= -EPSILON;
}

export function triangulateFloorplanPolygon(vertices: FloorplanBoundaryPoint[]): FloorplanTriangle[] {
    const cleaned = cleanFloorplanPolygonVertices(vertices);
    if (cleaned.length < 3 || Math.abs(floorplanPolygonSignedArea(cleaned)) <= EPSILON) {
        return [];
    }

    const indices = cleaned.map((_vertex, index) => index);
    if (floorplanPolygonSignedArea(cleaned) < 0) {
        indices.reverse();
    }

    const triangles: FloorplanTriangle[] = [];
    let guard = indices.length * indices.length;
    while (indices.length > 3 && guard-- > 0) {
        let earFound = false;
        for (let i = 0; i < indices.length; i++) {
            const previousIndex = indices[(i - 1 + indices.length) % indices.length];
            const currentIndex = indices[i];
            const nextIndex = indices[(i + 1) % indices.length];
            const previous = cleaned[previousIndex];
            const current = cleaned[currentIndex];
            const next = cleaned[nextIndex];

            if (cross(previous, current, next) <= EPSILON) {
                continue;
            }

            const containsAnotherVertex = indices.some(candidateIndex => {
                if ([previousIndex, currentIndex, nextIndex].includes(candidateIndex)) {
                    return false;
                }
                return pointInTriangle(cleaned[candidateIndex], previous, current, next);
            });
            if (containsAnotherVertex) {
                continue;
            }

            triangles.push([previous, current, next]);
            indices.splice(i, 1);
            earFound = true;
            break;
        }

        if (!earFound) {
            return [];
        }
    }

    if (indices.length === 3) {
        triangles.push([cleaned[indices[0]], cleaned[indices[1]], cleaned[indices[2]]]);
    }

    return triangles;
}

export function validateFloorplanPolygon(
    vertices: FloorplanBoundaryPoint[],
    bounds: FloorplanBoundaryBounds
): FloorplanBoundaryPoint[] {
    if (!Array.isArray(vertices) || vertices.some(vertex => !Number.isFinite(Number(vertex?.x)) || !Number.isFinite(Number(vertex?.y)))) {
        throw new Error('Boundary points must contain finite coordinates.');
    }

    const cleaned = cleanFloorplanPolygonVertices(vertices);
    if (cleaned.length < 3) {
        throw new Error('A boundary must contain at least three distinct points.');
    }
    if (cleaned.some(vertex => vertex.x < bounds.minX - EPSILON
        || vertex.x > bounds.maxX + EPSILON
        || vertex.y < bounds.minY - EPSILON
        || vertex.y > bounds.maxY + EPSILON)) {
        throw new Error('Keep every boundary point inside the uploaded image.');
    }
    if (floorplanPolygonHasSelfIntersections(cleaned)) {
        throw new Error('Boundary edges cannot cross. Undo or move a corner so the outline does not overlap itself.');
    }
    if (Math.abs(floorplanPolygonSignedArea(cleaned)) <= EPSILON) {
        throw new Error('Boundary area must be greater than zero.');
    }
    if (triangulateFloorplanPolygon(cleaned).length === 0) {
        throw new Error('Unable to create a valid area from this boundary.');
    }
    return cleaned;
}

function triangleArea(triangle: FloorplanTriangle): number {
    return Math.abs(cross(triangle[0], triangle[1], triangle[2])) / 2;
}

function normalizeRandom(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1 - Number.EPSILON, value));
}

export function randomPointInFloorplanPolygon(
    vertices: FloorplanBoundaryPoint[],
    random: () => number = Math.random
): FloorplanBoundaryPoint {
    const triangles = triangulateFloorplanPolygon(vertices);
    if (!triangles.length) {
        throw new Error('Unable to place a node inside an invalid boundary.');
    }

    const areas = triangles.map(triangleArea);
    const totalArea = areas.reduce((sum, area) => sum + area, 0);
    let target = normalizeRandom(random()) * totalArea;
    let selected = triangles[triangles.length - 1];
    for (let i = 0; i < triangles.length; i++) {
        target -= areas[i];
        if (target <= 0) {
            selected = triangles[i];
            break;
        }
    }

    const root = Math.sqrt(normalizeRandom(random()));
    const thirdWeight = normalizeRandom(random());
    const aWeight = 1 - root;
    const bWeight = root * (1 - thirdWeight);
    const cWeight = root * thirdWeight;

    return {
        x: selected[0].x * aWeight + selected[1].x * bWeight + selected[2].x * cWeight,
        y: selected[0].y * aWeight + selected[1].y * bWeight + selected[2].y * cWeight
    };
}
