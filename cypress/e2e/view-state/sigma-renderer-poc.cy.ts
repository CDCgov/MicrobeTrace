describe('Sigma renderer proof of concept', () => {
  it('keeps the complete large graph client-side while changing only drawn edge detail', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1&largeDemo=1&renderer=sigma');
    cy.contains('button', 'Continue with Large Network Demo', { timeout: 30000 }).click({ force: true });

    cy.get('[data-testid="sigma-poc-summary"]', { timeout: 120000 })
      .should('be.visible')
      .and('contain.text', '500 nodes')
      .and('contain.text', '124,750 links resident');
    cy.get('[data-testid="sigma-network-poc"] canvas').should('have.length.at.least', 2);
    cy.get('#network-guardrail-warning')
      .should('contain.text', 'all 124,750 threshold-qualified links are resident in the browser');

    cy.window().then((win: any) => {
      const adapter = win.sigmaPocInstance;
      expect(adapter, 'Sigma adapter').to.exist;
      expect(adapter.getGraph().order).to.equal(500);
      expect(adapter.getGraph().size).to.equal(124750);
      expect(adapter.getRenderer().getSettings().enableNodeDrag).to.equal(true);
      expect(adapter.getRenderer().getSettings().nodePickingPadding).to.equal(6);
      expect(adapter.getRenderer().getSettings().hideEdgesOnMove).to.equal(false);
      const layoutGroups = new Set<string>();
      adapter.getGraph().forEachNode((_node: string, attributes: any) => {
        if (attributes.group) layoutGroups.add(String(attributes.group));
      });
      expect(layoutGroups.size).to.equal(5);
      const overview = adapter.getSummary();
      expect(adapter.getDisplayGraph().size).to.equal(overview.drawnLinkCount);
      expect(adapter.getRenderer().getGraph().size).to.equal(overview.drawnLinkCount);
      expect(overview.edgeDetailMode).to.equal('overview');
      expect(overview.drawnLinkCount).to.be.lessThan(overview.residentLinkCount);
      cy.wrap(overview.drawnLinkCount).as('overviewDrawnLinkCount');
    });

    cy.window().then((win: any) => {
      const adapter = win.sigmaPocInstance;
      const renderer = adapter.getRenderer();
      const graph = adapter.getGraph();
      const mouseLayer = renderer.getMouseLayer();
      const layerBounds = mouseLayer.getBoundingClientRect();
      const dimensions = renderer.getDimensions();
      const allPoints = graph.nodes().map((nodeId: string) => {
        const attributes = graph.getNodeAttributes(nodeId);
        return {
          nodeId,
          ...renderer.graphToViewport({ x: Number(attributes.x), y: Number(attributes.y) }),
        };
      });
      const centerCandidates = allPoints.filter((point: any) =>
        point.x > 70 && point.x < dimensions.width - 70 &&
        point.y > 70 && point.y < dimensions.height - 70,
      );
      const center = centerCandidates[Math.floor(centerCandidates.length / 2)];
      const rectangle = {
        x1: Math.max(10, center.x - 60),
        y1: Math.max(10, center.y - 60),
        x2: Math.min(dimensions.width - 10, center.x + 60),
        y2: Math.min(dimensions.height - 10, center.y + 60),
      };
      const expected = allPoints.filter((point: any) =>
        point.x >= rectangle.x1 && point.x <= rectangle.x2 &&
        point.y >= rectangle.y1 && point.y <= rectangle.y2,
      );
      const pointerId = 41;
      mouseLayer.dispatchEvent(new win.PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId,
        button: 0,
        buttons: 1,
        shiftKey: true,
        clientX: layerBounds.left + rectangle.x1,
        clientY: layerBounds.top + rectangle.y1,
      }));
      win.document.dispatchEvent(new win.PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId,
        buttons: 1,
        shiftKey: true,
        clientX: layerBounds.left + rectangle.x2,
        clientY: layerBounds.top + rectangle.y2,
      }));
      win.document.dispatchEvent(new win.PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId,
        button: 0,
        buttons: 0,
        shiftKey: true,
        clientX: layerBounds.left + rectangle.x2,
        clientY: layerBounds.top + rectangle.y2,
      }));

      const selectedNodes = graph.nodes().filter((nodeId: string) =>
        Boolean(graph.getNodeAttribute(nodeId, 'selected')),
      );
      expect(expected.length).to.be.greaterThan(1);
      expect(selectedNodes).to.have.length(expected.length);
      expect(adapter.getSummary().drawnLinkCount).to.be.lessThan(adapter.getSummary().residentLinkCount);
      adapter.getDisplayGraph().forEachEdge((edgeId: string, attributes: any) => {
        const displayData = renderer.getEdgeDisplayData(edgeId);
        expect(displayData.color, `multi-select edge ${edgeId} color`).to.equal(attributes.color);
        expect(displayData.opacity, `multi-select edge ${edgeId} opacity`).to.equal(attributes.opacity);
      });
      adapter.clearSelection();
    });

    cy.window().then((win: any) => {
      const adapter = win.sigmaPocInstance;
      const renderer = adapter.getRenderer();
      const graph = adapter.getGraph();
      const group = adapter.groupHulls[0];
      expect(group, 'draggable group hull').to.exist;
      expect(group.nodeIds.length, 'group members').to.be.greaterThan(1);

      const center = renderer.graphToViewport(group.center);
      const beforeCamera = renderer.getCamera().getState();
      const beforePositions = new Map<string, { x: number; y: number }>(group.nodeIds.map((nodeId: string) => {
        const attributes = graph.getNodeAttributes(nodeId);
        return [nodeId, { x: Number(attributes.x), y: Number(attributes.y) }] as const;
      }));
      const mouseEvent = (type: string, x: number, y: number) => ({
        event: {
          x,
          y,
          original: new win.MouseEvent(type, { button: 0 }),
          sigmaDefaultPrevented: false,
          preventSigmaDefault() {},
        },
        preventSigmaDefault() {},
      });

      renderer.emit('downStage', mouseEvent('mousedown', center.x, center.y));
      renderer.emit('moveBody', mouseEvent('mousemove', center.x + 40, center.y + 25));
      renderer.emit('upStage', mouseEvent('mouseup', center.x + 40, center.y + 25));

      const selectedIds = graph.nodes()
        .filter((nodeId: string) => Boolean(graph.getNodeAttribute(nodeId, 'selected')))
        .sort();
      expect(selectedIds).to.deep.equal([...group.nodeIds].sort());
      expect(renderer.getCamera().getState()).to.deep.equal(beforeCamera);

      const deltas = group.nodeIds.map((nodeId: string) => {
        const before = beforePositions.get(nodeId)!;
        const attributes = graph.getNodeAttributes(nodeId);
        return {
          x: Number(attributes.x) - before.x,
          y: Number(attributes.y) - before.y,
        };
      });
      expect(Math.hypot(deltas[0].x, deltas[0].y), 'group movement').to.be.greaterThan(0);
      deltas.slice(1).forEach((delta: { x: number; y: number }) => {
        expect(delta.x, 'rigid group x delta').to.be.closeTo(deltas[0].x, 0.000001);
        expect(delta.y, 'rigid group y delta').to.be.closeTo(deltas[0].y, 0.000001);
      });
      adapter.clearSelection();
    });

    cy.window().then((win: any) => {
      const adapter = win.sigmaPocInstance;
      const renderer = adapter.getRenderer();
      const camera = renderer.getCamera();
      const initialCamera = camera.getState();
      win.sigmaPocInitialCamera = initialCamera;
      win.sigmaPocInitialBBox = JSON.stringify(renderer.getCustomBBox());
      win.sigmaPocZoomRatio = initialCamera.ratio * 0.4;
      camera.setState({ ...initialCamera, ratio: win.sigmaPocZoomRatio });
    });
    cy.get('@overviewDrawnLinkCount').then(overviewDrawnLinkCount => {
      cy.window({ timeout: 10000 }).should((win: any) => {
        const adapter = win.sigmaPocInstance;
        const zoomed = adapter.getSummary();
        expect(zoomed.drawnLinkCount).to.be.greaterThan(Number(overviewDrawnLinkCount));
        expect(adapter.getDisplayGraph().size).to.equal(zoomed.drawnLinkCount);
        expect(adapter.getRenderer().getCamera().getState().ratio).to.be.closeTo(win.sigmaPocZoomRatio, 0.000001);
        expect(JSON.stringify(adapter.getRenderer().getCustomBBox())).to.equal(win.sigmaPocInitialBBox);
      }).then((win: any) => {
        const adapter = win.sigmaPocInstance;
        adapter.getRenderer().getCamera().setState(win.sigmaPocInitialCamera);
      });
    });
    cy.wait(350);

    cy.get('[data-testid="sigma-edge-detail"]').click();
    cy.get('@overviewDrawnLinkCount').then(overviewDrawnLinkCount => {
      cy.window().then((win: any) => {
        const detail = win.sigmaPocInstance.getSummary();
        expect(detail.edgeDetailMode).to.equal('detail');
        expect(detail.drawnLinkCount).to.be.greaterThan(Number(overviewDrawnLinkCount));
        expect(detail.residentLinkCount).to.equal(124750);
      });
    });

    cy.get('[data-testid="sigma-edge-overview"]').click();
    cy.get('[data-testid="sigma-poc-statistics-row"]')
      .should('contain.text', 'Links drawn / resident')
      .and('contain.text', '124,750');
  });
});
