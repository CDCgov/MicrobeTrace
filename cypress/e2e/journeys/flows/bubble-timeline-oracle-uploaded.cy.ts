/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  computeOracleForProfile,
  getOracleSnapshot,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  setTimelineDate,
  setTimelineField,
} from '../../../support/journey-helpers';
import type { OracleSnapshot, OracleStep } from '../../../oracle/types';

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

const setBubbleXAxis = (label: string, expectedValue: string): void => {
  cy.get('@bubbleSettings').find('#bubble-axis-x').find('.p-select-dropdown').click({ force: true });
  clickVisiblePrimeOption(label);
  cy.get('@bubbleSettings').find('#bubble-axis-x').find('.p-select-label').should('contain', label);
  cy.window().its('commonService.session.style.widgets.bubble-x').should('equal', expectedValue);
};

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

const assertBubbleMatchesOracleSnapshot = (snapshot: OracleSnapshot): void => {
  assertMetricCount('#numberOfNodes', snapshot.visibleNodes);
  assertMetricCount('#numberOfVisibleLinks', snapshot.visibleLinks);
  assertMetricCount('#numberOfDisjointComponents', snapshot.components);
  assertMetricCount('#numberOfSingletonNodes', snapshot.singletons);

  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithBubble;
    const bubble = typedWindow.commonService.visuals.bubble;
    const visibleNodes = typedWindow.commonService.getVisibleNodes();
    const renderedNodeIds = getBubbleDataNodes(bubble).map((node: any) => String(node.id())).sort();
    const sessionVisibleNodeIds = visibleNodes.map((node: any) => String(node?._id ?? node?.id)).sort();
    const expectedNodeIds = [...snapshot.visibleNodeIds].sort();
    const xAxisNodes = bubble.cy.nodes('.X_axis').filter((node: any) => node.id() !== 'x_axis_Label');

    expect(sessionVisibleNodeIds, 'session visible node ids').to.deep.equal(expectedNodeIds);
    expect(renderedNodeIds, 'Bubble rendered node ids').to.deep.equal(expectedNodeIds);
    expect(bubble.visibleData.length, 'Bubble visibleData length').to.equal(snapshot.visibleNodes);
    expect(xAxisNodes.length, 'Bubble State axis count').to.equal(bubble.X_categories.length);
    expect(String(bubble.cy.getElementById('x_axis_Label').data('label') || ''), 'Bubble X axis label').to.equal('State');
  });
};

describe('Journey Flow - Bubble Timeline Oracle', () => {
  const profile = getProfile('timeline-covid-node-link');

  it('applies deterministic uploaded timeline checkpoints on Bubble while keeping rendered membership aligned with the oracle', () => {
    const timeline = profile.expectations.timeline;
    expect(timeline, 'timeline expectation').to.exist;

    const oracleSteps: OracleStep[] = [
      {
        id: 'timeline-enabled',
        kind: 'set-timeline-field',
        field: timeline!.field,
      },
      ...timeline!.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        kind: 'set-timeline-date' as const,
        date: checkpoint.date,
      })),
      {
        id: 'timeline-disabled',
        kind: 'set-timeline-field',
        field: 'None',
      },
    ];

    computeOracleForProfile(profile, oracleSteps);

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    setBubbleXAxis('State', 'State');
    cy.closeSettingsPane('Bubble Settings');

    getOracleSnapshot().then((snapshot) => {
      assertBubbleMatchesOracleSnapshot(snapshot);
    });

    setTimelineField(timeline!.field);

    getOracleSnapshot('oracleResult', 'timeline-enabled').then((snapshot) => {
      assertBubbleMatchesOracleSnapshot(snapshot);
    });

    timeline!.checkpoints.forEach((checkpoint) => {
      setTimelineDate(checkpoint.date);

      getOracleSnapshot('oracleResult', checkpoint.id).then((snapshot) => {
        assertBubbleMatchesOracleSnapshot(snapshot);
      });
    });

    setTimelineField('None');

    getOracleSnapshot('oracleResult', 'timeline-disabled').then((snapshot) => {
      assertBubbleMatchesOracleSnapshot(snapshot);
    });
  });
});
