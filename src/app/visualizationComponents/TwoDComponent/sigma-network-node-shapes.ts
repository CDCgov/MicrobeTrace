import type { SDFShape } from 'sigma/rendering';

export type SigmaNodeShape = 'circle' | 'square' | 'triangle' | 'diamond'
  | 'rhomboid' | 'pentagon' | 'hexagon' | 'heptagon' | 'octagon' | 'star' | 'barrel' | 'tag' | 'vee';

type Point = readonly [number, number];

// Match Cytoscape's generateUnitNgonPointsFitToSquare: even-sided polygons
// have a horizontal top edge; odd-sided polygons have a vertex at the top.
function ngon(sides: number, rotation = 0): Point[] {
  const increment = 2 * Math.PI / sides;
  const start = Math.PI / 2 + (sides % 2 === 0 ? increment / 2 : 0) + rotation;
  return Array.from({ length: sides }, (_, index) => {
    const angle = start + index * increment;
    return [Math.cos(angle), Math.sin(angle)] as Point;
  });
}

function fitToSquare(points: Point[]): Point[] {
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  return points.map(([x, y]) => [
    2 * (x - minX) / (maxX - minX) - 1,
    2 * (y - minY) / (maxY - minY) - 1,
  ]);
}

function star(): Point[] {
  const outer = ngon(5);
  const inner = ngon(5, Math.PI / 5);
  const innerRadius = 0.5 * (3 - Math.sqrt(5)) * 1.57;
  return fitToSquare(outer.flatMap((point, index) => [
    point,
    [inner[index][0] * innerRadius, inner[index][1] * innerRadius] as Point,
  ]));
}

function barrel(): Point[] {
  // Broader quadratic corners make Barrel distinct from Square at node sizes.
  // Sample the curves once, rather than doing curve work per pixel.
  const corners: Point[][] = [
    [[-1, 0.6], [-1, 1], [-0.5, 1]],
    [[0.5, 1], [1, 1], [1, 0.6]],
    [[1, -0.6], [1, -1], [0.5, -1]],
    [[-0.5, -1], [-1, -1], [-1, -0.6]],
  ];
  return corners.flatMap(([a, b, c]) => Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    const u = 1 - t;
    return [
      u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
      u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
    ] as Point;
  }));
}

// Coordinates use Sigma's upward-positive UV axis. Rhombus faces the same
// direction as the picker, and Barrel has more pronounced rounded corners.
export const SIGMA_NETWORK_POLYGON_POINTS: Partial<Record<SigmaNodeShape, readonly Point[]>> = {
  rhomboid: [[1, 1], [-0.333, 1], [-1, -1], [0.333, -1]],
  pentagon: fitToSquare(ngon(5)),
  hexagon: fitToSquare(ngon(6)),
  heptagon: fitToSquare(ngon(7)),
  octagon: fitToSquare(ngon(8)),
  star: star(),
  barrel: barrel(),
  tag: [[-1, 1], [0.25, 1], [1, 0], [0.25, -1], [-1, -1]],
  vee: [[-1, 1], [0, 0.333], [1, 1], [0, -1]],
};

function polygonShape(name: string, points: readonly Point[]): SDFShape {
  const vertex = ([x, y]: Point) => `vec2(${x.toFixed(8)}, ${y.toFixed(8)})`;
  // Emit constant segments rather than indexing a GLSL array in a loop.
  // The same SDF is compiled into Sigma's edge-clamping shaders, where nested
  // loops with dynamic array indexing are very expensive on Windows drivers.
  const segments = points.map((a, index) => {
    const b = points[(index + 1) % points.length];
    return `
  {
    vec2 a = ${vertex(a)};
    vec2 edge = ${vertex([b[0] - a[0], b[1] - a[1]])};
    vec2 relative = p - a;
    vec2 nearest = relative - edge * clamp(dot(relative, edge) / dot(edge, edge), 0.0, 1.0);
    distanceSquared = min(distanceSquared, dot(nearest, nearest));
    ${Math.abs(b[1] - a[1]) < 1e-10 ? '' : `if ((a.y > p.y) != (${b[1].toFixed(8)} > p.y)) {
      float crossingX = a.x + (p.y - a.y) * edge.x / edge.y;
      if (p.x < crossingX) inside = !inside;
    }`}
  }`;
  }).join('\n');
  return {
    name,
    uniforms: [],
    // Signed distance to the nearest segment plus even/odd containment also
    // handles concave shapes. Sigma reuses this SDF for borders and picking.
    glsl: `
float sdf_${name}(vec2 uv, float size) {
  vec2 p = uv / max(size, 0.000001);
  float distanceSquared = 100.0;
  bool inside = false;
  ${segments}
  return sqrt(distanceSquared) * (inside ? -size : size);
}
`,
  };
}

export const SIGMA_NETWORK_ADDITIONAL_SHAPES: SDFShape[] = Object.entries(SIGMA_NETWORK_POLYGON_POINTS)
  .map(([name, points]) => polygonShape(name, points));

const BUILTIN_POLYGON_POINTS: Partial<Record<SigmaNodeShape, readonly Point[]>> = {
  square: [[-1, 1], [1, 1], [1, -1], [-1, -1]],
  diamond: [[0, 1], [1, 0], [0, -1], [-1, 0]],
  triangle: [[0, 1], [Math.sqrt(3) / 2, -0.5], [-Math.sqrt(3) / 2, -0.5]],
};

/** Canvas outlines for image glyphs and the fallback without feature shaders. */
export function traceSigmaNodeOutline(
  context: CanvasRenderingContext2D, shape: SigmaNodeShape, x: number, y: number, radius: number,
): void {
  context.beginPath();
  const points = SIGMA_NETWORK_POLYGON_POINTS[shape] || BUILTIN_POLYGON_POINTS[shape];
  if (!points) {
    context.arc(x, y, radius, 0, Math.PI * 2);
    return;
  }
  points.forEach(([px, py], index) => {
    if (index === 0) context.moveTo(x + px * radius, y - py * radius);
    else context.lineTo(x + px * radius, y - py * radius);
  });
  context.closePath();
}

/** Distance from the center to a polygon along a screen-space ray. */
export function sigmaPolygonBoundaryDistance(shape: SigmaNodeShape, dx: number, dy: number): number | null {
  const points = SIGMA_NETWORK_POLYGON_POINTS[shape];
  if (!points) return null;
  let distance = Infinity;
  for (let index = 0; index < points.length; index++) {
    const [ax, ay] = points[index];
    const [bx, by] = points[(index + 1) % points.length];
    const ex = bx - ax;
    const ey = by - ay;
    const cross = dx * ey + dy * ex;
    if (Math.abs(cross) < 1e-10) continue;
    const ray = (ax * ey - ay * ex) / cross;
    const segment = (-ax * dy - ay * dx) / cross;
    if (ray >= 0 && segment >= 0 && segment <= 1) distance = Math.min(distance, ray);
  }
  return Number.isFinite(distance) ? distance : null;
}
