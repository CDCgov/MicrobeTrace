// cypress/support/journey-helpers.ts
/// <reference types="cypress" />

import type { Core } from 'cytoscape';
import type { DatasetProfile, DistanceMetric, DefaultView } from '../e2e/journeys/datasets/profile';
import type { FileLoadSpec } from '../e2e/journeys/datasets/profile';

type WinWithMT = Window & {
  commonService: any;
  cytoscapeInstance?: Core;
};

export function acceptEulaIfPresent(): void {
  cy.get('body', { log: false }).then(($body) => {
    const hasEula =
      $body.find('.p-dialog-title:contains("License Agreement")').length > 0;

    if (!hasEula) return;

    cy.contains('.p-dialog-title', 'License Agreement')
      .parents('.p-dialog')
      .within(() => {
        cy.contains('button', 'Accept').click({ force: true });
      });

    cy.contains('.p-dialog-title', 'License Agreement').should('not.exist');
  });
}

export function visitAppAndAcceptEula(): void {
  cy.visit('/');
  cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  acceptEulaIfPresent();
}

export function loadFilesUI(opts: FileLoadSpec[]): void {
    const fileNames = opts.map(f => f.name);
    const mimeTypes = fileNames.map(getMimeTypeFromFilename);
  
    cy.attach_files('#fileDropRef', fileNames, mimeTypes);
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
    cy.get('#launch').should('not.be.disabled');
  
    opts.forEach((file) => {
      cy.contains('#file-table .file-table-row', file.name)
        .should('be.visible')
        .then(($fileRow) => {
          const $row = cy.wrap($fileRow);
  
          const activeType = $fileRow.find('label.active input').attr('data-type');
          if (activeType !== file.datatype) {
            $row.find(`input[data-type="${file.datatype}"]`).click({ force: true });
          }
  
          if (file.datatype === 'link' || file.datatype === 'node') {
            const checkField = (expectedValue: string, fieldNumber: number) => {
              const selectId = `file-${file.name}-field-${fieldNumber}`;
              cy.wrap($fileRow).find(`select[id="${selectId}"]`).then($sel => {
                const current = String($sel.val());
                if (current !== expectedValue) cy.wrap($sel).select(expectedValue);
              });
              cy.get(`select[id="${selectId}"]`).should('have.value', expectedValue);
            };
  
            if (file.field1 !== undefined) checkField(file.field1, 1);
            if (file.field2 !== undefined) checkField(file.field2, 2);
            if (file.datatype === 'link' && file.field3 !== undefined) checkField(file.field3, 3);
          }
        });
    });
  
    cy.get('#launch').should('not.be.disabled');
  }

export function applyPreLaunchFileSettings(profile: DatasetProfile): void {
  // matches your existing file tests: click settings gear that opens #file-settings-pane
  cy.get('a[title="Settings"]', { timeout: 15000 }).first().click({ force: true });

  cy.get('#file-settings-pane', { timeout: 15000 })
    .should('be.visible')
    .as('fileSettings');

  cy.get('@fileSettings')
    .find('#default-distance-metric')
    .should('be.visible')
    .select(profile.preLaunch.metric);

  cy.get('@fileSettings')
    .find('#default-distance-threshold')
    .should('be.visible')
    .clear()
    .type(String(profile.preLaunch.threshold))
    .blur();

  if (profile.preLaunch.defaultView) {
    cy.get('@fileSettings')
      .find('#default-view')
      .should('be.visible')
      .select(profile.preLaunch.defaultView);
  }

  cy.get('@fileSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.get('#file-settings-pane').should('not.be.visible');

  cy.window().its('commonService.session.style.widgets.default-distance-metric')
    .should('equal', profile.preLaunch.metric);

  cy.window().its('commonService.session.style.widgets.link-threshold')
    .should('equal', profile.preLaunch.threshold);
}

export function launchAndWaitForProcessing(timeout = 60000): void {
  cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
  cy.get('#launch').click({ force: true });
  cy.get('#loading-information', { timeout }).should('not.exist');
}

export function goTo2DNetworkView(): void {
  cy.contains('button', 'View', { timeout: 15000 }).click({ force: true });
  cy.contains('button[mat-menu-item]', '2D Network', { timeout: 15000 }).click({ force: true });

  cy.get('#cy', { timeout: 30000 }).should('be.visible');
  cy.window({ timeout: 30000 }).should('have.property', 'cytoscapeInstance');
}

export function assertAfterLaunchCounts(profile: DatasetProfile): void {
  const expected = profile.expectations.afterLaunch;
  if (!expected) return;

  const readInt = (selector: string) =>
    cy.get(selector, { timeout: 20000 })
      .invoke('text')
      .then((t) => parseInt(String(t).replace(/,/g, ''), 10));

  if (expected.nodes !== undefined) {
    readInt('#numberOfNodes').should('equal', expected.nodes);
  }
  if (expected.visibleLinks !== undefined) {
    readInt('#numberOfVisibleLinks').should('equal', expected.visibleLinks);
  }
  if (expected.clusters !== undefined) {
    readInt('#numberOfDisjointComponents').should('equal', expected.clusters);
  }
  if (expected.singletons !== undefined) {
    readInt('#numberOfSingletonNodes').should('equal', expected.singletons);
  }
}

export function openTwoDSettingsDialog(): void {
  cy.get('TwoDComponent #tool-btn-container a[title="Settings"]', { timeout: 15000 })
    .should('exist')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings', { timeout: 10000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('twoDSettings');
}

export function enableGroupingShow(groupBy: 'cluster' | 'subtype' = 'cluster'): void {
  openTwoDSettingsDialog();

  cy.get('@twoDSettings').contains('.nav-link', 'Grouping').click({ force: true });

  cy.get('@twoDSettings')
    .contains('p-accordionTab', 'Controls')
    .click({ force: true });

  cy.get('@twoDSettings')
    .find('#polygons-controls')
    .should('be.visible');

  // Show groups
  cy.get('@twoDSettings')
    .find('#polygons-controls')
    .find('#colorPolygonsTable')
    .contains('Show')
    .click({ force: true });

  cy.window().its('commonService.session.style.widgets.polygons-show')
    .should('equal', true);

  // Set group-by if needed (only visible after show=true)
  if (groupBy !== 'cluster') {
    cy.get('@twoDSettings').find('#polygons-foci').should('be.visible').click({ force: true });
    cy.contains('li[role="option"]', 'Subtype').click({ force: true });
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');
  } else {
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'cluster');
  }

  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
}

export function assertGroupedByCluster(): void {
  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const cyInstance = w.cytoscapeInstance as Core;

    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const visibleNodes = (w.commonService.session.data.nodes || [])
      .filter((n: any) => n.visible !== false);

    const visibleClusters = new Set(visibleNodes.map((n: any) => String(n.cluster)));

    const parentCount = cyInstance.nodes('.parent').length;
    expect(parentCount, 'parent node count').to.equal(visibleClusters.size);

    visibleNodes.forEach((n: any) => {
      const nodeId = String(n._id || n.id);
      const clusterId = String(n.cluster);

      const cyNode = cyInstance.getElementById(nodeId);
      expect(cyNode.empty(), `cy node exists: ${nodeId}`).to.equal(false);

      const parent = cyNode.parent();
      expect(parent.empty(), `node ${nodeId} has parent`).to.equal(false);

      const pid = parent.id();
      expect([clusterId, `group-${clusterId}`], `node ${nodeId} parent id`)
        .to.include(pid);
    });
  });
}
