/// <reference types="cypress" />

import {
  expandAccordionTabByHeader,
  installSaveAsCaptureHook,
  openTwoDSettingsDialog,
} from '../../support/journey-helpers';

const loadSampleDataset = (): void => {
  cy.visit('/?skipEula=1');
  cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
    .should('be.visible')
    .click({ force: true });
  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
  cy.get('[data-testid="sigma-renderer-summary"]', { timeout: 30000 })
    .should('contain.text', '33 nodes')
    .and('contain.text', '74 links resident');
};

const expectSigmaGraph = (assertion: (win: any, twoD: any, graph: any) => void): void => {
  cy.window({ timeout: 30000 }).should(win => {
    const appWindow = win as any;
    const twoD = appWindow.commonService.visuals.twoD;
    expect(twoD?.sigmaActive, 'Sigma active').to.equal(true);
    expect(twoD?.sigmaLoading, 'Sigma finished rendering').to.equal(false);
    const graph = twoD?.sigmaRenderer?.getGraph();
    expect(graph, 'Sigma graph').to.exist;
    assertion(appWindow, twoD, graph);
  });
};

const openNetworkDisplayPanel = (): void => {
  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Network').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('networkTab');
  expandAccordionTabByHeader('@networkTab', 'Display');
};

const closeTwoDSettingsDialog = (): void => {
  cy.get('@twoDSettings').find('button.p-dialog-close-button').click({ force: true });
  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

describe('Sigma settings parity', () => {
  beforeEach(loadSampleDataset);

  it('applies node labels, size, border, tooltip, colors, shapes, selection color, and background live', () => {
    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const globalSettings = appWindow.commonService.visuals.microbeTrace;

      twoD.onNodeLabelVaribleChange('_id');
      twoD.setNodeLabelSize(32);
      twoD.onNodeLabelOrientationChange('Bottom');
      twoD.SelectedNodeRadiusSizeVariable = 100;
      twoD.onNodeRadiusChange(100);
      twoD.onNodeBorderWidthChange(5);
      twoD.onNodeTooltipVariableChange(['_id', 'cluster']);

      globalSettings.SelectedColorNodesByVariable = 'None';
      appWindow.commonService.session.style.widgets['node-color-variable'] = 'None';
      globalSettings.SelectedNodeColorVariable = '#123456';
      globalSettings.onNodeColorChanged();

      const house = globalSettings.getNodeShapeTreeSelection('house');
      globalSettings.onNodeShapeByChanged(true, false, 'None');
      globalSettings.onNodeShapeTreeChange(house);

      globalSettings.SelectedColorVariable = '#00aaee';
      globalSettings.onSelectedColorChanged();
      globalSettings.SelectedBackgroundColorVariable = '#112233';
      globalSettings.onBackgroundChanged();
    });

    expectSigmaGraph((win, twoD, graph) => {
      const nodeId = graph.nodes()[0];
      expect(graph.getNodeAttribute(nodeId, 'label')).to.equal(nodeId);
      expect(graph.getNodeAttribute(nodeId, 'labelSize')).to.equal(32);
      expect(graph.getNodeAttribute(nodeId, 'labelPosition')).to.equal('below');
      expect(graph.getNodeAttribute(nodeId, 'size')).to.equal(25);
      expect(graph.getNodeAttribute(nodeId, 'borderWidth')).to.equal(5);
      expect(graph.getNodeAttribute(nodeId, 'color')).to.equal('#123456');
      expect(graph.getNodeAttribute(nodeId, 'shapeKey')).to.equal('house');
      expect((twoD.sigmaRenderer as any).selectedColor).to.equal('#00aaee');
      expect(win.getComputedStyle(win.document.querySelector('[data-testid="sigma-network"]')).backgroundColor)
        .to.equal('rgb(17, 34, 51)');

      const renderer = twoD.sigmaRenderer.getRenderer();
      const nodeReducer = renderer.nodeReducer;
      const reducedNode = nodeReducer(
        nodeId,
        renderer.getNodeDisplayData(nodeId),
        graph.getNodeAttributes(nodeId),
        renderer.getNodeState(nodeId),
      );
      // Custom vector shapes draw their own exact outline; the generic Sigma
      // backdrop is deliberately hidden so it cannot add a circular border.
      expect(reducedNode.backdropVisibility).to.equal('hidden');
      expect(reducedNode.backdropBorderWidth).to.equal(5);
      expect(reducedNode.backdropShadowColor).to.equal('rgba(0,0,0,0)');
      expect(reducedNode.backdropShadowBlur).to.equal(0);
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.onNodeBorderWidthChange(0);
    });
    expectSigmaGraph((_win, twoD, graph) => {
      const nodeId = graph.nodes()[0];
      const renderer = twoD.sigmaRenderer.getRenderer();
      const reducedNode = renderer.nodeReducer(
        nodeId,
        renderer.getNodeDisplayData(nodeId),
        graph.getNodeAttributes(nodeId),
        renderer.getNodeState(nodeId),
      );
      expect(graph.getNodeAttribute(nodeId, 'borderWidth')).to.equal(0);
      expect(reducedNode.backdropVisibility).to.equal('hidden');
      expect(reducedNode.backdropShadowBlur).to.equal(0);
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer;
      const nodeId = adapter.getGraph().nodes()[0];
      (adapter as any).handleNodeHover(nodeId, new win.MouseEvent('mousemove', {
        clientX: 120,
        clientY: 120,
      }));
    });
    cy.get('#tooltip #tooltip-table').should('be.visible').and('contain.text', 'Cluster');

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.onNodeRadiusVariableChange('degree');
      twoD.widgets['node-radius-min'] = 10;
      twoD.widgets['node-radius-max'] = 90;
      twoD.onNodeRadiusMaxChange(90);
    });
    expectSigmaGraph((_win, _twoD, graph) => {
      const sizes = graph.nodes().map((nodeId: string) => graph.getNodeAttribute(nodeId, 'size'));
      expect(Math.min(...sizes)).to.be.lessThan(Math.max(...sizes));
      expect(Math.max(...sizes)).to.be.greaterThan(12);
    });
  });

  it('applies link labels, label size, width, transparency, colors, arrows, tooltips, scaling, and length', () => {
    let initialMeanLength = 0;

    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const globalSettings = appWindow.commonService.visuals.microbeTrace;
      const graph = twoD.sigmaRenderer.getGraph();
      const lengths = graph.edges().map((edgeId: string) => {
        const [sourceId, targetId] = graph.extremities(edgeId);
        const source = graph.getNodeAttributes(sourceId);
        const target = graph.getNodeAttributes(targetId);
        return Math.hypot(source.x - target.x, source.y - target.y);
      });
      initialMeanLength = lengths.reduce((sum: number, value: number) => sum + value, 0) / lengths.length;

      globalSettings.SelectedColorLinksByVariable = 'None';
      appWindow.commonService.session.style.widgets['link-color-variable'] = 'None';
      globalSettings.SelectedLinkColorVariable = '#654321';
      globalSettings.onLinkColorChanged('#654321');

      twoD.onLinkLabelVariableChange('distance');
      twoD.setLinkLabelSize(30);
      twoD.onLinkDecimalVariableChange(2);
      twoD.onLinkWidthChange(15);
      twoD.onLinkOpacityChange(0.25);
      twoD.onLinkDirectedUndirectedChange('Show');
      twoD.onLinkBidirectionalChange('Show');
      twoD.onLinkTooltipVariableChange(['distance']);
    });

    expectSigmaGraph((_win, _twoD, graph) => {
      const edgeIds = graph.edges();
      expect(edgeIds.some((edgeId: string) => graph.getEdgeAttribute(edgeId, 'label') !== '')).to.equal(true);
      expect(edgeIds.every((edgeId: string) => graph.getEdgeAttribute(edgeId, 'labelSize') === 30)).to.equal(true);
      expect(edgeIds.every((edgeId: string) => graph.getEdgeAttribute(edgeId, 'size') === 15)).to.equal(true);
      expect(edgeIds.every((edgeId: string) => Math.abs(graph.getEdgeAttribute(edgeId, 'opacity') - 0.25) < 0.001)).to.equal(true);
      expect(edgeIds.every((edgeId: string) => graph.getEdgeAttribute(edgeId, 'color') === '#654321')).to.equal(true);
      expect(graph.edges().some((id: string) => graph.getEdgeAttribute(id, 'head') === 'arrow')).to.equal(true);
    });
    cy.get('[data-testid="network-edge-label-overlay"]')
      .should('have.attr', 'data-renderer', 'sigma')
      .and('have.attr', 'data-label-size', '30');

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer;
      const edgeId = adapter.getGraph().edges()[0];
      (adapter as any).handleEdgeHover(edgeId, new win.MouseEvent('mousemove', {
        clientX: 180,
        clientY: 180,
      }));
    });
    cy.get('#tooltip').should('be.visible').and('not.be.empty');

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.widgets['link-width-min'] = 2;
      twoD.widgets['link-width-max'] = 12;
      twoD.onLinkWidthVariableChange('distance');
      twoD.onLinkWidthReciprocalNonReciprocalChange('Non-Reciprocal');
    });
    expectSigmaGraph((_win, _twoD, graph) => {
      const sizes = graph.edges().map((edgeId: string) => graph.getEdgeAttribute(edgeId, 'size'));
      expect(Math.min(...sizes)).to.be.at.least(2);
      expect(Math.max(...sizes)).to.be.at.most(12);
      expect(Math.min(...sizes)).to.be.lessThan(Math.max(...sizes));
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.SelectedLinkLengthVariable = 120;
      twoD.onLinkLengthChange(120);
    });
    expectSigmaGraph((_win, _twoD, graph) => {
      const lengths = graph.edges().map((edgeId: string) => {
        const [sourceId, targetId] = graph.extremities(edgeId);
        const source = graph.getNodeAttributes(sourceId);
        const target = graph.getNodeAttributes(targetId);
        return Math.hypot(source.x - target.x, source.y - target.y);
      });
      const meanLength = lengths.reduce((sum: number, value: number) => sum + value, 0) / lengths.length;
      expect(meanLength).to.be.greaterThan(initialMeanLength);
    });
  });

  it('preserves data-driven node colors and shapes plus two-origin link styling', () => {
    let dualOriginLink: any;

    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const style = appWindow.commonService.temp.style;

      twoD.widgets['node-color-variable'] = 'cluster';
      style.nodeColorMap = (value: unknown) => String(value) === '0' ? '#7c3aed' : '#ea580c';
      style.nodeAlphaMap = (value: unknown) => String(value) === '0' ? 0.4 : 0.8;
      twoD.widgets['node-symbol-variable'] = 'cluster';
      style.nodeSymbolMap = (value: unknown) => String(value) === '0' ? 'house' : 'star';

      dualOriginLink = appWindow.commonService.session.data.links[0];
      dualOriginLink.origin = ['Sigma source A', 'Sigma source B'];
      dualOriginLink.SigmaDualOrigin = true;
      twoD.widgets['link-color-variable'] = 'origin';
      style.linkColorMap = (value: unknown) => ({
        'Sigma source A': '#e11d48',
        'Sigma source B': '#0ea5e9',
      })[String(value)] || '#64748b';
      style.linkAlphaMap = () => 0.6;

      twoD.updateNodeColors();
      twoD.updateNodeShapes();
      twoD.updateLinkColor();
    });

    expectSigmaGraph((_win, _twoD, graph) => {
      const nodeAttributes = graph.nodes().map((nodeId: string) => graph.getNodeAttributes(nodeId));
      expect([...new Set(nodeAttributes.map((node: any) => node.color))]).to.include.members(['#7c3aed', '#ea580c']);
      expect([...new Set(nodeAttributes.map((node: any) => node.opacity))]).to.include.members([0.4, 0.8]);
      expect([...new Set(nodeAttributes.map((node: any) => node.shapeKey))]).to.include.members(['house', 'star']);

      const dualOriginEdge = graph.edges().find((edgeId: string) => (
        graph.getEdgeAttribute(edgeId, 'raw')?.raw?.SigmaDualOrigin === true
      ));
      expect(dualOriginEdge, 'two-origin Sigma edge').to.exist;
      expect(graph.getEdgeAttribute(dualOriginEdge, 'color')).to.equal('#e11d48');
      expect(graph.getEdgeAttribute(dualOriginEdge, 'opacity')).to.equal(0.6);
      expect(graph.getEdgeAttribute(dualOriginEdge, 'overlayDashColor')).to.equal('#0ea5e9');
      expect(graph.getEdgeAttribute(dualOriginEdge, 'overlayDashOpacity')).to.equal(0.6);
    });
    cy.get('[data-testid="network-edge-overlay"]')
      .should('have.attr', 'data-renderer', 'sigma')
      .invoke('attr', 'data-duo-link-count')
      .then(value => expect(Number(value)).to.be.greaterThan(0));
    cy.get('[data-testid="network-edge-overlay"]').then($edgeOverlay => {
      const stage = $edgeOverlay[0].parentElement?.querySelector('.sigma-stage');
      expect(stage, 'Sigma WebGL stage').not.to.be.null;
      expect(
        stage!.compareDocumentPosition($edgeOverlay[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
        'clipped dashed edge layer is above the primary WebGL edge',
      ).to.be.greaterThan(0);
      cy.get('[data-testid="network-node-feature-overlay"]').then($nodeOverlay => {
        const relationship = $edgeOverlay[0].compareDocumentPosition($nodeOverlay[0]);
        expect(
          relationship & Node.DOCUMENT_POSITION_FOLLOWING,
          'dashed edge layer is below the node overlay',
        ).to.be.greaterThan(0);
      });
    });
  });

  it('ties Sigma neighbor emphasis to its setting and clears hover emphasis on stage clicks', () => {
    expectSigmaGraph((_win, twoD) => {
      expect(twoD.widgets['node-highlight'], 'sample session neighbor setting').to.equal(true);
      expect(twoD.SelectedNetworkNeighborTypeVariable, 'display setting selection').to.equal('Highlighted');
      expect((twoD.sigmaRenderer as any).highlightNeighbors, 'Sigma neighbor setting').to.equal(true);
    });

    openNetworkDisplayPanel();
    cy.get('@networkTab')
      .find('#dont-highlight-neighbors-highlight-neighbors')
      .contains('p-togglebutton', 'Highlighted')
      .should('have.attr', 'aria-pressed', 'true');
    closeTwoDSettingsDialog();

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer as any;
      const graph = adapter.getGraph();
      const renderer = adapter.getRenderer();
      const edgeId = graph.edges()[0];
      const [nodeId] = graph.extremities(edgeId);
      const nonNeighborId = graph.nodes().find((candidate: string) => (
        candidate !== nodeId && !graph.areNeighbors(nodeId, candidate)
      ));
      expect(nonNeighborId, 'non-neighbor node').to.exist;

      adapter.handleNodeHover(nodeId, new win.MouseEvent('mousemove', {
        clientX: 140,
        clientY: 140,
      }));

      const dimmed = renderer.nodeReducer(
        nonNeighborId,
        renderer.getNodeDisplayData(nonNeighborId),
        graph.getNodeAttributes(nonNeighborId),
        renderer.getNodeState(nonNeighborId),
      );
      expect(dimmed.opacity, 'non-neighbor opacity while highlighted').to.equal(0.12);
      expect(adapter.getDisplayGraph().edges().every((candidate: string) => {
        const [sourceId, targetId] = adapter.getDisplayGraph().extremities(candidate);
        return sourceId === nodeId || targetId === nodeId;
      }), 'hover edge projection only contains incident links').to.equal(true);

      renderer.emit('clickStage', {});

      expect(adapter.hoveredNodeId, 'hover cleared by whitespace click').to.equal(null);
      expect(adapter.getSelectedNodeIds(), 'whitespace click does not select a node group').to.deep.equal([]);
      const restored = renderer.nodeReducer(
        nonNeighborId,
        renderer.getNodeDisplayData(nonNeighborId),
        graph.getNodeAttributes(nonNeighborId),
        renderer.getNodeState(nonNeighborId),
      );
      expect(restored.opacity, 'non-neighbor opacity after whitespace click').to.be.greaterThan(0.12);
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer as any;
      const graph = adapter.getGraph();
      const renderer = adapter.getRenderer();
      const network = win.document.querySelector('[data-testid="sigma-network"]') as HTMLElement;
      const rect = network.getBoundingClientRect();
      const nodePoints = graph.nodes().map((nodeId: string) => {
        const attributes = graph.getNodeAttributes(nodeId);
        return renderer.graphToViewport({ x: attributes.x, y: attributes.y });
      });
      let safePoint = { x: 40, y: Math.max(40, rect.height - 40), clearance: -1 };
      for (let x = 40; x <= rect.width - 40; x += 40) {
        for (let y = 100; y <= rect.height - 40; y += 40) {
          if (x > rect.width - 240 && y > rect.height - 180) continue;
          if (x > rect.width - 650 && y < 100) continue;
          const clearance = Math.min(...nodePoints.map((point: { x: number; y: number }) => (
            Math.hypot(point.x - x, point.y - y)
          )));
          if (clearance > safePoint.clearance) safePoint = { x, y, clearance };
        }
      }
      expect(safePoint.clearance, 'whitespace click clearance from every node').to.be.greaterThan(40);
      cy.wrap(safePoint, { log: false }).as('sigmaWhitespacePoint');
    });

    cy.get('@sigmaWhitespacePoint').then((point: any) => {
      cy.get('[data-testid="sigma-network"] .sigma-stage')
        .click(point.x, point.y, { force: true });
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer as any;
      const graph = adapter.getGraph();
      const renderer = adapter.getRenderer();
      expect(adapter.getKeyboardFocusedNodeId(), 'pointer click does not activate keyboard node focus').to.equal(null);
      expect(adapter.hoveredNodeId, 'pointer whitespace click clears hover').to.equal(null);
      expect(adapter.getSelectedNodeIds(), 'pointer whitespace click leaves selection empty').to.deep.equal([]);
      expect(Array.from(adapter.hoveredNeighborhood), 'pointer whitespace click leaves no active neighborhood')
        .to.deep.equal([]);
      graph.forEachNode((nodeId: string, attributes: any) => {
        const reduced = renderer.nodeReducer(
          nodeId,
          renderer.getNodeDisplayData(nodeId),
          attributes,
          renderer.getNodeState(nodeId),
        );
        expect(reduced.opacity, `normal opacity for ${nodeId}`).to.equal(attributes.opacity);
      });
    });

    openNetworkDisplayPanel();
    cy.get('@networkTab')
      .find('#dont-highlight-neighbors-highlight-neighbors')
      .contains('p-togglebutton', 'Normal')
      .click({ force: true })
      .should('have.attr', 'aria-pressed', 'true');
    closeTwoDSettingsDialog();

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer as any;
      const graph = adapter.getGraph();
      const renderer = adapter.getRenderer();
      const edgeId = graph.edges()[0];
      const [nodeId] = graph.extremities(edgeId);
      const nonNeighborId = graph.nodes().find((candidate: string) => (
        candidate !== nodeId && !graph.areNeighbors(nodeId, candidate)
      ));
      const edgeIdsBeforeHover = adapter.getDisplayGraph().edges().sort();

      adapter.handleNodeHover(nodeId, new win.MouseEvent('mousemove', {
        clientX: 140,
        clientY: 140,
      }));

      expect(twoD.widgets['node-highlight']).to.equal(false);
      expect(adapter.highlightNeighbors).to.equal(false);
      expect(Array.from(adapter.hoveredNeighborhood), 'disabled setting has no active neighborhood').to.deep.equal([]);
      expect(adapter.getDisplayGraph().edges().sort(), 'disabled setting keeps the normal edge projection')
        .to.deep.equal(edgeIdsBeforeHover);
      const normal = renderer.nodeReducer(
        nonNeighborId,
        renderer.getNodeDisplayData(nonNeighborId),
        graph.getNodeAttributes(nonNeighborId),
        renderer.getNodeState(nonNeighborId),
      );
      expect(normal.opacity, 'disabled setting does not dim non-neighbors')
        .to.equal(graph.getNodeAttribute(nonNeighborId, 'opacity'));
      adapter.handleNodeHover(null, new win.MouseEvent('mouseout'));
    });
  });

  it('uses configurable Sigma hulls for every group size and preserves network display settings', () => {
    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const nodes = appWindow.commonService.session.data.nodes as any[];
      const filteredNodes = appWindow.commonService.session.data.nodeFilteredValues as any[];
      const groupById = new Map<string, string>();

      nodes.forEach((node, index) => {
        const group = index === 0 ? 'Singleton' : index < 3 ? 'Pair' : 'Cohort';
        node.SigmaParityGroup = group;
        groupById.set(String(node._id ?? node.id), group);
      });
      filteredNodes.forEach(node => {
        node.SigmaParityGroup = groupById.get(String(node._id ?? node.id));
      });

      twoD.widgets['polygons-foci'] = 'SigmaParityGroup';
      twoD.widgets['polygons-color-show'] = true;
      twoD.polygonsToggle(true);
      twoD.onPolygonLabelShowChange(true);
      twoD.onPolygonLabelSizeChange(28);
      twoD.onPolygonLabelOrientationChange('Bottom');
      twoD.onDontHighlightNeighborsHighlightNeighborsChange('Highlighted');
      twoD.onNetworkGridlinesShowHideChange('Show');

      // Use the persisted style arrays that back the group color table so any
      // scheduled table refresh rebuilds the same color/alpha scales.
      appWindow.commonService.session.style.polygonColors = ['#dc2626', '#16a34a', '#2563eb'];
      appWindow.commonService.session.style.polygonAlphas = [0.25, 0.5, 0.75];
      appWindow.commonService.createPolygonColorMap();
      twoD.updateGroupNodeColors();
    });

    expectSigmaGraph((_win, twoD, graph) => {
      expect(twoD.sigmaSummary.groupHullCount).to.equal(3);
      expect(graph.nodes().some((nodeId: string) => graph.getNodeAttribute(nodeId, 'group') === 'Singleton'))
        .to.equal(true);
      const adapter = twoD.sigmaRenderer as any;
      expect(adapter.groupLabelPosition).to.equal('below');
      expect(adapter.groupLabelSize).to.equal(28);
      expect(adapter.highlightNeighbors).to.equal(true);
      expect(adapter.groupHulls.map((hull: any) => hull.opacity).sort()).to.deep.equal([0.25, 0.5, 0.75]);
      expect(adapter.groupHulls.every((hull: any) => hull.points.length >= 1)).to.equal(true);
    });
    cy.get('[data-testid="network-group-hull-overlay"]')
      .should('exist')
      .and('have.attr', 'data-renderer', 'sigma');
    cy.get('.grid-overlay').should('not.have.class', 'hidden');
    cy.get('#cy').should('not.exist');

    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      twoD.updatePolygonColors();

      const polygonGroups = appWindow.commonService.temp.polygonGroups;
      expect(polygonGroups.map((group: any) => group.key))
        .to.deep.equal(['Cohort', 'Pair', 'Singleton']);
      expect(polygonGroups.map((group: any) => group.index)).to.deep.equal([0, 1, 2]);
      expect(polygonGroups.find((group: any) => group.key === 'Singleton').values)
        .to.deep.equal([String(
          appWindow.commonService.session.data.nodes[0]._id
            ?? appWindow.commonService.session.data.nodes[0].id,
        )]);
      expect(polygonGroups.find((group: any) => group.key === 'Pair').values)
        .to.deep.equal(appWindow.commonService.session.data.nodes.slice(1, 3)
          .map((node: any) => String(node._id ?? node.id)));
      expect(polygonGroups.find((group: any) => group.key === 'Cohort').values)
        .to.deep.equal(appWindow.commonService.session.data.nodes.slice(3)
          .map((node: any) => String(node._id ?? node.id)));
      expect(twoD.polygonColorRows.map((row: any) => row.rawValue).sort())
        .to.deep.equal(['Cohort', 'Pair', 'Singleton']);

      const singletonRow = twoD.polygonColorRows.find((row: any) => row.rawValue === 'Singleton');
      twoD.onPolygonColorTableColorChange({
        value: 'Singleton',
        color: '#7e22ce',
        row: singletonRow,
      });
      twoD.onPolygonColorAlphaRequested({
        value: 'Singleton',
        row: singletonRow,
        event: new win.MouseEvent('click', { clientX: 120, clientY: 120 }),
      });
      const alphaInput = win.document.querySelector('#color-transparency') as HTMLInputElement;
      alphaInput.value = '0.4';
      alphaInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    });

    expectSigmaGraph((_win, twoD) => {
      const singletonHull = (twoD.sigmaRenderer as any).groupHulls
        .find((hull: any) => hull.label === 'Singleton');
      expect(singletonHull.color).to.equal('#7e22ce');
      expect(singletonHull.opacity).to.equal(0.4);
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.polygonColorsToggle(false);
      twoD.onPolygonColorChanged('#0f766e');
    });
    expectSigmaGraph((_win, twoD) => {
      expect((twoD.sigmaRenderer as any).groupHulls.every((hull: any) => hull.color === '#0f766e'))
        .to.equal(true);
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.polygonColorsToggle(true);
    });
    expectSigmaGraph((_win, twoD) => {
      const colors = (twoD.sigmaRenderer as any).groupHulls.map((hull: any) => hull.color);
      expect(new Set(colors).size).to.be.greaterThan(1);
      expect(colors).to.include('#7e22ce');
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer as any;
      const renderer = adapter.getRenderer();
      const displayGraph = adapter.getDisplayGraph();
      const edgeId = displayGraph.edges()[0];
      const [nodeId] = displayGraph.extremities(edgeId);
      const before = renderer.getEdgeDisplayData(edgeId);

      adapter.handleNodeHover(nodeId, new win.MouseEvent('mousemove', {
        clientX: 140,
        clientY: 140,
      }));

      const highlighted = renderer.getEdgeDisplayData(edgeId);
      expect(highlighted.color).to.equal(adapter.selectedColor);
      expect(highlighted.size).to.be.greaterThan(before.size);

      adapter.handleNodeHover(null, new win.MouseEvent('mouseout'));
      const restored = renderer.getEdgeDisplayData(edgeId);
      expect(restored.size).to.be.closeTo(before.size, 0.001);

      const cohortHull = adapter.groupHulls.find((hull: any) => hull.label === 'Cohort');
      expect(cohortHull, 'cohort hull').to.exist;
      const draggedNodeId = cohortHull.nodeIds[0];
      const beforeAttributes = adapter.getGraph().getNodeAttributes(draggedNodeId);
      const beforePosition = { x: beforeAttributes.x, y: beforeAttributes.y };
      const start = renderer.graphToViewport(cohortHull.center);
      const preventSigmaDefault = cy.stub();
      adapter.startHullDrag({
        event: {
          ...start,
          original: new win.MouseEvent('mousedown', { button: 0 }),
        },
        preventSigmaDefault,
      });
      adapter.finishHullDrag({
        event: { x: start.x + 45, y: start.y + 30 },
        preventSigmaDefault,
      });

      const afterPosition = adapter.getGraph().getNodeAttributes(draggedNodeId);
      expect(afterPosition.x).not.to.equal(beforePosition.x);
      expect(afterPosition.y).not.to.equal(beforePosition.y);
      expect(adapter.getSelectedNodeIds()).to.have.length(cohortHull.nodeIds.length);
      const sessionNode = (win as any).commonService.session.data.nodes.find(
        (node: any) => String(node._id ?? node.id) === draggedNodeId,
      );
      expect(sessionNode.x).to.be.closeTo(afterPosition.x, 0.001);
      expect(sessionNode.y).to.be.closeTo(afterPosition.y, 0.001);
    });
  });

  it('synchronizes external selection and keeps context-menu and node-drag interactions', () => {
    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer;
      const nodeIds = adapter.getGraph().nodes().slice(0, 2);
      const selected = new Set(nodeIds);

      for (const collection of [
        appWindow.commonService.session.data.nodes,
        appWindow.commonService.session.data.nodeFilteredValues,
      ]) {
        collection.forEach((node: any) => {
          node.selected = selected.has(String(node._id ?? node.id));
        });
      }
      win.document.dispatchEvent(new win.Event('node-selected'));
      expect(adapter.getSelectedNodeIds().sort()).to.deep.equal([...nodeIds].sort());

      const nodeId = nodeIds[0];
      const rawNode = adapter.getGraph().getNodeAttribute(nodeId, 'raw');
      const renderer = adapter.getRenderer() as any;
      const contextEvent = new win.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 160,
        clientY: 120,
      });
      renderer.emit('rightClickNode', {
        node: nodeId,
        event: { original: contextEvent },
        preventSigmaDefault: () => undefined,
      });
      expect(rawNode.raw, 'raw application node').to.exist;

      const beforeAttributes = adapter.getGraph().getNodeAttributes(nodeId);
      const before = { x: beforeAttributes.x, y: beforeAttributes.y };
      const start = renderer.graphToViewport({ x: before.x, y: before.y });
      const dragEvent = (x: number, y: number) => ({
        node: nodeId,
        draggedNode: nodeId,
        allDraggedNodes: [nodeId],
        event: { x, y },
      });
      renderer.emit('nodeDragStart', dragEvent(start.x, start.y));
      renderer.emit('nodeDrag', dragEvent(start.x + 55, start.y + 35));
      renderer.emit('nodeDragEnd', dragEvent(start.x + 55, start.y + 35));

      const after = adapter.getGraph().getNodeAttributes(nodeId);
      expect(after.x).not.to.equal(before.x);
      expect(after.y).not.to.equal(before.y);
      const sessionNode = appWindow.commonService.session.data.nodes.find(
        (node: any) => String(node._id ?? node.id) === nodeId,
      );
      expect(sessionNode.x).to.be.closeTo(after.x, 0.001);
      expect(sessionNode.y).to.be.closeTo(after.y, 0.001);
    });

    cy.get('#context-menu').should('be.visible');
    cy.get('#copyID').invoke('attr', 'data-clipboard-text').should('not.be.empty');
  });

  it('exports the complete Sigma canvas stack through the SVG workflow', () => {
    const fileName = `sigma-settings-export-${Date.now()}`;
    installSaveAsCaptureHook();

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.SelectedNetworkExportFilenameVariable = fileName;
      twoD.SelectedNetworkExportFileTypeListVariable = 'svg';
      twoD.SelectedNetworkExportScaleVariable = 2;
      twoD.exportVisualization(null);
    });

    cy.window({ timeout: 30000 }).should(win => {
      const downloads = (win as any).__mtCapturedDownloads || [];
      const captured = downloads.find((download: any) => download.fileName === `${fileName}.svg`);
      expect(captured, 'captured Sigma SVG').to.exist;
      const svg = win.atob(String(captured.dataUrl).split(',')[1] || '');
      expect(svg).to.include('<svg');
      expect(svg).to.include('microbetrace-renderer-export-metadata');
      expect(svg.includes('"renderer":"sigma"') || svg.includes('&quot;renderer&quot;:&quot;sigma&quot;'))
        .to.equal(true);
      expect(svg).to.include('<image');
      expect(svg).to.include('data:image/png;base64,');
    });
  });

  it('keeps scientific overlays and node collapse on the Sigma path', () => {
    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const applyFields = (node: any, index: number) => {
        node.SigmaQcStatus = index % 2 ? 'Review' : 'Pass';
        node.SigmaQcSeverity = index % 2 ? 'warning' : 'none';
        node.SigmaQcReason = index % 2 ? 'Metadata check' : 'Complete';
        node.SigmaUncertainty = index % 2 ? 0.65 : 0.1;
      };
      appWindow.commonService.session.data.nodes.forEach(applyFields);
      appWindow.commonService.session.data.nodeFilteredValues.forEach(applyFields);
      twoD.onRendererFeatureFieldChange('node-qc-status-variable', 'SigmaQcStatus');
      twoD.onRendererFeatureFieldChange('node-qc-severity-variable', 'SigmaQcSeverity');
      twoD.onRendererFeatureFieldChange('node-qc-reason-variable', 'SigmaQcReason');
      twoD.onRendererFeatureFieldChange('node-uncertainty-variable', 'SigmaUncertainty');
    });

    expectSigmaGraph((_win, _twoD, graph) => {
      const features = graph.getNodeAttribute(graph.nodes()[1], 'features');
      expect(features.qc.status).to.equal('Review');
      expect(features.qc.severity).to.equal('warning');
      expect(features.qc.reason).to.equal('Metadata check');
      expect(features.uncertainty).to.equal(0.65);
    });

    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.widgets['network-node-collapse-threshold'] = 1;
      twoD.onNodeCollapseEnabledChange(true, false);
    });
    cy.window({ timeout: 30000 }).should(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const graph = twoD.sigmaRenderer.getGraph();
      expect(twoD.sigmaActive).to.equal(true);
      expect(graph.order).to.be.lessThan(33);
      expect(graph.nodes().some((nodeId: string) => (
        graph.getNodeAttribute(nodeId, 'raw')?.raw?.isCollapsedAggregate === true
      ))).to.equal(true);
    });
    cy.get('#cy').should('not.exist');
  });
});
