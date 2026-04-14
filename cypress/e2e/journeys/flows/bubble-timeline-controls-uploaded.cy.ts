/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  openGlobalStylingTab,
  setTimelineDate,
  setTimelineField,
} from '../../../support/journey-helpers';

type WinWithBubble = Window & {
  commonService: any;
};

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const hexToRgbString = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
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

const changeColorTableEntry = (tableSelector: string, value: string, nextColor: string): void => {
  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .closest('tr')
    .find('input[type="color"]')
    .should('have.length', 1)
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = nextColor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get(`${tableSelector} td[data-value="${value}"]`)
    .closest('tr')
    .find('input[type="color"]')
    .should('have.value', nextColor);
};

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

const configureBubbleForTimeline = (collapsed: boolean): void => {
  openBubbleSettingsDialog();
  setBubbleAxis('#bubble-axis-x', 'State', 'bubble-x', 'State');
  setBubbleAxis('#bubble-axis-y', 'None', 'bubble-y', 'None');

  if (collapsed) {
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
  } else {
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', false);
  }

  cy.closeSettingsPane('Bubble Settings');
};

const assertExpandedBubbleTimelineAligned = (expectedVisibleNodes?: number): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithBubble;
    const visibleNodes = typedWindow.commonService.getVisibleNodes();
    const bubble = typedWindow.commonService.visuals.bubble;
    const renderedNodes = getBubbleDataNodes(bubble);

    expect(renderedNodes.length, 'rendered Bubble nodes stay aligned with visible nodes').to.equal(visibleNodes.length);
    if (expectedVisibleNodes !== undefined) {
      expect(visibleNodes.length, 'visible nodes at timeline checkpoint').to.equal(expectedVisibleNodes);
    }
  });
};

const assertCollapsedBubbleTimelineAligned = (): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithBubble;
    const visibleNodes = typedWindow.commonService.getVisibleNodes();
    const bubble = typedWindow.commonService.visuals.bubble;
    const renderedNodes = getBubbleDataNodes(bubble);
    const aggregateTotal = bubble.visibleData.reduce((sum: number, node: any) => sum + Number(node.totalCount || 0), 0);

    expect(renderedNodes.length, 'collapsed rendered Bubble aggregates').to.be.lessThan(visibleNodes.length);
    expect(aggregateTotal, 'collapsed Bubble aggregate totalCount sum').to.equal(visibleNodes.length);

    bubble.visibleData.forEach((aggregateNode: any) => {
      const renderedNode = bubble.cy.getElementById(aggregateNode.id);
      expect(renderedNode.empty(), `collapsed Bubble aggregate ${aggregateNode.id}`).to.equal(false);
      expect(
        Number(renderedNode.data('nodeSize')),
        `collapsed Bubble nodeSize for ${aggregateNode.id}`,
      ).to.be.closeTo(bubble.nodeSize * Math.sqrt(Number(aggregateNode.totalCount || 0)), 0.001);
    });
  });
};

const clickTimelineSliderAtDate = (date: string): void => {
  cy.window().then((win: unknown) => {
    const microbeTrace = (win as WinWithBubble).commonService.visuals.microbeTrace;
    const targetDate = new Date(date);
    const targetX = Math.round(Number(microbeTrace.xAttribute(targetDate)));
    const expectedLabel = String(microbeTrace.handleDateFormat(targetDate));

    cy.get('#global-timeline svg line.track-overlay').first().click(targetX, 0, { force: true });
    cy.get('svg g.slider text.label').should('have.text', expectedLabel);
  });

  cy.window()
    .its('commonService.session.state.timeEnd')
    .should((value) => {
      expect(new Date(value as string | number | Date).toDateString(), 'timeline slider date')
        .to.equal(new Date(date).toDateString());
    });
};

describe('Journey Flow - Bubble uploaded timeline controls', () => {
  const profile = getProfile('timeline-covid-node-link');
  const timeline = profile.expectations.timeline!;
  const startCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-start') ?? timeline.checkpoints[0];
  const midCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-mid') ?? timeline.checkpoints[0];
  const recoloredNodeId = 'MZ415508';

  it('keeps Bubble timeline play/pause and slider jumps aligned with uploaded visible membership', () => {
    let initialLabel = '';
    let initialTime = 0;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();
    configureBubbleForTimeline(false);

    setTimelineField(timeline.field);
    assertExpandedBubbleTimelineAligned();

    cy.get('svg g.slider text.label', { timeout: 15000 })
      .invoke('text')
      .then((text) => {
        initialLabel = String(text).trim();
      });

    cy.window().then((win: unknown) => {
      const value = (win as WinWithBubble).commonService.session.state.timeEnd;
      initialTime = new Date(value as string | number | Date).getTime();
    });

    cy.get('#timeline-play-button').should('contain', 'Play').click();
    cy.get('#timeline-play-button', { timeout: 15000 }).should('contain', 'Pause');

    cy.window({ timeout: 15000 }).should((win: unknown) => {
      const nextValue = (win as WinWithBubble).commonService.session.state.timeEnd;
      const nextTime = new Date(nextValue as string | number | Date).getTime();
      expect(Number.isFinite(nextTime), 'timeline playback date').to.equal(true);
      expect(nextTime, 'timeline playback advanced the current date').not.to.equal(initialTime);
    });

    cy.get('#timeline-play-button').should('contain', 'Pause').click();
    cy.get('#timeline-play-button').should('contain', 'Play');

    cy.get('svg g.slider text.label')
      .invoke('text')
      .should((text) => {
        expect(String(text).trim(), 'timeline label after play/pause').not.to.equal(initialLabel);
      });

    assertExpandedBubbleTimelineAligned();

    clickTimelineSliderAtDate(midCheckpoint.date);
    assertMetricCount('#numberOfNodes', midCheckpoint.after.nodes!);
    assertExpandedBubbleTimelineAligned(midCheckpoint.after.nodes);

    clickTimelineSliderAtDate(startCheckpoint.date);
    assertMetricCount('#numberOfNodes', startCheckpoint.after.nodes!);
    assertExpandedBubbleTimelineAligned(startCheckpoint.after.nodes);
  });

  it('keeps collapsed Bubble timeline playback aligned with aggregate totals and scaled node sizes', () => {
    let initialLabel = '';
    let initialTime = 0;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();
    configureBubbleForTimeline(true);

    setTimelineField(timeline.field);

    cy.get('svg g.slider text.label', { timeout: 15000 })
      .invoke('text')
      .then((text) => {
        initialLabel = String(text).trim();
      });

    cy.window().then((win: unknown) => {
      const value = (win as WinWithBubble).commonService.session.state.timeEnd;
      initialTime = new Date(value as string | number | Date).getTime();
    });

    cy.get('#timeline-play-button').should('contain', 'Play').click();
    cy.get('#timeline-play-button', { timeout: 15000 }).should('contain', 'Pause');

    cy.window({ timeout: 15000 }).should((win: unknown) => {
      const nextValue = (win as WinWithBubble).commonService.session.state.timeEnd;
      const nextTime = new Date(nextValue as string | number | Date).getTime();
      expect(Number.isFinite(nextTime), 'collapsed timeline playback date').to.equal(true);
      expect(nextTime, 'collapsed timeline playback advanced the current date').not.to.equal(initialTime);
    });

    cy.get('#timeline-play-button').should('contain', 'Pause').click();
    cy.get('#timeline-play-button').should('contain', 'Play');

    cy.get('svg g.slider text.label')
      .invoke('text')
      .should((text) => {
        expect(String(text).trim(), 'collapsed timeline label after play/pause').not.to.equal(initialLabel);
      });

    setTimelineDate(midCheckpoint.date);
    assertMetricCount('#numberOfNodes', midCheckpoint.after.nodes!);
    assertCollapsedBubbleTimelineAligned();
  });

  it('keeps edited Bubble node colors after timeline mode is turned off', () => {
    const updatedPennsylvaniaColor = '#777777';
    const expectedPennsylvaniaColor = normalizeColor(hexToRgbString(updatedPennsylvaniaColor));

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();
    configureBubbleForTimeline(false);

    setTimelineField(timeline.field);
    setTimelineDate(midCheckpoint.date);
    assertExpandedBubbleTimelineAligned(midCheckpoint.after.nodes);

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'State');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'State');
    cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');
    changeColorTableEntry('#node-color-table', 'Pennsylvania', updatedPennsylvaniaColor);
    cy.closeGlobalSettings();

    cy.window().should((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const renderedNode = bubble.cy.getElementById(recoloredNodeId);

      expect(renderedNode.empty(), `recolored Bubble node ${recoloredNodeId} during timeline`).to.equal(false);
      expect(normalizeColor(renderedNode.style('background-color')), `timeline Bubble color for ${recoloredNodeId}`)
        .to.equal(expectedPennsylvaniaColor);
    });

    setTimelineField('None');

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['node-timeline-variable']).to.equal('None');
        expect(widgets['timeline-date-field']).to.equal('None');
      });

    cy.window().should((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const renderedNode = bubble.cy.getElementById(recoloredNodeId);

      expect(renderedNode.empty(), `recolored Bubble node ${recoloredNodeId} after timeline teardown`).to.equal(false);
      expect(normalizeColor(renderedNode.style('background-color')), `post-teardown Bubble color for ${recoloredNodeId}`)
        .to.equal(expectedPennsylvaniaColor);
    });

    openGlobalStylingTab();
    cy.get('#node-color-table td[data-value="Pennsylvania"]')
      .closest('tr')
      .find('input[type="color"]')
      .should('have.value', updatedPennsylvaniaColor);
    cy.closeGlobalSettings();
  });
});
