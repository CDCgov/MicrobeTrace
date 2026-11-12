import { enableGroupingShow } from '../../support/journey-helpers';

describe('Sigma cluster-first layout', () => {
  it('uses hidden genetic distances for merge-aware placement and freezes that placement during sensitivity exploration', () => {
    const nodeIds = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'Unknown1', 'Unknown2'];
    const links = [
      'source,target,distance', 'A1,A2,1', 'B1,B2,1', 'C1,C2,1', 'D1,D2,1',
      'A1,B1,60', 'A2,B2,600', 'C1,D1,60', 'B1,C1,400',
    ];
    cy.viewport(1600, 1000);
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef').selectFile([
      { contents: Cypress.Buffer.from(['ID', ...nodeIds].join('\n')), fileName: 'MergeNodes.csv', mimeType: 'text/csv' },
      { contents: Cypress.Buffer.from(links.join('\n')), fileName: 'MergeLinks.csv', mimeType: 'text/csv' },
    ], { force: true });
    cy.get('#launch', { timeout: 30000 }).should('not.be.disabled').click();
    let positionsBefore: any;
    let graphBefore: any;
    let previewThreshold: number;
    const positions = (twoD: any) => {
      const graph = twoD.sigmaRenderer.getGraph();
      return graph.nodes().sort().map((id: string) => ({ id, x: graph.getNodeAttribute(id, 'x'), y: graph.getNodeAttribute(id, 'y') }));
    };
    const topology = (twoD: any) => {
      const graph = twoD.sigmaRenderer.getGraph();
      return { nodes: graph.nodes().sort(), edges: graph.edges().sort() };
    };
    cy.window({ timeout: 60000 }).should((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      expect(twoD.isRendererReady()).to.equal(true);
      const graph = twoD.sigmaRenderer.getGraph();
      expect(graph.order).to.equal(10);
      expect(graph.size, 'only baseline genetic edges are displayed').to.equal(4);
      expect(twoD.sigmaClusterLayoutSummary).to.include({ clusters: 6, mergeLinks: 3 });
      const footprint = (ids: string[]) => {
        const nodes = ids.map(id => graph.getNodeAttributes(id));
        const x = nodes.reduce((sum, node) => sum + node.x, 0) / ids.length;
        const y = nodes.reduce((sum, node) => sum + node.y, 0) / ids.length;
        return { x, y, radius: Math.max(...nodes.map(node => Math.hypot(node.x - x, node.y - y) + Number(node.size))) };
      };
      const footprints = [['A1', 'A2'], ['B1', 'B2'], ['C1', 'C2'], ['D1', 'D2'], ['Unknown1'], ['Unknown2']].map(footprint);
      const gap = (a: number, b: number) => Math.hypot(footprints[a].x - footprints[b].x, footprints[a].y - footprints[b].y)
        - footprints[a].radius - footprints[b].radius;
      expect(gap(0, 1), 'closest-pair family A/B').to.be.lessThan(gap(1, 2));
      expect(gap(2, 3), 'closest-pair family C/D').to.be.lessThan(gap(1, 2));
      footprints.forEach((_, i) => footprints.slice(i + 1).forEach((__, offset) => {
        expect(gap(i, i + offset + 1), 'separate cluster footprints').to.be.greaterThan(0);
      }));
    });
    cy.window().then((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      positionsBefore = positions(twoD);
      graphBefore = topology(twoD);
      twoD.openThresholdSensitivity();
      const previewIndex = twoD.thresholdSensitivityOptions.length - 1;
      previewThreshold = twoD.thresholdSensitivityOptions[previewIndex];
      twoD.onThresholdSensitivityPreviewIndexChange(previewIndex);
    });
    cy.get('[data-testid="threshold-sensitivity-panel"]').should('be.visible');
    cy.window().should((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      expect(twoD.thresholdSensitivityComparison.addedEdgeIds.length).to.be.greaterThan(0);
      expect(positions(twoD), 'preview preserves cluster and individual positions').to.deep.equal(positionsBefore);
      expect(topology(twoD), 'preview preserves the displayed nodes and links').to.deep.equal(graphBefore);
    });
    cy.get('[data-testid="threshold-sensitivity-apply"]').focus().type('{enter}');
    cy.get('[data-testid="threshold-sensitivity-panel"]').should('not.exist');
    cy.window({ timeout: 30000 }).should((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      expect(Number(win.commonService.session.style.widgets['link-threshold'])).to.equal(previewThreshold);
      expect(twoD.isRendererReady()).to.equal(true);
      expect(positions(twoD), 'committing a sensitivity preview retains its frozen layout').to.deep.equal(positionsBefore);
    });
  });

  it('compacts a dragged cluster around its current position and persists the result', () => {
    cy.viewport(1600, 1000);
    cy.visit('/?skipEula=1');
    cy.get('[data-testid="app-sample-dataset-button"]').click();
    cy.get('#overlay', { timeout: 30000 }).should('not.be.visible');
    cy.window({ timeout: 30000 }).should((win: any) => {
      expect(win.commonService.visuals.twoD.isRendererReady()).to.equal(true);
      expect(win.commonService.visuals.twoD.sigmaRenderer.getGraph().order).to.equal(33);
    });
    enableGroupingShow('cluster');

    cy.window().then(async (win: any) => {
      const twoD = win.commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer;
      const hull = [...adapter.groupHulls].sort((a: any, b: any) => a.nodeIds.length - b.nodeIds.length)[0];
      const ids: string[] = hull.nodeIds;
      const center = () => ids.reduce((sum, id) => {
        const attributes = twoD.sigmaRenderer.getGraph().getNodeAttributes(id);
        return { x: sum.x + attributes.x / ids.length, y: sum.y + attributes.y / ids.length };
      }, { x: 0, y: 0 });
      const original = center();
      const pointer = adapter.getRenderer().graphToViewport(hull.center);
      const payload = (x: number, y: number) => ({
        event: { x, y, original: new win.MouseEvent('mousedown', { button: 0 }) },
        preventSigmaDefault() {},
      });
      adapter.startHullDrag(payload(pointer.x, pointer.y));
      adapter.finishHullDrag(payload(pointer.x + 350, pointer.y + 120));
      const dragged = center();
      expect(Math.hypot(dragged.x - original.x, dragged.y - original.y)).to.be.greaterThan(100);

      for (let repeat = 0; repeat < 2; repeat++) {
        await twoD.updateLayout();
        const current = center();
        expect(current.x, 'dragged cluster horizontal center').to.be.closeTo(dragged.x, 1);
        expect(current.y, 'dragged cluster vertical center').to.be.closeTo(dragged.y, 1);
        const graph = twoD.sigmaRenderer.getGraph();
        expect(graph.order).to.equal(33);
        expect(graph.size).to.equal(74);
        ids.forEach(id => {
          const position = graph.getNodeAttributes(id);
          const saved = win.commonService.session.data.nodes.find((node: any) => String(node._id ?? node.id) === id);
          expect(saved.x).to.be.closeTo(position.x, 0.001);
          expect(saved.y).to.be.closeTo(position.y, 0.001);
        });
      }
    });
  });

  it('separates more than 80 clusters when the graph is loaded', () => {
    const nodes = ['ID'];
    const links = ['source,target,distance'];
    for (let cluster = 0; cluster < 325; cluster++) {
      const members = Array.from({ length: 2 + cluster % 6 }, (_, index) => `CLUSTER_${cluster}_${index}`);
      nodes.push(...members);
      members.slice(1).forEach((id, index) => links.push(`${members[index]},${id},1`));
    }
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef').selectFile([
      { contents: Cypress.Buffer.from(nodes.join('\n')), fileName: 'ClusterNodes.csv', mimeType: 'text/csv' },
      { contents: Cypress.Buffer.from(links.join('\n')), fileName: 'ClusterLinks.csv', mimeType: 'text/csv' },
    ], { force: true });
    cy.get('#launch', { timeout: 30000 }).should('not.be.disabled').click();
    cy.window({ timeout: 60000 }).should((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      expect(twoD.isRendererReady()).to.equal(true);
      const graph = twoD.sigmaRenderer.getGraph();
      expect(graph.order).to.equal(1460);
      expect(graph.size).to.equal(1135);
      const centers = Array.from({ length: 325 }, (_, cluster) => {
        const ids = graph.nodes().filter((id: string) => id.startsWith(`CLUSTER_${cluster}_`));
        const x = ids.reduce((sum: number, id: string) => sum + graph.getNodeAttribute(id, 'x'), 0) / ids.length;
        const y = ids.reduce((sum: number, id: string) => sum + graph.getNodeAttribute(id, 'y'), 0) / ids.length;
        const radius = Math.max(...ids.map((id: string) => Math.hypot(
          graph.getNodeAttribute(id, 'x') - x, graph.getNodeAttribute(id, 'y') - y
        )));
        return { x, y, radius };
      });
      let smallestGap = Infinity;
      centers.forEach((left, index) => centers.slice(index + 1).forEach(right => {
        smallestGap = Math.min(smallestGap, Math.hypot(left.x - right.x, left.y - right.y) - left.radius - right.radius);
      }));
      expect(smallestGap, 'clear space between all 325 clusters').to.be.greaterThan(0);
    });
  });
});
