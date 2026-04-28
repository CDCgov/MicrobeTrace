/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  openGlobalStylingTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

type WinWithCy = Window & {
  commonService: any;
  cytoscapeInstance?: any;
};

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const normalizeLogicalLinkId = (value: string): string => String(value || '').replace(/-2$/, '');

const getLogicalLinkId = (candidate: { id?: any; source?: any; target?: any }): string =>
  normalizeLogicalLinkId(String(candidate.id ?? [candidate.source, candidate.target].sort().join('-')));

const normalizeExpectedColor = (value: string): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized.startsWith('#')) {
    return normalizeColor(normalized);
  }

  const expanded = normalized.length === 4
    ? normalized.slice(1).split('').map((char) => `${char}${char}`).join('')
    : normalized.slice(1);
  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return normalizeColor(`rgb(${red}, ${green}, ${blue})`);
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

describe('Journey Flow - 2D mixed-origin link coloring', () => {
  const profile = getProfile('filtering-mixed-origin-nearest-neighbor');

  it('keeps mixed-origin rendered edges and the thresholded duo-link table swatch aligned with origin colors', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    waitForProcessingDialogToClear();

    openGlobalStylingTab();
    selectPrimeOption('#link-tooltip-variable', 'Origin');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'origin');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const cyInstance = typedWindow.cytoscapeInstance;
      expect(cyInstance, 'cytoscapeInstance').to.exist;

      typedWindow.commonService.createLinkColorMap();

      const mixedOriginLink = (typedWindow.commonService.getVisibleLinks() as any[]).find((link) =>
        Array.isArray(link?.origin) && link.origin.length === 2,
      );

      expect(mixedOriginLink, 'visible mixed-origin link').to.exist;

      const logicalLinkId = getLogicalLinkId(mixedOriginLink);
      const renderedEdges = cyInstance
        .edges(':visible')
        .toArray()
        .filter((edge: any) => getLogicalLinkId(edge.data()) === logicalLinkId);

      expect(renderedEdges.length, `rendered edge count for ${logicalLinkId}`).to.equal(2);
      expect(
        renderedEdges.filter((edge: any) => Boolean(edge.data('secondLink'))).length,
        `second-link edge count for ${logicalLinkId}`,
      ).to.equal(1);

      const renderedOrigins = renderedEdges
        .map((edge: any) => {
          const edgeOrigins = edge.data('origin');
          expect(Array.isArray(edgeOrigins), `origin array for rendered edge ${String(edge.id())}`).to.equal(true);
          expect(edgeOrigins.length, `single origin retained for rendered edge ${String(edge.id())}`).to.equal(1);
          return String(edgeOrigins[0]);
        })
        .sort();
      const expectedOrigins = [...mixedOriginLink.origin].map((origin: any) => String(origin)).sort();

      expect(renderedOrigins, `rendered origins for ${logicalLinkId}`).to.deep.equal(expectedOrigins);

      const renderedColors = renderedEdges
        .map((edge: any) => normalizeColor(String(edge.style('line-color') || '')))
        .sort();
      const expectedColors = mixedOriginLink.origin
        .map((origin: any) => normalizeExpectedColor(String(typedWindow.commonService.temp.style.linkColorMap(origin) || '')))
        .sort();

      expect(renderedColors, `rendered colors for ${logicalLinkId}`).to.deep.equal(expectedColors);
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const commonService = typedWindow.commonService;
      const originalThreshold = Number(commonService.session.style.widgets['link-threshold']);
      const candidateThresholds = [...new Set(
        (commonService.session.data.links as any[])
          .filter((link) => Number.isFinite(Number(link?.distance)) && link.hasDistance)
          .map((link) => Number(link.distance)),
      )].sort((left, right) => left - right);

      let matchingThreshold: number | null = null;

      for (const candidateThreshold of candidateThresholds) {
        commonService.session.style.widgets['link-threshold'] = candidateThreshold;
        commonService.setLinkVisibility(true);
        const aggregates = commonService.createLinkColorMap();
        const matchingLink = (commonService.getVisibleLinks() as any[]).find((link) =>
          Array.isArray(link?.origin) &&
          link.origin.length === 2 &&
          link.origin.some((origin: any) => Number(aggregates[String(origin)]) === 0),
        );

        if (matchingLink) {
          matchingThreshold = candidateThreshold;
          break;
        }
      }

      commonService.session.style.widgets['link-threshold'] = originalThreshold;
      commonService.setLinkVisibility(true);
      commonService.createLinkColorMap();

      expect(
        matchingThreshold,
        'threshold that preserves a duo-link while removing one standalone origin row',
      ).to.not.equal(null);

      cy.wrap(matchingThreshold, { log: false }).as('duoLinkThreshold');
    });

    cy.closeGlobalSettings();

    cy.get<number>('@duoLinkThreshold').then((duoLinkThreshold) => {
      openGlobalFilteringTab();
      waitForProcessingDialogToClear();
      setGlobalLinkThreshold(duoLinkThreshold);
      waitForProcessingDialogToClear();
      cy.closeGlobalSettings();
    });

    openGlobalStylingTab();
    cy.get('#global-settings-link-color-table', { timeout: 15000 }).should('be.visible');

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const aggregates = typedWindow.commonService.createLinkColorMap();
      const mixedOriginLink = (typedWindow.commonService.getVisibleLinks() as any[]).find((link) =>
        Array.isArray(link?.origin) && link.origin.length === 2,
      );

      expect(mixedOriginLink, 'visible mixed-origin link after threshold').to.exist;

      const expectedOrigins = mixedOriginLink.origin.map((origin: any) => String(origin));
      const zeroCountOrigin = expectedOrigins.find((origin) => Number(aggregates[origin]) === 0);

      expect(zeroCountOrigin, 'duo-link origin with no standalone row').to.exist;
      expect(Number(aggregates['Duo-Link']), 'duo-link count after threshold').to.be.greaterThan(0);

      const expectedColors = expectedOrigins.map((origin) =>
        normalizeExpectedColor(String(typedWindow.commonService.temp.style.linkColorMap(origin) || '')),
      );

      cy.get('#link-color-table', { timeout: 15000 }).should(($table) => {
        const zeroOriginCells = $table.find('td[data-value]').filter((_, cell) =>
          String(Cypress.$(cell).attr('data-value') || '') === zeroCountOrigin,
        );
        expect(zeroOriginCells.length, `hidden zero-count origin row ${String(zeroCountOrigin)}`).to.equal(0);

        const duoRow = $table.find('td[data-value]').filter((_, cell) =>
          String(Cypress.$(cell).attr('data-value') || '') === 'Duo-Link',
        ).closest('tr');
        expect(duoRow.length, 'duo-link row').to.equal(1);

        const segments = duoRow.find('.duo-link-color-segment');
        expect(segments.length, 'duo-link swatch segments').to.equal(2);

        const actualColors = segments.toArray().map((segment) =>
          normalizeColor(String(Cypress.$(segment).css('background-color') || '')),
        );
        expect(actualColors, 'duo-link swatch colors').to.deep.equal(expectedColors);
      });
    });
  });
});
