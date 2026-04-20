/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  openGlobalStylingTab,
} from '../../../support/journey-helpers';

type WinWithBubble = Window & {
  commonService: any;
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

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

const countUniqueFieldValues = (rows: any[], field: string): number => new Set(rows.map((row) => row?.[field])).size;

const getBubbleNodeDistance = (bubble: any, firstId: string, secondId: string): number => {
  const firstNode = bubble.cy.getElementById(firstId);
  const secondNode = bubble.cy.getElementById(secondId);

  expect(firstNode.empty(), `Bubble node ${firstId} exists`).to.equal(false);
  expect(secondNode.empty(), `Bubble node ${secondId} exists`).to.equal(false);

  const firstPosition = firstNode.position();
  const secondPosition = secondNode.position();

  return Math.hypot(firstPosition.x - secondPosition.x, firstPosition.y - secondPosition.y);
};

const setBubbleAxis = (
  selector: '#bubble-axis-x' | '#bubble-axis-y',
  label: string,
  expectedWidget: 'bubble-x' | 'bubble-y',
  expectedValue: string,
): void => {
  cy.get('@bubbleSettings').find(selector).find('.p-select-dropdown').click({ force: true });
  clickVisiblePrimeOption(label);
  cy.wait(100)
  cy.get('@bubbleSettings').find(selector).find('.p-select-label').should('contain', label);
  cy.window().its(`commonService.session.style.widgets.${expectedWidget}`).should('equal', expectedValue);
};

const setBubbleRangeValue = (
  selector: '#bubble-node-size' | '#bubble-label-size',
  value: number,
  expectedPath: string,
): void => {
  cy.get('@bubbleSettings')
    .find(selector)
    .invoke('val', value)
    .trigger('input')
    .trigger('change');

  cy.window().its(expectedPath).should('equal', value);
};

const formatBubbleDateLabel = (value: string): string =>
  new Date(Date.parse(value)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

const getBubbleDateBucketKey = (value: unknown): string => {
  if (value === null) return '__null__';
  if (value === undefined) return '__undefined__';
  return `${typeof value}:${String(value)}`;
};

const isBubbleDateValueValid = (value: unknown): boolean => !Number.isNaN(Date.parse(value as any));

const getBubbleDateAxisExpectations = (rows: any[], field: string) => {
  const validDatesByKey = new Map<string, string>();
  const unknownDateKeys = new Set<string>();

  rows.forEach((row) => {
    const rawValue = row?.[field];
    const bucketKey = getBubbleDateBucketKey(rawValue);

    if (!isBubbleDateValueValid(rawValue)) {
      unknownDateKeys.add(bucketKey);
      return;
    }

    validDatesByKey.set(bucketKey, String(rawValue));
  });

  return {
    validDates: Array.from(validDatesByKey.values())
      .sort((left, right) => Date.parse(left) - Date.parse(right)),
    unknownBucketCount: unknownDateKeys.size,
  };
};

describe('Journey Flow - Bubble uploaded controls', () => {
  const profile = getProfile('color-by-uploaded-categorical');

  it('updates uploaded Bubble axes, node sizing, and axis label sizing through the settings dialog', () => {
    const resizedNodes = 26;
    const resizedLabels = 28;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'State', 'bubble-x', 'State');
    setBubbleAxis('#bubble-axis-y', 'NodeClass', 'bubble-y', 'Node_Class');
    setBubbleRangeValue('#bubble-node-size', resizedNodes, 'commonService.session.style.widgets.bubble-size');
    setBubbleRangeValue('#bubble-label-size', resizedLabels, 'commonService.visuals.bubble.labelSize');
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const visibleNodes = typedWindow.commonService.getVisibleNodes();
      const dataNodes = getBubbleDataNodes(bubble);
      const xAxisNodes = bubble.cy.nodes('.X_axis').filter((node: any) => node.id() !== 'x_axis_Label');
      const yAxisNodes = bubble.cy.nodes('.Y_axis').filter((node: any) => node.id() !== 'y_axis_Label');
      const expectedXCount = countUniqueFieldValues(visibleNodes, 'State');
      const expectedYCount = countUniqueFieldValues(visibleNodes, 'Node_Class');

      expect(xAxisNodes.length, 'uploaded Bubble X-axis categories').to.equal(expectedXCount);
      expect(yAxisNodes.length, 'uploaded Bubble Y-axis categories').to.equal(expectedYCount);

      dataNodes.forEach((node: any) => {
        expect(node.data('nodeSize'), 'uploaded Bubble node size').to.equal(resizedNodes);
      });

      bubble.cy.nodes('.X_axis, .Y_axis').forEach((node: any) => {
        const expectedFontSize = node.hasClass('axisLabel') ? resizedLabels + 4 : resizedLabels;
        expect(parseFloat(node.style('font-size')), `axis font size for ${node.id()}`)
          .to.equal(expectedFontSize);
      });
    });
  });

  it('colors uploaded Bubble nodes by profession and renders aggregated tooltip counts when collapsed', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'State', 'bubble-x', 'State');
    setBubbleAxis('#bubble-axis-y', 'NodeClass', 'bubble-y', 'Node_Class');
    cy.closeSettingsPane('Bubble Settings');

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Profession');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Profession');
    cy.closeGlobalSettings();

    cy.window().should((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const healthcareNode = bubble.cy.getElementById('797703');
      const hospitalityNode = bubble.cy.getElementById('797519');

      expect(healthcareNode.empty(), 'Healthcare node present in Bubble').to.equal(false);
      expect(hospitalityNode.empty(), 'Hospitality node present in Bubble').to.equal(false);
      expect(
        healthcareNode.style('background-color'),
        'different uploaded professions render different Bubble colors',
      ).not.to.equal(hospitalityNode.style('background-color'));
    });

    openBubbleSettingsDialog();
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const visibleNodeCount = typedWindow.commonService.getVisibleNodes().length;
      const collapsedNode = bubble.visibleData.find((node: any) =>
        node.totalCount === 6
        && Array.isArray(node.counts)
        && node.counts.some((count: any) => count.label === 'Healthcare' && count.count === 4)
        && node.counts.some((count: any) => count.label === 'Education' && count.count === 2),
      );

      expect(collapsedNode, 'mixed uploaded Bubble aggregate').to.exist;
      expect(
        bubble.visibleData.reduce((sum: number, node: any) => sum + Number(node.totalCount || 0), 0),
        'collapsed Bubble totalCount sum',
      ).to.equal(visibleNodeCount);
      expect(getBubbleDataNodes(bubble).length, 'collapsed Bubble rendered node count').to.be.lessThan(visibleNodeCount);

      const renderedCollapsedNode = bubble.cy.getElementById(collapsedNode.id);
      expect(renderedCollapsedNode.empty(), 'rendered collapsed Bubble node').to.equal(false);
      expect(renderedCollapsedNode.style('background-image'), 'collapsed Bubble pie background').not.to.equal('none');
    });

    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const collapsedNode = bubble.visibleData.find((node: any) =>
        node.totalCount === 6
        && Array.isArray(node.counts)
        && node.counts.some((count: any) => count.label === 'Healthcare' && count.count === 4)
        && node.counts.some((count: any) => count.label === 'Education' && count.count === 2),
      );
      const renderedCollapsedNode = bubble.cy.getElementById(collapsedNode.id);

      renderedCollapsedNode.emit('mouseover', renderedCollapsedNode.renderedPosition());
    });

    cy.get('#bubbleTooltip', { timeout: 5000 })
      .should('be.visible')
      .and('contain', 'Profession')
      .and('contain', 'Healthcare')
      .and('contain', 'Education')
      .and('contain', 'Total');

    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const collapsedNode = bubble.visibleData.find((node: any) =>
        node.totalCount === 6
        && Array.isArray(node.counts)
        && node.counts.some((count: any) => count.label === 'Healthcare' && count.count === 4)
        && node.counts.some((count: any) => count.label === 'Education' && count.count === 2),
      );
      bubble.cy.getElementById(collapsedNode.id).emit('mouseout');
    });

    cy.get('#bubbleTooltip', { timeout: 5000 }).should('not.be.visible');
  });

  it('updates uploaded Bubble node spacing and disables the spacing control when collapsed', () => {
    const firstNodeId = '797703';
    const secondNodeId = '797748';
    const expandedSpacing = 0.15;
    let initialDistance = 0;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'State', 'bubble-x', 'State');
    setBubbleAxis('#bubble-axis-y', 'NodeClass', 'bubble-y', 'Node_Class');

    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      initialDistance = getBubbleNodeDistance(bubble, firstNodeId, secondNodeId);
      expect(initialDistance, 'initial distance inside the shared Bubble cell').to.be.greaterThan(0);
    });

    cy.get('@bubbleSettings')
      .find('#bubble-node-spacing')
      .invoke('val', expandedSpacing)
      .trigger('input')
      .trigger('change');

    cy.window().its('commonService.session.style.widgets.bubble-charge').should('equal', expandedSpacing);

    cy.window().should((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const updatedDistance = getBubbleNodeDistance(bubble, firstNodeId, secondNodeId);

      expect(updatedDistance, 'Bubble spacing increases node separation').to.be.greaterThan(initialDistance);
    });

    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    cy.get('@bubbleSettings').find('#bubble-node-spacing').should('be.disabled');
  });

  it('scales collapsed uploaded Bubble node sizes by aggregate totalCount when the node size changes', () => {
    const resizedNodes = 25;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'State', 'bubble-x', 'State');
    setBubbleAxis('#bubble-axis-y', 'NodeClass', 'bubble-y', 'Node_Class');
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    setBubbleRangeValue('#bubble-node-size', resizedNodes, 'commonService.session.style.widgets.bubble-size');
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const dataNodes = getBubbleDataNodes(bubble);
      const visibleNodeCount = typedWindow.commonService.getVisibleNodes().length;
      const aggregateCounts = bubble.visibleData.map((node: any) => Number(node.totalCount || 0));

      expect(dataNodes.length, 'collapsed Bubble rendered aggregates').to.be.lessThan(visibleNodeCount);
      expect(Math.max(...aggregateCounts), 'collapsed Bubble has an aggregate with totalCount > 1').to.be.greaterThan(1);

      bubble.visibleData.forEach((aggregateNode: any) => {
        const renderedNode = bubble.cy.getElementById(aggregateNode.id);
        expect(renderedNode.empty(), `collapsed Bubble aggregate ${aggregateNode.id} rendered`).to.equal(false);
        expect(
          Number(renderedNode.data('nodeSize')),
          `collapsed Bubble nodeSize for ${aggregateNode.id}`,
        ).to.be.closeTo(resizedNodes * Math.sqrt(Number(aggregateNode.totalCount || 0)), 0.001);
      });
    });
  });

  it('formats uploaded Bubble collection dates chronologically and keeps single-date nodes in the expected buckets', () => {
    const representativeDates = {
      '375596': '7/8/2021',
      '415508': '7/10/2021',
      '505967': '7/12/2021',
    } as const;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'CollectionDate', 'bubble-x', 'Collection_Date');
    setBubbleAxis('#bubble-axis-y', 'None', 'bubble-y', 'None');
    cy.get('@bubbleSettings').find('#xVarDate').click({ force: true });
    cy.window().its('commonService.visuals.bubble.xVarDate').should('equal', true);
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const visibleNodes = typedWindow.commonService.getVisibleNodes();
      const {
        validDates: expectedChronologicalDates,
        unknownBucketCount,
      } = getBubbleDateAxisExpectations(visibleNodes, 'Collection_Date');

      const sortedBubbleDates = bubble.X_categories
        .filter((value: unknown) => isBubbleDateValueValid(value))
        .map((value: string) => String(value));

      expect(sortedBubbleDates, 'Bubble nonblank X categories sort chronologically')
        .to.deep.equal(expectedChronologicalDates);

      const axisLabels = bubble.cy.nodes('.X_axis')
        .filter((node: any) => node.id() !== 'x_axis_Label')
        .sort((left: any, right: any) => left.position('x') - right.position('x'))
        .map((node: any) => String(node.data('label')));
      const unknownAxisLabels = axisLabels.filter((label: string) => label === 'Unknown');
      const nonUnknownAxisLabels = axisLabels.filter((label: string) => label !== 'Unknown');

      expect(nonUnknownAxisLabels, 'Bubble X-axis renders formatted chronological date labels')
        .to.deep.equal(expectedChronologicalDates.map(formatBubbleDateLabel));
      expect(unknownAxisLabels.length, 'Bubble X-axis renders Unknown labels for missing or invalid uploaded dates')
        .to.equal(unknownBucketCount);

      Object.entries(representativeDates).forEach(([nodeId, expectedDate]) => {
        const aggregateNode = bubble.visibleData.find((node: any) => node.id === nodeId);
        const renderedNode = bubble.cy.getElementById(nodeId);
        const expectedXGroup = bubble.X_categories.indexOf(expectedDate);

        expect(aggregateNode, `Bubble data node ${nodeId}`).to.exist;
        expect(renderedNode.empty(), `rendered Bubble node ${nodeId}`).to.equal(false);
        expect(Number(aggregateNode.Xgroup), `Bubble Xgroup for ${nodeId}`).to.equal(expectedXGroup);
        expect(renderedNode.position('x'), `rendered Bubble x position for ${nodeId}`)
          .to.be.closeTo(expectedXGroup * bubble.scaleFactor, 0.001);
        expect(renderedNode.position('y'), `rendered Bubble y position for ${nodeId}`)
          .to.be.closeTo(0, 0.001);
      });
    });
  });

  it('formats uploaded Bubble collection dates chronologically on the Y axis and keeps single-date nodes in the expected buckets', () => {
    const representativeDates = {
      '375596': '7/8/2021',
      '415508': '7/10/2021',
      '505967': '7/12/2021',
    } as const;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'None', 'bubble-x', 'None');
    setBubbleAxis('#bubble-axis-y', 'CollectionDate', 'bubble-y', 'Collection_Date');
    cy.get('@bubbleSettings').find('#yVarDate').click({ force: true });
    cy.window().its('commonService.visuals.bubble.yVarDate').should('equal', true);
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const visibleNodes = typedWindow.commonService.getVisibleNodes();
      const {
        validDates: expectedChronologicalDates,
        unknownBucketCount,
      } = getBubbleDateAxisExpectations(visibleNodes, 'Collection_Date');

      const sortedBubbleDates = bubble.Y_categories
        .filter((value: unknown) => isBubbleDateValueValid(value))
        .map((value: string) => String(value));

      expect(sortedBubbleDates, 'Bubble nonblank Y categories sort chronologically')
        .to.deep.equal(expectedChronologicalDates);

      const axisLabels = bubble.cy.nodes('.Y_axis')
        .filter((node: any) => node.id() !== 'y_axis_Label')
        .sort((left: any, right: any) => left.position('y') - right.position('y'))
        .map((node: any) => String(node.data('label')));
      const unknownAxisLabels = axisLabels.filter((label: string) => label === 'Unknown');
      const nonUnknownAxisLabels = axisLabels.filter((label: string) => label !== 'Unknown');

      expect(nonUnknownAxisLabels, 'Bubble Y-axis renders formatted chronological date labels')
        .to.deep.equal(expectedChronologicalDates.map(formatBubbleDateLabel));
      expect(unknownAxisLabels.length, 'Bubble Y-axis renders Unknown labels for missing or invalid uploaded dates')
        .to.equal(unknownBucketCount);

      Object.entries(representativeDates).forEach(([nodeId, expectedDate]) => {
        const aggregateNode = bubble.visibleData.find((node: any) => node.id === nodeId);
        const renderedNode = bubble.cy.getElementById(nodeId);
        const expectedYGroup = bubble.Y_categories.indexOf(expectedDate);

        expect(aggregateNode, `Bubble data node ${nodeId}`).to.exist;
        expect(renderedNode.empty(), `rendered Bubble node ${nodeId}`).to.equal(false);
        expect(Number(aggregateNode.Ygroup), `Bubble Ygroup for ${nodeId}`).to.equal(expectedYGroup);
        expect(renderedNode.position('x'), `rendered Bubble x position for ${nodeId}`)
          .to.be.closeTo(0, 0.001);
        expect(renderedNode.position('y'), `rendered Bubble y position for ${nodeId}`)
          .to.be.closeTo(expectedYGroup * bubble.scaleFactor, 0.001);
      });
    });
  });

  it('maps invalid and missing uploaded collection dates into Unknown Bubble date buckets', () => {
    const invalidNodeIds = ['797703', '797748'];
    const invalidDateValue = 'not-a-date';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      typedWindow.commonService.session.data.nodes.forEach((node: any) => {
        if (invalidNodeIds.includes(String(node._id ?? node.id))) {
          node.Collection_Date = invalidDateValue;
        }
      });
    });

    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'CollectionDate', 'bubble-x', 'Collection_Date');
    setBubbleAxis('#bubble-axis-y', 'None', 'bubble-y', 'None');
    cy.get('@bubbleSettings').find('#xVarDate').click({ force: true });
    cy.window().its('commonService.visuals.bubble.xVarDate').should('equal', true);
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const visibleNodes = typedWindow.commonService.getVisibleNodes();
      const {
        validDates: expectedChronologicalDates,
        unknownBucketCount,
      } = getBubbleDateAxisExpectations(visibleNodes, 'Collection_Date');

      const axisNodes = bubble.cy.nodes('.X_axis')
        .filter((node: any) => node.id() !== 'x_axis_Label')
        .sort((left: any, right: any) => left.position('x') - right.position('x'));
      const axisLabels = axisNodes.map((node: any) => String(node.data('label')));
      const unknownLabels = axisLabels.filter((label: string) => label === 'Unknown');
      const nonUnknownAxisLabels = axisLabels.filter((label: string) => label !== 'Unknown');
      const invalidBucketIndex = bubble.X_categories.indexOf(invalidDateValue);

      expect(nonUnknownAxisLabels, 'Bubble valid X-axis date labels stay chronological with invalid dates present')
        .to.deep.equal(expectedChronologicalDates.map(formatBubbleDateLabel));
      expect(unknownLabels.length, 'Bubble missing and invalid uploaded dates render as Unknown axis labels')
        .to.equal(unknownBucketCount);
      expect(invalidBucketIndex, 'Bubble raw invalid-date category index').to.be.greaterThan(-1);

      invalidNodeIds.forEach((nodeId) => {
        const invalidNode = bubble.visibleData.find((node: any) => node.id === nodeId);

        expect(invalidNode, `Bubble invalid-date node ${nodeId}`).to.exist;
        expect(Number(invalidNode.Xgroup), `Bubble invalid-date Xgroup for ${nodeId}`).to.equal(invalidBucketIndex);
      });
    });
  });
});
