/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  createGanttEntry,
  goToGanttView,
  launchProfileToTwoD,
  openGanttSettingsDialog,
} from '../../../support/journey-helpers';

type WinWithGantt = Window & {
  commonService: any;
};

const profile = getProfile('gantt-angulartesting-sequence-node');
const rangeEntry = {
  name: 'Admission Range',
  startField: 'ipstart',
  endField: 'ipend',
};
const singleDateEntry = {
  name: 'Diagnosis Marker',
  startField: 'Diagnosis date',
};

function launchToUploadedGantt(): void {
  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  goToGanttView();
}

describe('Journey Flow - Gantt multi-entry management on uploaded data', () => {
  it('creates stacked uploaded Gantt entries and removes one while preserving the other', () => {
    launchToUploadedGantt();

    createGanttEntry({
      ...rangeEntry,
      expectedEntries: 1,
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 14);

    createGanttEntry({
      ...singleDateEntry,
      expectedEntries: 2,
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 28);
    cy.get('ganttcomponent #gantt .y-axis-text').should('have.length', 14);
    cy.get('ganttcomponent #gantt .gantt-entry').then(($entries) => {
      const widths = [...$entries].map((entry) => Number(entry.getAttribute('width') || '0'));

      expect(widths.some((width) => width > 15), 'range entry widths').to.equal(true);
      expect(widths.filter((width) => width === 15).length, 'single-date fallback widths').to.be.greaterThan(0);
    });

    openGanttSettingsDialog();
    cy.get('.runtime-error-banner').should('not.exist');

    cy.get('@ganttSettings')
      .contains('tr', rangeEntry.name)
      .should('contain.text', rangeEntry.startField)
      .and('contain.text', rangeEntry.endField);

    cy.get('@ganttSettings')
      .contains('tr', singleDateEntry.name)
      .should('contain.text', singleDateEntry.startField)
      .and('contain.text', singleDateEntry.startField);

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;
      const legendNames = gantt.ganttChartService.legend.flat().map((entry: any) => entry.name);

      expect(gantt.ganttEntries, 'stacked settings rows').to.have.length(2);
      expect(gantt.ganttChartData, 'stacked rendered entries').to.have.length(2);
      expect(legendNames, 'stacked legend labels').to.have.members([rangeEntry.name, singleDateEntry.name]);
    });

    cy.get('@ganttSettings')
      .contains('tr', rangeEntry.name)
      .find('a[title="Remove"]')
      .click({ force: true });

    cy.get('@ganttSettings').contains('tr', rangeEntry.name).should('not.exist');
    cy.get('@ganttSettings')
      .contains('tr', singleDateEntry.name)
      .should('contain.text', singleDateEntry.startField);

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;
      const legendNames = gantt.ganttChartService.legend.flat().map((entry: any) => entry.name);

      expect(gantt.ganttEntries, 'remaining settings rows').to.have.length(1);
      expect(gantt.ganttEntries[0].entryName, 'remaining settings row name').to.equal(singleDateEntry.name);
      expect(gantt.ganttChartData, 'remaining rendered entries').to.have.length(1);
      expect(gantt.ganttChartData[0].name, 'remaining rendered entry name').to.equal(singleDateEntry.name);
      expect(legendNames, 'remaining legend labels').to.deep.equal([singleDateEntry.name]);
    });

    cy.closeSettingsPane('Gantt Settings');

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 14);
    cy.get('ganttcomponent #gantt .gantt-entry').each(($entry) => {
      expect(Number($entry.attr('width') || '0'), 'remaining single-date bar width').to.equal(15);
    });

    openGanttSettingsDialog();
    cy.get('.runtime-error-banner').should('not.exist');
    cy.get('@ganttSettings').contains('tr', rangeEntry.name).should('not.exist');
    cy.get('@ganttSettings')
      .contains('tr', singleDateEntry.name)
      .should('contain.text', singleDateEntry.startField);
  });

  it('removes the final uploaded Gantt entry and allows a replacement entry to be created', () => {
    launchToUploadedGantt();

    createGanttEntry({
      ...rangeEntry,
      expectedEntries: 1,
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 14);

    openGanttSettingsDialog();
    cy.get('@ganttSettings')
      .contains('tr', rangeEntry.name)
      .find('a[title="Remove"]')
      .click({ force: true });

    cy.get('@ganttSettings').contains('tr', rangeEntry.name).should('not.exist');

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;
      const legendNames = Array.isArray(gantt.ganttChartService.legend)
        ? gantt.ganttChartService.legend.flat().map((entry: any) => entry.name)
        : [];

      expect(gantt.ganttEntries, 'empty settings rows').to.have.length(0);
      expect(gantt.ganttChartData, 'empty rendered entries').to.have.length(0);
      expect(legendNames, 'empty legend labels').to.have.length(0);
    });

    cy.closeSettingsPane('Gantt Settings');

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 0);
    cy.get('ganttcomponent #gantt .y-axis-text').should('have.length', 0);

    createGanttEntry({
      ...singleDateEntry,
      expectedEntries: 1,
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 14);
    cy.get('ganttcomponent #gantt .gantt-entry').each(($entry) => {
      expect(Number($entry.attr('width') || '0'), 'replacement single-date bar width').to.equal(15);
    });

    openGanttSettingsDialog();
    cy.get('@ganttSettings').contains('tr', rangeEntry.name).should('not.exist');
    cy.get('@ganttSettings')
      .contains('tr', singleDateEntry.name)
      .should('contain.text', singleDateEntry.startField);
  });
});
