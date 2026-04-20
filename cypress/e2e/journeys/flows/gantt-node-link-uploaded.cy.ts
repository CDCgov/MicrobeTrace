/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  createGanttEntry,
  goToGanttView,
  launchProfileToTwoD,
  openGanttSettingsDialog,
} from '../../../support/journey-helpers';

describe('Journey Flow - Gantt uploaded node plus link data', () => {
  const profile = getProfile('gantt-covid-node-link');
  const expectedRenderedBars = 30;
  const expectedRenderedRows = 33;

  it('renders a symptom-window Gantt entry for uploaded nodes with complete symptom dates', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToGanttView();

    createGanttEntry({
      name: 'Symptom Window',
      startField: 'Date of symptom onset Date',
      endField: 'Date symptoms resolved',
      color: '#ff6f3c',
    });

    cy.get('ganttcomponent #gantt svg', { timeout: 20000 }).should('be.visible');
    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', expectedRenderedBars);
    cy.get('ganttcomponent #gantt .y-axis-text').should('have.length', expectedRenderedRows);

    cy.window().then((win: any) => {
      const gantt = win.commonService.visuals.gantt;

      expect(gantt.ganttEntries, 'gantt entry table').to.have.length(1);
      expect(gantt.ganttEntries[0].entryName, 'entry name').to.equal('Symptom Window');
      expect(gantt.ganttEntries[0].startDate, 'start field').to.equal('Date of symptom onset Date');
      expect(gantt.ganttEntries[0].endDate, 'end field').to.equal('Date symptoms resolved');
      expect(Object.keys(gantt.ganttChartData[0].timelines), 'timelines keyed by node id').to.have.length(expectedRenderedRows);
      expect(gantt.ganttChartService.ganttPhases, 'rendered row labels').to.have.length(expectedRenderedRows);
    });

    openGanttSettingsDialog();
    cy.get('@ganttSettings')
      .contains('tr', 'Symptom Window')
      .should('contain.text', 'Date of symptom onset Date')
      .and('contain.text', 'Date symptoms resolved');
  });
});
