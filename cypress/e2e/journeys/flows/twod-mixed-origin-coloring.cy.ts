/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertAfterLaunchCounts,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  openGlobalStylingTab,
  setGlobalLinkThreshold,
  visitAppAndAcceptEula,
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

const DEFAULT_ORIGIN_COLORS = {
  contactTracing: normalizeExpectedColor('#a6cee3'),
  geneticDistance: normalizeExpectedColor('#1f78b4'),
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

describe('Journey Flow - 2D mixed-origin link coloring', () => {
  const profile = getProfile('filtering-mixed-origin-nearest-neighbor');
  const covidNodeFile = {
    name: 'COVID-19_simulated_NodeList_snp.csv',
    datatype: 'node' as const,
    field1: 'ID',
    field2: 'seq',
  };
  const covidContactFile = {
    name: 'COVID-19_simulated_ContactTracing_snp.csv',
    datatype: 'link' as const,
    field1: 'source',
    field2: 'target',
  };
  const covidMixedOriginProfile = {
    id: 'covid-snps16-contact-tracing-node-list',
    title: '2D mixed-origin COVID SNP/contact tracing link-color counts',
    tags: ['color-by', 'mixed-origin', 'snps', 'origin', 'load-to-twod'],
    files: [covidNodeFile, covidContactFile],
    preLaunch: {
      metric: 'snps' as const,
      threshold: 16,
      defaultView: '2D Network' as const,
    },
    expectations: {
      afterLaunch: {
        visibleLinks: 59,
      },
    },
  };

  const aggregateVisibleOriginCounts = (visibleLinks: any[]): Record<string, number> => {
    const aggregates: Record<string, number> = {};
    let duoLinkCount = 0;

    visibleLinks.forEach((link) => {
      const origins = Array.from(new Set(
        (Array.isArray(link?.origin) ? link.origin : [link?.origin])
          .filter((origin: any) => origin !== undefined && origin !== null && origin !== '')
          .map((origin: any) => String(origin)),
      ));

      origins.forEach((origin) => {
        if (!Object.prototype.hasOwnProperty.call(aggregates, origin)) {
          aggregates[origin] = 0;
        }
      });

      if (origins.length > 1) {
        duoLinkCount += 1;
      } else if (origins.length === 1) {
        aggregates[origins[0]] += 1;
      }
    });

    if (duoLinkCount > 0) {
      aggregates['Duo-Link'] = duoLinkCount;
    }

    return aggregates;
  };

  const getOriginKeys = (link: any): string[] =>
    (Array.isArray(link?.origin) ? link.origin : [link?.origin])
      .filter((origin: any) => origin !== undefined && origin !== null && origin !== '')
      .map((origin: any) => String(origin));

  const assertCovidMixedOriginCounts = (): void => {
    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const commonService = typedWindow.commonService;
      const visibleLinks = commonService.getVisibleLinks() as any[];
      const aggregates = aggregateVisibleOriginCounts(visibleLinks);
      const contactOrigin = covidContactFile.name;
      const geneticOrigin = 'Genetic Distance';

      expect(commonService.session.style.widgets['link-color-variable']).to.equal('origin');
      expect(visibleLinks.length, 'visible logical links').to.equal(59);
      expect(
        visibleLinks.filter((link) => Array.isArray(link?.origin) && link.origin.length > 1).length,
        'duo-link logical links',
      ).to.equal(11);
      expect(Number(aggregates[contactOrigin]), 'contact tracing standalone links').to.equal(29);
      expect(Number(aggregates[geneticOrigin]), 'genetic distance standalone links').to.equal(19);
      expect(Number(aggregates['Duo-Link']), 'duo links').to.equal(11);

      const contactColor = normalizeExpectedColor(
        String(commonService.temp.style.linkColorMap(contactOrigin) || ''),
      );
      const geneticColor = normalizeExpectedColor(
        String(commonService.temp.style.linkColorMap(geneticOrigin) || ''),
      );

      expect(contactColor, 'contact tracing origin color').to.equal(DEFAULT_ORIGIN_COLORS.contactTracing);
      expect(geneticColor, 'genetic distance origin color').to.equal(DEFAULT_ORIGIN_COLORS.geneticDistance);
      expect(contactColor, 'contact tracing origin color').to.not.equal(geneticColor);

      const contactOnlyLink = visibleLinks.find((link) => {
        const origins = getOriginKeys(link);
        return origins.length === 1 && origins[0] === contactOrigin;
      });
      const geneticOnlyLink = visibleLinks.find((link) => {
        const origins = getOriginKeys(link);
        return origins.length === 1 && origins[0] === geneticOrigin;
      });
      const cyInstance = typedWindow.cytoscapeInstance;
      const visibleRenderedEdges = cyInstance?.edges(':visible').toArray() || [];
      const renderedColorFor = (link: any, label: string): string => {
        const logicalLinkId = getLogicalLinkId(link);
        const renderedEdge = visibleRenderedEdges.find((edge: any) =>
          getLogicalLinkId(edge.data()) === logicalLinkId,
        );

        expect(Boolean(renderedEdge), `rendered edge for ${label}`).to.equal(true);
        return normalizeExpectedColor(String(renderedEdge?.style('line-color') || renderedEdge?.data('lineColor') || ''));
      };

      expect(contactOnlyLink, 'contact-only visible link').to.exist;
      expect(geneticOnlyLink, 'genetic-only visible link').to.exist;
      expect(cyInstance, 'cytoscapeInstance').to.exist;

      const renderedContactColor = renderedColorFor(contactOnlyLink, contactOrigin);
      const renderedGeneticColor = renderedColorFor(geneticOnlyLink, geneticOrigin);

      expect(renderedContactColor, 'rendered contact tracing origin color').to.equal(contactColor);
      expect(renderedGeneticColor, 'rendered genetic distance origin color').to.equal(geneticColor);
      expect(renderedContactColor, 'rendered origin colors').to.not.equal(renderedGeneticColor);
    });
  };

  const launchCovidFilesToTwoD = (files: typeof covidMixedOriginProfile.files): void => {
    visitAppAndAcceptEula();
    cy.loadFiles(files);
    applyPreLaunchFileSettings(covidMixedOriginProfile);
    ensurePreLaunchProfileSynced(covidMixedOriginProfile);
    launchAndWaitForProcessing(60000);
    ensureTwoDNetworkView();
  };

  const seedDuplicateCovidOriginColorHistory = (): void => {
    cy.window().then((win: unknown) => {
      const commonService = (win as WinWithCy).commonService;
      const duplicateColor = String(
        commonService.temp.style.linkColorMap('Genetic Distance') ||
        commonService.session.style.linkColors?.[0] ||
        '#a6cee3',
      );

      commonService.session.style.linkColorsTable ||= {};
      commonService.session.style.linkColorsTableKeys ||= {};
      commonService.session.style.linkColorsTableHistory ||= {};
      commonService.session.style.linkColorsTable.origin = [duplicateColor, duplicateColor];
      commonService.session.style.linkColorsTableKeys.origin = ['Genetic Distance', covidContactFile.name];
      commonService.session.style.linkColors = [duplicateColor, duplicateColor];
      commonService.session.style.linkColorsTableHistory['Genetic Distance'] = duplicateColor;
      commonService.session.style.linkColorsTableHistory[covidContactFile.name] = duplicateColor;
    });
  };

  const openAddDataTab = (): void => {
    cy.get('#top-toolbar').contains('button', 'File').click({ force: true });
    cy.contains('[role="menuitem"]', 'Add Data', { timeout: 15000 }).click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', 'Files');
  };

  const appendCovidFileAndUpdate = (
    file: typeof covidNodeFile | typeof covidContactFile,
    resetSettings = false,
  ): void => {
    openAddDataTab();
    cy.loadFiles([file]);
    if (resetSettings) {
      cy.get('#launch-reset-settings', { timeout: 20000 }).should('not.be.disabled').click({ force: true });
    } else {
      cy.get('[data-testid="files-update-button"]', { timeout: 20000 }).should('not.be.disabled').click({ force: true });
    }
    waitForProcessingDialogToClear();
    ensureTwoDNetworkView();
  };

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
    cy.get('#key-tables-link-table', { timeout: 15000 }).should('be.visible');

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

      cy.get('#key-tables-link-table', { timeout: 15000 }).should(($table) => {
        const zeroOriginRow = $table.find('td[data-value]').filter((_, cell) =>
          String(Cypress.$(cell).attr('data-value') || '') === zeroCountOrigin,
        ).closest('tr');
        expect(zeroOriginRow.length, `visible zero-count origin row ${String(zeroCountOrigin)}`).to.equal(1);
        expect(
          zeroOriginRow.find('.tableCount').text().trim(),
          `blank count for zero-count origin row ${String(zeroCountOrigin)}`,
        ).to.equal('');

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

  it('counts COVID contact tracing, genetic distance, and duo-link origins once each', () => {
    launchProfileToTwoD(covidMixedOriginProfile, { skipDemoSession: false });
    assertAfterLaunchCounts(covidMixedOriginProfile);
    waitForProcessingDialogToClear();

    assertCovidMixedOriginCounts();

    openGlobalStylingTab();
    cy.get('#key-tables-link-table', { timeout: 15000 }).should(($table) => {
      const countFor = (value: string) => {
        const row = $table.find('td[data-value]').filter((_, cell) =>
          String(Cypress.$(cell).attr('data-value') || '') === value,
        ).closest('tr');
        expect(row.length, `row for ${value}`).to.equal(1);
        return row.find('.tableCount').text().trim();
      };

      expect(countFor('COVID-19_simulated_ContactTracing_snp.csv')).to.equal('29');
      expect(countFor('Genetic Distance')).to.equal('19');
      expect(countFor('Duo-Link')).to.equal('11');
    });
  });

  it('keeps COVID mixed-origin counts when the contact file is added after sequence launch', () => {
    launchCovidFilesToTwoD([covidNodeFile]);
    seedDuplicateCovidOriginColorHistory();
    appendCovidFileAndUpdate(covidContactFile);
    assertCovidMixedOriginCounts();
  });

  it('keeps COVID mixed-origin counts when the sequence file is added later with reset settings', () => {
    launchCovidFilesToTwoD([covidContactFile]);
    appendCovidFileAndUpdate(covidNodeFile, true);
    assertCovidMixedOriginCounts();
  });
});
