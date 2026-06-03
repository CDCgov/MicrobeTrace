/// <reference types="cypress" />

import { byTestId, testIds } from '../../../support/selectors';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  openGlobalStylingTab,
} from '../../../support/journey-helpers';

type ExpectedBubblePieSlice = {
  label: string;
  count: number;
  color: string;
  opacity: number;
};

type ExpectedBubblePieExport = {
  totalCount: number;
  slices: ExpectedBubblePieSlice[];
};

type ExportedBubblePieTag = {
  attributes: Record<string, string>;
};

type ExportedBubblePieGroup = ExportedBubblePieTag & {
  slices: ExportedBubblePieTag[];
  outline?: ExportedBubblePieTag;
};

type WinWithBubble = Window & {
  commonService: any;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeColor = (value: string | null | undefined): string => {
  const color = String(value || '').trim().toLowerCase();
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1].toLowerCase();
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }

    return `#${hex}`;
  }

  const rgbMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const toHex = (channel: string) => Number(channel).toString(16).padStart(2, '0');
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  return color;
};

const getSvgTagAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const attributePattern = /\s([:\w-]+)="([^"]*)"/g;
  let match = attributePattern.exec(tag);

  while (match) {
    attributes[match[1]] = match[2];
    match = attributePattern.exec(tag);
  }

  return attributes;
};

const findExportedBubblePieGroup = (
  svgText: string,
  expected: ExpectedBubblePieExport,
): ExportedBubblePieGroup | undefined => {
  const groupPattern = /(<g\b[^>]*data-mt-export="bubble-pie"[^>]*>)([\s\S]*?)<\/g>/g;
  let match = groupPattern.exec(svgText);

  while (match) {
    const attributes = getSvgTagAttributes(match[1]);
    const content = match[2];
    const sliceTags = content.match(/<path\b[^>]*data-mt-export="bubble-pie-slice"[^>]*>/g) || [];
    const slices = sliceTags.map((tag) => ({ attributes: getSvgTagAttributes(tag) }));

    if (
      attributes['data-mt-total-count'] === String(expected.totalCount)
      && slices.length === expected.slices.length
      && expected.slices.every((expectedSlice) =>
        slices.some((slice) =>
          slice.attributes['data-mt-slice-label'] === expectedSlice.label
          && slice.attributes['data-mt-slice-count'] === String(expectedSlice.count)
          && /^M /.test(slice.attributes.d || '')
        )
      )
    ) {
      const outlineTag = content.match(/<circle\b[^>]*data-mt-export="bubble-pie-outline"[^>]*>/)?.[0];

      return {
        attributes,
        slices,
        outline: outlineTag ? { attributes: getSvgTagAttributes(outlineTag) } : undefined,
      };
    }

    match = groupPattern.exec(svgText);
  }

  return undefined;
};

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay:visible', { timeout: 15000 })
    .last()
    .contains('li[role="option"]', new RegExp(`^${escapeRegExp(label)}$`))
    .scrollIntoView()
    .click({ force: true });
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).find('.p-select-dropdown').click({ force: true });
  clickVisiblePrimeOption(label);
  cy.get(selector).find('.p-select-label').should('contain', label);
};

const setBubbleAxis = (
  selector: '#bubble-axis-x' | '#bubble-axis-y',
  label: string,
  expectedWidget: 'bubble-x' | 'bubble-y',
  expectedValue: string,
): void => {
  const axis = selector === '#bubble-axis-x' ? 'X' : 'Y';

  cy.window().then((win: unknown) => {
    const bubble = (win as WinWithBubble).commonService.visuals.bubble;
    const field = bubble.selectedFieldList.find((item: any) =>
      item.label === label && item.value === expectedValue
    );

    expect(field, `Bubble ${axis} axis option ${label}`).to.exist;
    if (axis === 'X') {
      bubble.xVariable = expectedValue;
    } else {
      bubble.yVariable = expectedValue;
    }
    bubble.onDataChange(axis);
  });
  cy.window().its(`commonService.session.style.widgets.${expectedWidget}`).should('equal', expectedValue);
};

describe('Journey Flow - Bubble export on uploaded data', () => {
  const profile = getProfile('color-by-uploaded-categorical');

  it('exports collapsed uploaded Bubble pie charts as vector SVG paths', () => {
    const exportFileBase = `cypress_bubble_export_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.svg`;
    let expectedPie: ExpectedBubblePieExport | undefined;

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

    openBubbleSettingsDialog();
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    cy.closeSettingsPane('Bubble Settings');

    cy.window().then((win: unknown) => {
      const commonService = (win as WinWithBubble).commonService;
      const bubble = commonService.visuals.bubble;
      const mixedNode = bubble.visibleData.find((node: any) =>
        node.totalCount === 6
        && Array.isArray(node.counts)
        && node.counts.some((count: any) => count.label === 'Healthcare' && count.count === 4)
        && node.counts.some((count: any) => count.label === 'Education' && count.count === 2),
      );

      expect(mixedNode, 'mixed uploaded Bubble aggregate').to.exist;
      const mixedCountsByLabel = new Map<string, number>(
        mixedNode.counts.map((count: any) => [String(count.label), Number(count.count)]),
      );
      expectedPie = {
        totalCount: Number(mixedNode.totalCount),
        slices: [
          { label: 'Healthcare', count: mixedCountsByLabel.get('Healthcare') || 0 },
          { label: 'Education', count: mixedCountsByLabel.get('Education') || 0 },
        ].map((count) => {
          const nodeStyle = commonService.getNodeFillStyle({ Profession: count.label });

          return {
            label: count.label,
            count: count.count,
            color: String(nodeStyle.color),
            opacity: Number(nodeStyle.alpha),
          };
        }),
      };
    });

    cy.get(byTestId(testIds.bubbleExportButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'Export Bubble View')
      .should('be.visible')
      .parents('.p-dialog')
      .as('exportDialog');

    cy.get('@exportDialog')
      .find('#bubble-export-filename')
      .invoke('val', exportFileBase)
      .trigger('input')
      .trigger('change');

    cy.get('@exportDialog').find('#bubble-export-filetype').select('svg');
    cy.get('@exportDialog').find('#bubble-export-confirm').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Bubble View').should('not.exist');

    cy.readFile(exportPath, 'utf8', { timeout: 20000 }).should((svgText) => {
      expect(expectedPie, 'expected pie metadata').to.exist;
      expect(svgText, 'exported Bubble SVG content').to.include('<svg');
      expect(svgText.length, 'exported Bubble SVG length').to.be.greaterThan(100);
      expect(svgText, 'Bubble pie export avoids raster PNG payloads').not.to.include('data:image/png;base64');
      expect(svgText, 'Bubble pie export includes vector pie groups')
        .to.include('data-mt-export="bubble-pie"');
      expect(svgText, 'Bubble pie export includes vector pie slices')
        .to.include('data-mt-export="bubble-pie-slice"');

      const expected = expectedPie as ExpectedBubblePieExport;
      const pieGroup = findExportedBubblePieGroup(svgText, expected);
      expect(pieGroup, 'exported Bubble pie vector group').to.exist;
      expect(pieGroup?.attributes['data-mt-node-id'], 'exported Bubble pie node id')
        .to.match(/\S+/);
      expect(pieGroup?.attributes['data-mt-total-count'], 'exported Bubble pie total count')
        .to.equal(String(expected.totalCount));

      const slices = pieGroup?.slices || [];
      expect(slices.length, 'exported Bubble pie slice count').to.equal(expected.slices.length);
      expected.slices.forEach((expectedSlice) => {
        const slice = slices.find((candidate) =>
          candidate.attributes['data-mt-slice-label'] === expectedSlice.label
        );
        const expectedFraction = expectedSlice.count / expected.totalCount;

        expect(slice, `exported Bubble pie slice for ${expectedSlice.label}`).to.exist;
        expect(slice?.attributes['data-mt-node-id'], `exported Bubble pie slice node id for ${expectedSlice.label}`)
          .to.equal(pieGroup?.attributes['data-mt-node-id']);
        expect(slice?.attributes['data-mt-slice-count'], `exported Bubble pie count for ${expectedSlice.label}`)
          .to.equal(String(expectedSlice.count));
        expect(Number(slice?.attributes['data-mt-slice-fraction']), `exported Bubble pie fraction for ${expectedSlice.label}`)
          .to.be.closeTo(expectedFraction, 0.0001);
        expect(slice?.attributes.fill, `exported Bubble pie color for ${expectedSlice.label}`)
          .to.satisfy((fill: string | null) => normalizeColor(fill) === normalizeColor(expectedSlice.color));
        expect(Number(slice?.attributes['fill-opacity']), `exported Bubble pie opacity for ${expectedSlice.label}`)
          .to.be.closeTo(expectedSlice.opacity, 0.001);
        expect(slice?.attributes.d, `exported Bubble pie path for ${expectedSlice.label}`)
          .to.match(/^M /);
      });

      const outline = pieGroup?.outline;
      expect(outline, 'exported Bubble pie black outline').to.exist;
      expect(outline?.attributes.stroke, 'exported Bubble pie outline color').to.equal('#000000');
      expect(Number(outline?.attributes['stroke-width']), 'exported Bubble pie outline width').to.be.greaterThan(0);
    });
  });

  it('exports the uploaded Bubble view as a PNG file after changing the advanced scale', () => {
    const exportFileBase = `cypress_bubble_export_png_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.png`;
    const exportScale = '1.5';
    let initialDimensions = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    cy.get(byTestId(testIds.bubbleExportButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'Export Bubble View')
      .should('be.visible')
      .parents('.p-dialog')
      .as('exportDialog');

    cy.get('@exportDialog')
      .find('#bubble-export-filename')
      .invoke('val', exportFileBase)
      .trigger('input')
      .trigger('change');

    cy.get('@exportDialog').find('#bubble-export-filetype').select('png');
    cy.get('@exportDialog').contains('p-accordion-header', 'Advanced').click({ force: true });
    cy.get('@exportDialog').find('#bubble-export-scale').should('be.visible');

    cy.get('@exportDialog')
      .find('#bubble-export-dimensions')
      .invoke('text')
      .then((text) => {
        initialDimensions = String(text).trim();
      });

    cy.get('@exportDialog')
      .find('#bubble-export-scale')
      .clear()
      .type(exportScale)
      .trigger('input')
      .trigger('change');

    cy.get('@exportDialog')
      .find('#bubble-export-dimensions')
      .invoke('text')
      .should((text) => {
        expect(String(text).trim(), 'updated Bubble export dimensions').not.to.equal(initialDimensions);
      });

    cy.get('@exportDialog').find('#bubble-export-confirm').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Bubble View').should('not.exist');

    cy.readFile(exportPath, null, { timeout: 30000 }).should((pngBuffer) => {
      const byteLength = (pngBuffer as { byteLength?: number; length?: number } | null)?.byteLength
        ?? (pngBuffer as { length?: number } | null)?.length
        ?? 0;

      expect(pngBuffer, 'exported Bubble PNG buffer').not.to.equal(null);
      expect(byteLength, 'exported Bubble PNG byte length').to.be.greaterThan(1000);
    });
  });
});
