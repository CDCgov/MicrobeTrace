/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goToTableView,
  launchProfileToTwoD,
  openGlobalStylingTab,
  setTimelineDate,
  setTimelineField,
} from '../../../support/journey-helpers';
import {
  assertTableDatasetMatchesSession,
  selectTableDataset,
} from '../../../support/table-helpers';

type WinWithMT = Window & {
  commonService: any;
};

type CountMap = Record<string, number>;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector, { timeout: 15000 })
    .scrollIntoView()
    .should('be.visible')
    .click({ force: true });
  cy.get('.p-select-overlay:visible', { timeout: 15000 })
    .last()
    .should('be.visible')
    .within(() => {
      cy.contains(
        'li[role="option"]',
        new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`),
        { timeout: 15000 },
      )
      .scrollIntoView()
      .click({ force: true });
    });
  cy.get('body').find('.p-select-overlay:visible').should('have.length', 0);
};

const readColorTableCounts = ($table: JQuery<HTMLElement>): CountMap => {
  const counts: CountMap = {};

  $table.find('tr').each((index, row) => {
    if (index === 0) return;

    const $row = Cypress.$(row);
    const value = String($row.find('td[data-value]').attr('data-value') || '');
    if (!value) return;

    const countText = String($row.find('td.tableCount').first().text() || '').trim();
    const count = parseInt(countText.replace(/,/g, ''), 10);

    counts[value] = count;
  });

  return counts;
};

const readVisibleNodeCounts = (win: WinWithMT, field: string): { counts: CountMap; total: number } => {
  const nodes = win.commonService.getVisibleNodes();
  const counts: CountMap = {};

  nodes.forEach((node: any) => {
    const value = String(node?.[field]);
    counts[value] = (counts[value] ?? 0) + 1;
  });

  return { counts, total: nodes.length };
};

const assertNodeColorTableMatchesVisibleNodes = (field: string, label: string): void => {
  cy.window().then((win: unknown) => {
    const { counts: expectedCounts, total } = readVisibleNodeCounts(win as WinWithMT, field);

    cy.get('#key-tables-node-table', { timeout: 15000 }).should(($table) => {
      const tableCounts = readColorTableCounts($table);
      const tableTotal = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);

      expect(tableTotal, `${label} node color table total`).to.equal(total);
      expect(Object.keys(tableCounts).sort(), `${label} node color categories`)
        .to.deep.equal(Object.keys(expectedCounts).sort());

      Object.entries(expectedCounts).forEach(([value, count]) => {
        expect(tableCounts[value], `${label} node color count for ${value}`).to.equal(count);
      });
    });
  });
};

const readVisibleLinkCounts = (win: WinWithMT, field: string): { counts: CountMap; total: number } => {
  const links = win.commonService.getVisibleLinksForCurrentTimeline();
  const counts: CountMap = {};

  links.forEach((link: any) => {
    const value = String(link?.[field]);
    counts[value] = (counts[value] ?? 0) + 1;
  });

  return { counts, total: links.length };
};

const assertLinkColorTableMatchesVisibleLinks = (field: string, label: string): void => {
  cy.window().then((win: unknown) => {
    const { counts: expectedCounts, total } = readVisibleLinkCounts(win as WinWithMT, field);

    cy.get('#key-tables-link-table', { timeout: 15000 }).should(($table) => {
      const tableCounts = readColorTableCounts($table);
      const tableTotal = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);

      expect(tableTotal, `${label} link color table total`).to.equal(total);
      expect(Object.keys(tableCounts).sort(), `${label} link color categories`)
        .to.deep.equal(Object.keys(expectedCounts).sort());

      Object.entries(expectedCounts).forEach(([value, count]) => {
        expect(tableCounts[value], `${label} link color count for ${value}`).to.equal(count);
      });
    });
  });
};

describe('Journey Flow - Timeline key table refresh', () => {
  const profile = getProfile('timeline-covid-node-link');
  const timeline = profile.expectations.timeline!;
  const midCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-mid') ?? timeline.checkpoints[0];
  const maxCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-max') ?? timeline.checkpoints[timeline.checkpoints.length - 1];
  const nodeColorField = 'State';
  const linkColorField = 'cluster';

  it('refreshes node and link color table counts when timeline visibility changes', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    setTimelineField(timeline.field);

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', nodeColorField);
    selectPrimeOption('#link-tooltip-variable', 'Cluster');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', nodeColorField);
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', linkColorField);
    selectPrimeOption('#link-color-scale-mode', 'Categorical');
    cy.get('#key-tables-node-table', { timeout: 15000 }).should('be.visible');
    cy.get('#key-tables-link-table', { timeout: 15000 }).should('be.visible');
    assertNodeColorTableMatchesVisibleNodes(nodeColorField, 'timeline max');
    assertLinkColorTableMatchesVisibleLinks(linkColorField, 'timeline max');
    cy.closeGlobalSettings();

    setTimelineDate(midCheckpoint.date);
    assertMetricCount('#numberOfNodes', midCheckpoint.after.nodes!);
    assertMetricCount('#numberOfVisibleLinks', midCheckpoint.after.visibleLinks!);
    assertNodeColorTableMatchesVisibleNodes(nodeColorField, 'timeline midpoint');
    assertLinkColorTableMatchesVisibleLinks(linkColorField, 'timeline midpoint');

    setTimelineField('None');
    assertMetricCount('#numberOfNodes', maxCheckpoint.after.nodes!);
    assertMetricCount('#numberOfVisibleLinks', maxCheckpoint.after.visibleLinks!);
    assertNodeColorTableMatchesVisibleNodes(nodeColorField, 'timeline disabled');
    assertLinkColorTableMatchesVisibleLinks(linkColorField, 'timeline disabled');

    setTimelineField(timeline.field);
    setTimelineDate(midCheckpoint.date);

    goToTableView();
    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');

    setTimelineField('None');
    assertTableDatasetMatchesSession('Link');
  });
});
