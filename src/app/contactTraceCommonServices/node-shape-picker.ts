import { TreeNode } from 'primeng/api';
import { TreeSelectPassThrough } from 'primeng/types/treeselect';

import {
    getNodeShapePreviewDataUri,
    NodeShapeOption
} from './node-shapes';

export interface NodeShapeTreeOption extends NodeShapeOption {
    previewSrc: string;
}

interface ShapeTreePassThroughContext {
    context?: {
        node?: TreeNode<NodeShapeTreeOption>;
    };
}

export function buildNodeShapeTreeLeaf(option: NodeShapeOption): TreeNode<NodeShapeTreeOption> {
    return {
        key: option.key,
        // The tree icon renders the shape preview. Keep the label text-only so
        // basic shapes do not display both the preview and their legacy glyph.
        label: option.name,
        type: 'shape',
        data: {
            ...option,
            previewSrc: getNodeShapePreviewDataUri(option.key)
        },
        icon: 'shape-tree-preview',
        leaf: true,
        selectable: true
    };
}

export const NODE_SHAPE_TREE_SELECT_PASS_THROUGH: TreeSelectPassThrough = {
    pcTree: {
        nodeIcon: ((options: ShapeTreePassThroughContext) => {
            const shapeOption = options.context?.node?.data;
            if (!shapeOption?.previewSrc) {
                return {};
            }

            return {
                'data-shape-key': shapeOption.key,
                style: {
                    backgroundImage: `url("${shapeOption.previewSrc}")`
                }
            };
        }) as any
    }
};
