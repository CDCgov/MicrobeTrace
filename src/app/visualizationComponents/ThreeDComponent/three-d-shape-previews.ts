import { TreeNode } from 'primeng/api';
import { THREE_D_NODE_SHAPES } from './three-d-network.model';
import { THREE_D_RENDERED_PREVIEWS } from './three-d-shape-previews.generated';

/** Embedded captures keep keys self-contained in image and SVG exports. */
export function threeDShapePreview(shape: string, version: 1 | 2 = 2, lighting: 'fixed' | 'camera' = 'fixed'): string {
  return THREE_D_RENDERED_PREVIEWS[`${version}:${lighting}:${shape}`] ?? THREE_D_RENDERED_PREVIEWS[`${version}:${lighting}:sphere`];
}

const trees = new Map<string, TreeNode[]>();
export function threeDShapeTree(version: 1 | 2 = 2, lighting: 'fixed' | 'camera' = 'fixed'): TreeNode[] {
  const key = `${version}:${lighting}`;
  if (!trees.has(key)) trees.set(key, THREE_D_NODE_SHAPES.map(shape => ({
    key: shape.value, label: shape.label, leaf: true, selectable: true, icon: 'shape-tree-preview',
    data: { key: shape.value, name: shape.label, previewSrc: threeDShapePreview(shape.value, version, lighting) },
  })));
  return trees.get(key)!;
}
export const THREE_D_SHAPE_TREE = threeDShapeTree();
