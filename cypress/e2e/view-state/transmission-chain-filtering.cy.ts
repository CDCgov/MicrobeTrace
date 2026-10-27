import type { Core } from 'cytoscape';
import {
  goToTransmissionChainView,
  openGlobalFilteringTab,
  openGlobalStylingTab,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

const selectOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.get('.p-select-overlay:visible').last().find('.p-select-option')
    .filter((_index, option) => String(option.textContent || '').trim() === label)
    .should('have.length', 1).click({ force: true });
  cy.get('.p-select-overlay:visible').should('not.exist');
};

const graph = () => cy.window().its('commonService.visuals.transmissionChain.cy') as Cypress.Chainable<Core>;
const nodes = (core: Core) => core.nodes(':visible').filter(node => !node.isParent());
const closeGlobalSettings = (): void => {
  cy.closeGlobalSettings();
  cy.contains('.p-dialog-title:visible', 'Global Settings').should('not.exist');
};

const expectFit = (core: Core): void => {
  const [top, right, bottom, left] = (core.container()!.style.clipPath.match(/[\d.]+(?=px)/g) || []).map(Number);
  const area = { x1: left, y1: top, x2: core.width() - right, y2: core.height() - bottom };
  const bounds = core.elements(':visible').boundingBox({ includeLabels: true, includeOverlays: false });
  const pan = core.pan();
  const zoom = core.zoom();
  expect(bounds.x1 * zoom + pan.x, 'chain left edge').to.be.at.least(area.x1 - 1);
  expect(bounds.x2 * zoom + pan.x, 'chain right edge').to.be.at.most(area.x2 + 1);
  expect(bounds.y1 * zoom + pan.y, 'chain top edge').to.be.at.least(area.y1 - 1);
  expect(bounds.y2 * zoom + pan.y, 'chain bottom edge').to.be.at.most(area.y2 + 1);
  expect(bounds.w * zoom / (area.x2 - area.x1), 'chain width occupancy').to.be.closeTo(0.9, 0.03);
};

const expectCurrentFilters = (): void => {
  cy.window().should((win: any) => {
    const service = win.commonService;
    const core: Core = service.visuals.transmissionChain.cy;
    const expectedNodes = service.getVisibleNodesIgnoringTimeline()
      .filter(node => Number.isFinite(Date.parse(String(node.Collection_Date))));
    const ids = new Set(expectedNodes.map(node => String(node._id ?? node.id)));
    expect(nodes(core).map(node => node.id()).sort(), 'dated nodes allowed by current filters')
      .to.deep.equal([...ids].sort());
    const linkKey = (link: any) => `${link.index}:${link.source}:${link.target}`;
    const expectedLinks = service.getVisibleLinksIgnoringTimeline()
      .filter(link => ids.has(String(link.source)) && ids.has(String(link.target)))
      .map(linkKey);
    const actualLinks = core.edges().map(edge => linkKey(edge.data()));
    expect([...new Set(actualLinks)].sort(), 'links allowed by current filters')
      .to.deep.equal([...new Set(expectedLinks)].sort());
  });
  graph().should(expectFit);
};

const setMinimum = (value: number): void => {
  openGlobalFilteringTab();
  cy.get('#cluster-minimum-size').clear().type(String(value)).blur();
  cy.window().its('commonService.session.style.widgets.cluster-minimum-size').should('equal', value);
  closeGlobalSettings();
};

const setThreshold = (value: number): void => {
  openGlobalFilteringTab();
  cy.get('#link-threshold').clear().type(String(value)).blur();
  cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', value);
  closeGlobalSettings();
};

describe('Transmission Chain Explorer global filtering and styling', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    goToTransmissionChainView();
    cy.contains('.p-dialog-title:visible', 'Transmission Chain Explorer Settings').should('be.visible');
    selectOption('#transmission-chain-date-field', 'Collection_Date');
    cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-date-field').should('equal', 'Collection_Date');
    selectOption('#transmission-chain-y-axis-field', 'Cluster');
    cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-y-axis-field').should('equal', 'cluster');
    cy.closeSettingsPane('Transmission Chain Explorer Settings');
    graph().should(core => expect(nodes(core).length).to.equal(30));
    graph().should(expectFit);
  });

  it('applies consecutive minimum-cluster changes in both directions without touching the threshold', () => {
    for (const [minimum, count] of [[3, 28], [15, 17], [2, 30], [3, 28], [1, 30]]) {
      setMinimum(minimum);
      graph().should(core => expect(nodes(core).length, `dated nodes at minimum ${minimum}`).to.equal(count));
      expectCurrentFilters();
    }
    cy.screenshot('explorer-collection-cluster-filtering', { capture: 'viewport', disableTimersAndAnimations: false });
  });

  it('keeps the complete chain layout fitted when the threshold changes repeatedly', () => {
    setMinimum(3);
    expectCurrentFilters();
    for (const threshold of [8, 4, 16, 10, 16]) {
      setThreshold(threshold);
      cy.window().its('commonService.session.style.widgets.cluster-minimum-size').should('equal', 3);
      expectCurrentFilters();
    }
  });

  it('recolors links without moving nodes or changing the camera, including Origin mode', () => {
    let before: any;
    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      before = {
        positions: nodes(component.cy).map(node => ({ id: node.id(), ...node.position() })),
        camera: component.getRendererViewState(),
      };
    });
    for (const label of ['None', 'Exposure', 'Origin', 'None']) {
      openGlobalStylingTab();
      selectOption('#global-settings-modal #link-tooltip-variable', label);
      if (label === 'None') {
        cy.get('#link-color').invoke('val', '#ad1457').trigger('input').trigger('change');
      }
      closeGlobalSettings();
      cy.window().should((win: any) => {
        const component = win.commonService.visuals.transmissionChain;
        expect(nodes(component.cy).map(node => ({ id: node.id(), ...node.position() })), 'node positions after recoloring')
          .to.deep.equal(before.positions);
        expect(component.getRendererViewState(), 'camera after recoloring').to.deep.equal(before.camera);
        if (label === 'None') {
          expect(component.cy.edges().map(edge => edge.data('lineColor')), 'chosen link color is applied')
            .to.satisfy((colors: string[]) => colors.every(color => color === '#ad1457'));
        }
      });
      expectCurrentFilters();
    }
  });

  it('keeps the configured link label size when recoloring and rebuilding links', () => {
    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      component.onLinkLabelVariableChange('source_id');
      component.setLinkLabelSize(32);
    });
    const expectLabelSize = (): void => {
      graph().should(core => {
        expect(core.edges().length, 'links remain rendered').to.be.greaterThan(0);
        core.edges().forEach(edge => {
          expect(edge.data('label'), 'configured link label').to.equal(edge.source().id());
          expect(parseFloat(edge.style('font-size')), 'configured link label size').to.equal(32);
        });
      });
    };
    expectLabelSize();
    for (const label of ['Origin', 'None']) {
      openGlobalStylingTab();
      selectOption('#global-settings-modal #link-tooltip-variable', label);
      closeGlobalSettings();
      expectLabelSize();
    }
    setMinimum(3);
    expectLabelSize();
    setMinimum(1);
    expectLabelSize();
  });

  it('applies and clears consecutive node and link subsets while keeping chains fitted', () => {
    for (const [kind, field, value] of [
      ['node', 'State', 'Texas'],
      ['node', 'State', 'Florida'],
      ['link', 'Exposure', 'low'],
      ['link', 'Exposure', 'high'],
    ]) {
      openGlobalFilteringTab();
      cy.get(`#network-subset-${kind}-field`).select(field);
      cy.get(`#network-subset-${kind}-operator`).select('equals');
      cy.get(`#network-subset-${kind}-value`).clear().type(value);
      cy.get('#network-subset-apply').click({ force: true });
      closeGlobalSettings();
      expectCurrentFilters();
      openGlobalFilteringTab();
      cy.get('#network-subset-clear').click({ force: true });
      closeGlobalSettings();
      graph().should(core => expect(nodes(core).length, 'subset cleared').to.equal(30));
      expectCurrentFilters();
    }
  });

  it('updates and fits chains when nearest-neighbor pruning is enabled and disabled', () => {
    let originalLinks = 0;
    let originalThreshold = 0;
    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      originalLinks = new Set(component.cy.edges().map(edge => edge.data('index'))).size;
      originalThreshold = win.commonService.session.style.widgets['link-threshold'];
    });
    for (const mode of ['Nearest Neighbor', 'None', 'Nearest Neighbor', 'None'] as const) {
      openGlobalFilteringTab();
      cy.get('#prune-select').contains('span', mode).click({ force: true });
      cy.get('body').then($body => {
        if ($body.find('.p-dialog:visible:contains("two different sources")').length) {
          cy.contains('.p-dialog:visible', 'two different sources').contains('button', 'Confirm').click({ force: true });
        }
      });
      cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', mode === 'Nearest Neighbor');
      closeGlobalSettings();
      graph().should(core => {
        const count = new Set(core.edges().map(edge => edge.data('index'))).size;
        if (mode === 'Nearest Neighbor') expect(count, 'nearest-neighbor links are actually pruned').to.be.lessThan(originalLinks);
        else expect(count, 'disabling pruning restores all links').to.equal(originalLinks);
      });
      cy.window().should((win: any) => {
        expect(win.commonService.session.style.widgets['link-threshold'], 'pruning leaves the selected threshold unchanged')
          .to.equal(originalThreshold);
      });
      expectCurrentFilters();
    }
  });
});
