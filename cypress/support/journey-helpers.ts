// cypress/support/journey-helpers.ts
/// <reference types="cypress" />

import type { Core } from 'cytoscape';
import type { DatasetProfile, DistanceMetric, DefaultView } from '../e2e/journeys/datasets/profile';
import type { FileLoadSpec } from '../e2e/journeys/datasets/profile';
import type { JourneyExpectations } from '../e2e/journeys/datasets/types';

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


  export function applyPreLaunchSessionSettings(profile: DatasetProfile): void {
    cy.window().then((win: unknown) => {
      const w = win as WinWithMT;
      const cs = w.commonService;
  
      cs.session.style.widgets['default-distance-metric'] = profile.preLaunch.metric;
      cs.session.style.widgets['link-threshold'] = profile.preLaunch.threshold;
  
      if (profile.preLaunch.defaultView) {
        cs.session.style.widgets['default-view'] = profile.preLaunch.defaultView;
      }
  
      // keep GlobalSettingsModel consistent (some code reads from here too)
      cs.GlobalSettingsModel.SelectedDistanceMetricVariable = profile.preLaunch.metric;
      cs.GlobalSettingsModel.SelectedLinkThresholdVariable = profile.preLaunch.threshold;
    });
  }


  export function applyTwoDGroupingFromProfile(profile: DatasetProfile): void {
    const g = profile.expectations.grouping;
    if (!g) return;
  
    openTwoDSettingsDialog();
  
    cy.get('@twoDSettings').contains('.nav-link', 'Grouping').click({ force: true });
  
    // Controls
    expandAccordionTabByHeader('@twoDSettings', 'Controls');

    cy.get('@twoDSettings')
    .find('#polygons-controls')
    .should('exist')
    .within(() => {
      cy.get('#polygons-show-toggle')
        .contains('button, .p-button, .ui-button', 'Show')
        .click({ force: true });
    });

    cy.window()
      .its('commonService.session.style.widgets.polygons-show')
      .should('equal', g.showGroups);

    if (g.showGroups) {
      assertGroupsRendered(1);
    }
  
    // Group By (only visible when showGroups=true)
    if (g.showGroups) {
      const wantSubtype = g.groupBy === 'Subtype';
  
      // If you need to switch to subtype
      if (wantSubtype) {
        cy.get('@twoDSettings').find('#polygons-foci').should('be.visible').click({ force: true });
        cy.contains('li[role="option"]', 'Subtype').click({ force: true });
        cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');
      } else {
        // default is cluster
        cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'cluster');
      }
    }
  
    // Labels
    if (g.showGroups) {
      cy.get('@twoDSettings').contains('p-accordionTab', 'Labels').click({ force: true });
  
      cy.get('@twoDSettings')
        .find('#polygons-label-visibility')
        .contains(g.showGroupLabels ? 'Show' : 'Hide')
        .click({ force: true });
  
      cy.window().its('commonService.session.style.widgets.polygons-label-show')
        .should('equal', g.showGroupLabels);
    }
  
    // Colors
    if (g.showGroups) {
      cy.get('@twoDSettings').contains('p-accordionTab', 'Colors').click({ force: true });
  
      cy.get('@twoDSettings')
        .find('#colorPolygons') // Color Groups show/hide
        .contains(g.showGroupColors ? 'Show' : 'Hide')
        .click({ force: true });
  
      cy.window().its('commonService.session.style.widgets.polygons-color-show')
        .should('equal', g.showGroupColors);
  
      // If we are showing group colors, also ensure the table is visible (needed to test changing colors)
      if (g.showGroupColors) {
        cy.get('@twoDSettings')
          .find('#polygon-color-table-row')
          .should('be.visible')
          .within(() => {
            cy.get('#polygon-color-table-toggle').contains('Show').click({ force: true });
          });
  
        cy.window().its('commonService.session.style.widgets.polygon-color-table-visible')
          .should('equal', true);
  
        // Optional: change some group colors if specified
        if (g.changeGroupColors?.groups?.length) {
          // table lives in the separate polygon color dialog
          cy.get('#polygon-color-table-wrapper', { timeout: 15000 }).should('be.visible');
  
          g.changeGroupColors.groups.forEach((groupKey, idx) => {
            const newColor = idx % 2 === 0 ? '#ff0000' : '#00ff00';
  
            cy.get('#polygon-color-table')
              .find(`td[data-value="${groupKey}"]`)
              .should('exist')
              .parents('tr')
              .within(() => {
                cy.get('input[type="color"]').then(($input) => {
                  const el = $input.get(0) as HTMLInputElement;
                  el.value = newColor;
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                });
              });
          });
  
          // quick sanity: parent nodes exist when groups are shown
          cy.window().then((win: unknown) => {
            const w = win as WinWithMT;
            const cyInstance = w.cytoscapeInstance as Core;
            expect(cyInstance.nodes('.parent').length).to.be.greaterThan(0);
          });
        }
      }
    }
  
    cy.get('@twoDSettings')
      .find('button.p-dialog-close-button')
      .click({ force: true });
  
    cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
  }

  function expandAccordionTabByHeader(containerAlias: string, headerText: string): void {
    const timeout = 15000;
  
    const HEADER_CLICK_SEL = [
      '.p-accordion-header',
      '.p-accordion-header-link',
      '.p-accordion-header-action',
      '.ui-accordion-header',
      '.ui-accordion-header a'
    ].join(', ');
  
    const TAB_SEL = '.p-accordion-tab, .ui-accordion-tab';
    const CONTENT_SEL = [
      '.p-accordion-content',
      '.ui-accordion-content',
      '.p-toggleable-content',
      '.ui-toggleable-content'
    ].join(', ');
  
    // Find the header by text, then walk up to something clickable
    cy.get(containerAlias, { timeout })
      .should('exist')
      .contains(headerText, { timeout })
      .then(($t) => {
        const $clickTarget = $t.closest(HEADER_CLICK_SEL).length ? $t.closest(HEADER_CLICK_SEL) : $t;
        cy.wrap($clickTarget).as('accHeader');
      });
  
    cy.get('@accHeader').then(($h) => {
      const $header = $h;
  
      const ariaExpanded = $header.attr('aria-expanded');
      const isExpanded =
        $header.hasClass('p-highlight') ||
        $header.hasClass('ui-state-active') ||
        ariaExpanded === 'true';
  
      if (!isExpanded) {
        cy.wrap($header).scrollIntoView().click({ force: true });
      }
  
      // PrimeNG usually wires header -> content via aria-controls
      const controlsId = $header.attr('aria-controls');
      if (controlsId) {
        cy.get(`#${controlsId}`, { timeout }).should('be.visible');
        return;
      }
  
      // Fallback: locate the tab wrapper and assert any content block is visible
      const $tab = $header.closest(TAB_SEL);
      if ($tab.length) {
        cy.wrap($tab).find(CONTENT_SEL).first().should('be.visible');
        return;
      }
  
      // Last resort: within container, ensure some content exists after the click
      cy.get(containerAlias).find(CONTENT_SEL).should('exist');
    });
  }
  
  
  function assertGroupsRendered(minParents = 1): void {
    cy.window()
      .its('cytoscapeInstance')
      .should((cyInst: any) => {
        expect(cyInst, 'cytoscapeInstance').to.exist;
        const parents = cyInst.nodes('.parent').length;
        expect(parents, 'parent groups rendered').to.be.greaterThan(minParents - 1);
      });
  }
  

  export function assertGroupingMembershipFromProfile(profile: DatasetProfile): void {
    const expected = profile.expectations.grouping?.expectedGroups;
    if (!expected) return;
  
    const resolveParent = (cyInstance: Core, groupKey: string) => {
      const direct = cyInstance.getElementById(String(groupKey));
      if (direct && !direct.empty()) return direct;
  
      const prefixed = cyInstance.getElementById(`group-${String(groupKey)}`);
      if (prefixed && !prefixed.empty()) return prefixed;
  
      return direct; // empty (for error messaging)
    };
  
    cy.window().then((win: unknown) => {
      const w = win as WinWithMT;
      const cyInstance = w.cytoscapeInstance as Core;
  
      expect(cyInstance, 'cytoscapeInstance').to.exist;
  
      const expectedGroupKeys = Object.keys(expected);
  
      // Parent count should match number of expected groups (regardless of id format)
      const parentCount = cyInstance.nodes('.parent').length;
      expect(parentCount, 'parent group count').to.equal(expectedGroupKeys.length);
  
      expectedGroupKeys.forEach((groupKey) => {
        const parent = resolveParent(cyInstance, groupKey);
  
        expect(parent.empty(), `parent group exists: ${groupKey}`).to.equal(false);
  
        // Exact child membership
        const childIds = parent.children().map((n) => n.id());
        const childSet = new Set(childIds);
  
        const expectedChildren = expected[groupKey].map(String);
        const expectedSet = new Set(expectedChildren);
  
        expectedChildren.forEach((id) => {
          expect(childSet.has(id), `group ${groupKey} contains ${id}`).to.equal(true);
        });
  
        childIds.forEach((id) => {
          expect(expectedSet.has(id), `group ${groupKey} unexpected child ${id}`).to.equal(true);
        });
      });
  
      // Also assert every visible non-parent node belongs to one of the expected groups
      const expectedAllNodeIds = new Set(expectedGroupKeys.flatMap((k) => expected[k].map(String)));
  
      const visibleChildNodes = cyInstance
        .nodes(':visible')
        .filter((n) => n.children().length === 0);
  
      visibleChildNodes.forEach((n) => {
        const id = n.id();
        expect(expectedAllNodeIds.has(id), `visible node accounted for: ${id}`).to.equal(true);
  
        const parent = n.parent();
        expect(parent.empty(), `node has parent: ${id}`).to.equal(false);
  
        const pid = parent.id();
        const ok = expectedGroupKeys.some((k) => pid === String(k) || pid === `group-${String(k)}`);
        expect(ok, `node ${id} parent id recognized`).to.equal(true);
      });
    });
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
  cy.get('@twoDSettings').find('#polygons-controls', { timeout: 15000 }).should('exist');


  // Expand Controls correctly (PrimeNG)
  expandAccordionTabByHeader('@twoDSettings', 'Controls');

  // Show groups (inside Controls)
  cy.get('@twoDSettings')
  .find('#polygons-controls')
  .should('exist')
  .within(() => {
    cy.get('#polygons-show-toggle')
      .contains('button, .p-button, .ui-button', 'Show')
      .click({ force: true });
  });

  cy.window()
    .its('commonService.session.style.widgets.polygons-show')
    .should('equal', true);

  // Wait until Cytoscape actually has parent nodes (groups)
  assertGroupsRendered(1);

  // Set group-by if needed (only visible after show=true)
  if (groupBy !== 'cluster') {
    cy.get('@twoDSettings')
      .find('#polygons-foci')
      .should('be.visible')
      .click({ force: true });

    cy.contains('li[role="option"]', 'Subtype').click({ force: true });

    cy.window()
      .its('commonService.session.style.widgets.polygons-foci')
      .should('equal', 'subtype');
  } else {
    cy.window()
      .its('commonService.session.style.widgets.polygons-foci')
      .should('equal', 'cluster');
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
