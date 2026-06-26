/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  createGanttEntry,
  goToGanttView,
  launchProfileToTwoD,
  openGanttSettingsDialog,
} from '../../../support/journey-helpers';

describe('Journey Flow - Gantt uploaded sequence node list', () => {
  const profile = getProfile('gantt-angulartesting-sequence-node');

  it('renders a date-range Gantt entry from uploaded sequence-node fields', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToGanttView();

    createGanttEntry({
      name: 'Infectious Period',
      startField: 'ipstart',
      endField: 'ipend',
      color: '#00897b',
      expectedEntries: 1,
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 14);

    cy.get('ganttcomponent #gantt .gantt-entry').then(($entries) => {
      const widths = [...$entries].map((entry) => Number(entry.getAttribute('width') || '0'));

      expect(widths.some((width) => width > 15), 'range entries wider than the single-day fallback').to.equal(true);
    });

    cy.window().then((win: any) => {
      const gantt = win.commonService.visuals.gantt;

      expect(gantt.ganttEntries, 'gantt entry table').to.have.length(1);
      expect(gantt.ganttEntries[0].startDate, 'range entry start').to.equal('ipstart');
      expect(gantt.ganttEntries[0].endDate, 'range entry end').to.equal('ipend');
    });

    openGanttSettingsDialog();
    cy.get('@ganttSettings')
      .contains('tr', 'Infectious Period')
      .should('contain.text', 'ipstart')
      .and('contain.text', 'ipend');
  });

  it('renders a single-date Gantt entry from an uploaded sequence-node field', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToGanttView();

    createGanttEntry({
      name: 'Diagnosis Date',
      startField: 'Diagnosis date',
      color: '#8e24aa',
      expectedEntries: 1,
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 14);
    cy.get('ganttcomponent #gantt .gantt-entry').then(($entries) => {
      const widths = [...$entries].map((entry) => Number(entry.getAttribute('width') || '0'));
      expect(widths.every((width) => width === 15), 'single-date entries render as fixed-width markers').to.equal(true);
    });

    cy.window().then((win: any) => {
      const gantt = win.commonService.visuals.gantt;

      expect(gantt.ganttEntries, 'gantt entry table').to.have.length(1);
      expect(gantt.ganttEntries[0].startDate, 'single-date entry start').to.equal('Diagnosis date');
      expect(gantt.ganttEntries[0].endDate, 'single-date entry auto-fills end').to.equal('Diagnosis date');
    });

    openGanttSettingsDialog();
    cy.get('@ganttSettings')
      .contains('tr', 'Diagnosis Date')
      .should('contain.text', 'Diagnosis date');
  });
});
