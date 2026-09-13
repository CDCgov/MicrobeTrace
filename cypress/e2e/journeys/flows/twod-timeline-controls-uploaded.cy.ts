/// <reference types="cypress" />

import moment from 'moment';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  openGlobalStylingTab,
  setTimelineField,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

type WinWithCy = Window & {
  commonService: any;
  cytoscapeInstance?: any;
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

const normalizeLogicalLinkId = (value: string): string => String(value || '').replace(/-\d+$/, '');

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay:visible', { timeout: 15000 })
    .last()
    .should('be.visible')
    .within(() => {
      cy.contains(
        'li[role="option"]',
        new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`),
        { timeout: 15000 },
      ).click({ force: true });
    });
  cy.get('body').find('.p-select-overlay:visible').should('have.length', 0);
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector, { timeout: 15000 })
    .scrollIntoView()
    .should('be.visible')
    .click({ force: true });
  clickVisiblePrimeOption(label);
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

const getRenderedVisibleNodeIds = (win: WinWithCy): string[] => {
  const cyInstance = win.cytoscapeInstance;
  expect(cyInstance, 'cytoscapeInstance').to.exist;

  return cyInstance
    .nodes(':visible')
    .filter((node: any) => node.children().length === 0)
    .map((node: any) => String(node.id()))
    .sort();
};

const getRenderedVisibleLinkIds = (win: WinWithCy): string[] => {
  const cyInstance = win.cytoscapeInstance;
  expect(cyInstance, 'cytoscapeInstance').to.exist;

  return Array.from(new Set(
    cyInstance
      .edges(':visible')
      .map((edge: any) => normalizeLogicalLinkId(String(edge.id()))),
  )).sort();
};

const getSessionVisibleNodeIds = (win: WinWithCy): string[] =>
  win.commonService.getVisibleNodes()
    .map((node: any) => String(node?._id ?? node?.id ?? ''))
    .filter(Boolean)
    .sort();

const assertTwoDTimelineNodeMembershipAligned = (): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithCy;

    expect(
      getRenderedVisibleNodeIds(typedWindow),
      'rendered 2D node ids stay aligned with session-visible nodes',
    ).to.deep.equal(getSessionVisibleNodeIds(typedWindow));
  });
};

const assertRenderedLogicalLinkCountMatchesMetric = (): void => {
  cy.window().then((win: unknown) => {
    const renderedLinkCount = getRenderedVisibleLinkIds(win as WinWithCy).length;

    cy.get('#numberOfVisibleLinks').should(($metric) => {
      const metricValue = parseInt(String($metric.text()).replace(/,/g, ''), 10);
      expect(metricValue, 'rendered 2D logical link count matches the visible-link metric').to.equal(renderedLinkCount);
    });
  });
};

const clickTimelineSliderAtDate = (date: string): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithCy;
    const microbeTrace = typedWindow.commonService.visuals.microbeTrace;
    const targetDate = moment(date).toDate();
    const targetX = Number(microbeTrace.xAttribute(targetDate));
    const expectedLabel = moment(date).format('MMM D');

    cy.get('#global-timeline svg line.track-overlay').first().click(targetX, 0, { force: true });
    cy.get('svg g.slider text.label').should('have.text', expectedLabel);
  });

  cy.window()
    .its('commonService.session.state.timeEnd')
    .should((value) => {
      expect(moment(value as string | number | Date).format('M/D/YYYY'), 'timeline slider date')
        .to.equal(moment(date).format('M/D/YYYY'));
    });
};

const assertRenderedNodeColor = (nodeId: string, expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const cyInstance = (win as WinWithCy).cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const node = cyInstance.getElementById(nodeId);
    expect(node.empty(), `rendered 2D node ${nodeId}`).to.equal(false);
    expect(normalizeColor(node.style('background-color')), `2D node color for ${nodeId}`).to.equal(expectedColor);
  });
};

const assertRenderedLinkColor = (linkId: string, expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const cyInstance = (win as WinWithCy).cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const edge = cyInstance
      .edges()
      .toArray()
      .find((candidate: any) => normalizeLogicalLinkId(String(candidate.id())) === normalizeLogicalLinkId(linkId));

    expect(Boolean(edge), `rendered 2D link ${linkId}`).to.equal(true);
    expect(normalizeColor(String(edge.style('line-color') || '')), `2D link color for ${linkId}`).to.equal(expectedColor);
  });
};

const assertNoRuntimeErrorBanner = (): void => {
  cy.get('.runtime-error-banner').should('not.exist');
};

const assertProcessingModalClosed = (): void => {
  cy.get('body').then(($body) => {
    if ($body.find('#loading-information-modal').length > 0) {
      cy.get('#loading-information-modal').should('not.be.visible');
    }
  });
};

const waitForTwoDRenderIdle = (timeout = 30000): void => {
  cy.window({ timeout })
    .its('commonService.session.network.rendering')
    .should('equal', false);
};

describe('Journey Flow - 2D uploaded timeline controls', () => {
  const profile = getProfile('timeline-covid-node-link');
  const timeline = profile.expectations.timeline!;
  const startCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-start') ?? timeline.checkpoints[0];
  const midCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-mid') ?? timeline.checkpoints[0];

  it('keeps 2D timeline play/pause and manual slider checkpoints aligned on uploaded data', () => {
    let initialTime = 0;

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
      {
        id: startCheckpoint.id,
        kind: 'set-timeline-date',
        date: startCheckpoint.date,
      },
    ];

    computeOracleForProfile(profile, oracleSteps);

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    setTimelineField(timeline.field);

    getOracleSnapshot('oracleResult', 'timeline-enabled').then((snapshot) => {
      assertNetworkMatchesOracleSnapshot(snapshot);
    });

    cy.window().then((win: unknown) => {
      const value = (win as WinWithCy).commonService.session.state.timeEnd;
      initialTime = new Date(value as string | number | Date).getTime();
    });

    cy.get('#timeline-play-button').should('contain', 'Play').click();
    cy.get('#timeline-play-button', { timeout: 15000 }).should('contain', 'Pause');

    cy.window({ timeout: 15000 }).should((win: unknown) => {
      const nextValue = (win as WinWithCy).commonService.session.state.timeEnd;
      const nextTime = new Date(nextValue as string | number | Date).getTime();
      expect(Number.isFinite(nextTime), 'timeline playback date').to.equal(true);
      expect(nextTime, 'timeline playback advanced the current date').not.to.equal(initialTime);
    });

    cy.get('#timeline-play-button').should('contain', 'Pause').click();
    cy.get('#timeline-play-button').should('contain', 'Play');

    cy.window().then((win: unknown) => {
      const value = (win as WinWithCy).commonService.session.state.timeEnd;
      const expectedLabel = moment(value as string | number | Date).format('MMM D');
      cy.get('svg g.slider text.label').should('have.text', expectedLabel);
    });

    assertTwoDTimelineNodeMembershipAligned();
    assertRenderedLogicalLinkCountMatchesMetric();

    clickTimelineSliderAtDate(midCheckpoint.date);
    getOracleSnapshot('oracleResult', midCheckpoint.id).then((snapshot) => {
      assertNetworkMatchesOracleSnapshot(snapshot);
    });

    clickTimelineSliderAtDate(startCheckpoint.date);
    getOracleSnapshot('oracleResult', startCheckpoint.id).then((snapshot) => {
      assertNetworkMatchesOracleSnapshot(snapshot);
    });
  });

  it('keeps edited 2D node colors after timeline mode is turned off', () => {
    const updatedNodeColor = '#123456';
    const expectedNodeColor = normalizeColor(hexToRgbString(updatedNodeColor));
    let targetClusterValue = '';
    let targetNodeId = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    setTimelineField(timeline.field);
    waitForTwoDRenderIdle();
    assertNoRuntimeErrorBanner();
    clickTimelineSliderAtDate(midCheckpoint.date);
    waitForTwoDRenderIdle();
    assertNoRuntimeErrorBanner();
    assertTwoDTimelineNodeMembershipAligned();
    assertRenderedLogicalLinkCountMatchesMetric();

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Cluster');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'cluster');
    selectPrimeOption('#node-color-scale-mode', 'Categorical');

    cy.window().then((win: unknown) => {
      const cyInstance = (win as WinWithCy).cytoscapeInstance;
      expect(cyInstance, 'cytoscapeInstance').to.exist;

      const visibleNode = cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .first();

      expect(visibleNode.empty(), 'visible 2D node at midpoint timeline checkpoint').to.equal(false);
      targetClusterValue = String(visibleNode.data('cluster'));
      expect(targetClusterValue, 'visible cluster value to recolor').not.to.equal('');
    });

    cy.then(() => {
      expect(targetClusterValue, 'captured visible cluster value').not.to.equal('');
      changeColorTableEntry('#key-tables-node-table', targetClusterValue, updatedNodeColor);
    });

    cy.window().should((win: unknown) => {
      const cyInstance = (win as WinWithCy).cytoscapeInstance;
      expect(cyInstance, 'cytoscapeInstance').to.exist;

      const recoloredNode = cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .toArray()
        .find((node: any) => normalizeColor(String(node.style('background-color') || '')) === expectedNodeColor);

      expect(Boolean(recoloredNode), 'recolored 2D node during timeline mode').to.equal(true);
    });

    cy.window().then((win: unknown) => {
      const cyInstance = (win as WinWithCy).cytoscapeInstance;
      expect(cyInstance, 'cytoscapeInstance').to.exist;

      const recoloredNode = cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .toArray()
        .find((node: any) =>
          String(node.data('cluster')) === targetClusterValue &&
          normalizeColor(String(node.style('background-color') || '')) === expectedNodeColor,
        );

      expect(Boolean(recoloredNode), 'recolored 2D node to persist after teardown').to.equal(true);
      targetNodeId = String(recoloredNode.id());
      expect(targetNodeId, 'captured recolored 2D node id').not.to.equal('');
    });

    cy.contains('#global-settings-modal .nav-link', 'Timeline').click({ force: true });
    cy.get('#global-settings-modal #timeline-config').should('exist');
    cy.get('#node-timeline-variable').click({ force: true });
    clickVisiblePrimeOption('None');
    cy.closeGlobalSettings();

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['node-timeline-variable']).to.equal('None');
        expect(widgets['timeline-date-field']).to.equal('None');
      });
    waitForTwoDRenderIdle();
    assertNoRuntimeErrorBanner();

    cy.then(() => {
      expect(targetNodeId, 'captured recolored 2D node id after teardown').not.to.equal('');
      assertRenderedNodeColor(targetNodeId, expectedNodeColor);
    });
  });

  it('keeps edited 2D link colors after timeline mode is turned off', () => {
    const updatedLinkColor = '#0f4c81';
    const expectedLinkColor = normalizeColor(hexToRgbString(updatedLinkColor));
    let targetLinkRowIndex = -1;
    let targetLinkId = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    setTimelineField(timeline.field);
    waitForTwoDRenderIdle();
    assertNoRuntimeErrorBanner();
    assertProcessingModalClosed();

    clickTimelineSliderAtDate(midCheckpoint.date);
    waitForTwoDRenderIdle();
    assertNoRuntimeErrorBanner();
    assertProcessingModalClosed();
    assertTwoDTimelineNodeMembershipAligned();
    assertRenderedLogicalLinkCountMatchesMetric();

    openGlobalStylingTab();
    selectPrimeOption('#link-tooltip-variable', 'Cluster');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'cluster');
    selectPrimeOption('#link-color-scale-mode', 'Categorical');

    cy.get('#key-tables-link-table tr', { timeout: 15000 })
      .then(($rows) => {
        targetLinkRowIndex = Array.from($rows).findIndex((row) => {
          const hasColorInput = row.querySelector('input[type="color"]') !== null;
          return hasColorInput;
        });

        expect(targetLinkRowIndex, 'editable 2D link color-table row index at midpoint timeline checkpoint')
          .to.be.greaterThan(0);
      });

    cy.then(() => {
      expect(targetLinkRowIndex, 'captured editable 2D link color-table row index').to.be.greaterThan(0);
      cy.get('#key-tables-link-table tr')
        .eq(targetLinkRowIndex)
        .find('input[type="color"]')
        .should('have.length', 1)
        .then(($input) => {
          const input = $input.get(0) as HTMLInputElement;
          input.value = updatedLinkColor;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      cy.get('#key-tables-link-table tr')
        .eq(targetLinkRowIndex)
        .find('input[type="color"]')
        .should('have.value', updatedLinkColor);
    });

    waitForTwoDRenderIdle();
    assertNoRuntimeErrorBanner();
    assertProcessingModalClosed();

    cy.window().should((win: unknown) => {
      const cyInstance = (win as WinWithCy).cytoscapeInstance;
      expect(cyInstance, 'cytoscapeInstance').to.exist;

      const recoloredEdge = cyInstance
        .edges(':visible')
        .toArray()
        .find((edge: any) => normalizeColor(String(edge.style('line-color') || '')) === expectedLinkColor);

      expect(Boolean(recoloredEdge), 'recolored 2D link during timeline mode').to.equal(true);
      targetLinkId = String(recoloredEdge.id());
      expect(targetLinkId, 'captured recolored 2D link id').not.to.equal('');
    });

    cy.contains('#global-settings-modal .nav-link', 'Timeline').click({ force: true });
    cy.get('#global-settings-modal #timeline-config').should('exist');
    cy.get('#node-timeline-variable').click({ force: true });
    clickVisiblePrimeOption('None');
    cy.closeGlobalSettings();

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['node-timeline-variable']).to.equal('None');
        expect(widgets['timeline-date-field']).to.equal('None');
      });
    waitForTwoDRenderIdle();
    assertNoRuntimeErrorBanner();
    assertProcessingModalClosed();

    cy.then(() => {
      expect(targetLinkId, 'captured recolored 2D link id after teardown').not.to.equal('');
      assertRenderedLinkColor(targetLinkId, expectedLinkColor);
    });

    openGlobalStylingTab();
    cy.get('#key-tables-link-table input[type="color"]', { timeout: 15000 })
      .should(($inputs) => {
        const values = Array.from($inputs).map((input) => String((input as HTMLInputElement).value).toLowerCase());
        expect(values, 'rebuilt 2D link color-table values after timeline teardown').to.include(updatedLinkColor);
      });
    cy.closeGlobalSettings();
  });
});
