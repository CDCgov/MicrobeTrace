import type cytoscape from 'cytoscape';
import { dimCustomNodeImage } from '@app/contactTraceCommonServices/network-node-appearance';

export function createNetworkCytoscapeStyles(widgets: Record<string, any>, options: { explorer: boolean; linkWidth: (edge: cytoscape.EdgeSingular) => number; edgeRouting: Record<string, any> }): cytoscape.StylesheetCSS[] {
        const dimmedOpacity = options.explorer ? 0.2 : 0.12;
        const nodeFillOpacity = (node: cytoscape.NodeSingular): number => {
            const opacity = Number(node.data('bgOpacity') ?? 1);
            return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
        };
        const dimmedCustomNodeImages = new Map<string, string>();
        const dimmedCustomNodeImage = (node: cytoscape.NodeSingular): string => {
            const mixedImage = node.data('mixedColorImage');
            const image = String(mixedImage || node.data('iconBackgroundImage'));
            const fillMultiplier = dimmedOpacity * (mixedImage ? 1 : nodeFillOpacity(node));
            const cacheKey = `${fillMultiplier}:${image}`;
            const cachedImage = dimmedCustomNodeImages.get(cacheKey);
            if (cachedImage) return cachedImage;

            // Custom icon outlines live in the SVG; fade its fills without fading its strokes.
            const dimmedImage = dimCustomNodeImage(image, fillMultiplier);
            dimmedCustomNodeImages.set(cacheKey, dimmedImage);
            return dimmedImage;
        };
        const transmissionChainHighlightStyle = options.explorer ? {
            'z-index': 1000,
            'z-index-compare': 'manual' as const,
            'z-compound-depth': 'top' as const,
            'line-opacity': 1
        } : {};
        return [
            {
                selector: 'node',
                css: {
                    'background-color': 'data(nodeColor)',
                    'border-color': '#000000',
                    // 'width': 'mapData(nodeSize, 0, 100, 10, 50)', // Existing dynamic sizing
                    // 'height': 'mapData(nodeSize, 0, 100, 10, 50)',
                    'border-width': 'data(borderWidth)', // Use dynamic border width
                    // 'border-color': '#000',
                    'color': 'black',
                    'z-index': 10, // Not a standard Cytoscape property, but kept for clarity
                    // 'font-size': 'data(fontSize)' // Ensure this line is included
                }
            },
            {
                selector: 'node[!isParent]',
                css: {
                    // Keep nodes above raised chain links for drawing and hover detection.
                    ...(options.explorer ? {
                        'z-compound-depth': 'top' as const,
                        'z-index-compare': 'auto' as const
                    } : {}),
                    'text-valign': (() => {
                        const o = (widgets && widgets['node-label-orientation']) ? widgets['node-label-orientation'].toLowerCase() : 'right';
                        if (o === 'top') return 'top';
                        if (o === 'bottom') return 'bottom';
                        return 'center';
                    })(),
                    'text-halign': (() => {
                        const o = (widgets && widgets['node-label-orientation']) ? widgets['node-label-orientation'].toLowerCase() : 'right';
                        if (o === 'left') return 'left';
                        if (o === 'right') return 'right';
                        return 'center';
                    })(),
                    // @ts-ignore
                    'shape': 'data(shape)'
                }
            },
            {
                selector: 'node[label]',
                css: {
                  'label': 'data(label)' 
                }
              },
              {
                selector: 'node[!label]',
                css: {
                  'label': '' // or omit entirely
                }
              },
              // Apply styles only to nodes with nodeSize defined
            {
                selector: 'node[nodeSize]',
                css: {
                    'width': 'mapData(nodeSize, 0, 100, 10, 50)',
                    'height': 'mapData(nodeSize, 0, 100, 10, 50)'
                }
            },
            {
                selector: 'node[!isParent][isCollapsedAggregate][aggregateRenderedSize]',
                css: {
                    'width': 'data(aggregateRenderedSize)',
                    'height': 'data(aggregateRenderedSize)'
                }
            },
            {
                selector: 'node[bgOpacity][!pieBackgroundImage]',
                css: {
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)',
                    // @ts-ignore
                    'border-opacity': 'data(bgOpacity)',
                }
            },
            {
                selector: 'node[!isParent][iconBackgroundImage]',
                css: {
                    // @ts-ignore
                    'background-image': 'data(iconBackgroundImage)',
                    'background-image-containment': 'over',
                    'background-fit': 'contain',
                    'background-clip': 'node',
                    'background-position-x': '50%',
                    'background-position-y': '50%',
                    'background-repeat': 'no-repeat',
                    // @ts-ignore
                    'background-image-opacity': 'data(bgOpacity)',
                    'background-opacity': 0,
                    'border-width': 0
                }
            },
            {
                selector: 'node[!isParent][mixedColorImage]',
                css: {
                    // @ts-ignore
                    'background-image': 'data(mixedColorImage)',
                    'background-image-containment': 'inside',
                    'background-fit': 'contain',
                    'background-clip': 'node',
                    'background-position-x': '50%',
                    'background-position-y': '50%',
                    'background-repeat': 'no-repeat',
                    // @ts-ignore
                    'background-image-opacity': 1,
                    'background-opacity': 0,
                    'border-width': 'data(borderWidth)'
                }
            },
            {
                selector: 'node[!isParent][mixedColorImage][customIconKey]',
                css: {
                    'border-width': 0
                }
            },
            {
                selector: 'node[!isParent][mixedColorImage][mixedColorImageCoversShape]',
                css: {
                    'background-image-containment': 'inside',
                    'background-fit': 'cover',
                    'background-clip': 'node'
                }
            },
            {
                selector: 'node[!isParent][pieBackgroundImage]',
                css: {
                    // @ts-ignore
                    'background-image': 'data(pieBackgroundImage)',
                    'background-fit': 'cover',
                    'background-clip': 'node',
                    'background-position-x': '50%',
                    'background-position-y': '50%',
                    'background-repeat': 'no-repeat',
                    'background-color': 'transparent',
                    'background-opacity': 0
                }
            },
                {
                    selector: '.hidden',
                    css: {
                        display: 'none'
                    }
                },
            // Apply styles only to nodes with nodeColor defined
            {
                selector: 'node[nodeColor]',
                css: {
                    'background-color': 'data(nodeColor)'
                }
            },
            {
                selector: 'node[!isParent][nodeColor][iconBackgroundImage]',
                css: {
                    'background-color': '#ffffff',
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)'
                }
            },
            // Apply styles only to nodes with fontSize defined
            {
                selector: 'node[!isParent][fontSize]',
                css: {
                    'font-size': 'data(fontSize)'
                }
            },
            {
                selector: 'node[!isParent][shape]',
                css: {
                    // @ts-ignore
                    'shape': 'data(shape)'
                }
            },
            {
                selector: 'node.parent',
                css: {
                    'z-index': 20, // Not a standard Cytoscape property, but kept for clarity
                    // We also need to ensure that it uses data(...) for color & alpha:
                    'background-color': 'data(nodeColor)', 
                    'border-width': 'data(borderWidth)',
                    'shape': 'rectangle'
                    // The critical addition (can also be 'opacity' but that will fade the label, border, etc.):
                    // 'z-compound-depth': 'back',  // ensures parent is behind children
                }
            },
            {
                selector: 'node.parent[bgOpacity]',
                css: {
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)',
                }
            },
            {
                selector: 'edge',
                css: {
                    'width': options.explorer
                        ? (edge: cytoscape.EdgeSingular) => options.linkWidth(edge)
                        : 'data(width)',
                    'line-color': 'data(lineColor)', // Maps 'lineColor' data attribute to 'line-color' style
                    // @ts-ignore
                    'line-opacity': 'data(lineOpacity)', // Explicitly control link transparency

                    'label' : 'data(label)',                   
                    // 'target-arrow-color': '#ccc',
                    // 'target-arrow-shape': 'triangle',
                    ...options.edgeRouting
                    // 'opacity': 'data(opacity)' // Existing opacity
                }
            },
            {
                selector: 'edge[fontSize]',
                css: {
                    'font-size': 'data(fontSize)'
                } // Apply font size change only to edges with font-size defined
            },
            {
                selector: 'edge[secondLink]',
                css: {
                    'line-style': 'dashed',
                    'line-dash-pattern': [10, 10],
                    'line-dash-offset': 5,
                }
            },
            {
                selector: 'edge[!secondLink]',
                css: {
                    'line-style': 'solid',
                }
            },
            {
                selector: 'node:selected[!isParent][!iconBackgroundImage][!pieBackgroundImage]',
                css: {
                    'background-color': 'data(nodeColor)',
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 3
                }
            },
            {
                selector: 'node:selected[!isParent][pieBackgroundImage]',
                css: {
                    'background-color': 'transparent',
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 3
                }
            },
            {
                selector: 'node:selected[!isParent][iconBackgroundImage]',
                css: {
                    'background-color': '#ffffff',
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)',
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 3
                }
            },
            {
                selector: 'node:selected[!isParent][mixedColorImage]',
                css: {
                    // @ts-ignore
                    'background-image': 'data(mixedColorImage)',
                    'background-image-containment': 'inside',
                    'background-fit': 'contain',
                    'background-clip': 'node',
                    // @ts-ignore
                    'background-image-opacity': 1,
                    'background-opacity': 0,
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 3
                }
            },
            {
                selector: 'node:selected[!isParent][pieBackgroundImage]',
                css: {
                    'background-color': 'transparent',
                    'background-opacity': 0,
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 3
                }
            },
            {
                selector: 'node:selected[!isParent][isCollapsedAggregate]',
                css: {
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 'data(borderWidth)'
                }
            },
            {
                selector: 'edge:selected',
                css: {
                    // 'line-color': '#f00',
                    // 'target-arrow-color': '#f00',
                    'width': options.explorer
                        ? (edge: cytoscape.EdgeSingular) => options.linkWidth(edge)
                        : 3,
                    ...transmissionChainHighlightStyle
                }
            },
            {
                selector: 'edge.highlighted',
                css: {
                    'line-color': 'data(lineSelectedColor)', // Highlight color
                    'width': options.explorer
                        ? (edge: cytoscape.EdgeSingular) => options.linkWidth(edge)
                        : '3px',
                    'opacity': 1,
                    ...transmissionChainHighlightStyle
                }
            },
            {
                selector: 'edge.network-neighbor-dimmed',
                css: {
                    'opacity': dimmedOpacity
                }
            },
            {
                selector: 'node.network-neighbor-dimmed',
                css: {
                    // Fade the fill and label separately so the outline remains fully opaque.
                    'background-opacity': (node: cytoscape.NodeSingular) =>
                        node.data('mixedColorImage') || node.data('pieBackgroundImage')
                            ? 0 : nodeFillOpacity(node) * dimmedOpacity,
                    'background-image-opacity': (node: cytoscape.NodeSingular) =>
                        node.data('mixedColorImage') || node.data('pieBackgroundImage')
                            ? dimmedOpacity : nodeFillOpacity(node) * dimmedOpacity,
                    'border-opacity': 1,
                    'text-opacity': dimmedOpacity
                }
            },
            {
                selector: 'node.network-neighbor-dimmed[customIconKey]',
                css: {
                    'background-image': dimmedCustomNodeImage,
                    'background-image-opacity': 1
                }
            }
        ];
    
}
