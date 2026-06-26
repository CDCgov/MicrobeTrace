/// <reference types="cypress" />

import { readRenderedAggregateRows } from '../../../support/aggregate-helpers';
import { readRenderedCrosstab } from '../../../support/crosstab-helpers';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapMatchesOracleSnapshot,
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  setTimelineDate,
  setTimelineField,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import {
  assertNoDashboardRuntimeBanner,
  assertOpenDashboardTabs,
  configureDashboardMapZipcode,
  focusDashboardTab,
  openDashboardViews,
} from '../../../support/dashboard-helpers';
import type { OracleSnapshot, OracleStep } from '../../../oracle/types';

type DashboardWindow = Window & {
  commonService: any;
};

type WaterfallDrilldownSnapshot = {
  clusterId: string;
  clusterRows: Array<{ id: string; nodeCount: number }>;
  linkIndex: number;
  linkRows: Array<{ id: string; distance: string }>;
  nodeId: string;
  nodeRows: Array<{ id: string; degree: number }>;
};

type NonTargetSnapshot = {
  aggregateRows: any[];
  crosstab: any;
  waterfall: WaterfallDrilldownSnapshot;
};

const DASHBOARD_TABS = ['2D Network', 'Map', 'Bubble', 'Aggregate', 'Crosstab', 'Waterfall'];

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay', { timeout: 15000 })
    .last()
    .find('p-selectitem')
    .contains('li', new RegExp(`^${escapeRegExp(label)}$`))
    .click({ force: true });
};

const closeDialogIfPresent = (title: string): void => {
  cy.get('body').then(($body) => {
    const dialogTitle = $body
      .find('.p-dialog-title')
      .toArray()
      .find((candidate) => String(candidate.textContent || '').trim() === title);

    if (!dialogTitle) {
      return;
    }

    cy.contains('.p-dialog-title', title)
      .parents('.p-dialog')
      .find('button.p-dialog-close-button')
      .click({ force: true });

    cy.contains('.p-dialog-title', title).should('not.exist');
  });
};

const readWaterfallClusterRows = (): Cypress.Chainable<Array<{ id: string; nodeCount: number }>> => {
  return cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
    .then(($rows) => Array.from($rows).map((row) => {
      const cells = row.querySelectorAll('td');
      return {
        id: String(cells.item(0)?.textContent || '').trim(),
        nodeCount: Number(String(cells.item(1)?.textContent || '').trim()),
      };
    }));
};

const readWaterfallNodeRows = (): Cypress.Chainable<Array<{ id: string; degree: number }>> => {
  return cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
    .then(($rows) => Array.from($rows).map((row) => {
      const cells = row.querySelectorAll('td');
      return {
        id: String(cells.item(0)?.textContent || '').trim(),
        degree: Number(String(cells.item(1)?.textContent || '').trim()),
      };
    }));
};

const readWaterfallLinkRows = (): Cypress.Chainable<Array<{ id: string; distance: string }>> => {
  return cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
    .then(($rows) => Array.from($rows).map((row) => {
      const cells = row.querySelectorAll('td');
      return {
        id: String(cells.item(0)?.textContent || '').trim(),
        distance: String(cells.item(1)?.textContent || '').trim(),
      };
    }));
};

const configureBubbleXAxisToState = (): void => {
  focusDashboardTab('Bubble');
  openBubbleSettingsDialog();
  cy.get('@bubbleSettings').find('#bubble-axis-x').find('.p-select-dropdown').click({ force: true });
  clickVisiblePrimeOption('State');
  cy.get('@bubbleSettings').find('#bubble-axis-x').find('.p-select-label').should('contain', 'State');
  cy.window().its('commonService.session.style.widgets.bubble-x').should('equal', 'State');
  cy.closeSettingsPane('Bubble Settings');
};

const assertBubbleMatchesOracleSnapshot = (snapshot: OracleSnapshot): void => {
  focusDashboardTab('Bubble');
  cy.window().should((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const bubble = typedWindow.commonService.visuals.bubble;
    const renderedNodeIds = getBubbleDataNodes(bubble).map((node: any) => String(node.id())).sort();
    const expectedNodeIds = [...snapshot.visibleNodeIds].sort();

    expect(renderedNodeIds, 'Bubble rendered node ids').to.deep.equal(expectedNodeIds);
    expect(bubble.visibleData.length, 'Bubble visibleData length').to.equal(snapshot.visibleNodes);
    expect(String(bubble.cy.getElementById('x_axis_Label').data('label') || ''), 'Bubble X axis label').to.equal('State');
  });
};

const captureWaterfallDrilldown = (): Cypress.Chainable<WaterfallDrilldownSnapshot> => {
  focusDashboardTab('Waterfall');

  return readWaterfallClusterRows().then((clusterRows) => {
    expect(clusterRows.length, 'Waterfall cluster rows').to.be.greaterThan(0);

    cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row').first().click({ force: true });
    cy.window().its('commonService.visuals.waterfall.selectedClusterRow.id').should('exist');

    return readWaterfallNodeRows().then((nodeRows) => {
      expect(nodeRows.length, 'Waterfall node rows').to.be.greaterThan(0);

      cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row').first().click({ force: true });
      cy.window().its('commonService.visuals.waterfall.selectedNodeRow.id').should('exist');

      return readWaterfallLinkRows().then((linkRows) => {
        expect(linkRows.length, 'Waterfall link rows').to.be.greaterThan(0);

        cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row').first().click({ force: true });
        cy.window().its('commonService.visuals.waterfall.selectedLinkRow.index').should('exist');

        return cy.window().then((win: unknown) => {
          const waterfall = (win as DashboardWindow).commonService.visuals.waterfall;

          return {
            clusterId: String(waterfall.selectedClusterRow.id),
            clusterRows,
            linkIndex: Number(waterfall.selectedLinkRow.index),
            linkRows,
            nodeId: String(waterfall.selectedNodeRow.id),
            nodeRows,
          };
        });
      });
    });
  });
};

const snapshotNonTargetViews = (alias = 'timelineNonTargetBaseline'): void => {
  focusDashboardTab('Aggregate');
  readRenderedAggregateRows(0).then((aggregateRows) => {
    expect(aggregateRows.length, 'Aggregate baseline rows').to.be.greaterThan(0);

    focusDashboardTab('Crosstab');
    readRenderedCrosstab().then((crosstab) => {
      expect(crosstab.body.length, 'Crosstab baseline rows').to.be.greaterThan(0);

      captureWaterfallDrilldown().then((waterfall) => {
        cy.wrap<NonTargetSnapshot>({
          aggregateRows,
          crosstab,
          waterfall,
        }, { log: false }).as(alias);
      });
    });
  });
};

const assertWaterfallDrilldownPreserved = (baseline: WaterfallDrilldownSnapshot): void => {
  focusDashboardTab('Waterfall');
  cy.window().should((win: unknown) => {
    const waterfall = (win as DashboardWindow).commonService.visuals.waterfall;

    expect(String(waterfall.selectedClusterRow?.id), 'Waterfall selected cluster').to.equal(baseline.clusterId);
    expect(String(waterfall.selectedNodeRow?.id), 'Waterfall selected node').to.equal(baseline.nodeId);
    expect(Number(waterfall.selectedLinkRow?.index), 'Waterfall selected link').to.equal(baseline.linkIndex);
  });

  readWaterfallClusterRows().should((rows) => {
    expect(rows, 'Waterfall cluster rows after timeline').to.deep.equal(baseline.clusterRows);
  });
  readWaterfallNodeRows().should((rows) => {
    expect(rows, 'Waterfall node rows after timeline').to.deep.equal(baseline.nodeRows);
  });
  readWaterfallLinkRows().should((rows) => {
    expect(rows, 'Waterfall link rows after timeline').to.deep.equal(baseline.linkRows);
  });
};

const assertNonTargetViewsStable = (alias = 'timelineNonTargetBaseline'): void => {
  cy.get<NonTargetSnapshot>(`@${alias}`).then((baseline) => {
    focusDashboardTab('Aggregate');
    readRenderedAggregateRows(0).should((rows) => {
      expect(rows, 'Aggregate rows after dashboard timeline checkpoint').to.deep.equal(baseline.aggregateRows);
    });

    focusDashboardTab('Crosstab');
    readRenderedCrosstab().should((rendered) => {
      expect(rendered, 'Crosstab rendering after dashboard timeline checkpoint').to.deep.equal(baseline.crosstab);
    });

    assertWaterfallDrilldownPreserved(baseline.waterfall);
  });
};

const prepareDashboard = (): void => {
  const profile = getProfile('timeline-covid-node-link');

  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  openDashboardViews(['Map', 'Bubble', 'Aggregate', 'Crosstab', 'Waterfall']);
  closeDialogIfPresent('Aggregate Settings');
  closeDialogIfPresent('Crosstab Settings');
  configureDashboardMapZipcode('Off');
  configureBubbleXAxisToState();
  waitForProcessingDialogToClear();
  assertOpenDashboardTabs(DASHBOARD_TABS);
  assertNoDashboardRuntimeBanner();
};

describe('Journey Flow - Dashboard timeline propagation', () => {
  it('applies the timeline checkpoint only to 2D Map and Bubble while Aggregate Crosstab and Waterfall stay isolated', () => {
    const profile = getProfile('timeline-covid-node-link');
    const timeline = profile.expectations.timeline!;
    const midCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-mid') ?? timeline.checkpoints[0];

    const oracleSteps: OracleStep[] = [
      {
        id: 'timeline-enabled',
        kind: 'set-timeline-field',
        field: timeline.field,
      },
      {
        id: midCheckpoint.id,
        kind: 'set-timeline-date',
        date: midCheckpoint.date,
      },
    ];

    computeOracleForProfile(profile, oracleSteps);

    prepareDashboard();
    snapshotNonTargetViews();

    setTimelineField(timeline.field);
    setTimelineDate(midCheckpoint.date);
    waitForProcessingDialogToClear();

    getOracleSnapshot('oracleResult', midCheckpoint.id).then((snapshot) => {
      focusDashboardTab('2D Network');
      assertNetworkMatchesOracleSnapshot(snapshot, { assertNodeIds: true });

      focusDashboardTab('Map');
      assertMapMatchesOracleSnapshot(snapshot, { latitudeField: '_lat', longitudeField: '_lon' });

      assertBubbleMatchesOracleSnapshot(snapshot);
    });

    assertNonTargetViewsStable();
    assertNoDashboardRuntimeBanner();
  });
});
