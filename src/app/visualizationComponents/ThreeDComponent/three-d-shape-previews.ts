import { TreeNode } from 'primeng/api';
import { THREE_D_NODE_SHAPES } from './three-d-network.model';

const drawings: Record<string, string> = {
  sphere: '<circle cx="16" cy="16" r="12" fill="url(#shade)"/>',
  cube: '<path d="M16 3 28 10 28 23 16 30 4 23 4 10Z"/><path d="m4 10 12 7 12-7M16 17v13" fill="none" stroke="#fff"/>',
  cone: '<path d="M16 3 29 26Q16 33 3 26Z"/><ellipse cx="16" cy="26" rx="13" ry="4" fill="#7994ae"/>',
  cylinder: '<path d="M4 8v17c0 7 24 7 24 0V8Z"/><ellipse cx="16" cy="8" rx="12" ry="5" fill="#9aafc2"/>',
  diamond: '<path d="m16 2 13 14-13 14L3 16Z"/><path d="m16 2 0 28M3 16h26" stroke="#fff" fill="none"/>',
  pyramid: '<path d="m16 2 14 23-14 6L2 25Z"/><path d="m16 2 0 29L2 25" stroke="#fff" fill="none"/>',
};

export function threeDShapePreview(shape: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><radialGradient id="shade" cx="30%" cy="25%"><stop stop-color="#c5d4e0"/><stop offset="1" stop-color="#456583"/></radialGradient></defs><g fill="#456583" stroke="#294761" stroke-width="1">${drawings[shape] ?? drawings.sphere}</g></svg>`);
}

export const THREE_D_SHAPE_TREE: TreeNode[] = THREE_D_NODE_SHAPES.map(shape => ({
  key: shape.value, label: shape.label, leaf: true, selectable: true, icon: 'shape-tree-preview',
  data: { key: shape.value, name: shape.label, previewSrc: threeDShapePreview(shape.value) },
}));
