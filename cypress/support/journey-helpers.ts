// cypress/support/journey-helpers.ts
/// <reference types="cypress" />

import type { Core } from 'cytoscape';
import type { FileLoadSpec } from '../e2e/journeys/datasets/profile';
import type { DatasetProfile, DistanceMetric, LinkLabelVariable, PruneWith } from '../e2e/journeys/datasets/profile';
import { resolveExpected } from '../e2e/journeys/datasets/profile';
import { byTestId, testIds } from './selectors';

type WinWithMT = Window & {
  commonService: any;
  cytoscapeInstance?: Core;
};

type JourneyVisitOptions = {
  extraQuery?: Record<string, string | number | boolean>;
  skipDemoSession?: boolean;
  skipEula?: boolean;
};

function buildJourneyUrl(options: JourneyVisitOptions = {}): string {
  const params = new URLSearchParams();
  const skipDemoSession = options.skipDemoSession ?? true;
  const skipEula = options.skipEula ?? true;

  if (skipDemoSession) {
    params.set('skipDemoSession', '1');
  }

  if (skipEula) {
    params.set('skipEula', '1');
  }

  Object.entries(options.extraQuery || {}).forEach(([key, value]) => {
    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `/?${query}` : '/';
}

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

export function visitAppAndAcceptEula(options: JourneyVisitOptions = {}): void {
  const resolvedOptions: JourneyVisitOptions = {
    skipDemoSession: true,
    skipEula: true,
    ...options,
  };

  cy.visit(buildJourneyUrl(resolvedOptions));
  cy.get('#fileDropRef', { timeout: 15000 }).should('exist');

  if (!resolvedOptions.skipEula) {
    acceptEulaIfPresent();
  }

  cy.get('body').then(($body) => {
    const continueButton = $body.find(byTestId(testIds.appSampleDatasetButton));
    if (!continueButton.length) return;

    cy.get(byTestId(testIds.appSampleDatasetButton)).click({ force: true });
    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
  });
}

export function loadFilesUI(opts: FileLoadSpec[]): void {
  cy.loadFiles(opts);
}

export function applyPreLaunchSessionSettings(profile: DatasetProfile): void {
  applyPreLaunchFileSettings(profile);
}

export function syncPreLaunchProfileToSession(profile: DatasetProfile): void {
  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const widgets = w.commonService.session.style.widgets;

    widgets['default-distance-metric'] = profile.preLaunch.metric;
    widgets['link-threshold'] = profile.preLaunch.threshold;

    if (profile.preLaunch.defaultView) {
      widgets['default-view'] = profile.preLaunch.defaultView;
    }

    w.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = profile.preLaunch.metric;
    w.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = profile.preLaunch.threshold;

    if (profile.preLaunch.defaultView) {
      w.commonService.GlobalSettingsModel.SelectedDefaultViewVariable = profile.preLaunch.defaultView;
    }

    const microbeTrace = w.commonService.visuals?.microbeTrace;
    if (microbeTrace) {
      microbeTrace.metric = profile.preLaunch.metric;
      microbeTrace.threshold = String(profile.preLaunch.threshold);
      microbeTrace.SelectedDistanceMetricVariable = profile.preLaunch.metric;
      microbeTrace.SelectedLinkThresholdVariable = profile.preLaunch.threshold;
    }
  });
}

export function ensurePreLaunchProfileSynced(profile: DatasetProfile): void {
  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const widgets = w.commonService.session.style.widgets;

    const needsSync =
      widgets['default-distance-metric'] !== profile.preLaunch.metric ||
      Number(widgets['link-threshold']) !== Number(profile.preLaunch.threshold) ||
      (
        profile.preLaunch.defaultView !== undefined &&
        widgets['default-view'] !== profile.preLaunch.defaultView
      );

    if (!needsSync) return;

    syncPreLaunchProfileToSession(profile);
  });
}

function resolveParentGroupNode(cyInstance: Core, groupKey: string) {
  const direct = cyInstance.getElementById(String(groupKey));
  if (direct && !direct.empty()) return direct;

  const prefixed = cyInstance.getElementById(`group-${String(groupKey)}`);
  if (prefixed && !prefixed.empty()) return prefixed;

  return direct;
}

function hexToRgbString(hex: string): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return `rgb(${r}, ${g}, ${b})`;
}


  export function applyTwoDGroupingFromProfile(profile: DatasetProfile): void {
    const g = profile.expectations.grouping;
    if (!g) return;
  
  openTwoDSettingsDialog();

  cy.get('@twoDSettings').contains('.nav-link', 'Grouping').click({ force: true });

  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('groupingTab');
  
  // Controls
  expandAccordionTabByHeader('@groupingTab', 'Controls');

    cy.get('@groupingTab')
    .find('#polygons-controls')
    .should('exist')
    .within(() => {
      cy.get('#polygons-show-toggle')
        .contains('Show')
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
        cy.get('@groupingTab').find('#polygons-foci').should('be.visible').click({ force: true });
        cy.contains('li[role="option"]', 'Subtype').click({ force: true });
        cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');
      } else {
        // default is cluster
        cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'cluster');
      }
    }
  
    // Labels
    if (g.showGroups) {
      expandAccordionTabByHeader('@groupingTab', 'Labels');
  
      cy.get('@groupingTab')
        .find('#polygons-label-visibility')
        .contains(g.showGroupLabels ? 'Show' : 'Hide')
        .click({ force: true });
  
      cy.window().its('commonService.session.style.widgets.polygons-label-show')
        .should('equal', g.showGroupLabels);

      if (g.showGroupLabels) {
        cy.window().then((win: unknown) => {
          const w = win as WinWithMT;
          const cyInstance = w.cytoscapeInstance as Core;

          expect(cyInstance, 'cytoscapeInstance').to.exist;
          cyInstance.nodes('.parent').forEach((parentNode) => {
            expect(String(parentNode.style('label') || '').trim(), `group label for ${parentNode.id()}`)
              .to.not.equal('');
          });
        });
      }
    }
  
    // Colors
    if (g.showGroups) {
      expandAccordionTabByHeader('@groupingTab', 'Colors');
  
      cy.get('@groupingTab')
        .find('#colorPolygons') // Color Groups show/hide
        .contains(g.showGroupColors ? 'Show' : 'Hide')
        .click({ force: true });
  
      cy.window().its('commonService.session.style.widgets.polygons-color-show')
        .should('equal', g.showGroupColors);
  
      // If we are showing group colors, also ensure the table is visible (needed to test changing colors)
      if (g.showGroupColors) {
        cy.get('@groupingTab')
          .find('#polygon-color-table-row')
          .scrollIntoView()
          .should('exist')
          .within(() => {
            cy.get('#polygon-color-table-toggle').contains('Show').click({ force: true });
          });
  
        cy.window().its('commonService.session.style.widgets.polygon-color-table-visible')
          .should('equal', true);
  
        // Optional: change some group colors if specified
        if (g.changeGroupColors?.groups?.length) {
          cy.get('body').then(($body) => {
            if (!$body.find('#polygon-color-table:visible').length) return;

            g.changeGroupColors!.groups.forEach((groupKey, idx) => {
              const newColor = g.changeGroupColors?.colorsByGroup?.[groupKey] ?? (idx % 2 === 0 ? '#ff0000' : '#00ff00');
              const expectedRgb = hexToRgbString(newColor).replace(/\s+/g, '');

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
                  cy.get('input[type="color"]').should('have.value', newColor);
                });

              cy.window().then((win: unknown) => {
                const w = win as WinWithMT;
                const cyInstance = w.cytoscapeInstance as Core;
                const parentNode = resolveParentGroupNode(cyInstance, groupKey);

                expect(parentNode.empty(), `parent group exists for color change: ${groupKey}`).to.equal(false);
                expect(String(parentNode.data('nodeColor')).toLowerCase(), `stored polygon color for ${groupKey}`)
                  .to.equal(newColor.toLowerCase());
                expect(String(parentNode.style('background-color')).replace(/\s+/g, ''), `rendered polygon color for ${groupKey}`)
                  .to.equal(expectedRgb);
              });
            });

            // quick sanity: parent nodes exist when groups are shown
            cy.window().then((win: unknown) => {
              const w = win as WinWithMT;
              const cyInstance = w.cytoscapeInstance as Core;
              expect(cyInstance.nodes('.parent').length).to.be.greaterThan(0);
            });
          });
        }
      }
    }
  
    cy.get('@twoDSettings')
      .find('button.p-dialog-close-button')
      .click({ force: true });
  
    cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
  }

export function expandAccordionTabByHeader(containerAlias: string, headerText: string): void {
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
        cy.wrap($header).should(($expandedHeader) => {
          const expanded =
            $expandedHeader.hasClass('p-highlight') ||
            $expandedHeader.hasClass('ui-state-active') ||
            $expandedHeader.attr('aria-expanded') === 'true';

          expect(expanded, `accordion expanded: ${headerText}`).to.equal(true);
        });
        cy.get(`#${controlsId}`, { timeout }).should('exist');
        return;
      }
  
      // Fallback: locate the tab wrapper and assert any content block is visible
      const $tab = $header.closest(TAB_SEL);
      if ($tab.length) {
        cy.wrap($tab).find(CONTENT_SEL).first().should('exist');
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
  
    cy.window().then((win: unknown) => {
      const w = win as WinWithMT;
      const cyInstance = w.cytoscapeInstance as Core;
  
      expect(cyInstance, 'cytoscapeInstance').to.exist;
  
      const expectedGroupKeys = Object.keys(expected);
  
      // Parent count should match number of expected groups (regardless of id format)
      const parentCount = cyInstance.nodes('.parent').length;
      expect(parentCount, 'parent group count').to.equal(expectedGroupKeys.length);
  
      expectedGroupKeys.forEach((groupKey) => {
        const parent = resolveParentGroupNode(cyInstance, groupKey);
  
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
  cy.get(byTestId(testIds.filesSettingsButton), { timeout: 15000 }).click({ force: true });

  cy.contains('.p-dialog-title', 'File Settings', { timeout: 15000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('fileSettings');

  cy.get('@fileSettings')
    .find('#default-distance-metric')
    .should('be.visible')
    .then(($select) => {
      const select = $select.get(0) as HTMLSelectElement;
      select.value = profile.preLaunch.metric;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get('@fileSettings')
    .find('#default-distance-metric')
    .should('have.value', profile.preLaunch.metric);

  cy.get('@fileSettings')
    .find('#default-distance-threshold')
    .should('be.visible')
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = String(profile.preLaunch.threshold);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    });

  cy.get('@fileSettings')
    .find('#default-distance-threshold')
    .should('have.value', String(profile.preLaunch.threshold));

  if (profile.preLaunch.defaultView) {
    cy.get('@fileSettings')
      .find('#default-view')
      .should('be.visible')
      .select(profile.preLaunch.defaultView);

    cy.get('@fileSettings')
      .find('#default-view')
      .should('have.value', profile.preLaunch.defaultView);
  }

  cy.get('@fileSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', 'File Settings').should('not.exist');
}

export function launchAndWaitForProcessing(timeout = 60000): void {
  cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
  cy.get('#launch').click({ force: true });
  cy.get('#loading-information', { timeout }).should('not.exist');
  cy.window({ timeout })
    .its('commonService.session.network.isFullyLoaded')
    .should('equal', true);
}

export function goTo2DNetworkView(): void {
  cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
  cy.get(byTestId(testIds.appViewMenuTwoD), { timeout: 15000 }).click({ force: true });

  assertTwoDNetworkReady();
}

export function assertTwoDNetworkReady(timeout = 30000): void {
  cy.get('#cy', { timeout }).should('be.visible');
  cy.window({ timeout }).should('have.property', 'cytoscapeInstance');
}

export function ensureTwoDNetworkView(): void {
  cy.get('body', { timeout: 15000 }).then(($body) => {
    if ($body.find('#cy').length) {
      assertTwoDNetworkReady();
      return;
    }

    goTo2DNetworkView();
  });
}

export function launchProfileToTwoD(profile: DatasetProfile): void {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  launchAndWaitForProcessing(60000);
  ensureTwoDNetworkView();
}

export function assertMetricCount(selector: string, expected: number, timeout = 20000): void {
  cy.get(selector, { timeout }).should(($metric) => {
    const value = parseInt(String($metric.text()).replace(/,/g, ''), 10);
    expect(value, `metric count for ${selector}`).to.equal(expected);
  });
}

export function waitForProcessingDialogToClear(timeout = 30000): void {
  cy.get('body', { timeout }).should(($body) => {
    const visibleProcessingDialogs = $body
      .find('.p-dialog:visible .p-dialog-title')
      .filter((_, element) => String(element.textContent || '').includes('Processing Files...'))
      .length;

    expect(visibleProcessingDialogs, 'visible processing dialogs').to.equal(0);
  });
}

export function openGlobalFilteringTab(): void {
  cy.openGlobalSettings();
  cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
  cy.get('#filtering-config', { timeout: 15000 }).should('be.visible');
}

export function setFilteringPruneWith(value: PruneWith): void {
  cy.get('#prune-select').contains('span', value).click({ force: true });
  cy.window()
    .its('commonService.GlobalSettingsModel.SelectedPruneWithTypesVariable')
    .should('equal', value);

  if (value === 'Nearest Neighbor') {
    cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', true);
    cy.get('#filtering-epsilon-row').should('be.visible');
    return;
  }

  cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', false);
  cy.get('#filtering-epsilon-row').should('not.be.visible');
}

export function setFilteringEpsilonExponent(exponent: number): void {
  cy.get('#filtering-epsilon-row').should('be.visible');
  cy.get(byTestId(testIds.filterEpsilon))
    .should('be.visible')
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = String(exponent);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.window()
    .its('commonService.session.style.widgets.filtering-epsilon')
    .should((value) => {
      expect(Number(value)).to.equal(exponent);
    });

  cy.contains('#filtering-epsilon-row label', Math.pow(10, exponent).toPrecision(3)).should('be.visible');
}

export function setGlobalDistanceMetric(metric: DistanceMetric): void {
  cy.get('#global-settings-modal')
    .find('#default-distance-metric')
    .should('be.visible')
    .select(metric);

  cy.window()
    .its('commonService.session.style.widgets.default-distance-metric')
    .should('equal', metric);
}

export function assertVisibleNodeIds(expectedNodeIds: string[]): void {
  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const cyInstance = w.cytoscapeInstance as Core;

    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const visibleNodeIds = cyInstance
      .nodes(':visible')
      .filter((node) => node.children().length === 0)
      .map((node) => String(node.id()))
      .sort();

    expect(visibleNodeIds, 'visible node ids').to.deep.equal([...expectedNodeIds].sort());
  });
}

export type StyleSnapshot = {
  nodes: Record<string, string>;
  nodeShapes: Record<string, string>;
  nodeWidths: Record<string, string>;
  edges: Record<string, string>;
};

type StylePreservationOptions = {
  ignoreNodeWidths?: boolean;
};

export function snapshotVisibleStyles(): Cypress.Chainable<StyleSnapshot> {
  return cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const cyInstance = w.cytoscapeInstance as Core;

    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const visibleNodes = cyInstance
      .nodes()
      .filter((node) => !node.hasClass('parent') && node.visible());

    const visibleEdges = cyInstance
      .edges()
      .filter((edge) => edge.visible());

    return {
      nodes: visibleNodes.reduce((acc: Record<string, string>, node) => {
        acc[node.id()] = String(node.style('background-color') || '').replace(/\s+/g, '');
        return acc;
      }, {}),
      nodeShapes: visibleNodes.reduce((acc: Record<string, string>, node) => {
        acc[node.id()] = String(node.style('shape') || '').trim();
        return acc;
      }, {}),
      nodeWidths: visibleNodes.reduce((acc: Record<string, string>, node) => {
        acc[node.id()] = String(node.style('width') || '').trim();
        return acc;
      }, {}),
      edges: visibleEdges.reduce((acc: Record<string, string>, edge) => {
        acc[edge.id()] = String(edge.style('line-color') || '').replace(/\s+/g, '');
        return acc;
      }, {}),
    };
  });
}

export function assertVisibleStylePreserved(
  before: StyleSnapshot,
  after: StyleSnapshot,
  options: StylePreservationOptions = {},
): void {
  Object.entries(after.nodes).forEach(([id, backgroundColor]) => {
    expect(before.nodes[id], `node ${id} background-color`).to.equal(backgroundColor);
  });

  Object.entries(after.nodeShapes).forEach(([id, shape]) => {
    expect(before.nodeShapes[id], `node ${id} shape`).to.equal(shape);
  });

  if (!options.ignoreNodeWidths) {
    Object.entries(after.nodeWidths).forEach(([id, width]) => {
      expect(before.nodeWidths[id], `node ${id} width`).to.equal(width);
    });
  }

  Object.entries(after.edges).forEach(([id, lineColor]) => {
    expect(before.edges[id], `edge ${id} color`).to.equal(lineColor);
  });
}

export function assertAfterLaunchCounts(profile: DatasetProfile, mode: 'observed' | 'intended' = 'observed'): void {
  const expected = resolveExpected(profile.expectations.afterLaunch, mode);
  if (!expected) return;

  if (expected.nodes !== undefined) {
    assertMetricCount('#numberOfNodes', expected.nodes);
  }
  if (expected.visibleLinks !== undefined) {
    assertMetricCount('#numberOfVisibleLinks', expected.visibleLinks);
  }
  if (expected.clusters !== undefined) {
    assertMetricCount('#numberOfDisjointComponents', expected.clusters);
  }
  if (expected.singletons !== undefined) {
    assertMetricCount('#numberOfSingletonNodes', expected.singletons);
  }
}

export function readMetricCount(selector: string): Cypress.Chainable<number> {
  return cy.get(selector, { timeout: 20000 })
    .invoke('text')
    .then((text) => parseInt(String(text).replace(/,/g, ''), 10));
}

export function applyStyleFromProfile(profile: DatasetProfile): void {
  const style = profile.expectations.applyStyle;
  if (!style) return;

  cy.openGlobalSettings();
  cy.contains('#global-settings-modal .nav-link', 'Styling').click();
  cy.get('#apply-style').should('exist');
  cy.attach_files('#apply-style', [style.styleFile], ['application/json']);

  assertStyleWidgetsFromProfile(profile);
}

export function assertStyleWidgetsFromProfile(profile: DatasetProfile): void {
  const style = profile.expectations.applyStyle;
  if (!style) return;

  cy.window()
    .its('commonService.session.style.widgets', { timeout: 5000 })
    .should((widgets) => {
      if (style.expectWidgets.nodeColorVariable) {
        expect(widgets['node-color-variable']).to.equal(style.expectWidgets.nodeColorVariable);
      }

      if (style.expectWidgets.nodeSymbolVariable) {
        expect(widgets['node-symbol-variable']).to.equal(style.expectWidgets.nodeSymbolVariable);
      }

      if (style.expectWidgets.nodeRadiusVariable) {
        expect(widgets['node-radius-variable']).to.equal(style.expectWidgets.nodeRadiusVariable);
      }

      if (style.expectWidgets.linkColorVariable) {
        expect(widgets['link-color-variable']).to.equal(style.expectWidgets.linkColorVariable);
      }
    });
}

export function assertStyleTablesFromProfile(profile: DatasetProfile): void {
  const style = profile.expectations.applyStyle;
  if (!style) return;

  const assertTableVisibility = (selector: string, shouldBeVisible: boolean) => {
    if (shouldBeVisible) {
      cy.get(selector, { timeout: 15000 }).should('be.visible');
      return;
    }

    cy.get('body').then(($body) => {
      if (!$body.find(selector).length) return;
      cy.get(selector).should('not.be.visible');
    });
  };

  assertTableVisibility('#node-color-table', style.expectTables.nodeColorTable);
  assertTableVisibility('#link-color-table', style.expectTables.linkColorTable);
  assertTableVisibility('#nodeSymbolTable', style.expectTables.nodeSymbolTable);

  cy.window()
    .its('commonService.session.style.widgets.node-symbol-table-visible')
    .should('equal', style.expectTables.nodeSymbolTable ? 'Show' : 'Hide');

  if (!style.expectTables.nodeSizeTable) {
    cy.contains('.p-dialog-title', 'Node Size Table').should('not.exist');
  }
}

export function setTwoDLinkLabelVariable(variable: LinkLabelVariable): void {
  const optionLabel = variable === 'distance' ? 'Distance' : variable;

  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Links').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('linksTab');

  cy.get('@linksTab').contains('p-accordion-panel', 'Labels and Tooltips').click({ force: true });
  cy.get('@linksTab').contains('.form-group', 'Label').find('p-select').click({ force: true });
  cy.contains('li[role="option"]', optionLabel).click({ force: true });

  cy.window()
    .its('commonService.session.style.widgets.link-label-variable')
    .should('equal', variable);

  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const cyInstance = w.cytoscapeInstance as Core;

    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const labeledVisibleEdges = cyInstance
      .edges(':visible')
      .filter((edge) => /\d/.test(String(edge.data('label') || '')));

    expect(labeledVisibleEdges.length, `visible edges labeled with ${variable}`).to.be.greaterThan(0);
  });

  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
}

export function openTwoDSettingsDialog(): void {
  cy.get(byTestId(testIds.twodSettingsButton), { timeout: 15000 })
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
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('groupingTab');


  // Expand Controls correctly (PrimeNG)
  expandAccordionTabByHeader('@groupingTab', 'Controls');

  // Show groups (inside Controls)
  cy.get('@groupingTab')
  .find('#polygons-controls')
  .should('exist')
  .within(() => {
    cy.get('#polygons-show-toggle')
      .contains('Show')
      .click({ force: true });
  });

  cy.window()
    .its('commonService.session.style.widgets.polygons-show')
    .should('equal', true);

  // Wait until Cytoscape actually has parent nodes (groups)
  assertGroupsRendered(1);

  // Set group-by if needed (only visible after show=true)
  if (groupBy !== 'cluster') {
    cy.get('@groupingTab')
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
