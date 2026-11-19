import { ClusterFootprintIndex, type ClusterFootprint } from './cluster-footprint-index';

// A deliberately exhaustive oracle: the index must preserve the exact approach
// distance, including obstacles far from the eventual candidate center.
function exhaustive(points: ClusterFootprint[], right: ClusterFootprint, x: number, y: number,
  ux: number, uy: number, gap: number, minimum = 0): number {
  let result = minimum;
  for (const left of points) {
    const dx = right.x + x - left.x, dy = right.y + y - left.y;
    const perpendicular = dx * uy - dy * ux;
    const radius = left.radius + right.radius + gap;
    if (Math.abs(perpendicular) < radius) {
      result = Math.max(result, -(dx * ux + dy * uy)
        + Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
    }
  }
  return result;
}

describe('Cluster footprint collision index', () => {
  it('matches exhaustive collision checks as mixed-size footprints are added', () => {
    let seed = 42;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const points: ClusterFootprint[] = [];
    const index = new ClusterFootprintIndex(points);
    for (let i = 0; i < 192; i++) {
      const point = { x: (random() - 0.5) * 3000, y: (random() - 0.5) * 3000, radius: 2 + random() * (i % 17 ? 35 : 350) };
      points.push(point);
      index.add(point);
      if (i % 16) continue;
      const right = { x: random() * 50, y: random() * 50, radius: 5 + random() * 80 };
      const x = (random() - 0.5) * 2000, y = (random() - 0.5) * 2000;
      for (let direction = 0; direction < 16; direction++) {
        const angle = direction * Math.PI / 8 + 0.123;
        const ux = Math.cos(angle), uy = Math.sin(angle);
        const minimum = direction * 7;
        expect(index.requiredSeparation(right, x, y, ux, uy, 20, minimum))
          .toBeCloseTo(exhaustive(points, right, x, y, ux, uy, 20, minimum), 8);
      }
    }
  });

  it('includes far obstacles along the approach direction and excludes off-path footprints', () => {
    const index = new ClusterFootprintIndex([
      { x: 0, y: 0, radius: 10 }, { x: 5000, y: 0, radius: 20 },
      { x: 10000, y: 1000, radius: 100 },
    ]);
    expect(index.requiredSeparation({ x: 0, y: 0, radius: 10 }, 0, 0, 1, 0, 5)).toBe(5035);
  });

  it('updates radius bounds for coincident points and expanding quadtree roots', () => {
    const points = [{ x: 0, y: 0, radius: 1 }, { x: 0, y: 0, radius: 200 },
      { x: -100000, y: -100000, radius: 5 }, { x: 100000, y: 100000, radius: 500 }];
    const index = new ClusterFootprintIndex(points.slice(0, 1));
    points.slice(1).forEach(point => index.add(point));
    const right = { x: 0, y: 190, radius: 10 };
    expect(index.requiredSeparation(right, 0, 0, 1, 0, 20))
      .toBeCloseTo(exhaustive(points, right, 0, 0, 1, 0, 20), 8);
    expect(index.requiredSeparation(right, 0, 0, -Math.SQRT1_2, -Math.SQRT1_2, 20))
      .toBeCloseTo(exhaustive(points, right, 0, 0, -Math.SQRT1_2, -Math.SQRT1_2, 20), 8);
  });

  it('keeps tangency, empty indexes, and an existing separation unchanged', () => {
    const right = { x: 0, y: 20, radius: 10 };
    expect(new ClusterFootprintIndex([]).requiredSeparation(right, 0, 0, 1, 0, 0, 42)).toBe(42);
    expect(new ClusterFootprintIndex([{ x: 0, y: 0, radius: 10 }])
      .requiredSeparation(right, 0, 0, 1, 0, 0)).toBe(0);
  });

  it('retains large old footprints when an internal root expands across multiple levels', () => {
    const points = [{ x: 0, y: 0, radius: 300 }, { x: 1, y: 1, radius: 1 },
      { x: 1000000, y: 1000000, radius: 1 }];
    const index = new ClusterFootprintIndex(points.slice(0, 2));
    index.add(points[2]);
    const right = { x: 0, y: 250, radius: 10 };
    expect(index.requiredSeparation(right, 0, 0, 1, 0, 20))
      .toBeCloseTo(exhaustive(points, right, 0, 0, 1, 0, 20), 8);
  });
});
