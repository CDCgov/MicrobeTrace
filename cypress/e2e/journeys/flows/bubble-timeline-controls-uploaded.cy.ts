/// <reference types="cypress" />

import moment from 'moment';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  computeOracleForProfile,
  getOracleSnapshot,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  openGlobalStylingTab,
  setTimelineDate,
  setTimelineField,
  setTimelineRange,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

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
const visibleSelectOverlay = '.p-select-overlay:visible';

const closeVisiblePrimeOverlays = (): void => {
  cy.get('body').then(($body) => {
    if (!$body.find(visibleSelectOverlay).length) return;
    cy.get('body').type('{esc}', { force: true });
  });
};

const clickVisiblePrimeOption = (label: string): void => {
  cy.get(visibleSelectOverlay, { timeout: 15000 })
    .last()
    .find('p-selectitem')
    .contains('li', new RegExp(`^${escapeRegExp(label)}$`))
    .click({ force: true });
  closeVisiblePrimeOverlays();
};

const selectPrimeOption = (selector: string, label: string): void => {
  closeVisiblePrimeOverlays();
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

const formatDateInput = (date: string): string => moment(date).format('YYYY-MM-DD');

const dragTimelineRangeHandleToDate = (
  selector: '.timeline-range-start-handle' | '.timeline-range-end-handle',
  date: string,
): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithBubble;
    const microbeTrace = typedWindow.commonService.visuals.microbeTrace;
    const targetDate = moment(date).toDate();
    const targetX = Number(microbeTrace.xAttribute(targetDate));
    const handle = typedWindow.document.querySelector(selector) as SVGPathElement | null;
    const slider = typedWindow.document.querySelector('#global-timeline svg g.slider') as SVGGElement | null;
    const svg = typedWindow.document.querySelector('#global-timeline svg') as SVGSVGElement | null;

    expect(handle, `${selector} handle`).to.exist;
    expect(slider, 'timeline slider group').to.exist;
    expect(svg, 'timeline svg').to.exist;

    const toScreenPoint = (x: number, y: number) => {
      const point = svg!.createSVGPoint();
      point.x = x;
      point.y = y;
      return point.matrixTransform(slider!.getScreenCTM()!);
    };
    const currentPoint = toScreenPoint(Number(handle!.getAttribute('data-x') || 0), -12);
    const targetPoint = toScreenPoint(targetX, 0);
    const dispatchMouse = (target: EventTarget, type: string, point: DOMPoint, buttons: number) => {
      target.dispatchEvent(new typedWindow.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: typedWindow,
        button: 0,
        buttons,
        clientX: point.x,
        clientY: point.y,
      }));
    };

    dispatchMouse(handle!, 'mousedown', currentPoint, 1);
    dispatchMouse(typedWindow.document, 'mousemove', targetPoint, 1);
    dispatchMouse(typedWindow.document, 'mouseup', targetPoint, 0);
  });
};

describe('Journey Flow - Bubble uploaded timeline controls', () => {
  const profile = getProfile('timeline-covid-node-link');
  const timeline = profile.expectations.timeline!;
  const startCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-start') ?? timeline.checkpoints[0];
  const midCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-mid') ?? timeline.checkpoints[0];
  const maxCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-max') ?? timeline.checkpoints[timeline.checkpoints.length - 1];
  const playbackEndDate = '7/17/2021';
  const recoloredNodeId = 'MZ415508';

  it('keeps Bubble timeline play/pause and slider jumps aligned with uploaded visible membership', () => {
    let initialTime = 0;
    let selectedStartTime = 0;
    let pausedTime = 0;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();
    configureBubbleForTimeline(false);

    setTimelineField(timeline.field);
    assertExpandedBubbleTimelineAligned();

    cy.window().then((win: unknown) => {
      const state = (win as WinWithBubble).commonService.session.state;
      initialTime = new Date(state.timeEnd as string | number | Date).getTime();
      selectedStartTime = new Date(state.timeStart as string | number | Date).getTime();
    });

    cy.get('#timeline-play-button').should('contain', 'Play').click();
    cy.get('#timeline-play-button', { timeout: 15000 }).should('contain', 'Pause');

    cy.window({ timeout: 15000 }).should((win: unknown) => {
      const nextValue = (win as WinWithBubble).commonService.session.state.timeEnd;
      const nextTime = new Date(nextValue as string | number | Date).getTime();
      expect(Number.isFinite(nextTime), 'timeline playback date').to.equal(true);
      expect(nextTime, 'timeline playback advanced the current date').not.to.equal(initialTime);
      expect(nextTime, 'timeline playback advanced past the selected start').to.be.greaterThan(selectedStartTime);
    });

    cy.get('#timeline-play-button').should('contain', 'Pause').click();
    cy.get('#timeline-play-button').should('contain', 'Play');
    cy.window().then((win: unknown) => {
      const value = (win as WinWithBubble).commonService.session.state.timeEnd;
      pausedTime = new Date(value as string | number | Date).getTime();
      expect(pausedTime, 'paused timeline date').to.be.greaterThan(selectedStartTime);
    });

    cy.get('#timeline-play-button').click();
    cy.get('#timeline-play-button', { timeout: 15000 }).should('contain', 'Pause');
    cy.window().should((win: unknown) => {
      const value = (win as WinWithBubble).commonService.session.state.timeEnd;
      const resumedTime = new Date(value as string | number | Date).getTime();
      expect(resumedTime, 'timeline resumes from the paused date').to.be.at.least(pausedTime);
      expect(resumedTime, 'timeline does not restart from selected start').to.be.greaterThan(selectedStartTime);
    });
    cy.get('#timeline-play-button').click();
    cy.get('#timeline-play-button').should('contain', 'Play');

    cy.window().then((win: unknown) => {
      const value = (win as WinWithBubble).commonService.session.state.timeEnd;
      const expectedLabel = moment(value as string | number | Date).format('MMM D');
      cy.get('svg g.slider text.label').should('have.text', expectedLabel);
    });

    assertExpandedBubbleTimelineAligned();

    clickTimelineSliderAtDate(midCheckpoint.date);
    assertMetricCount('#numberOfNodes', midCheckpoint.after.nodes!);
    assertExpandedBubbleTimelineAligned(midCheckpoint.after.nodes);

    clickTimelineSliderAtDate(startCheckpoint.date);
    assertMetricCount('#numberOfNodes', startCheckpoint.after.nodes!);
    assertExpandedBubbleTimelineAligned(startCheckpoint.after.nodes);
  });

  it('links timeline range inputs, draggable handles, reset, and bounded playback', () => {
    const rangeSnapshotId = 'timeline-mid-to-max-range';
    const draggedRangeSnapshotId = 'timeline-dragged-start-to-max-range';
    const oracleSteps: OracleStep[] = [
      {
        id: 'timeline-enabled',
        kind: 'set-timeline-field',
        field: timeline.field,
      },
      {
        id: rangeSnapshotId,
        kind: 'set-timeline-range',
        start: midCheckpoint.date,
        end: maxCheckpoint.date,
      },
      {
        id: draggedRangeSnapshotId,
        kind: 'set-timeline-range',
        start: startCheckpoint.date,
        end: maxCheckpoint.date,
      },
    ];

    computeOracleForProfile(profile, oracleSteps);

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();
    configureBubbleForTimeline(false);

    setTimelineField(timeline.field);
    setTimelineRange(midCheckpoint.date, maxCheckpoint.date);

    cy.openGlobalSettings();
    cy.contains('.p-dialog:visible .nav-link', 'Timeline').click({ force: true });
    cy.get('.p-dialog:visible #timeline-range-start').should('have.value', formatDateInput(midCheckpoint.date));
    cy.get('.p-dialog:visible #timeline-range-end').should('have.value', formatDateInput(maxCheckpoint.date));
    cy.closeGlobalSettings();

    getOracleSnapshot('oracleResult', rangeSnapshotId).then((snapshot) => {
      assertMetricCount('#numberOfNodes', snapshot.visibleNodes);
      assertExpandedBubbleTimelineAligned(snapshot.visibleNodes);
    });

    cy.window().then((win: unknown) => {
      const microbeTrace = (win as WinWithBubble).commonService.visuals.microbeTrace;
      const expectedStartX = Number(microbeTrace.xAttribute(moment(midCheckpoint.date).toDate()));
      const expectedEndX = Number(microbeTrace.xAttribute(moment(maxCheckpoint.date).toDate()));

      cy.get('#global-timeline svg .timeline-range-start-handle')
        .should(($handle) => {
          expect(Number($handle.attr('data-x')), 'range start handle x').to.be.closeTo(expectedStartX, 1);
        });
      cy.get('#global-timeline svg .timeline-range-end-handle')
        .should(($handle) => {
          expect(Number($handle.attr('data-x')), 'range end handle x').to.be.closeTo(expectedEndX, 1);
        });
    });

    setTimelineRange(midCheckpoint.date, playbackEndDate);
    cy.window().then((win: unknown) => {
      const microbeTrace = (win as WinWithBubble).commonService.visuals.microbeTrace;
      microbeTrace.timelineSpeed = 1;
    });
    cy.get('#timeline-play-button').should('contain', 'Play').click();
    cy.window().should((win: unknown) => {
      const state = (win as WinWithBubble).commonService.session.state;
      expect(moment(state.timeStart).format('M/D/YYYY'), 'timeline playback range start')
        .to.equal(moment(midCheckpoint.date).format('M/D/YYYY'));
      expect(moment(state.timeEnd).format('M/D/YYYY'), 'timeline playback starts at selected start')
        .to.equal(moment(midCheckpoint.date).format('M/D/YYYY'));
    });
    cy.get('#timeline-play-button', { timeout: 20000 }).should('contain', 'Play');
    cy.window().should((win: unknown) => {
      const state = (win as WinWithBubble).commonService.session.state;
      expect(moment(state.timeEnd).format('M/D/YYYY'), 'timeline playback stops at selected end')
        .to.equal(moment(playbackEndDate).format('M/D/YYYY'));
    });

    setTimelineRange(midCheckpoint.date, maxCheckpoint.date);
    dragTimelineRangeHandleToDate('.timeline-range-start-handle', startCheckpoint.date);

    cy.openGlobalSettings();
    cy.contains('.p-dialog:visible .nav-link', 'Timeline').click({ force: true });
    cy.get('.p-dialog:visible #timeline-range-start').should('have.value', formatDateInput(startCheckpoint.date));
    cy.get('.p-dialog:visible #timeline-range-end').should('have.value', formatDateInput(maxCheckpoint.date));
    cy.closeGlobalSettings();

    getOracleSnapshot('oracleResult', draggedRangeSnapshotId).then((snapshot) => {
      assertMetricCount('#numberOfNodes', snapshot.visibleNodes);
      assertExpandedBubbleTimelineAligned(snapshot.visibleNodes);
    });

    setTimelineRange(midCheckpoint.date, maxCheckpoint.date);
    cy.openGlobalSettings();
    cy.contains('.p-dialog:visible .nav-link', 'Timeline').click({ force: true });
    cy.get('.p-dialog:visible #timeline-range-reset').click({ force: true });
    cy.get('.p-dialog:visible #timeline-range-start').should('have.value', formatDateInput(startCheckpoint.date));
    cy.get('.p-dialog:visible #timeline-range-end').should('have.value', formatDateInput(maxCheckpoint.date));
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfNodes', maxCheckpoint.after.nodes!);
    assertExpandedBubbleTimelineAligned(maxCheckpoint.after.nodes);
  });

  it('keeps collapsed Bubble timeline playback aligned with aggregate totals and scaled node sizes', () => {
    let initialTime = 0;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();
    configureBubbleForTimeline(true);

    setTimelineField(timeline.field);

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

    cy.window().then((win: unknown) => {
      const value = (win as WinWithBubble).commonService.session.state.timeEnd;
      const expectedLabel = moment(value as string | number | Date).format('MMM D');
      cy.get('svg g.slider text.label').should('have.text', expectedLabel);
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
    cy.get('#key-tables-node-table', { timeout: 15000 }).should('be.visible');
    changeColorTableEntry('#key-tables-node-table', 'Pennsylvania', updatedPennsylvaniaColor);
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
    cy.get('#key-tables-node-table td[data-value="Pennsylvania"]')
      .closest('tr')
      .find('input[type="color"]')
      .should('have.value', updatedPennsylvaniaColor);
    cy.closeGlobalSettings();
  });
});
