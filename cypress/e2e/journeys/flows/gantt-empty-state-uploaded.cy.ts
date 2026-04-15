/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  createGanttEntry,
  goToGanttView,
  launchProfileToTwoD,
  openGanttSettingsDialog,
  selectGanttField,
} from '../../../support/journey-helpers';

type EmptyStateCase = {
  entryName: string;
  expectedBars: number;
  profile: DatasetProfile;
  startField: string;
  title: string;
  endField?: string;
};

type WinWithGantt = Window & {
  commonService: any;
};

const EMPTY_STATE_CASES: EmptyStateCase[] = [
  {
    profile: getProfile('gantt-covid-node-link'),
    title: 'keeps the uploaded node plus link Gantt empty state stable before the first entry is created',
    entryName: 'Symptom Window',
    startField: 'Date of symptom onset Date',
    endField: 'Date symptoms resolved',
    expectedBars: 30,
  },
  {
    profile: getProfile('gantt-angulartesting-sequence-node'),
    title: 'keeps the uploaded sequence-node Gantt empty state stable before the first entry is created',
    entryName: 'Admission Range',
    startField: 'ipstart',
    endField: 'ipend',
    expectedBars: 14,
  },
];

function launchToUploadedGantt(profile: DatasetProfile): void {
  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  goToGanttView();
}

function assertEmptyGanttState(): void {
  cy.get('.runtime-error-banner').should('not.exist');
  cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 0);
  cy.get('ganttcomponent #gantt .y-axis-text').should('have.length', 0);

  cy.window().should((win: unknown) => {
    const gantt = (win as WinWithGantt).commonService.visuals.gantt;
    const legend = Array.isArray(gantt.ganttChartService.legend)
      ? gantt.ganttChartService.legend.flat()
      : [];

    expect(gantt.ganttEntries, 'empty settings rows').to.have.length(0);
    expect(gantt.ganttChartData, 'empty rendered entries').to.have.length(0);
    expect(legend, 'empty legend rows').to.have.length(0);
  });
}

describe('Journey Flow - Gantt empty-state behavior on uploaded data', () => {
  EMPTY_STATE_CASES.forEach(({ profile, title, entryName, startField, endField, expectedBars }) => {
    it(title, () => {
      launchToUploadedGantt(profile);
      assertEmptyGanttState();

      cy.contains('.p-dialog-title', 'Gantt Settings').should('be.visible');
      cy.closeSettingsPane('Gantt Settings');
      openGanttSettingsDialog();

      assertEmptyGanttState();

      createGanttEntry({
        name: entryName,
        startField,
        endField,
      });

      cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', expectedBars);
      cy.get('ganttcomponent #gantt .y-axis-text').should('have.length', expectedBars);
    });
  });

  it('blocks creating an uploaded Gantt entry until a start date field is selected', () => {
    const profile = getProfile('gantt-covid-node-link');

    launchToUploadedGantt(profile);
    openGanttSettingsDialog();
    assertEmptyGanttState();

    cy.get('@ganttSettings')
      .contains('button', 'Create Entry')
      .as('createEntryButton')
      .should('be.disabled');

    cy.window().then((win: any) => {
      win.commonService.visuals.gantt.createGanttEntry();
    });

    cy.contains('.p-dialog-title', 'Gantt Settings').should('be.visible');
    assertEmptyGanttState();

    selectGanttField('gantt-start', 'Date of symptom onset Date', 'GanttStartVariable');
    cy.get('@createEntryButton').should('not.be.disabled');

    selectGanttField('gantt-end', 'Date symptoms resolved', 'GanttEndVariable');
    cy.get('@createEntryButton').click({ force: true });

    cy.contains('.p-dialog-title', 'Gantt Settings').should('not.exist');
    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 30);

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;

      expect(gantt.ganttEntries, 'created entries').to.have.length(1);
      expect(gantt.ganttEntries[0].startDate, 'created start field').to.equal('Date of symptom onset Date');
      expect(gantt.ganttEntries[0].endDate, 'created end field').to.equal('Date symptoms resolved');
    });
  });
});
