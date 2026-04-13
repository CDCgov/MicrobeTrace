/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertAlignmentReady,
  expandAccordionTabByHeader,
  launchProfileToAlignment,
  openAlignmentSettingsDialog,
} from '../../../support/journey-helpers';

type AlignmentWindow = Window & {
  commonService: {
    visuals: {
      alignment: any;
    };
    session: {
      data: {
        nodes: any[];
      };
    };
  };
};

type RgbPixel = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function openAlignmentSettingsSection(headerText: string): void {
  openAlignmentSettingsDialog();
  expandAccordionTabByHeader('@alignmentSettings', headerText);
}

function closeAlignmentSettings(): void {
  cy.get('@alignmentSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });
  cy.contains('.p-dialog-title', 'Alignment View Settings').should('not.exist');
}

function selectAlignmentToggle(selector: string, label: string): void {
  cy.get('@alignmentSettings')
    .find(selector)
    .contains(label)
    .click({ force: true });

  assertAlignmentReady();
}

function selectAlignmentOption(
  selector: string,
  label: string,
  waitForAlignment = true,
): void {
  cy.get('@alignmentSettings')
    .find(selector)
    .within(() => {
      cy.get('.p-select-dropdown').click({ force: true });
    });

  cy.get('body').then(($body) => {
    if ($body.find('.p-select-overlay:visible li[role="option"]').length) {
      return;
    }

    cy.get('@alignmentSettings')
      .find(selector)
      .click({ force: true });
  });

  cy.get('.p-select-overlay:visible li[role="option"]', { timeout: 15000 })
    .should('have.length.greaterThan', 0);

  cy.contains(
    '.p-select-overlay:visible li[role="option"]',
    new RegExp(`^\\s*${escapeForRegex(label)}\\s*$`),
    { timeout: 15000 },
  ).click({ force: true });

  if (waitForAlignment) {
    assertAlignmentReady();
  }
}

function setNumberInput(selector: string, value: number): void {
  cy.get('@alignmentSettings')
    .find(selector)
    .should('exist')
    .invoke('val', String(value))
    .trigger('input')
    .trigger('change');
}

function setAlignmentRange(start: number, end: number): void {
  setNumberInput('#alignment-start-position', start);
  cy.window()
    .its('commonService.visuals.alignment.startPos')
    .should('equal', start);

  setNumberInput('#alignment-end-position', end);
  cy.window()
    .its('commonService.visuals.alignment.endPos')
    .should('equal', end);

  assertAlignmentReady();
}

function readCanvasPixel(
  selector: string,
  x: number,
  y: number,
): Cypress.Chainable<RgbPixel> {
  return cy.get(selector).then(($canvas) => {
    const canvas = $canvas.get(0) as HTMLCanvasElement;
    const context = canvas.getContext('2d');

    expect(context, `2d context for ${selector}`).to.exist;

    const pixel = context!.getImageData(x, y, 1, 1).data;

    return {
      r: pixel[0],
      g: pixel[1],
      b: pixel[2],
      a: pixel[3],
    };
  });
}

function countDarkPixels(selector: string): Cypress.Chainable<number> {
  return cy.get(selector).then(($canvas) => {
    const canvas = $canvas.get(0) as HTMLCanvasElement;
    const context = canvas.getContext('2d');

    expect(context, `2d context for ${selector}`).to.exist;

    const imageData = context!.getImageData(0, 0, canvas.width, canvas.height).data;
    let darkPixelCount = 0;

    for (let index = 0; index < imageData.length; index += 4) {
      const r = imageData[index];
      const g = imageData[index + 1];
      const b = imageData[index + 2];
      const a = imageData[index + 3];

      if (a > 0 && r < 40 && g < 40 && b < 40) {
        darkPixelCount += 1;
      }
    }

    return darkPixelCount;
  });
}

function hexToRgb(hex: string): RgbPixel {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
    a: 255,
  };
}

function expectPixelToMatch(pixel: RgbPixel, hex: string): void {
  const expected = hexToRgb(hex);

  expect(pixel.r, `red channel for ${hex}`).to.be.within(expected.r - 2, expected.r + 2);
  expect(pixel.g, `green channel for ${hex}`).to.be.within(expected.g - 2, expected.g + 2);
  expect(pixel.b, `blue channel for ${hex}`).to.be.within(expected.b - 2, expected.b + 2);
}

function readVisibleLabels(limit = 5): Cypress.Chainable<string[]> {
  return cy.get('.canvasLabels > div').then(($labels) => {
    return [...$labels]
      .slice(0, limit)
      .map((label) => String(label.textContent || '').trim());
  });
}

describe('Journey Flow - Alignment uploaded advanced settings', () => {
  const nodeListProfile = getProfile('alignment-angulartesting-sequence-node-list');
  const nodeLinkProfile = getProfile('alignment-covid-node-link-excluded');

  it('updates positive ruler interval and character visibility modes on uploaded Alignment data', () => {
    launchProfileToAlignment(nodeLinkProfile);
    assertAfterLaunchCounts(nodeLinkProfile);
    assertAlignmentReady();

    openAlignmentSettingsSection('Data');
    setAlignmentRange(1, 60);

    expandAccordionTabByHeader('@alignmentSettings', 'Layout');
    selectAlignmentOption('#alignment-ruler-minor-interval', '20');

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      expect(alignment.widgets['alignView-rulerMinorInterval']).to.equal(20);
    });

    cy.get('#alignmentTop svg text').then(($texts) => {
      const tickTexts = [...$texts].map((node) => String(node.textContent || '').trim());
      expect(tickTexts).to.include('20');
      expect(tickTexts).to.include('40');
      expect(tickTexts).to.include('60');
    });

    selectAlignmentOption('#alignment-ruler-minor-interval', '0');

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      expect(alignment.widgets['alignView-rulerMinorInterval']).to.equal(0);
    });

    cy.get('#alignmentTop svg text').then(($texts) => {
      const tickTexts = [...$texts].map((node) => String(node.textContent || '').trim());
      expect(tickTexts).to.include('1');
      expect(tickTexts).not.to.include('20');
      expect(tickTexts).not.to.include('40');
      expect(tickTexts).not.to.include('60');
    });

    expandAccordionTabByHeader('@alignmentSettings', 'Sizing');
    selectAlignmentToggle('#alignment-size-preset', 'Large');

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      expect(alignment.widgets['alignView-selectedSize']).to.equal('l');
      expect(alignment.spanHeight).to.equal(16);
      expect(alignment.spanWidth).to.equal(10);
    });

    expandAccordionTabByHeader('@alignmentSettings', 'Layout');

    countDarkPixels('.canvasHolder canvas').then((hiddenTextPixels) => {
      selectAlignmentToggle('#alignment-show-characters', 'Show');

      cy.window().then((win: unknown) => {
        const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
        expect(alignment.widgets['alignView-charSetting']).to.equal('show');
      });

      countDarkPixels('.canvasHolder canvas').then((shownTextPixels) => {
        selectAlignmentToggle('#alignment-show-characters', 'Minimum');

        cy.window().then((win: unknown) => {
          const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
          expect(alignment.widgets['alignView-charSetting']).to.equal('min');
        });

        countDarkPixels('.canvasHolder canvas').then((minimumTextPixels) => {
          expect(shownTextPixels, 'show mode draws the most text').to.be.greaterThan(minimumTextPixels);
          expect(minimumTextPixels, 'minimum mode still draws visible text').to.be.greaterThan(hiddenTextPixels);
        });
      });
    });

    closeAlignmentSettings();
  });

  it('changes label fields on uploaded Alignment rows deterministically', () => {
    launchProfileToAlignment(nodeListProfile);
    assertAfterLaunchCounts(nodeListProfile);
    assertAlignmentReady();

    openAlignmentSettingsSection('Labels and Order');
    selectAlignmentOption('#alignment-label-field', 'Gender', false);

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      const expectedLabels = alignment.labelArray
        .slice(0, 5)
        .map((entry: { gender: string }) => String(entry.gender));

      expect(alignment.widgets['alignView-labelField']).to.equal('gender');

      readVisibleLabels().then((visibleLabels) => {
        expect(visibleLabels).to.deep.equal(expectedLabels);
        expect([...new Set(visibleLabels)]).to.have.members(['F', 'M']);
      });
    });

    cy.get('.canvasLabels > div').should('have.length', 14);

    closeAlignmentSettings();
  });

  it('sorts uploaded Alignment rows deterministically for numeric and string fields', () => {
    let expectedAgeOrder: string[] = [];
    let expectedSubtypeOrder: string[] = [];

    launchProfileToAlignment(nodeListProfile);
    assertAfterLaunchCounts(nodeListProfile);
    assertAlignmentReady();

    cy.window().then((win: unknown) => {
      const nodes = (win as AlignmentWindow).commonService.session.data.nodes
        .map((node, index) => ({ index, ...node }))
        .filter((node) => /[^-\s]/.test(String(node.seq || '')));

      const ageSortedNodes = [...nodes].sort((left, right) => Number(left.age) - Number(right.age));
      const subtypeSortedNodes = [...ageSortedNodes].sort((left, right) => String(left.subtype).localeCompare(String(right.subtype)));

      expectedAgeOrder = ageSortedNodes.slice(0, 5).map((node) => String(node._id));
      expectedSubtypeOrder = subtypeSortedNodes.slice(0, 5).map((node) => String(node._id));
    });

    openAlignmentSettingsSection('Labels and Order');

    selectAlignmentOption('#alignment-sort-field', 'Age', false);
    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      expect(alignment.widgets['alignView-sortField']).to.equal('age');
    });
    readVisibleLabels().then((visibleLabels) => {
      expect(visibleLabels).to.deep.equal(expectedAgeOrder);
    });

    selectAlignmentOption('#alignment-sort-field', 'Subtype', false);
    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      expect(alignment.widgets['alignView-sortField']).to.equal('subtype');
    });
    readVisibleLabels().then((visibleLabels) => {
      expect(visibleLabels).to.deep.equal(expectedSubtypeOrder);
    });

    cy.get('.canvasHolder canvas', { timeout: 30000 }).should(($canvas) => {
      const canvas = $canvas.get(0) as HTMLCanvasElement;
      expect(canvas.width, 'sorted alignment canvas width').to.be.greaterThan(0);
      expect(canvas.height, 'sorted alignment canvas height').to.be.greaterThan(0);
    });

    closeAlignmentSettings();
  });

});
