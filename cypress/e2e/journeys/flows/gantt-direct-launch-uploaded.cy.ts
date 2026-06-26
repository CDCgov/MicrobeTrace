/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertGanttReady,
  createGanttEntry,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

type GanttDirectLaunchCase = {
  profileId: string;
  title: string;
  entryName: string;
  startField: string;
  endField: string;
  expectedRenderedBars: number;
  expectedRenderedRows: number;
};

const GANTT_DIRECT_LAUNCH_CASES: GanttDirectLaunchCase[] = [
  {
    profileId: 'gantt-covid-node-link',
    title: 'Gantt direct launch: uploaded node plus link files reach interactive Gantt on launch',
    entryName: 'Symptom Window',
    startField: 'Date of symptom onset Date',
    endField: 'Date symptoms resolved',
    expectedRenderedBars: 30,
    expectedRenderedRows: 33,
  },
  {
    profileId: 'gantt-angulartesting-sequence-node',
    title: 'Gantt direct launch: uploaded sequence node list reaches interactive Gantt on launch',
    entryName: 'Infectious Period',
    startField: 'ipstart',
    endField: 'ipend',
    expectedRenderedBars: 14,
    expectedRenderedRows: 14,
  },
];

const asDirectGanttProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Gantt Chart',
  },
});

const launchProfileDirectToGantt = (profile: DatasetProfile): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  launchAndWaitForProcessing(60000);
  assertGanttReady();
};

const assertDirectLaunchSessionCounts = (profile: DatasetProfile): void => {
  const expected = profile.expectations.afterLaunch;
  if (!expected) return;

  cy.window().should((win: any) => {
    if (expected.nodes !== undefined) {
      expect(win.commonService.session.data.nodes.length, 'loaded node count').to.equal(expected.nodes);
    }
    if (expected.visibleLinks !== undefined) {
      const visibleLinks = win.commonService.session.data.links.filter((link: any) => link.visible);
      expect(visibleLinks.length, 'visible link count').to.equal(expected.visibleLinks);
    }
  });
};

describe('Journey Flow - Gantt direct launch on uploaded data', () => {
  GANTT_DIRECT_LAUNCH_CASES.forEach(
    ({ profileId, title, entryName, startField, endField, expectedRenderedBars, expectedRenderedRows }) => {
      const profile = asDirectGanttProfile(getProfile(profileId));

      it(title, () => {
        launchProfileDirectToGantt(profile);
        assertDirectLaunchSessionCounts(profile);

        cy.window()
          .its('commonService.session.style.widgets.default-view')
          .should('equal', 'Gantt Chart');

        createGanttEntry({
          name: entryName,
          startField,
          endField,
        });

        cy.get('ganttcomponent #gantt .gantt-entry').should('have.length', expectedRenderedBars);
        cy.get('ganttcomponent #gantt .y-axis-text').should('have.length', expectedRenderedRows);

        cy.window().then((win: any) => {
          const gantt = win.commonService.visuals.gantt;

          expect(gantt.ganttEntries, 'gantt entry table').to.have.length(1);
          expect(gantt.ganttEntries[0].entryName, 'entry name').to.equal(entryName);
          expect(gantt.ganttEntries[0].startDate, 'entry start field').to.equal(startField);
          expect(gantt.ganttEntries[0].endDate, 'entry end field').to.equal(endField);
        });
      });
    },
  );
});
