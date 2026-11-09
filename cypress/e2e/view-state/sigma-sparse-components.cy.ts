import { openGlobalFilteringTab } from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

describe('Sigma sparse disconnected-component layout', () => {
  const launchSparseGraph = () => {
    cy.viewport(1280, 720);
    cy.visit('/?skipEula=1&skipDemoSession=1&renderer=sigma');
    cy.loadFiles([
      { name: 'Issue1807SparseNodes.csv', datatype: 'node' },
      { name: 'Issue1807SparseLinks.csv', datatype: 'link' },
    ]);
    cy.get('#launch').click({ force: true });

    cy.get('[data-testid="network-render-summary"]', { timeout: 30000 })
      .should('contain.text', '314 nodes')
      .and('contain.text', '7 links shown');
  };

  it('keeps issue 1807 clusters clear of a singleton-heavy field', () => {
    launchSparseGraph();
    cy.get('#numberOfDisjointComponents').should('contain.text', '5');
    cy.get('#numberOfSingletonNodes').should('contain.text', '303');

    cy.window().then((win: any) => {
      const graph = win.commonService.visuals.twoD.sigmaRenderer.getGraph();
      const linkedNodeIds = new Set<string>();
      graph.forEachEdge((_edgeId: string, _attributes: any, source: string, target: string) => {
        linkedNodeIds.add(source);
        linkedNodeIds.add(target);
      });
      const linkedPositions = Array.from(linkedNodeIds, nodeId => ({
        x: Number(graph.getNodeAttribute(nodeId, 'x')),
        y: Number(graph.getNodeAttribute(nodeId, 'y')),
      }));
      const singletonPositions = graph.nodes()
        .filter((nodeId: string) => !linkedNodeIds.has(nodeId))
        .map((nodeId: string) => ({
          x: Number(graph.getNodeAttribute(nodeId, 'x')),
          y: Number(graph.getNodeAttribute(nodeId, 'y')),
        }));
      const closestSingletonToCluster = Math.min(...linkedPositions.flatMap(linked => (
        singletonPositions.map(singleton => Math.hypot(
          linked.x - singleton.x,
          linked.y - singleton.y,
        ))
      )));

      expect(linkedNodeIds.size, 'nodes in five linked clusters').to.equal(11);
      expect(singletonPositions, 'singleton node count').to.have.length(303);
      expect(closestSingletonToCluster, 'clear space between clusters and singletons')
        .to.be.greaterThan(20);
    });
  });

  it('hides singleton components when minimum cluster size is 2', () => {
    launchSparseGraph();

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterMinimumClusterSize))
      .clear()
      .type('2')
      .blur();

    cy.window()
      .its('commonService.session.style.widgets.cluster-minimum-size')
      .should('equal', 2);
    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const visibleNodes = win.commonService.session.data.nodes
        .filter((node: any) => node.visible);

      expect(visibleNodes, 'visible session nodes').to.have.length(11);
    });

    cy.get('[data-testid="network-render-summary"]', { timeout: 30000 })
      .should('contain.text', '11 nodes')
      .and('contain.text', '7 links shown');
    cy.get('#numberOfNodes').should('contain.text', '11');
    cy.get('#numberOfDisjointComponents').should('contain.text', '5');
    cy.get('#numberOfSingletonNodes').should('contain.text', '0');

    cy.window().then((win: any) => {
      const graph = win.commonService.visuals.twoD.sigmaRenderer.getGraph();

      expect(graph.order, 'rendered nodes').to.equal(11);
    });
  });
});
