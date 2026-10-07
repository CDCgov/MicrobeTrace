/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToTableView,
  goToWaterfallView,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalDistanceMetric,
  setTN93DistanceDisplayFormat,
  setTwoDLinkLabelVariable,
  waitForProcessingDialogToClear,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';
import {
  getTableColumnIndex,
  selectTableDataset,
  setVisibleTableColumns,
} from '../../../support/table-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type WinWithMT = Window & {
  commonService: any;
};

type WaterfallDistanceCase = {
  clusterId: string;
  nodeId: string;
  peerId: string;
  clusterDistance: string;
  linkDistance: string;
};

const profile = getProfile('nn-angulartesting-tn93-edgelist');

const setDisplayedThreshold = (displayedThreshold: number, expectedRawThreshold: number): void => {
  cy.get('#link-threshold')
    .should('be.visible')
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.focus();
      input.value = String(displayedThreshold);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get('#link-threshold').should(($input) => {
    expect(Number($input.val()), 'displayed threshold input').to.be.closeTo(displayedThreshold, 0.0001);
  });

  cy.window()
    .its('commonService.session.style.widgets.link-threshold')
    .should((value) => {
      expect(Number(value), 'stored raw threshold').to.be.closeTo(expectedRawThreshold, 0.000001);
    });
};

const assertThresholdInputValue = (expectedValue: number): void => {
  cy.get('#link-threshold').should(($input) => {
    expect(Number($input.val()), 'threshold input value').to.be.closeTo(expectedValue, 0.0001);
  });
};

const assertVisibleDistanceLabelsUsePercent = (): void => {
  cy.window().then((win: unknown) => {
    const cyInstance = (win as any).cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const labels = cyInstance
      .edges(':visible')
      .filter((edge: any) => Number.isFinite(Number(edge.data('distance'))))
      .map((edge: any) => String(edge.data('label') || '').trim())
      .filter((label: string) => label !== '');

    expect(labels.length, 'visible TN93 distance labels').to.be.greaterThan(0);
    labels.forEach((label: string) => {
      expect(label, `2D link label ${label}`).to.match(/^-?\d+(?:\.\d+)?%$/);
    });
  });
};

const assertTableColumnContainsPercent = (header: string): void => {
  getTableColumnIndex(header).then((columnIndex) => {
    cy.get('.table-wrapper .p-datatable-tbody > tr', { timeout: 15000 })
      .should(($rows) => {
        const values = Array.from($rows).map((row) =>
          String(row.querySelectorAll('td').item(columnIndex)?.textContent || '').trim());

        expect(values.length, `${header} values`).to.be.greaterThan(0);
        expect(values.some((value) => /%$/.test(value)), `${header} includes percentage values`).to.equal(true);
      });
  });
};

const assertTableColumnMatchingContainsPercent = (headerPattern: RegExp): void => {
  cy.get('.table-wrapper .p-datatable-thead tr', { timeout: 15000 })
    .first()
    .find('th')
    .then(($headers) => {
      const index = Array.from($headers).findIndex((header) =>
        headerPattern.test(String(header.textContent || '').replace(/\s+/g, ' ').trim()));

      expect(index, `table column matching ${headerPattern}`).to.be.greaterThan(-1);
      return index;
    })
    .then((columnIndex) => {
      cy.get('.table-wrapper .p-datatable-tbody > tr', { timeout: 15000 })
        .should(($rows) => {
          const values = Array.from($rows).map((row) =>
            String(row.querySelectorAll('td').item(columnIndex)?.textContent || '').trim());

          expect(values.length, `values for ${headerPattern}`).to.be.greaterThan(0);
          expect(values.some((value) => /%$/.test(value)), `${headerPattern} includes percentage values`)
            .to.equal(true);
        });
    });
};

const buildWaterfallDistanceCase = (win: WinWithMT): WaterfallDistanceCase => {
  const commonService = win.commonService;
  const visibleNodes = commonService.getVisibleNodes();
  const visibleLinks = commonService.session.data.links.filter((link: any) => link.visible);
  const cluster = commonService.session.data.clusters.find((candidate: any) =>
    candidate.visible !== false && Number.isFinite(Number(candidate.mean_genetic_distance)));

  expect(cluster, 'cluster with mean genetic distance').to.exist;

  const clusterMembers = visibleNodes.filter((node: any) => String(node.cluster) === String(cluster.id));
  const node = clusterMembers.find((candidate: any) =>
    visibleLinks.some((link: any) => link.source === candidate._id || link.target === candidate._id));

  expect(node, 'cluster node with visible links').to.exist;

  const link = visibleLinks.find((candidate: any) =>
    candidate.source === node._id || candidate.target === node._id);

  expect(link, 'visible waterfall link').to.exist;

  const clusterDistance = commonService.formatDisplayedDistanceValue(
    cluster.mean_genetic_distance,
    'mean_genetic_distance',
  );
  const linkDistance = commonService.formatDisplayedDistanceValue(link.distance, 'distance');

  expect(clusterDistance, 'formatted cluster distance').to.match(/%$/);
  expect(linkDistance, 'formatted link distance').to.match(/%$/);

  return {
    clusterId: String(cluster.id),
    nodeId: String(node._id),
    peerId: String(link.source === node._id ? link.target : link.source),
    clusterDistance,
    linkDistance,
  };
};

const saveStyleFromFileMenu = (styleFileBase: string): void => {
  cy.get('#top-toolbar').contains('button', 'File').click({ force: true });
  cy.contains('button[mat-menu-item]', 'Save').click({ force: true });
  cy.contains('.p-dialog-title', 'Save Session')
    .should('be.visible')
    .parents('.p-dialog')
    .as('saveStyleDialog');

  cy.get('@saveStyleDialog')
    .find('#stash-name')
    .clear({ force: true })
    .type(styleFileBase, { delay: 0, force: true })
    .should('have.value', styleFileBase);

  cy.get('@saveStyleDialog')
    .find('p-select')
    .click({ force: true });
  cy.contains('li[role="option"]', 'style', { timeout: 15000 }).click({ force: true });

  cy.get('@saveStyleDialog')
    .find('#stash-data')
    .should('not.be.disabled')
    .click({ force: true });

  cy.contains('.p-dialog-title', 'Save Session').should('not.exist');
};

describe('Journey Flow - TN93 distance display format', () => {
  it('shows the display-format control only for TN93 and stores percentage thresholds as raw TN93 values', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openGlobalFilteringTab();
    cy.get('#tn93-distance-display-format')
      .scrollIntoView()
      .should('be.visible');
    assertThresholdInputValue(0.015);

    setTN93DistanceDisplayFormat('percentage');
    assertThresholdInputValue(1.5);
    cy.get('#filtering-threshold')
      .scrollIntoView()
      .within(() => {
        cy.contains('label', '(%)').should('be.visible');
      });

    setDisplayedThreshold(1.2, 0.012);

    setGlobalDistanceMetric('snps');
    cy.get('#tn93-distance-display-format').should('not.exist');
    cy.window()
      .its('commonService.session.style.widgets.link-threshold')
      .should('equal', 16);

    cy.closeGlobalSettings();
  });

  it('renders TN93 percentage values in 2D link labels, Table cells, and Waterfall distance rows', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openGlobalFilteringTab();
    setTN93DistanceDisplayFormat('percentage');
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear(30000);

    setTwoDLinkLabelVariable('distance');
    assertVisibleDistanceLabelsUsePercent();

    goToTableView();
    selectTableDataset('Link');
    setVisibleTableColumns(['Distance']);
    assertTableColumnContainsPercent('Distance');

    selectTableDataset('Cluster');
    assertTableColumnMatchingContainsPercent(/mean.*genetic.*distance/i);

    goToWaterfallView();
    cy.window().then((win: unknown) => {
      cy.wrap(buildWaterfallDistanceCase(win as WinWithMT), { log: false }).as('waterfallDistanceCase');
    });

    cy.get<WaterfallDistanceCase>('@waterfallDistanceCase').then((waterfallCase) => {
      cy.contains('#waterfall-cluster-table-container tbody tr.ui-selectable-row', waterfallCase.clusterId)
        .click();
      cy.get(byTestId(testIds.waterfallClusterExpansion), { timeout: 10000 })
        .should('contain.text', waterfallCase.clusterDistance);

      cy.contains('#waterfall-node-table-container tbody tr.ui-selectable-row', waterfallCase.nodeId)
        .click();
      cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row', { timeout: 10000 })
        .should('contain.text', waterfallCase.linkDistance);

      cy.contains('#waterfall-link-table-container tbody tr.ui-selectable-row', waterfallCase.peerId)
        .click();
      cy.get(byTestId(testIds.waterfallLinkExpansion), { timeout: 10000 })
        .should('contain.text', waterfallCase.linkDistance);
    });
  });

  it('saves and reapplies the TN93 percentage display format in a style file', () => {
    const styleFileBase = `cypress_tn93_percentage_style_${Date.now()}`;
    const styleFilePath = `${Cypress.config('downloadsFolder')}/${styleFileBase}.style`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openGlobalFilteringTab();
    setTN93DistanceDisplayFormat('percentage');
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear(30000);

    installSaveAsCaptureHook();
    saveStyleFromFileMenu(styleFileBase);
    writeCapturedDownloadToDisk(`${styleFileBase}.style`, styleFilePath);

    cy.readFile(styleFilePath, 'utf8', { timeout: 30000 }).then((savedStyle) => {
      const style = JSON.parse(String(savedStyle));
      expect(style.widgets['tn93-distance-display-format'], 'saved style TN93 display format').to.equal('percentage');
    });

    openGlobalFilteringTab();
    setTN93DistanceDisplayFormat('decimal');
    cy.window()
      .its('commonService.session.style.widgets.tn93-distance-display-format')
      .should('equal', 'decimal');

    cy.contains('#global-settings-modal .nav-link', 'Styling').click({ force: true });
    cy.get('#global-settings-modal #style-config', { timeout: 15000 }).should('exist');
    cy.get('#apply-style').selectFile(styleFilePath, { force: true });

    cy.window()
      .its('commonService.session.style.widgets.tn93-distance-display-format', { timeout: 10000 })
      .should('equal', 'percentage');

    cy.contains('#global-settings-modal .nav-link', 'Filtering').click({ force: true });
    cy.get('#tn93-distance-display-format', { timeout: 15000 })
      .scrollIntoView()
      .should('be.visible');
    cy.window().then((win: unknown) => {
      const commonService = (win as WinWithMT).commonService;
      expect(commonService.tn93PercentageDisplayEnabled('distance'), 'percentage display restored from style')
        .to.equal(true);
    });

    cy.closeGlobalSettings();
  });
});
