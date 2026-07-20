/// <reference types="cypress" />

import {
  ensureTwoDNetworkView,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Load Nextstrain URL', () => {
  const nextstrainUrl = 'https://nextstrain.org/yellow-fever/genome';
  const fixtureName = 'nextstrain-yellow-fever-small.json';

  const openPhylogeneticTreeView = (): void => {
    cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
    cy.get('.cdk-overlay-container', { timeout: 15000 })
      .contains('button', 'Phylogenetic Tree')
      .click({ force: true });
  };

  it('loads Nextstrain URL data and opens the phylogenetic tree view', () => {
    cy.intercept('GET', nextstrainUrl, { fixture: fixtureName }).as('loadNextstrainDataset');

    visitAppAndAcceptEula({
      extraQuery: { url: nextstrainUrl },
    });

    cy.wait('@loadNextstrainDataset', { timeout: 30000 });
    cy.wait(2000)
    waitForProcessingDialogToClear(120000);
    cy.wait(2000)
    cy.window({ timeout: 300000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      const nodes = win.commonService.session.data.nodes;
      const visibleLinks = win.commonService.session.data.links.filter(l => l.visible);

      expect(nodes.length, 'nodes loaded from stubbed Nextstrain URL').to.equal(4);
      expect(visibleLinks.length, 'links generated from stubbed Nextstrain URL').to.equal(3);
      expect(win.commonService.session.files[0]?.format, 'Nextstrain URL file format').to.equal('auspice');
      expect(win.commonService.session.data.newickSource, 'Newick source marker').to.equal('auspice');
      expect(win.commonService.session.style.widgets['default-distance-metric'], 'decimal divergence metric').to.equal('tn93');
      expect(Number(win.commonService.session.style.widgets['link-threshold']), 'decimal divergence threshold').to.equal(0.015);
    });

    openGlobalFilteringTab();
    cy.window().then((win: any) => {
      expect(
        Number(win.commonService.thresholdHistogramMaxValue),
        'initial threshold histogram maximum',
      ).to.be.closeTo(0.005, 1e-8);

      cy.spy(win.commonService, 'updateThresholdHistogram').as('thresholdHistogramRenders');
      cy.spy(win.commonService, 'ensurePatristicEdgesForThreshold').as('patristicThresholdQueries');
      cy.spy(win.commonService.workerComputeService, 'buildPatristicEdges').as('patristicEdgeBuilds');
    });

    setGlobalLinkThreshold(0.025);
    waitForProcessingDialogToClear(60000);

    cy.window().should((win: any) => {
      const links = win.commonService.session.data.links;
      const visibleLinks = links.filter(l => l.visible);

      expect(links.length, 'links materialized after raising Nextstrain threshold').to.equal(6);
      expect(visibleLinks.length, 'visible links after raising Nextstrain threshold').to.equal(6);
      expect(
        win.commonService.session.meta.performance.patristic.edgeGeneration.threshold,
        'patristic re-query threshold',
      ).to.equal(0.025);
      expect(
        Number(win.commonService.thresholdHistogramMaxValue),
        'expanded threshold histogram maximum',
      ).to.be.closeTo(0.023, 1e-8);
    });
    cy.get('@thresholdHistogramRenders').should('have.callCount', 1);
    cy.get('@patristicThresholdQueries').should('have.callCount', 1);
    cy.get('@patristicEdgeBuilds').should('have.callCount', 1);

    setGlobalLinkThreshold(0.015);
    cy.window().should((win: any) => {
      const visibleLinks = win.commonService.session.data.links.filter(link => link.visible);
      expect(visibleLinks.length, 'visible links after lowering threshold').to.equal(3);
    });
    cy.get('@patristicThresholdQueries').should('have.callCount', 2);
    cy.get('@thresholdHistogramRenders').should('have.callCount', 1);
    cy.get('@patristicEdgeBuilds').should('have.callCount', 1);

    setGlobalLinkThreshold(0.025);
    cy.window().should((win: any) => {
      const visibleLinks = win.commonService.session.data.links.filter(link => link.visible);
      expect(visibleLinks.length, 'visible links after restoring threshold').to.equal(6);
    });
    cy.get('@patristicThresholdQueries').should('have.callCount', 3);
    cy.get('@thresholdHistogramRenders').should('have.callCount', 1);
    cy.get('@patristicEdgeBuilds').should('have.callCount', 1);

    setGlobalLinkThreshold(0.03);
    cy.get('@patristicThresholdQueries').should('have.callCount', 4);
    cy.get('@thresholdHistogramRenders').should('have.callCount', 1);
    cy.get('@patristicEdgeBuilds').should('have.callCount', 1);

    setGlobalLinkThreshold(0.04);
    cy.get('@patristicThresholdQueries').should('have.callCount', 5);
    cy.get('@thresholdHistogramRenders').should('have.callCount', 1);
    cy.get('@patristicEdgeBuilds').should('have.callCount', 1);

    cy.closeGlobalSettings();

    openPhylogeneticTreeView();
    cy.get('#phylocanvas', { timeout: 30000 }).should('be.visible');
  });

  it('loads Nextstrain URL data when geo resolutions omit referenced demes', () => {
    cy.fixture(fixtureName).then((dataset) => {
      const datasetWithMissingDeme = Cypress._.cloneDeep(dataset);
      const americaTreeNode = datasetWithMissingDeme.tree.children.find(node => node.name === 'YF_A');
      const africaTreeNode = datasetWithMissingDeme.tree.children.find(node => node.name === 'YF_C');

      americaTreeNode.node_attrs.country = { value: 'Guam' };
      americaTreeNode.node_attrs.division = { value: 'Guam' };
      americaTreeNode.node_attrs.location = { value: 'Hagåtña' };
      africaTreeNode.node_attrs.location = { value: 'Missing city' };

      datasetWithMissingDeme.meta.geo_resolutions = [
        {
          key: 'location',
          demes: {
            Hagåtña: {
              latitude: 13.4757,
              longitude: 144.7489,
            },
          },
        },
        {
          key: 'country',
          demes: {
            Guam: {
              latitude: 13.4443,
              longitude: 144.7937,
            },
          },
        },
        {
          key: 'division',
          demes: {
            Guam: {
              latitude: 13.4443,
              longitude: 144.7937,
            },
          },
        },
        {
          key: 'region',
          demes: {
            Americas: {
              latitude: 12.34,
              longitude: -56.78,
            },
          },
        },
      ];

      cy.intercept('GET', nextstrainUrl, datasetWithMissingDeme).as('loadNextstrainDatasetWithMissingDeme');
    });

    visitAppAndAcceptEula({
      extraQuery: { url: nextstrainUrl },
    });

    cy.wait('@loadNextstrainDatasetWithMissingDeme', { timeout: 30000 });
    waitForProcessingDialogToClear(120000);
    cy.window({ timeout: 300000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    cy.window().then((win: any) => {
      const nodes = win.commonService.session.data.nodes;
      const americaNode = nodes.find((node: any) => node._id === 'YF_A');
      const africaNode = nodes.find((node: any) => node._id === 'YF_C');

      expect(nodes.length, 'nodes loaded despite missing geospatial deme').to.equal(4);
      expect(americaNode.latitude, 'location-level latitude').to.equal(13.4757);
      expect(americaNode.longitude, 'location-level longitude').to.equal(144.7489);
      expect(africaNode.latitude, 'missing deme latitude').to.be.oneOf([null, undefined]);
      expect(africaNode.longitude, 'missing deme longitude').to.be.oneOf([null, undefined]);
      expect(win.commonService.session.data.nodeFields, 'latitude field').to.include('latitude');
      expect(win.commonService.session.data.nodeFields, 'longitude field').to.include('longitude');
      expect(
        win.commonService.session.data.auspiceMapData.countries.features,
        'Nextstrain country map metadata',
      ).to.deep.include({
        type: 'Feature',
        id: 'Guam',
        properties: {
          name: 'Guam',
          usps: 'Guam',
          _lat: 13.4443,
          _lon: 144.7937,
          auspiceKey: 'country',
        },
        geometry: null,
      });
      expect(
        win.commonService.session.data.auspiceMapData.states.features,
        'Nextstrain division map metadata',
      ).to.deep.include({
        type: 'Feature',
        id: 'Guam',
        properties: {
          name: 'Guam',
          usps: 'Guam',
          _lat: 13.4443,
          _lon: 144.7937,
          auspiceKey: 'division',
        },
        geometry: null,
      });
    });

    cy.window().then(async (win: any) => {
      const countries = await win.commonService.getMapData('countries.json');
      const states = await win.commonService.getMapData('states.json');

      expect(
        countries.features.some((feature: any) => feature.properties?.name === 'Guam'),
        'Nextstrain country merged into map lookups',
      ).to.equal(true);
      expect(
        states.features.some((feature: any) => feature.properties?.name === 'Guam'),
        'Nextstrain division merged into map lookups',
      ).to.equal(true);
    });
  });
});
