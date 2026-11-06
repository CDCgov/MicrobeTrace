import type { Camera, Quaternion, Vector3 } from 'three';

interface OrientationAxis {
  group: SVGGElement;
  line: SVGLineElement;
  arrow: SVGPathElement;
  point: SVGCircleElement;
  label: SVGTextElement;
  direction: Vector3;
  labelX: number;
  labelY: number;
}

/** Projects the world axes into camera space without another renderer or animation loop. */
export class ThreeDOrientationIndicator {
  private axes: OrientationAxis[];
  private inverse: Quaternion;
  private previous: number[] = [];

  constructor(private element: SVGSVGElement, camera: Camera) {
    this.inverse = camera.quaternion.clone();
    this.axes = ['x', 'y', 'z'].map(axis => {
      const group = element.querySelector<SVGGElement>(`[data-axis="${axis}"]`)!;
      return {
        group,
        line: group.querySelector<SVGLineElement>('line')!,
        arrow: group.querySelector<SVGPathElement>('path')!,
        point: group.querySelector<SVGCircleElement>('circle')!,
        label: group.querySelector<SVGTextElement>('text')!,
        direction: camera.position.clone(), labelX: 0, labelY: 0,
      };
    });
  }

  update(camera: Camera): void {
    camera.getWorldQuaternion(this.inverse).invert();
    const quaternion = this.inverse.toArray();
    if (this.previous.length && quaternion.every((value, i) => Math.abs(value - this.previous[i]) < 1e-12)) return;
    this.previous = quaternion;

    this.axes.forEach((axis, index) => {
      const direction = axis.direction.set(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0)
        .applyQuaternion(this.inverse);
      const dx = direction.x * 30;
      const dy = -direction.y * 30; // SVG's vertical direction is opposite to camera-space Y.
      const length = Math.hypot(dx, dy);
      const x = 50 + dx;
      const y = 50 + dy;
      const away = direction.z < -0.01;
      axis.group.classList.toggle('is-away', away);
      axis.line.setAttribute('x2', String(x));
      axis.line.setAttribute('y2', String(y));
      axis.line.setAttribute('stroke-dasharray', away ? '3 2' : 'none');
      if (length >= 4) {
        const ux = dx / length;
        const uy = dy / length;
        const size = Math.min(7, length / 2);
        axis.arrow.setAttribute('d', `M ${x} ${y} L ${x - ux * size - uy * 3.5} ${y - uy * size + ux * 3.5} L ${x - ux * size + uy * 3.5} ${y - uy * size - ux * 3.5} Z`);
        axis.point.setAttribute('visibility', 'hidden');
        axis.labelX = x + ux * 11;
        axis.labelY = y + uy * 11;
      } else {
        // An end-on axis is a dot toward the viewer and a ring away from the viewer.
        axis.arrow.setAttribute('d', '');
        axis.point.setAttribute('visibility', 'visible');
        axis.point.setAttribute('cx', String(x));
        axis.point.setAttribute('cy', String(y));
        axis.point.setAttribute('fill', away ? '#ffffff' : 'currentColor');
        axis.labelX = x + 12;
        axis.labelY = y + 12;
      }
    });

    // Separate labels when two axes project onto the same screen direction.
    this.axes.forEach((axis, index) => this.axes.slice(index + 1).forEach(other => {
      if (Math.hypot(axis.labelX - other.labelX, axis.labelY - other.labelY) >= 15) return;
      const length = Math.hypot(axis.direction.x, axis.direction.y) || 1;
      const x = axis.direction.y / length * 8;
      const y = axis.direction.x / length * 8;
      axis.labelX += x;
      axis.labelY += y;
      other.labelX -= x;
      other.labelY -= y;
    }));
    this.axes.forEach(axis => {
      axis.label.setAttribute('x', String(axis.labelX));
      axis.label.setAttribute('y', String(axis.labelY));
    });
    // Draw axes nearest the viewer last, while keeping their world-axis identities stable.
    [...this.axes].sort((a, b) => a.direction.z - b.direction.z)
      .forEach(axis => this.element.appendChild(axis.group));
  }
}
