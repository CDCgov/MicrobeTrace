/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import {
  ensureBubbleView,
  ensureMapView,
  goToPhyloTreeView,
  launchProfileToTwoD,
  openGlobalStylingTab,
} from '../../../support/journey-helpers';

type WinWithMicrobeTrace = Window & {
  commonService: any;
  cytoscapeInstance?: any;
};

const profile: DatasetProfile = {
  id: 'mixed-genotype-node-coloring',
  title: 'Mixed genotype node coloring',
  tags: ['color-by', 'mixed-node-colors', 'genotype', 'load-to-twod'],
  files: [
    {
      name: 'Cypress_MixedGenotype_Nodes.csv',
      datatype: 'node',
      field1: 'ID',
      field2: 'seq',
    },
    {
      name: 'Cypress_MixedGenotype_Links.csv',
      datatype: 'link',
      field1: 'source',
      field2: 'target',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expectations: {
    afterLaunch: {
      nodes: 4,
      visibleLinks: 3,
    },
  },
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

const assertMixedStyleSegments = (expectedFirstColor?: string): void => {
  cy.window().then((win: unknown) => {
    const { commonService } = win as WinWithMicrobeTrace;
    const mixedNode = commonService.session.data.nodes.find((node: any) => node._id === 'sample-4');
    const singleNode = commonService.session.data.nodes.find((node: any) => node._id === 'sample-2');
    const mixedStyle = commonService.getNodeFillStyle(mixedNode);
    const singleStyle = commonService.getNodeFillStyle(singleNode);
    const color2a = String(commonService.temp.style.nodeColorMap('2a'));
    const color3a = String(commonService.temp.style.nodeColorMap('3a'));

    expect(mixedStyle.segments?.map((segment: any) => segment.value)).to.deep.equal(['2a', '3a']);
    expect(mixedStyle.segments?.map((segment: any) => segment.color)).to.deep.equal([color2a, color3a]);
    expect(singleStyle.segments).to.equal(undefined);

    if (expectedFirstColor) {
      expect(color2a.toLowerCase()).to.equal(expectedFirstColor);
      expect(mixedStyle.segments?.[0].color.toLowerCase()).to.equal(expectedFirstColor);
    }
  });
};

describe('Journey Flow - mixed node coloring', () => {
  it('renders mixed genotype nodes with component color segments across node views', () => {
    launchProfileToTwoD(profile);

    openGlobalStylingTab();
    cy.get('#node-mixed-colors-row').should('be.visible');
    cy.get('#node-mixed-colors-enabled').should('be.visible').and('be.disabled');
    selectPrimeOption('#node-color-variable', 'Genotype');
    cy.get('#node-mixed-colors-enabled').should('be.visible').and('be.enabled').check();
    cy.window().its('commonService.session.style.widgets.node-mixed-colors-enabled').should('equal', true);
    cy.closeGlobalSettings();

    assertMixedStyleSegments();

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMicrobeTrace;
      const cyInstance = typedWindow.cytoscapeInstance;
      const mixedNode = cyInstance.getElementById('sample-4');
      const singleNode = cyInstance.getElementById('sample-2');

      expect(String(mixedNode.data('mixedColorImage') || '')).to.contain('data:image/svg+xml');
      expect(singleNode.data('mixedColorImage')).to.equal(undefined);
    });

    cy.get('#key-tables-node-table td[data-value="2a"]', { timeout: 15000 })
      .parents('tr')
      .find('input[type="color"]')
      .invoke('val', '#00aa00')
      .trigger('input')
      .trigger('change');

    assertMixedStyleSegments('#00aa00');

    ensureBubbleView();
    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithMicrobeTrace).commonService.visuals.bubble;
      const mixedBubbleNode = bubble.cy.getElementById('sample-4');
      expect(String(mixedBubbleNode.data('mixedColorImage') || '')).to.contain('data:image/svg+xml');
    });

    ensureMapView();
    cy.window().then((win: unknown) => {
      const map = (win as WinWithMicrobeTrace).commonService.visuals.gisMap;
      const marker = map.mapNodeMarkersById['sample-4'];
      const iconUrl = String(marker?.options?.icon?.options?.iconUrl || '');
      expect(iconUrl).to.contain('data:image/svg+xml');
      expect(decodeURIComponent(iconUrl)).to.contain('#00aa00');
    });

    goToPhyloTreeView();
    cy.get('#phylocanvas image.tidytree-node-shape-overlay', { timeout: 30000 })
      .should(($overlays) => {
        expect($overlays.length).to.be.greaterThan(0);
      });
  });
});
