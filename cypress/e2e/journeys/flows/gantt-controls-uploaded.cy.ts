/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  createGanttEntry,
  goTo2DNetworkView,
  goToGanttView,
  launchProfileToTwoD,
  openGanttSettingsDialog,
} from '../../../support/journey-helpers';

type WinWithGantt = Window & {
  commonService: any;
};

const profile = getProfile('gantt-covid-node-link');
const baseEntry = {
  name: 'Symptom Window',
  startField: 'Date of symptom onset Date',
  endField: 'Date symptoms resolved',
};
const baseEntryRenderedBars = 30;

function launchToUploadedGantt(): void {
  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  goToGanttView();
}

function createBaselineEntry(): void {
  createGanttEntry(baseEntry);
  cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', baseEntryRenderedBars);
}

function openGanttSettingsTab(label: 'Gantt Entry' | 'Visual Settings'): void {
  cy.get('@ganttSettings').contains('.nav-link', label).click({ force: true });
}

function assertSvgRectAttributeCount(attribute: 'opacity' | 'fill', value: string, expected: number): void {
  cy.get('ganttcomponent #gantt svg rect').should(($rects) => {
    const matches = Array.from($rects).filter(
      (rect) => String(rect.getAttribute(attribute) || '').toLowerCase() === value.toLowerCase(),
    );

    expect(matches.length, `${attribute}=${value} rect count`).to.equal(expected);
  });
}

function setGanttNumberInput(
  rowLabel: 'Spacing (Y)' | 'Spacing (X)' | 'Font Size',
  value: number,
  expectedPath: string,
): void {
  cy.get('@ganttSettings')
    .contains('.form-group.row', rowLabel)
    .find('input[type="number"]')
    .invoke('val', value)
    .trigger('input')
    .trigger('change');

  cy.window().its(expectedPath).should('equal', value);
}

describe('Journey Flow - Gantt controls on uploaded data', () => {
  it('updates uploaded Gantt entry color from the settings table', () => {
    const updatedColor = '#ff6600';

    launchToUploadedGantt();
    createBaselineEntry();

    openGanttSettingsDialog();
    openGanttSettingsTab('Gantt Entry');

    cy.get('@ganttSettings')
      .contains('tr', baseEntry.name)
      .as('ganttEntryRow');

    cy.get('@ganttEntryRow')
      .find('input[type="color"]')
      .invoke('val', updatedColor)
      .trigger('input')
      .trigger('change');

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;

      expect(gantt.ganttEntries[0].color, 'entry table color').to.equal(updatedColor);
      expect(gantt.ganttChartData[0].color, 'rendered entry color').to.equal(updatedColor);
      expect(gantt.ganttChartService.legend[0][0].color, 'legend color').to.equal(updatedColor);
    });

    cy.get('@ganttEntryRow')
      .find('input[type="color"]')
      .should('have.value', updatedColor);

    cy.get('ganttcomponent #gantt .gantt-entry').each(($entry) => {
      expect(String($entry.attr('fill') || '').toLowerCase(), 'rendered bar fill').to.equal(updatedColor);
    });
    assertSvgRectAttributeCount('fill', updatedColor, baseEntryRenderedBars + 1);
  });

  it('updates uploaded Gantt entry opacity from the settings table', () => {
    const updatedOpacity = 0.45;

    launchToUploadedGantt();
    createBaselineEntry();

    openGanttSettingsDialog();
    openGanttSettingsTab('Gantt Entry');

    cy.get('@ganttSettings')
      .contains('tr', baseEntry.name)
      .as('ganttEntryRow');

    cy.get('@ganttEntryRow')
      .find('.transparency-symbol')
      .click(10, 10, { force: true });

    cy.get('#color-transparency')
      .then(($input) => {
        const input = $input.get(0) as HTMLInputElement;
        input.value = String(updatedOpacity);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;

      expect(gantt.ganttEntries[0].opacity, 'entry table opacity').to.equal(updatedOpacity);
      expect(gantt.ganttChartData[0].opacity, 'rendered entry opacity').to.equal(updatedOpacity);
      expect(gantt.ganttChartService.legend[0][0].opacity, 'legend opacity').to.equal(updatedOpacity);
    });

    cy.get('ganttcomponent #gantt .gantt-entry').each(($entry) => {
      expect(Number($entry.attr('opacity')), 'rendered bar opacity').to.equal(updatedOpacity);
    });
    assertSvgRectAttributeCount('opacity', String(updatedOpacity), baseEntryRenderedBars + 1);
  });

  it('uses the default entry name fallback for unnamed uploaded Gantt entries', () => {
    launchToUploadedGantt();

    createGanttEntry({
      startField: baseEntry.startField,
      endField: baseEntry.endField,
    });

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;

      expect(gantt.ganttEntries, 'created entries').to.have.length(1);
      expect(gantt.ganttEntries[0].entryName, 'fallback table name').to.equal('Entry 1');
      expect(gantt.ganttChartData[0].name, 'fallback rendered name').to.equal('Entry 1');
    });

    cy.get('ganttcomponent #gantt text').should('contain.text', 'Entry 1');

    openGanttSettingsDialog();
    openGanttSettingsTab('Gantt Entry');
    cy.get('@ganttSettings')
      .contains('tr', 'Entry 1')
      .should('contain.text', baseEntry.startField)
      .and('contain.text', baseEntry.endField);
  });

  it('updates visual settings and keeps them after switching away and back', () => {
    const spacingY = 35;
    const spacingX = 180;
    const fontSize = 22;
    let initialWidth = 0;
    let initialFirstRowY = 0;

    launchToUploadedGantt();
    createBaselineEntry();

    cy.get('ganttcomponent #gantt svg')
      .invoke('attr', 'width')
      .then((width) => {
        initialWidth = Number(width);
      });

    cy.get('ganttcomponent #gantt .y-axis-text')
      .first()
      .invoke('attr', 'y')
      .then((y) => {
        initialFirstRowY = Number(y);
      });

    openGanttSettingsDialog();
    openGanttSettingsTab('Visual Settings');

    cy.get('@ganttSettings')
      .contains('.form-group.row', 'Grid')
      .contains('span', 'Hide')
      .click({ force: true });

    cy.window().its('commonService.visuals.gantt.showGrid').should('equal', false);
    cy.get('ganttcomponent #gantt svg rect[stroke="#444444"]').should('have.attr', 'fill', 'none');

    setGanttNumberInput('Spacing (Y)', spacingY, 'commonService.visuals.gantt.gridWidthY');
    cy.window().its('commonService.visuals.gantt.ganttChartElement.gridWidthY').should('equal', spacingY);

    setGanttNumberInput('Spacing (X)', spacingX, 'commonService.visuals.gantt.gridWidthX');
    cy.window().its('commonService.visuals.gantt.ganttChartElement.gridWidthX').should('equal', spacingX);

    setGanttNumberInput('Font Size', fontSize, 'commonService.visuals.gantt.fontSize');
    cy.window().its('commonService.visuals.gantt.ganttChartElement.fontSize').should('equal', fontSize);

    cy.get('ganttcomponent #gantt svg')
      .invoke('attr', 'width')
      .should((width) => {
        expect(Number(width), 'updated SVG width').to.be.greaterThan(initialWidth);
      });

    cy.get('ganttcomponent #gantt .y-axis-text')
      .first()
      .invoke('attr', 'y')
      .should((y) => {
        expect(Number(y), 'updated first row y position').not.to.equal(initialFirstRowY);
      });

    cy.get('ganttcomponent #gantt .y-axis-text').first().should('have.css', 'font-size', `${fontSize}px`);

    cy.closeSettingsPane('Gantt Settings');

    goTo2DNetworkView();
    goToGanttView();

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;

      expect(gantt.ganttEntries, 'persisted entries').to.have.length(1);
      expect(gantt.ganttEntries[0].entryName, 'persisted entry name').to.equal(baseEntry.name);
      expect(gantt.showGrid, 'persisted grid toggle').to.equal(false);
      expect(gantt.gridWidthY, 'persisted spacing y').to.equal(spacingY);
      expect(gantt.gridWidthX, 'persisted spacing x').to.equal(spacingX);
      expect(gantt.fontSize, 'persisted font size').to.equal(fontSize);
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', baseEntryRenderedBars);
    cy.get('ganttcomponent #gantt svg rect[stroke="#444444"]').should('have.attr', 'fill', 'none');
    cy.get('ganttcomponent #gantt .y-axis-text').first().should('have.css', 'font-size', `${fontSize}px`);
  });
});
