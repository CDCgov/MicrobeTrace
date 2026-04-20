/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapRenderedCounts,
  assertMetricCount,
  goToMapView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  openGlobalStylingTab,
  openMapSettingsDialog,
  selectMapField,
  setGlobalLinkThreshold,
  setMapNodeCollapsing,
} from '../../../support/journey-helpers';
import { readRenderedMapNodeStyle } from '../../../support/map-helpers';

type WinWithMap = Window & {
  commonService: any;
};

type ColorTable = Record<string, string>;

type NodeSnapshot = Record<string, { cluster: string; color: string }>;

type LinkSnapshot = Record<string, { cluster: string; color: string }>;

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.get('body').then(($body) => {
    const overlay = $body.find('.p-select-overlay:visible').last();

    expect(overlay.length, `visible PrimeNG overlay for ${selector}`).to.be.greaterThan(0);

    cy.wrap(overlay)
      .contains('li[role="option"]', label, { timeout: 15000 })
      .scrollIntoView()
      .click({ force: true });
  }).wait(50);
};

const getNodeId = (data: any): string => String(data?._id ?? data?.ID ?? data?.id ?? '');

const getLinkId = (data: any): string => String(
  data?.index
  ?? data?.id
  ?? `${String(data?.source ?? '')}->${String(data?.target ?? '')}#${String(data?.distance ?? '')}`,
);

const extractColorTable = ($table: JQuery<HTMLElement>): ColorTable => {
  const out: ColorTable = {};

  $table.find('tr').each((index, row) => {
    if (index === 0) return;

    const $row = Cypress.$(row);
    const value = String($row.find('td[data-value]').attr('data-value') || '');
    if (!value) return;

    const color = String($row.find('input[type="color"]').val() || '');
    out[value] = normalizeColor(color);
  });

  return out;
};

const waitForColorTableRows = (selector: string, label: string): void => {
  cy.get(`${selector} tr`, { timeout: 15000 }).should(($rows) => {
    expect($rows.length, `${label} color-table rows`).to.be.greaterThan(1);
  });
};

const readRenderedNodeSnapshot = (win: WinWithMap): NodeSnapshot =>
  win.commonService.visuals.gisMap.layers.featureGroup
    .getLayers()
    .reduce((acc: NodeSnapshot, layer: any) => {
      const nodeId = getNodeId(layer?.data);
      if (!nodeId) return acc;

      acc[nodeId] = {
        cluster: String(layer?.data?.cluster),
        color: readRenderedMapNodeStyle(layer).fillColor,
      };

      return acc;
    }, {});

const readRenderedLinkSnapshot = (win: WinWithMap): LinkSnapshot =>
  win.commonService.visuals.gisMap.layers.links
    .getLayers()
    .reduce((acc: LinkSnapshot, layer: any) => {
      const data = layer?.data;
      const linkId = getLinkId(data);
      if (!data?.source || !data?.target || !linkId || acc[linkId]) return acc;

      acc[linkId] = {
        cluster: String(data.cluster),
        color: normalizeColor(layer?.options?.color),
      };

      return acc;
    }, {});

const assertNodeSnapshotMatchesTable = (snapshot: NodeSnapshot, table: ColorTable, label: string): void => {
  const nodeIds = Object.keys(snapshot);

  expect(nodeIds.length, `${label} rendered nodes`).to.be.greaterThan(0);
  nodeIds.forEach((nodeId) => {
    const state = snapshot[nodeId];
    expect(table[state.cluster], `${label} node table color for cluster ${state.cluster}`).to.exist;
    expect(state.color, `${label} rendered node color for ${nodeId}`).to.equal(table[state.cluster]);
  });
};

const assertLinkSnapshotMatchesTable = (snapshot: LinkSnapshot, table: ColorTable, label: string): void => {
  const linkIds = Object.keys(snapshot);

  expect(linkIds.length, `${label} rendered links`).to.be.greaterThan(0);
  linkIds.forEach((linkId) => {
    const state = snapshot[linkId];
    expect(table[state.cluster], `${label} link table color for cluster ${state.cluster}`).to.exist;
    expect(state.color, `${label} rendered link color for ${linkId}`).to.equal(table[state.cluster]);
  });
};

describe('Journey Flow - Map uploaded cluster-color recompute', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('recomputes rendered Map node and link colors when Cluster color-by is active and threshold changes', () => {
    let nodeColorsBefore: ColorTable = {};
    let linkColorsBefore: ColorTable = {};
    let nodeSnapshotBefore: NodeSnapshot = {};
    let linkSnapshotBefore: LinkSnapshot = {};
    let nodeColorsAfter: ColorTable = {};
    let linkColorsAfter: ColorTable = {};
    let nodeSnapshotAfter: NodeSnapshot = {};
    let linkSnapshotAfter: LinkSnapshot = {};

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Cluster');
    selectPrimeOption('#link-tooltip-variable', 'Cluster');

    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'cluster');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'cluster');

    cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');
    cy.get('#global-settings-link-color-table', { timeout: 15000 }).should('be.visible');
    waitForColorTableRows('#node-color-table', 'before-threshold node');
    waitForColorTableRows('#link-color-table', 'before-threshold link');

    cy.get('#node-color-table', { timeout: 15000 }).then(($table) => {
      nodeColorsBefore = extractColorTable($table);
    });
    cy.get('#link-color-table', { timeout: 15000 }).then(($table) => {
      linkColorsBefore = extractColorTable($table);
    });
    cy.closeGlobalSettings();

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      nodeSnapshotBefore = readRenderedNodeSnapshot(typedWindow);
      linkSnapshotBefore = readRenderedLinkSnapshot(typedWindow);
    });

    cy.then(() => {
      assertNodeSnapshotMatchesTable(nodeSnapshotBefore, nodeColorsBefore, 'before-threshold');
      assertLinkSnapshotMatchesTable(linkSnapshotBefore, linkColorsBefore, 'before-threshold');
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(24);
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfVisibleLinks', 73);
    assertMapRenderedCounts({
      nodes: 30,
      links: 73,
      excludedNodes: EXCLUDED_NODE_IDS,
    });

    openGlobalStylingTab();
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'cluster');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'cluster');
    waitForColorTableRows('#node-color-table', 'after-threshold node');
    waitForColorTableRows('#link-color-table', 'after-threshold link');
    cy.get('#node-color-table', { timeout: 15000 }).then(($table) => {
      nodeColorsAfter = extractColorTable($table);
    });
    cy.get('#link-color-table', { timeout: 15000 }).then(($table) => {
      linkColorsAfter = extractColorTable($table);
    });
    cy.closeGlobalSettings();

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      nodeSnapshotAfter = readRenderedNodeSnapshot(typedWindow);
      linkSnapshotAfter = readRenderedLinkSnapshot(typedWindow);
    });

    cy.then(() => {
      assertNodeSnapshotMatchesTable(nodeSnapshotAfter, nodeColorsAfter, 'after-threshold');
      assertLinkSnapshotMatchesTable(linkSnapshotAfter, linkColorsAfter, 'after-threshold');

      const changedNodeIds = Object.keys(nodeSnapshotAfter).filter((nodeId) => {
        const before = nodeSnapshotBefore[nodeId];
        const after = nodeSnapshotAfter[nodeId];
        return Boolean(before) && before.cluster !== after.cluster;
      });
      const recoloredNodeIds = changedNodeIds.filter((nodeId) => nodeSnapshotBefore[nodeId].color !== nodeSnapshotAfter[nodeId].color);

      expect(changedNodeIds.length, 'rendered node cluster membership changed after threshold').to.be.greaterThan(0);
      expect(recoloredNodeIds.length, 'changed rendered nodes also recolored').to.be.greaterThan(0);

      const changedLinkIds = Object.keys(linkSnapshotAfter).filter((linkId) => {
        const before = linkSnapshotBefore[linkId];
        const after = linkSnapshotAfter[linkId];
        return Boolean(before) && before.cluster !== after.cluster;
      });
      const recoloredLinkIds = changedLinkIds.filter((linkId) => linkSnapshotBefore[linkId].color !== linkSnapshotAfter[linkId].color);

      expect(changedLinkIds.length, 'rendered link cluster membership changed after threshold').to.be.greaterThan(0);
      expect(recoloredLinkIds.length, 'changed rendered links also recolored').to.be.greaterThan(0);
    });
  });
});
