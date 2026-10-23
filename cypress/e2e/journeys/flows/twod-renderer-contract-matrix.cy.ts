/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
} from '../../../support/journey-helpers';
import {
  assertTwoDRendererReady,
  dragTwoDNodeBy,
  getHighlightedIncidentEdgeCount,
  getSelectedTwoDNodeIds,
  getTwoDEdgeSnapshots,
  getTwoDGroupSnapshots,
  getTwoDNodeSnapshots,
  hoverTwoDNode,
  openTwoDNodeContextMenu,
  refreshTwoDRendererData,
  rendererVisitOptions,
  selectTwoDNodesFromExternalView,
  TWO_D_RENDERER_CASES,
  TwoDRendererMode,
} from '../../../support/twod-renderer-harness';

const profile = getProfile('style-apply-cypress-test-style-threshold');

const waitForRender = (mode: TwoDRendererMode): void => {
  assertTwoDRendererReady(mode);
  cy.window({ timeout: 60000 }).should((win: any) => {
    const twoD = win.commonService.visuals.twoD;
    expect(twoD.sigmaLoading || false, 'Sigma loading').to.equal(false);
    expect(twoD.sigmaRendering || false, 'Sigma rendering').to.equal(false);
  });
};

const meanLinkLength = (win: any): number => {
  const nodes = new Map(getTwoDNodeSnapshots(win).map(node => [node.id, node]));
  const lengths = getTwoDEdgeSnapshots(win).map(edge => {
    const source = nodes.get(edge.source)!;
    const target = nodes.get(edge.target)!;
    return Math.hypot(source.x - target.x, source.y - target.y);
  });
  return lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, lengths.length);
};

TWO_D_RENDERER_CASES.forEach(({ label, mode }) => {
  describe(`2D renderer-neutral contracts - ${label}`, () => {
    beforeEach(() => {
      launchProfileToTwoD(profile, rendererVisitOptions(mode));
      assertAfterLaunchCounts(profile);
      waitForRender(mode);
    });

    it('loads the same uploaded graph without allocating the other renderer', () => {
      cy.window().then((win: any) => {
        const nodes = getTwoDNodeSnapshots(win);
        const edges = getTwoDEdgeSnapshots(win);
        expect(nodes, 'resident uploaded nodes').to.have.length(15);
        expect(edges, 'resident uploaded links').to.have.length(12);
        expect(new Set(nodes.map(node => node.id)).size, 'unique node ids').to.equal(15);
        expect(edges.every(edge => edge.source && edge.target), 'valid link endpoints').to.equal(true);
      });

      cy.get('#numberOfNodes').should('contain.text', '15');
      cy.get('#numberOfVisibleLinks').should('contain.text', '12');
    });

    it('applies the same node label, size, border, orientation, and scaling contracts', () => {
      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.onNodeLabelVaribleChange('_id');
        twoD.setNodeLabelSize(26);
        twoD.onNodeLabelOrientationChange('Bottom');
        twoD.SelectedNodeRadiusSizeVariable = 70;
        twoD.onNodeRadiusChange(70);
        twoD.onNodeBorderWidthChange(5);
      });
      waitForRender(mode);

      cy.window().then((win: any) => {
        const nodes = getTwoDNodeSnapshots(win);
        expect(nodes.every(node => node.label === node.id), 'ID labels').to.equal(true);
        expect(nodes.every(node => Math.abs(node.diameter - 38) < 1), 'fixed rendered diameter').to.equal(true);
        expect(nodes.every(node => Math.abs(node.borderWidth - 5) < 0.2), 'node border width').to.equal(true);
      });

      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.widgets['node-radius-min'] = 25;
        twoD.widgets['node-radius-max'] = 90;
        twoD.onNodeRadiusVariableChange('degree');
        twoD.onNodeRadiusMaxChange(90);
      });
      waitForRender(mode);

      cy.window().then((win: any) => {
        const diameters = getTwoDNodeSnapshots(win).map(node => node.diameter);
        expect(Math.min(...diameters), 'minimum scaled node diameter').to.be.closeTo(20, 1);
        expect(Math.max(...diameters), 'maximum scaled node diameter').to.be.closeTo(46, 1);
        expect(Math.max(...diameters) - Math.min(...diameters), 'non-flat node scale').to.be.greaterThan(20);
      });
    });

    it('applies the same link width, opacity, labels, arrows, scaling, and length contracts', () => {
      let initialLength = 0;
      cy.window().then((win: any) => {
        initialLength = meanLinkLength(win);
        for (const collection of [
          win.commonService.session.data.links,
          win.commonService.session.data.linkFilteredValues,
        ]) {
          (collection || []).forEach((link: any) => {
            link.directed = true;
            link.bidirectional = true;
          });
        }

        return refreshTwoDRendererData(win);
      });
      waitForRender(mode);

      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.onLinkLabelVariableChange('distance');
        twoD.setLinkLabelSize(28);
        twoD.onLinkDecimalVariableChange(2);
        twoD.onLinkWidthChange(12);
        twoD.onLinkOpacityChange(0.45);
        twoD.onLinkDirectedUndirectedChange('Show');
        twoD.onLinkBidirectionalChange('Show');
      });
      waitForRender(mode);

      cy.window().then((win: any) => {
        const edges = getTwoDEdgeSnapshots(win);
        expect(edges.every(edge => Math.abs(edge.width - 12) < 0.5), 'fixed link width').to.equal(true);
        expect(edges.every(edge => Math.abs(edge.opacity - 0.45) < 0.02), 'link opacity').to.equal(true);
        expect(edges.some(edge => /\d/.test(edge.label)), 'numeric link labels').to.equal(true);
        expect(edges.every(edge => edge.head === 'arrow'), 'directed arrows').to.equal(true);
        expect(edges.every(edge => edge.tail === 'arrow'), 'bidirectional arrows').to.equal(true);
      });

      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.widgets['link-width-min'] = 2;
        twoD.widgets['link-width-max'] = 18;
        twoD.onLinkWidthVariableChange('distance');
        twoD.onLinkWidthReciprocalNonReciprocalChange('Non-Reciprocal');
      });
      waitForRender(mode);

      cy.window().then((win: any) => {
        const widths = getTwoDEdgeSnapshots(win).map(edge => edge.width);
        expect(Math.min(...widths), 'minimum link width').to.be.closeTo(2, 0.6);
        expect(Math.max(...widths), 'maximum link width').to.be.closeTo(18, 0.6);
      });

      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.SelectedLinkLengthVariable = 120;
        return twoD.onLinkLengthChange(120);
      });
      waitForRender(mode);
      cy.window().then((win: any) => {
        expect(Number(win.commonService.session.style.widgets['link-length']), 'stored link length').to.equal(120);
        expect(
          Math.abs(meanLinkLength(win) - initialLength),
          'layout responds to link-length change',
        ).to.be.greaterThan(0.2);
      });
    });

    it('applies one uploaded style file to equivalent data-driven node and link attributes', () => {
      applyStyleFromProfile(profile);
      cy.closeGlobalSettings();
      waitForRender(mode);

      cy.window().then((win: any) => {
        const nodes = getTwoDNodeSnapshots(win);
        const edges = getTwoDEdgeSnapshots(win);
        const professions = new Set(nodes.map(node => String(node.raw.Profession)));
        const nodeTypes = new Set(nodes.map(node => String(node.raw['Node type'])));
        const professionColors = new Map<string, Set<string>>();
        const nodeTypeShapes = new Map<string, Set<string>>();

        nodes.forEach(node => {
          const profession = String(node.raw.Profession);
          const nodeType = String(node.raw['Node type']);
          if (!professionColors.has(profession)) professionColors.set(profession, new Set());
          if (!nodeTypeShapes.has(nodeType)) nodeTypeShapes.set(nodeType, new Set());
          professionColors.get(profession)!.add(node.color.toLowerCase());
          nodeTypeShapes.get(nodeType)!.add(node.shapeKey);
        });

        expect(professions.size, 'multiple profession values').to.be.greaterThan(1);
        expect(nodeTypes.size, 'multiple node types').to.be.greaterThan(1);
        professionColors.forEach(colors => expect(colors.size, 'one color per profession').to.equal(1));
        nodeTypeShapes.forEach(shapes => expect(shapes.size, 'one shape per node type').to.equal(1));
        expect(new Set([...professionColors.values()].map(colors => [...colors][0])).size, 'distinct profession colors')
          .to.be.greaterThan(1);
        expect(new Set([...nodeTypeShapes.values()].map(shapes => [...shapes][0])).size, 'distinct node-type shapes')
          .to.be.greaterThan(1);
        expect(new Set(edges.map(edge => edge.color.toLowerCase())).size, 'data-driven link colors')
          .to.be.greaterThan(1);
        expect(new Set(nodes.map(node => Math.round(node.diameter))).size, 'degree-scaled node sizes')
          .to.be.greaterThan(1);
      });
    });

    it('synchronizes cross-view selection, highlighting, tooltips, context menus, and dragging', () => {
      let targetNodeId = '';
      let selectedNodeIds: string[] = [];
      let originalPosition = { x: 0, y: 0 };

      cy.window().then((win: any) => {
        const nodes = getTwoDNodeSnapshots(win);
        const edges = getTwoDEdgeSnapshots(win);
        targetNodeId = edges[0].source;
        selectedNodeIds = nodes.slice(0, 2).map(node => node.id).sort();
        const target = nodes.find(node => node.id === targetNodeId)!;
        originalPosition = { x: target.x, y: target.y };

        selectTwoDNodesFromExternalView(win, selectedNodeIds);
        expect(getSelectedTwoDNodeIds(win)).to.deep.equal(selectedNodeIds);

        win.commonService.visuals.twoD.onDontHighlightNeighborsHighlightNeighborsChange('Highlighted');
      });
      waitForRender(mode);

      cy.window().then((win: any) => {
        hoverTwoDNode(win, targetNodeId, true);
        expect(getHighlightedIncidentEdgeCount(win, targetNodeId), 'highlighted incident edges')
          .to.be.greaterThan(0);
      });
      cy.get('#tooltip', { timeout: 10000 }).should('be.visible');

      cy.window().then((win: any) => {
        hoverTwoDNode(win, targetNodeId, false);
        expect(getHighlightedIncidentEdgeCount(win, targetNodeId), 'cleared incident highlights').to.equal(0);
        openTwoDNodeContextMenu(win, targetNodeId);
      });
      cy.get('#context-menu').should('be.visible');
      cy.get('#copyID').should(($copyId) => {
        expect($copyId.attr('data-clipboard-text'), 'context-menu node id').to.equal(targetNodeId);
      });

      cy.window().then((win: any) => {
        const nextPosition = dragTwoDNodeBy(win, targetNodeId, 55, 35);
        expect(nextPosition.x, 'dragged x').not.to.equal(originalPosition.x);
        expect(nextPosition.y, 'dragged y').not.to.equal(originalPosition.y);
        const sessionNode = win.commonService.session.data.nodes.find(
          (node: any) => String(node._id ?? node.id) === targetNodeId,
        );
        expect(Number(sessionNode.x), 'session x').to.be.closeTo(nextPosition.x, 0.001);
        expect(Number(sessionNode.y), 'session y').to.be.closeTo(nextPosition.y, 0.001);
      });
      cy.get('#numberOfSelectedNodes').should('have.text', '2');
    });

    it('represents the same grouping membership and editable palette as hulls or fallback parents', () => {
      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.widgets['polygons-foci'] = 'Node type';
        twoD.widgets['polygons-color-show'] = true;
        twoD.polygonsToggle(true);
        twoD.onPolygonLabelShowChange(true);
        twoD.onPolygonLabelOrientationChange('Bottom');
      });
      waitForRender(mode);

      cy.window().should((win: any) => {
        const groups = getTwoDGroupSnapshots(win);
        const expectedKeys = [...new Set(getTwoDNodeSnapshots(win)
          .map(node => node.raw['Node type'])
          .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
          .map(value => String(value)))]
          .sort();
        expect(groups.map(group => group.key).sort(), 'group keys').to.deep.equal(expectedKeys);

        groups.forEach(group => {
          const expectedMembers = getTwoDNodeSnapshots(win)
            .filter(node => String(node.raw['Node type']) === group.key)
            .map(node => node.id)
            .sort();
          expect(group.nodeIds, `${group.key} membership`).to.deep.equal(expectedMembers);
        });
      });

      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.updatePolygonColors();
        const row = twoD.polygonColorRows[0];
        expect(row, 'group palette row').to.exist;
        twoD.onPolygonColorTableColorChange({
          value: row.rawValue,
          color: '#7e22ce',
          row,
        });
        cy.wrap(String(row.rawValue), { log: false }).as('changedGroupKey');
      });
      waitForRender(mode);

      cy.get<string>('@changedGroupKey').then(groupKey => {
        cy.window().then((win: any) => {
          const group = getTwoDGroupSnapshots(win).find(candidate => candidate.key === groupKey);
          expect(group, 'changed group').to.exist;
          expect(group!.color.toLowerCase(), 'changed group color').to.equal('#7e22ce');
        });
      });
    });

    it('updates the active graph after a user threshold change', () => {
      let initialEdgeCount = 0;
      cy.window().then((win: any) => {
        initialEdgeCount = getTwoDEdgeSnapshots(win).length;
      });

      openGlobalFilteringTab();
      setGlobalLinkThreshold(0);
      cy.closeGlobalSettings();

      cy.window({ timeout: 60000 }).should((win: any) => {
        const edgeCount = getTwoDEdgeSnapshots(win).length;
        const visibleSessionLinks = win.commonService.session.data.links
          .filter((link: any) => link.visible).length;
        expect(
          edgeCount,
          `filtered renderer links (session has ${visibleSessionLinks} visible links)`,
        ).to.be.lessThan(initialEdgeCount);
        expect(visibleSessionLinks, 'zero-threshold session links').to.equal(0);
        expect(edgeCount, 'zero-threshold links').to.equal(0);
      });
    });

    it('exports a valid SVG through the same workflow', () => {
      const fileName = `renderer-contract-${mode}-${Date.now()}`;
      installSaveAsCaptureHook();

      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.SelectedNetworkExportFilenameVariable = fileName;
        twoD.SelectedNetworkExportFileTypeListVariable = 'svg';
        twoD.SelectedNetworkExportScaleVariable = 1;
        twoD.exportVisualization(null);
      });

      cy.window({ timeout: 30000 }).should((win: any) => {
        const captured = (win.__mtCapturedDownloads || [])
          .find((download: any) => download.fileName === `${fileName}.svg`);
        expect(captured, 'captured SVG export').to.exist;
        const svg = win.atob(String(captured.dataUrl).split(',')[1] || '');
        expect(svg).to.include('<svg');
        expect(svg.length, 'SVG payload length').to.be.greaterThan(100);
      });
    });
  });
});
