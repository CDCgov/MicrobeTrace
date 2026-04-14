/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  openGlobalFilteringTab,
  openGlobalStylingTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

type WinWithBubble = Window & {
  commonService: any;
};

type ColorTable = Record<string, string>;

type ExpandedBubbleSnapshot = Record<string, {
  cluster: string;
  xGroup: number;
  xCategory: string;
  renderedX: number;
  color: string;
}>;

type CollapsedBubbleSnapshot = Record<string, {
  key: string;
  totalCount: number;
  counts: Record<string, number>;
  nodeSize: number;
  backgroundImage: string;
}>;

const hexToRgb = (value: string): string => {
  const normalized = value.replace('#', '');
  const hex = normalized.length === 3
    ? normalized.split('').map((segment) => `${segment}${segment}`).join('')
    : normalized;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return `rgb(${r},${g},${b})`;
};

const normalizeColor = (value: string): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.startsWith('#')) {
    return hexToRgb(normalized);
  }

  return normalized.replace(/\s+/g, '');
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay', { timeout: 15000 })
    .last()
    .find('p-selectitem')
    .contains('li', new RegExp(`^${escapeRegExp(label)}$`))
    .click({ force: true });
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  clickVisiblePrimeOption(label);
};

const setBubbleAxis = (
  selector: '#bubble-axis-x' | '#bubble-axis-y',
  label: string,
  expectedWidget: 'bubble-x' | 'bubble-y',
  expectedValue: string,
): void => {
  cy.get('@bubbleSettings').find(selector).find('.p-select-dropdown').click({ force: true });
  clickVisiblePrimeOption(label);
  cy.get('@bubbleSettings').find(selector).find('.p-select-label').should('contain', label);
  cy.window().its(`commonService.session.style.widgets.${expectedWidget}`).should('equal', expectedValue);
};

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

const readExpandedBubbleSnapshot = (win: WinWithBubble): ExpandedBubbleSnapshot => {
  const bubble = win.commonService.visuals.bubble;
  const fullNodes = win.commonService.session.data.nodeFilteredValues as Array<Record<string, unknown>>;

  return bubble.visibleData.reduce((acc: ExpandedBubbleSnapshot, node: any) => {
    const fullNode = fullNodes.find((candidate) => String(candidate._id ?? candidate.id) === String(node.id));
    const renderedNode = bubble.cy.getElementById(String(node.id));
    if (!fullNode || renderedNode.empty()) return acc;

    acc[String(node.id)] = {
      cluster: String(fullNode.cluster),
      xGroup: Number(node.Xgroup),
      xCategory: String(bubble.X_categories[node.Xgroup]),
      renderedX: Number(renderedNode.position('x')),
      color: normalizeColor(renderedNode.style('background-color')),
    };

    return acc;
  }, {});
};

const readCollapsedBubbleSnapshot = (win: WinWithBubble): CollapsedBubbleSnapshot => {
  const bubble = win.commonService.visuals.bubble;

  return bubble.visibleData.reduce((acc: CollapsedBubbleSnapshot, node: any) => {
    const xCategory = String(bubble.X_categories[node.Xgroup]);
    const yCategory = String(bubble.Y_categories[node.Ygroup]);
    const key = `${xCategory}|${yCategory}`;
    const renderedNode = bubble.cy.getElementById(String(node.id));

    if (renderedNode.empty()) return acc;

    acc[key] = {
      key,
      totalCount: Number(node.totalCount || 0),
      counts: Object.fromEntries(
        (Array.isArray(node.counts) ? node.counts : []).map((count: any) => [String(count.label), Number(count.count)]),
      ),
      nodeSize: Number(renderedNode.data('nodeSize')),
      backgroundImage: String(renderedNode.style('background-image') || ''),
    };

    return acc;
  }, {});
};

const assertExpandedSnapshotMatchesTable = (
  snapshot: ExpandedBubbleSnapshot,
  table: ColorTable,
  label: string,
): void => {
  const nodeIds = Object.keys(snapshot);

  expect(nodeIds.length, `${label} Bubble nodes`).to.be.greaterThan(0);
  nodeIds.forEach((nodeId) => {
    const state = snapshot[nodeId];
    expect(table[state.cluster], `${label} Bubble color table entry for cluster ${state.cluster}`).to.exist;
    expect(state.color, `${label} Bubble rendered color for ${nodeId}`).to.equal(table[state.cluster]);
  });
};

const sumCollapsedTotals = (snapshot: CollapsedBubbleSnapshot): number =>
  Object.values(snapshot).reduce((sum, state) => sum + state.totalCount, 0);

describe('Journey Flow - Bubble uploaded cluster recompute', () => {
  const profile = getProfile('map-covid-zipcode-threshold');
  const linksAtThreshold24 = 73;

  it('recomputes Bubble cluster buckets and rendered colors when Cluster color-by is active and threshold changes', () => {
    let clusterColorsBefore: ColorTable = {};
    let clusterColorsAfter: ColorTable = {};
    let bubbleSnapshotBefore: ExpandedBubbleSnapshot = {};
    let bubbleSnapshotAfter: ExpandedBubbleSnapshot = {};

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'Cluster', 'bubble-x', 'cluster');
    setBubbleAxis('#bubble-axis-y', 'State', 'bubble-y', 'State');
    cy.closeSettingsPane('Bubble Settings');

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Cluster');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'cluster');
    cy.get('#node-color-table', { timeout: 15000 }).then(($table) => {
      clusterColorsBefore = extractColorTable($table);
    });
    cy.closeGlobalSettings();

    cy.window().then((win: unknown) => {
      bubbleSnapshotBefore = readExpandedBubbleSnapshot(win as WinWithBubble);
    });

    cy.then(() => {
      assertExpandedSnapshotMatchesTable(bubbleSnapshotBefore, clusterColorsBefore, 'before-threshold');
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(24);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    assertMetricCount('#numberOfNodes', 33);
    assertMetricCount('#numberOfVisibleLinks', linksAtThreshold24);

    openGlobalStylingTab();
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'cluster');
    cy.get('#node-color-table', { timeout: 15000 }).then(($table) => {
      clusterColorsAfter = extractColorTable($table);
    });
    cy.closeGlobalSettings();

    cy.window().then((win: unknown) => {
      bubbleSnapshotAfter = readExpandedBubbleSnapshot(win as WinWithBubble);
    });

    cy.then(() => {
      assertExpandedSnapshotMatchesTable(bubbleSnapshotAfter, clusterColorsAfter, 'after-threshold');

      const changedNodeIds = Object.keys(bubbleSnapshotAfter).filter((nodeId) => {
        const before = bubbleSnapshotBefore[nodeId];
        const after = bubbleSnapshotAfter[nodeId];
        return Boolean(before) && before.cluster !== after.cluster;
      });
      const rebucketedNodeIds = changedNodeIds.filter((nodeId) => {
        const before = bubbleSnapshotBefore[nodeId];
        const after = bubbleSnapshotAfter[nodeId];
        return before.xGroup !== after.xGroup || before.xCategory !== after.xCategory || before.renderedX !== after.renderedX;
      });
      const recoloredNodeIds = changedNodeIds.filter((nodeId) => {
        const before = bubbleSnapshotBefore[nodeId];
        const after = bubbleSnapshotAfter[nodeId];
        return before.color !== after.color;
      });

      expect(changedNodeIds.length, 'Bubble node cluster membership changed after threshold').to.be.greaterThan(0);
      expect(rebucketedNodeIds.length, 'changed Bubble nodes rebucketed onto a new cluster axis slot').to.be.greaterThan(0);
      expect(recoloredNodeIds.length, 'changed Bubble nodes recolored after threshold').to.be.greaterThan(0);
    });
  });

  it('recomputes collapsed Bubble aggregate composition and sizes when Cluster color-by is active and threshold changes', () => {
    let collapsedSnapshotBefore: CollapsedBubbleSnapshot = {};
    let collapsedSnapshotAfter: CollapsedBubbleSnapshot = {};
    let collapsedBaseNodeSize = 0;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'State', 'bubble-x', 'State');
    setBubbleAxis('#bubble-axis-y', 'None', 'bubble-y', 'None');
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    cy.closeSettingsPane('Bubble Settings');

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Cluster');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'cluster');
    cy.closeGlobalSettings();

    cy.window().then((win: unknown) => {
      collapsedSnapshotBefore = readCollapsedBubbleSnapshot(win as WinWithBubble);
    });

    cy.then(() => {
      const multiClusterKeys = Object.keys(collapsedSnapshotBefore).filter((key) =>
        Object.keys(collapsedSnapshotBefore[key].counts).length > 1,
      );

      expect(sumCollapsedTotals(collapsedSnapshotBefore), 'collapsed totalCount sum before threshold').to.equal(33);
      expect(multiClusterKeys.length, 'collapsed mixed-cluster aggregates before threshold').to.be.greaterThan(0);
      multiClusterKeys.forEach((key) => {
        expect(collapsedSnapshotBefore[key].backgroundImage, `collapsed pie background before threshold for ${key}`)
          .to.not.equal('none');
      });
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(24);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    assertMetricCount('#numberOfNodes', 33);
    assertMetricCount('#numberOfVisibleLinks', linksAtThreshold24);

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      collapsedBaseNodeSize = Number(typedWindow.commonService.session.style.widgets['bubble-size']);
      collapsedSnapshotAfter = readCollapsedBubbleSnapshot(typedWindow);
    });

    cy.then(() => {
      const changedAggregateKeys = Object.keys(collapsedSnapshotAfter).filter((key) => {
        const before = collapsedSnapshotBefore[key];
        const after = collapsedSnapshotAfter[key];
        return Boolean(before)
          && (
            before.totalCount !== after.totalCount
            || JSON.stringify(before.counts) !== JSON.stringify(after.counts)
          );
      });
      const changedPieKeys = changedAggregateKeys.filter((key) => {
        const before = collapsedSnapshotBefore[key];
        const after = collapsedSnapshotAfter[key];
        return before.backgroundImage !== after.backgroundImage;
      });

      expect(sumCollapsedTotals(collapsedSnapshotAfter), 'collapsed totalCount sum after threshold').to.equal(33);
      expect(changedAggregateKeys.length, 'collapsed aggregate membership changed after threshold').to.be.greaterThan(0);
      expect(changedPieKeys.length, 'collapsed aggregate pie backgrounds changed after threshold').to.be.greaterThan(0);

      Object.values(collapsedSnapshotAfter).forEach((aggregate) => {
        expect(
          aggregate.nodeSize,
          `collapsed nodeSize follows sqrt(totalCount) for ${aggregate.key}`,
        ).to.be.closeTo(collapsedBaseNodeSize * Math.sqrt(aggregate.totalCount), 0.001);

        if (Object.keys(aggregate.counts).length > 1) {
          expect(aggregate.backgroundImage, `collapsed mixed aggregate background for ${aggregate.key}`)
            .to.not.equal('none');
        }
      });
    });
  });
});
