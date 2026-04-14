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

describe('Journey Flow - Gantt uploaded data-mapping edge cases', () => {
  const profile = getProfile('gantt-cypress-edge-case-node-link');

  it('skips sparse rows that do not have both start and end dates', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToGanttView();

    createGanttEntry({
      name: 'Sparse Window',
      startField: 'Sparse start date',
      endField: 'Sparse end date',
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 2);
    cy.get('ganttcomponent #gantt .y-axis-text').should('have.length', 2);

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;
      const timelines = gantt.ganttChartData[0].timelines;
      const keys = Object.keys(timelines);

      expect(keys, 'nodes with complete sparse dates').to.have.members(['A', 'D']);
      expect(keys, 'sparse timeline key count').to.have.length(2);
      expect(timelines.A[0].from, 'A sparse start').to.equal('2024-07-01');
      expect(timelines.A[0].to, 'A sparse end').to.equal('2024-07-05');
      expect(timelines.D[0].from, 'D sparse start').to.equal('2024-07-04');
      expect(timelines.D[0].to, 'D sparse end').to.equal('2024-07-04');
      expect(gantt.ganttChartService.ganttPhases, 'rendered sparse rows').to.have.length(2);
    });

    openGanttSettingsDialog();
    cy.get('@ganttSettings')
      .contains('tr', 'Sparse Window')
      .should('contain.text', 'Sparse start date')
      .and('contain.text', 'Sparse end date');
  });

  it('normalizes GMT-stamped dates before rendering Gantt bars', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToGanttView();

    createGanttEntry({
      name: 'Timezone Window',
      startField: 'Timezone start date',
      endField: 'Timezone end date',
    });

    cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', 4);
    cy.get('ganttcomponent #gantt .y-axis-text').should('have.length', 4);
    cy.get('ganttcomponent #gantt .gantt-entry').then(($entries) => {
      const widths = [...$entries].map((entry) => Number(entry.getAttribute('width') || '0'));

      expect(widths.some((width) => width > 15), 'timezone ranges retain multi-day widths').to.equal(true);
      expect(widths.some((width) => width === 15), 'timezone single-day rows keep fallback width').to.equal(true);
    });

    cy.window().should((win: unknown) => {
      const gantt = (win as WinWithGantt).commonService.visuals.gantt;
      const timelines = gantt.ganttChartData[0].timelines;

      expect(Object.keys(timelines), 'timezone timeline key count').to.have.length(4);
      expect(timelines.A[0].from, 'normalized A timezone start').to.equal('Jul 01 2024');
      expect(timelines.A[0].to, 'normalized A timezone end').to.equal('Jul 05 2024');
      expect(timelines.B[0].from, 'normalized B timezone start').to.equal('Jul 02 2024');
      expect(timelines.B[0].to, 'normalized B timezone end').to.equal('Jul 09 2024');
      expect(timelines.C[0].from, 'normalized C timezone start').to.equal('Jul 03 2024');
      expect(timelines.C[0].to, 'normalized C timezone end').to.equal('Jul 03 2024');
      expect(timelines.D[0].from, 'normalized D timezone start').to.equal('Jul 04 2024');
      expect(timelines.D[0].to, 'normalized D timezone end').to.equal('Jul 04 2024');

      Object.values(timelines).forEach((timelineRows: any) => {
        expect(String(timelineRows[0].from), 'normalized from value').not.to.include('GMT');
        expect(String(timelineRows[0].to), 'normalized to value').not.to.include('GMT');
      });
    });

    openGanttSettingsDialog();
    cy.get('@ganttSettings')
      .contains('tr', 'Timezone Window')
      .should('contain.text', 'Timezone start date')
      .and('contain.text', 'Timezone end date');
  });
});
