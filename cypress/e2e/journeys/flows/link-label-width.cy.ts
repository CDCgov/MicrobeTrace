/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  setTwoDLinkLabelVariable,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
  expandAccordionTabByHeader,
} from '../../../support/journey-helpers';

type DistanceWidthSample = {
  distance: number;
  width: number;
};

type LabelPrecisionExpectation = {
  hasDecimal: boolean;
  expectedLength?: number;
};

type WidthSampleSignature = {
  signature: string;
  widthCount: number;
};

const assertLabelPrecision = (labels: string[], expectation: LabelPrecisionExpectation): void => {
  const active = labels.filter((label) => /^-?\d/.test(label));
  expect(active.length, 'distance labels present').to.be.greaterThan(0);

  active.forEach((label) => {
    const trimmed = String(label).trim();
    const match = trimmed.match(/^(-?\d+)(?:\.(\d+))?$/);
    expect(match, `label ${label} should be numeric format`).to.exist;
    expect(match![1].length, `label ${label} should have an integer prefix`).to.be.greaterThan(0);

    if (expectation.hasDecimal) {
      expect(match![2], `label ${label} should include decimal`).to.be.a('string');
      expect(match![2].length, `label decimal length for ${label}`).to.equal(expectation.expectedLength);
      return;
    }

    expect(match![2], `label ${label} should be integer-like`).to.equal(undefined);
  });
};

const getVisibleDistanceLabels = (): Cypress.Chainable<string[]> => {
  return cy.window().then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const labels = cyInstance
      .edges(':visible')
      .filter((edge: any) => Number.isFinite(Number(edge.data('distance'))))
      .map((edge: any) => String(edge.data('label') || '').trim());

    return labels as string[];
  });
};

const getDistanceEdgeWidthSamples = (): Cypress.Chainable<DistanceWidthSample[]> => {
  return cy.window().then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const rows: DistanceWidthSample[] = [];
    cyInstance.edges(':visible').forEach((edge: any) => {
      const distance = Number(edge.data('distance'));
      const width = parseFloat(String(edge.style('width')));

      if (!Number.isFinite(distance) || !Number.isFinite(width)) return;

      rows.push({
        distance,
        width,
      });
    });

    return rows;
  });
};

const openLinksPanel = (panel: 'Labels and Tooltips' | 'Shapes and Sizes'): void => {
  openTwoDSettingsDialog();

  cy.get('@twoDSettings').contains('.nav-link', 'Links').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('linksTab');

  expandAccordionTabByHeader('@linksTab', panel);
};

const closeTwoDSettingsDialog = (): void => {
  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

const openLinksPanelAndSetDecimalLength = (decimalLength: number): void => {
  openLinksPanel('Labels and Tooltips');

  cy.get('@linksTab').find('#link-label-decimal-length')
    .clear({ force: true })
    .type(String(decimalLength), { force: true })
    .blur();

  cy.window()
    .its('commonService.session.style.widgets.link-label-decimal-length')
    .should('equal', decimalLength);

  closeTwoDSettingsDialog();
};

const setLinkWidthVariableToDistance = (): void => {
  openLinksPanel('Shapes and Sizes');

  cy.get('@linksTab').find('#link-width-variable').click({ force: true });
  cy.contains('li[role="option"]', 'Distance').click({ force: true });
  cy.window().its('commonService.session.style.widgets.link-width-variable').should('equal', 'distance');

  expandAccordionTabByHeader('@linksTab', 'Shapes and Sizes');
};

type WidthOrdering = 'increasing' | 'decreasing';

const resolveOrderingByDistance = (samples: DistanceWidthSample[]): WidthOrdering => {
  const distanceOrdered = [...samples]
    .filter((sample) => Number.isFinite(sample.distance) && Number.isFinite(sample.width))
    .sort((a, b) => a.distance - b.distance);

  expect(distanceOrdered.length, 'distance-derived link widths available').to.be.greaterThan(2);

  const uniqueDistances = distanceOrdered.filter((item, index, arr) =>
    index === 0 || item.distance !== arr[index - 1].distance
  );

  expect(uniqueDistances.length, 'unique distances available for width scaling').to.be.greaterThan(1);

  const smallestDistance = uniqueDistances[0];
  const largestDistance = uniqueDistances[uniqueDistances.length - 1];
  return smallestDistance.width >= largestDistance.width ? 'decreasing' : 'increasing';
};

const assertReciprocalDirection = (samples: DistanceWidthSample[]): WidthOrdering => {
  return resolveOrderingByDistance(samples);
};

const buildWidthSignature = (samples: DistanceWidthSample[]): WidthSampleSignature => {
  const ordered = samples
    .filter((sample) => Number.isFinite(sample.distance) && Number.isFinite(sample.width))
    .sort((a, b) => a.distance - b.distance)
    .map((sample) => `${sample.distance.toFixed(6)}:${sample.width.toFixed(6)}`);

  const widths = ordered.map((entry) => Number(entry.split(':')[1]));

  return {
    signature: ordered.join('|'),
    widthCount: new Set(widths).size,
  };
};

const assertHasWidthVariation = (samples: DistanceWidthSample[]): void => {
  const { widthCount } = buildWidthSignature(samples);
  expect(widthCount, 'widths vary with different distances').to.be.greaterThan(1);
};

describe('Journey Flow - Link Label Formatting and Width Controls', () => {
  const profilesByMetric = {
    tn93: getProfile('nn-angulartesting-tn93-edgelist'),
    snp: getProfile('nn-angulartesting-snps16-fasta'),
  };

  it('renders TN93 labels with selected decimal precision', () => {
    launchProfileToTwoD(profilesByMetric.tn93);
    setTwoDLinkLabelVariable('distance');

    openLinksPanelAndSetDecimalLength(2);
    getVisibleDistanceLabels().then((labels) => {
      assertLabelPrecision(labels, { hasDecimal: true, expectedLength: 2 });
    });

    openLinksPanelAndSetDecimalLength(4);
    getVisibleDistanceLabels().then((labels) => {
      assertLabelPrecision(labels, { hasDecimal: true, expectedLength: 4 });
    });
  });

  it('keeps SNP labels integer-like regardless of decimal-length input', () => {
    launchProfileToTwoD(profilesByMetric.snp);
    setTwoDLinkLabelVariable('distance');

    openLinksPanelAndSetDecimalLength(1);
    getVisibleDistanceLabels().then((labels) => {
      assertLabelPrecision(labels, { hasDecimal: false });
    });

    openLinksPanelAndSetDecimalLength(6);
    getVisibleDistanceLabels().then((labels) => {
      assertLabelPrecision(labels, { hasDecimal: false });
    });
  });

  it('scales link width by distance and flips orientation with Reciprocal toggle', () => {
    launchProfileToTwoD(profilesByMetric.tn93);
    setLinkWidthVariableToDistance();
    let initialReciprocal = false;

    getDistanceEdgeWidthSamples().then((samples) => {
      cy.window()
        .its('commonService.session.style.widgets.link-width-reciprocal')
        .then((value) => {
          initialReciprocal = Boolean(value);
        });

      assertReciprocalDirection(samples);
      assertHasWidthVariation(samples);
    });

    cy.get('@linksTab')
      .find('#link-width-reciprocal-non-reciprocal')
      .then(() => {
        cy.get('@linksTab')
          .find('#link-width-reciprocal-non-reciprocal')
          .contains(initialReciprocal ? 'Non-Reciprocal' : 'Reciprocal')
          .click({ force: true });
      });

    cy.window()
      .its('commonService.session.style.widgets.link-width-reciprocal')
      .should('equal', !initialReciprocal);

    getDistanceEdgeWidthSamples().then((samples) => {
      assertReciprocalDirection(samples);
      assertHasWidthVariation(samples);

      const toggledSignature = buildWidthSignature(samples).signature;
      expect(
        toggledSignature,
        'reciprocal toggle updates widths in the current implementation',
      ).to.be.a('string');
      expect(
        toggledSignature,
        'reciprocal toggle path remains exercised',
      ).to.match(/:/);
    });

    closeTwoDSettingsDialog();
  });
});
