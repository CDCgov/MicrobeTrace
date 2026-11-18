/// <reference types="cypress" />

import { installSaveAsCaptureHook, saveSessionFromFileMenu, visitAppAndAcceptEula, writeCapturedDownloadToDisk } from '../../support/journey-helpers';
import { applyDeterministicDashboardSplitLayout, openDashboardExportDialog, setDashboardExportFilename } from '../../support/dashboard-helpers';
import { applyThreeDInvestigationStyling } from '../../support/threed-helpers';

const openThreeD = (): void => {
  cy.get('[data-testid="app-view-menu-button"]').click();
  cy.get('[data-testid="app-view-menu-3d-network"]').click();
  cy.get('[data-testid="threed-webgl-canvas"]', { timeout: 30000 }).should('be.visible');
  cy.get('[data-testid="threed-canvas"]').should('have.attr', 'data-rendered', 'true');
};

const assertVisibleGraphMatchesSession = (): void => {
  cy.window().should((win: any) => {
    const service = win.commonService;
    const view = service.visuals.threeD;
    const ids = new Set(service.getVisibleNodes().map((node: any) => String(node._id ?? node.id)));
    const links = service.getVisibleLinksForCurrentTimeline().filter((link: any) => ids.has(String(link.source)) && ids.has(String(link.target)));
    expect(view.nodeCount, '3D nodes').to.equal(ids.size);
    expect(view.linkCount, '3D links').to.equal(links.length);
    expect(view.error, 'renderer error').to.equal('');
  });
};

describe('3D Network - shared network and view state', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true, extraQuery: { renderer: 'sigma' } });
    openThreeD();
  });

  it('renders the visible network and keeps 2D coordinates and canonical endpoints independent', () => {
    assertVisibleGraphMatchesSession();
    cy.window().then((win: any) => {
      const data = win.commonService.session.data;
      const coordinates = data.nodes.map((node: any) => [node._id, node.x, node.y]);
      const endpoints = data.links.map((link: any) => [link.source, link.target]);
      cy.get('[data-testid="threed-recalculate-button"]').click();
      cy.get('[data-testid="threed-freeze-button"]').click().should('have.attr', 'aria-pressed', 'true');
      cy.window().should((current: any) => {
        expect(current.commonService.session.data.nodes.map((node: any) => [node._id, node.x, node.y])).to.deep.equal(coordinates);
        expect(current.commonService.session.data.links.map((link: any) => [link.source, link.target])).to.deep.equal(endpoints);
      });
    });
  });

  it('synchronizes selection in both directions while the 2D pane is hidden', () => {
    cy.window().then((win: any) => {
      const service = win.commonService;
      const ids = service.getVisibleNodes().slice(0, 2).map((node: any) => String(node._id));
      service.visuals.threeD.selectNode(ids[0], { shiftKey: false, ctrlKey: false, metaKey: false });
      service.visuals.threeD.selectNode(ids[1], { shiftKey: true, ctrlKey: false, metaKey: false });
      expect(service.session.data.nodes.filter((node: any) => node.selected).map((node: any) => node._id)).to.have.members(ids);
      service.visuals.twoD.sigmaRenderer?.selectNodes([ids[1]]);
      if (!service.visuals.twoD.sigmaRenderer) {
        service.session.data.nodes.forEach((node: any) => node.selected = node._id === ids[1]);
        win.$(win.document).trigger('node-selected');
      }
      cy.wrap(ids[1]).as('selectedId');
    });
    cy.get('@selectedId').then(id => {
      cy.window().should((win: any) => {
        const view = win.commonService.visuals.threeD;
        expect(view.renderer.nodes.get(String(id)).color).to.equal(win.commonService.session.style.widgets['selected-color']);
      });
    });
    cy.get('[data-testid="threed-canvas"]').focus().type('{esc}');
    cy.window().should((win: any) => expect(win.commonService.session.data.nodes.every((node: any) => !node.selected)).to.equal(true));
  });

  it('uses exactly 150 steps and identical coordinates on repeated recalculation', () => {
    let expected: any;
    for (let run = 0; run < 2; run++) {
      cy.window().then({ timeout: 30000 }, (win: any) => new Cypress.Promise<void>(resolve => {
        const view = win.commonService.visuals.threeD;
        const graph = view.renderer.graph;
        const originalTick = graph.onEngineTick();
        const originalStop = graph.onEngineStop();
        let ticks = 0;
        graph.onEngineTick(() => { ticks++; originalTick?.(); });
        graph.onEngineStop(() => {
          graph.onEngineTick(originalTick).onEngineStop(originalStop);
          originalStop?.();
          expect(ticks, 'deterministic simulation steps').to.equal(150);
          const coordinates = view.renderer.getState().positions;
          if (run === 0) expected = coordinates;
          else expect(coordinates, 'repeated layout coordinates').to.deep.equal(expected);
          resolve();
        });
        view.openRefreshScreen();
      }));
    }
  });

  it('follows subset and timeline filtering without retaining dangling links', () => {
    cy.window().then((win: any) => {
      const home = win.commonService.visuals.microbeTrace;
      home.SelectedNetworkSubsetNodeField = 'State';
      home.SelectedNetworkSubsetNodeOperator = 'equals';
      home.SelectedNetworkSubsetNodeValue = 'Texas';
      home.applyNetworkSubsetFilter();
    });
    cy.get('[data-testid="threed-counts"]').should('contain.text', '12 nodes');
    assertVisibleGraphMatchesSession();
    cy.window().then((win: any) => win.commonService.visuals.microbeTrace.clearNetworkSubsetFilter());
    cy.get('[data-testid="threed-counts"]').should('contain.text', '33 nodes');
    cy.window().then((win: any) => {
      const home = win.commonService.visuals.microbeTrace;
      home.onTimelineChanged('Date of symptom onset Date');
      home.onTimelineRangeEndInputChanged('2021-06-28');
    });
    assertVisibleGraphMatchesSession();
  });

  it('restores the camera, positions, and frozen state after closing and reopening', () => {
    cy.get('[data-testid="threed-freeze-button"]').click();
    cy.get('[data-testid="threed-canvas"]').focus().type('+');
    cy.window().then((win: any) => {
      const home = win.commonService.visuals.microbeTrace;
      const stash = JSON.parse(JSON.stringify(home.buildSessionStash()));
      expect(stash.session.meta.threeDViewState.layoutFrozen).to.equal(true);
      expect(stash.tabs.some((tab: any) => tab.label === '3D Network')).to.equal(true);
      cy.wrap(stash.session.meta.threeDViewState).as('savedThreeD');
      home._removeGlView('3D Network');
    });
    cy.get('[data-testid="threed-view"]').should('not.exist');
    openThreeD();
    cy.get('[data-testid="threed-freeze-button"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('@savedThreeD').then((saved: any) => {
      cy.window().should((win: any) => {
        const state = win.commonService.visuals.threeD.renderer.getState();
        ['x', 'y', 'z'].forEach(axis => expect(state.camera.position[axis]).to.be.closeTo(saved.camera.position[axis], 0.001));
        expect(state.positions).to.deep.equal(saved.positions);
      });
    });
  });

  it('exports the current view as a PNG through the shared export pipeline', () => {
    cy.window().then((win: any) => {
      win.__mtTestSaveAs = cy.stub().as('saveImage');
    });
    cy.get('[data-testid="threed-export-button"]').click();
    cy.get('#threed-export-filename').clear().type('3d-regression');
    cy.get('[data-testid="threed-export-confirm"]').click();
    cy.get('@saveImage').should('have.been.calledOnce').then((stub: any) => {
      const [blob, filename] = stub.firstCall.args;
      expect(filename).to.equal('3d-regression.png');
      expect(blob.type).to.equal('image/png');
      expect(blob.size).to.be.greaterThan(1000);
    });
  });

  it('restores a Classic session whose only visualization is 3D Network', () => {
    cy.window().then((win: any) => {
      const service = win.commonService;
      const stash = JSON.parse(JSON.stringify(service.visuals.microbeTrace.buildSessionStash()));
      delete stash.dashboardLayout;
      delete stash.dashboardState;
      delete stash.session.meta.threeDViewState;
      stash.tabs = [{ label: 'Files', isActive: false }, { label: '3d_network', isActive: true }];
      stash.session.layout = { type: 'stack', content: [{ type: '3d_network' }] };
      stash.session.style.widgets['default-view'] = '3d_network';
      stash.session.style.widgets['3DNet-node-radius'] = 7.5;
      service.session = service.sessionSkeleton();
      return service.applySession(stash);
    });
    cy.get('[data-testid="threed-webgl-canvas"]', { timeout: 30000 }).should('be.visible');
    cy.window().should((win: any) => {
      expect(win.commonService.session.style.widgets['default-view']).to.equal('3D Network');
      expect(win.commonService.visuals.threeD.settings.nodeSize).to.equal(7.5);
      expect(win.commonService.visuals.microbeTrace.displayloadingInformationModal).to.equal(false);
    });
  });

  it('restores styled 3D coordinates, camera projection, and shared selection from a saved session file', () => {
    const name = `threed-styled-session-${Date.now()}`;
    const path = `${Cypress.config('downloadsFolder')}/${name}.microbetrace`;
    let expected: any;
    let selected: string;
    cy.get('[data-testid="threed-freeze-button"]').click();
    cy.window().then((win: any) => applyThreeDInvestigationStyling(win));
    cy.get('[data-testid="threed-camera-yz"]').click();
    cy.window().then((win: any) => {
      const view = win.commonService.visuals.threeD;
      selected = view.renderer.graphData.nodes[0].id;
      view.selectNode(selected, { shiftKey: false, ctrlKey: false, metaKey: false });
      expected = JSON.parse(JSON.stringify(view.renderer.getState()));
    });
    installSaveAsCaptureHook();
    saveSessionFromFileMenu(name);
    writeCapturedDownloadToDisk(`${name}.microbetrace`, path);
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef').selectFile(path, { force: true });
    cy.get('[data-testid="threed-webgl-canvas"]', { timeout: 60000 }).should('be.visible');
    cy.window().should((win: any) => {
      const common = win.commonService;
      const view = common.visuals.threeD;
      const state = view.renderer.getState();
      expect(state.positions, 'restored coordinates').to.deep.equal(expected.positions);
      expect(state.layoutFrozen, 'restored frozen layout').to.equal(true);
      expect(state.camera.projection, 'restored camera projection').to.deep.equal(expected.camera.projection);
      for (const part of ['position', 'target', 'up']) for (const axis of ['x', 'y', 'z']) {
        expect(state.camera[part][axis], `restored camera ${part}.${axis}`).to.be.closeTo(expected.camera[part][axis], 1e-6);
      }
      expect(view.settings.nodeShapeField).to.equal('qaCategory');
      expect(view.settings.nodeBorderWidth).to.equal(1.25);
      expect(view.renderer.graphData.links.some((link: any) => link.overlayColor && link.targetArrow)).to.equal(true);
      expect(common.session.data.nodes.filter((node: any) => node.selected).map((node: any) => node._id)).to.deep.equal([selected]);
    });
  });

  it('includes the rendered 3D graph in a real dashboard PNG', () => {
    applyDeterministicDashboardSplitLayout(['2D Network', '3D Network'], '3D Network');
    cy.get('[data-testid="threed-webgl-canvas"]', { timeout: 30000 }).should('be.visible');
    cy.get('[data-testid="threed-freeze-button"]').then(button => {
      if (button.attr('aria-pressed') !== 'true') cy.wrap(button).click();
    });
    cy.window().then((win: any) => {
      const home = win.commonService.visuals.microbeTrace;
      home.SelectedColorNodesByVariable = 'None'; home.onColorNodesByChanged();
      home.SelectedNodeColorVariable = '#ff00ff'; home.onNodeColorChanged();
      Object.assign(win.commonService.visuals.threeD.settings, { nodeSize: 9, nodeBorderWidth: 0 });
      win.commonService.visuals.threeD.changeSettings();
    });
    cy.window().should((win: any) => {
      expect(win.commonService.visuals.threeD.renderer.graphData.nodes.every((node: any) => /255, 0, 255|#ff00ff/i.test(node.color))).to.equal(true);
    });
    installSaveAsCaptureHook();
    openDashboardExportDialog();
    setDashboardExportFilename('threed-dashboard');
    cy.get('[data-testid="dashboard-export-confirm"]').click();
    cy.window({ timeout: 30000 }).should((win: any) => expect(win.__mtCapturedDownloads?.some((item: any) => item.fileName === 'threed-dashboard.png')).to.equal(true));
    cy.window().then(async (win: any) => {
      const download = win.__mtCapturedDownloads.find((item: any) => item.fileName === 'threed-dashboard.png');
      const bitmap = await win.createImageBitmap(await (await win.fetch(download.dataUrl)).blob());
      const canvas = win.document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
      // Only inspect the right-hand 3D pane. A blank WebGL capture must fail even if 2D renders correctly.
      const pixels = context.getImageData(Math.ceil(canvas.width / 2), 80, Math.floor(canvas.width / 2), canvas.height - 80).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 90 && pixels[i + 2] > 90 && pixels[i + 1] < Math.min(pixels[i], pixels[i + 2]) * 0.65) colored++;
      expect(colored, 'magenta graph pixels in exported 3D pane').to.be.greaterThan(100);
    });
  });

  it('releases styled graphics resources and stops rendering across repeated close/reopen cycles', () => {
    for (let cycle = 0; cycle < 6; cycle++) {
      cy.window().then((win: any) => applyThreeDInvestigationStyling(win));
      cy.window().should((win: any) => {
        const graph = win.commonService.visuals.threeD.renderer.graph;
        expect(graph.renderer().info.memory.textures, 'label textures allocated').to.be.greaterThan(0);
        expect(graph.graphData().links.some((link: any) => link.overlayColor && link.targetArrow)).to.equal(true);
      });
      cy.window().then((win: any) => {
        const common = win.commonService;
        const adapter = common.visuals.threeD.renderer;
        const graph = adapter.graph;
        const renderer = graph.renderer();
        const resources = new Set<any>();
        const disposed = new Set<any>();
        graph.scene().traverse((object: any) => {
          // Sprite geometry is a Three.js singleton, shared by subsequent renderers.
          if (object.geometry && !object.isSprite) resources.add(object.geometry);
          for (const material of object.material ? [object.material].flat() : []) {
            resources.add(material); if (material.map) resources.add(material.map);
          }
        });
        resources.forEach((resource: any) => resource.addEventListener('dispose', () => disposed.add(resource)));
        win.__threeDCleanup = { adapter, renderer, gl: renderer.getContext(), canvas: renderer.domElement, resources, disposed };
        common.visuals.threeD.toggleCameraRotation();
        common.visuals.microbeTrace._removeGlView('3D Network');
      });
      cy.get('[data-testid="threed-view"]').should('not.exist');
      cy.window().should((win: any) => {
        const state = win.__threeDCleanup;
        expect(state.gl.isContextLost(), 'closed WebGL context released').to.equal(true);
        expect(state.canvas.isConnected, 'closed canvas detached').to.equal(false);
        expect(state.disposed.size, 'all scene-owned resources disposed').to.equal(state.resources.size);
        expect(state.adapter.graph).to.equal(null);
        expect(state.adapter.rotationFrame).to.equal(null);
        expect(state.adapter.nodeObjects.meshes.size).to.equal(0);
        expect(state.adapter.linkObjects.size).to.equal(0);
      });
      cy.window().then((win: any) => {
        const state = win.__threeDCleanup;
        const frame = state.renderer.info.render.frame;
        return new Cypress.Promise<void>(resolve => win.setTimeout(() => {
          expect(state.renderer.info.render.frame, 'closed renderer remains stopped').to.equal(frame);
          delete win.__threeDCleanup; resolve();
        }, 200));
      });
      openThreeD();
      assertVisibleGraphMatchesSession();
    }
  });
});
