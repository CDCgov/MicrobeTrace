import type { Core, NodeSingular } from 'cytoscape';

export function setNetworkNeighborHover(
    cy: Core,
    node: NodeSingular | null,
    enabled: boolean,
    dimUnrelatedLinks: boolean
): void {
    if (!cy || cy.destroyed()) return;
    cy.batch(() => {
        cy.edges('.highlighted').removeClass('highlighted');
        cy.elements('.network-neighbor-dimmed').removeClass('network-neighbor-dimmed');
        if (!node || node.empty() || !enabled || node.isParent()) return;

        const neighborhood = node.closedNeighborhood();
        node.connectedEdges().addClass('highlighted');
        cy.nodes(':childless').difference(neighborhood).addClass('network-neighbor-dimmed');
        if (dimUnrelatedLinks) {
            cy.edges().difference(neighborhood).addClass('network-neighbor-dimmed');
        }
    });
}
