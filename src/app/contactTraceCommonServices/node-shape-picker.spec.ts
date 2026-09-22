import { NODE_SYMBOL_OPTIONS } from './node-shapes';
import {
  buildNodeShapeTreeLeaf,
  NODE_SHAPE_TREE_SELECT_PASS_THROUGH
} from './node-shape-picker';

describe('node shape picker previews', () => {
  it('adds a reusable image preview to custom-shape tree leaves', () => {
    const manOption = NODE_SYMBOL_OPTIONS.find(option => option.key === 'man');
    expect(manOption).toBeDefined();

    const leaf = buildNodeShapeTreeLeaf(manOption!);

    expect(leaf.icon).toBe('shape-tree-preview');
    expect(leaf.data?.previewSrc).toContain('data:image/svg+xml');
    expect(leaf.data?.previewSrc).toContain('%3Csvg');
  });

  it('applies each leaf preview as the dropdown icon background', () => {
    const virusOption = NODE_SYMBOL_OPTIONS.find(option => option.key === 'virus');
    expect(virusOption).toBeDefined();

    const leaf = buildNodeShapeTreeLeaf(virusOption!);
    const nodeIcon = (NODE_SHAPE_TREE_SELECT_PASS_THROUGH as any).pcTree.nodeIcon;
    const attributes = nodeIcon({ context: { node: leaf } });

    expect(attributes['data-shape-key']).toBe('virus');
    expect(attributes.style.backgroundImage).toContain(leaf.data!.previewSrc);
  });

  it('keeps tree labels text-only because the icon already renders the shape', () => {
    for (const key of ['ellipse', 'tag', 'barrel', 'unknown', 'fly']) {
      const option = NODE_SYMBOL_OPTIONS.find(candidate => candidate.key === key);
      expect(option).withContext(`missing node shape option ${key}`).toBeDefined();

      const leaf = buildNodeShapeTreeLeaf(option!);

      expect(leaf.label).withContext(`duplicate preview for ${key}`).toBe(option!.name);
    }
  });
});
