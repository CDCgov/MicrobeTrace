import type * as Three from 'three';

export interface ThreeDLabelView { camera: Three.Camera; height: number; }

export function labelWorldHeight(view: ThreeDLabelView, point: { x?: number; y?: number; z?: number }, fontSize: number): number {
  const m = view.camera.matrixWorldInverse.elements;
  const depth = Math.max(0.001, Math.abs(m[2] * (point.x ?? 0) + m[6] * (point.y ?? 0) + m[10] * (point.z ?? 0) + m[14]));
  return fontSize * (64 / 48) * 2 * depth / (Math.abs(view.camera.projectionMatrix.elements[5]) * Math.max(1, view.height));
}

/** Textures are shared by text and released when labels leave the visible graph. */
export class ThreeDTextSprites {
  private materials = new Map<string, Three.SpriteMaterial>();
  constructor(private three: typeof Three) {}

  update(parent: Three.Object3D, name: string, text: string, height: number): Three.Sprite | null {
    let sprite = parent.getObjectByName(name) as Three.Sprite | undefined;
    if (!text) { if (sprite) parent.remove(sprite); return null; }
    let material = this.materials.get(text);
    if (!material) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.font = '48px Roboto, Arial, sans-serif';
      canvas.width = Math.min(4096, Math.ceil(context.measureText(text).width) + 16);
      canvas.height = 64;
      context.font = '48px Roboto, Arial, sans-serif';
      context.textBaseline = 'middle';
      context.lineWidth = 6;
      context.strokeStyle = '#ffffff';
      context.strokeText(text, 8, 32, canvas.width - 16);
      context.fillStyle = '#222222';
      context.fillText(text, 8, 32, canvas.width - 16);
      material = new this.three.SpriteMaterial({ map: new this.three.CanvasTexture(canvas), transparent: true, depthTest: false });
      this.materials.set(text, material);
    }
    if (!sprite) { sprite = new this.three.Sprite(material); sprite.name = name; parent.add(sprite); }
    sprite.material = material;
    sprite.scale.set(height * material.map!.image.width / 64, height, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  retain(texts: Iterable<string>): void {
    const used = new Set(texts);
    this.materials.forEach((material, text) => {
      if (!used.has(text)) { material.map?.dispose(); material.dispose(); this.materials.delete(text); }
    });
  }
  destroy(): void { this.retain([]); }
}
