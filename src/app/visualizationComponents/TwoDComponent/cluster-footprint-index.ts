import { quadtree } from 'd3';

export interface ClusterFootprint {
  x: number;
  y: number;
  radius: number;
}

interface FootprintLeaf {
  data: ClusterFootprint;
  next?: FootprintLeaf;
}
type FootprintQuad = FootprintLeaf | FootprintQuad[];
interface FootprintTree {
  add(point: ClusterFootprint): void;
  root(): FootprintQuad | undefined;
  extent(): [[number, number], [number, number]];
  visit(callback: (node: FootprintQuad, x0: number, y0: number, x1: number, y1: number) => boolean | void): void;
}

/** Index fixed footprints while a family grows. Queries bound the complete
 * approach direction, so distant obstacles cannot be missed by a local search.
 */
export class ClusterFootprintIndex {
  private readonly tree = quadtree().x((point: ClusterFootprint) => point.x)
    .y((point: ClusterFootprint) => point.y) as FootprintTree;
  private readonly radii = new WeakMap<object, number>();

  constructor(points: readonly ClusterFootprint[]) {
    points.forEach(point => this.add(point));
  }

  private maxRadius(node: FootprintQuad | undefined): number {
    if (!node) return 0;
    const cached = this.radii.get(node);
    if (cached !== undefined) return cached;
    // cover() can wrap an existing root in several new branches that are not
    // on the new point's insertion path. Resolve those bounds lazily as well.
    const radius = Array.isArray(node)
      ? Math.max(this.maxRadius(node[0]), this.maxRadius(node[1]), this.maxRadius(node[2]), this.maxRadius(node[3]))
      : Math.max(node.data.radius, this.maxRadius(node.next));
    this.radii.set(node, radius);
    return radius;
  }

  add(point: ClusterFootprint): void {
    this.tree.add(point);
    let node = this.tree.root();
    let [[x0, y0], [x1, y1]] = this.tree.extent();
    const parents: FootprintQuad[][] = [];
    while (Array.isArray(node)) {
      parents.push(node);
      const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
      const right = point.x >= xm, bottom = point.y >= ym;
      node = node[(bottom ? 2 : 0) | (right ? 1 : 0)];
      if (right) x0 = xm; else x1 = xm;
      if (bottom) y0 = ym; else y1 = ym;
    }
    if (node) this.radii.set(node, Math.max(point.radius, this.maxRadius(node.next)));
    // Only the insertion path changes, including any new roots/split branches.
    for (let index = parents.length - 1; index >= 0; index--) {
      const parent = parents[index];
      this.radii.set(parent, Math.max(this.maxRadius(parent[0]), this.maxRadius(parent[1]),
        this.maxRadius(parent[2]), this.maxRadius(parent[3])));
    }
  }

  requiredSeparation(right: ClusterFootprint, baseX: number, baseY: number,
    ux: number, uy: number, gap: number, minimum = 0): number {
    const rightX = right.x + baseX, rightY = right.y + baseY;
    let separation = minimum;
    this.tree.visit((node, x0, y0, x1, y1) => {
      const dx = rightX - (x0 + x1) / 2, dy = rightY - (y0 + y1) / 2;
      const halfWidth = (x1 - x0) / 2, halfHeight = (y1 - y0) / 2;
      const padding = this.maxRadius(node) + right.radius + gap;
      const perpendicularSpan = halfWidth * Math.abs(uy) + halfHeight * Math.abs(ux);
      const parallelSpan = halfWidth * Math.abs(ux) + halfHeight * Math.abs(uy);
      const epsilon = Number.EPSILON * 64 * (1 + Math.abs(rightX) + Math.abs(rightY)
        + Math.abs(x0) + Math.abs(y0) + Math.abs(x1) + Math.abs(y1) + padding + separation);
      if (Math.abs(dx * uy - dy * ux) > perpendicularSpan + padding + epsilon
        || -(dx * ux + dy * uy) + parallelSpan + padding < separation - epsilon) return true;
      if (!Array.isArray(node)) {
        let leaf: FootprintLeaf | undefined = node;
        do {
          const left = leaf.data;
          const px = rightX - left.x, py = rightY - left.y;
          const perpendicular = px * uy - py * ux;
          const radius = left.radius + right.radius + gap;
          if (Math.abs(perpendicular) < radius) {
            separation = Math.max(separation, -(px * ux + py * uy)
              + Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
          }
          leaf = leaf.next;
        } while (leaf);
      }
      return false;
    });
    return separation;
  }
}
