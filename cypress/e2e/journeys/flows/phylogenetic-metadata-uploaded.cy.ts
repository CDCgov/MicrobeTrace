/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertPhyloTreeReady,
  launchProfileToPhyloTree,
  openGlobalFilteringTab,
  openGlobalStylingTab,
  setGlobalLinkThreshold,
} from '../../../support/journey-helpers';

type WinWithMT = Window & {
  commonService: any;
};

type ColorTable = Record<string, string>;
type LeafSnapshot = Record<string, { cluster: string; color: string }>;

const SELECTORS = {
  treeSvg: '#phylocanvas svg',
  leafGroups: '#phylocanvas svg g.tidytree-node-leaf',
  leafNodes: '#phylocanvas svg g.tidytree-node-leaf circle',
  branchPaths: '#phylocanvas svg g.tidytree-link path',
  branchDistanceLabels: '#phylocanvas svg g.tidytree-link text',
  internalNodes: '#phylocanvas svg g.tidytree-node-internal circle',
  settingsButton: '#tool-btn-container-phylo a[title="Settings"]',
};

const METADATA_PROFILE = getProfile('phylo-covid-metadata-threshold');
const STYLE_PROFILE = getProfile('style-apply-cypress-test-style-threshold');

const HEALTHCARE_NODE_ID = 'MZ797703';
const EDUCATION_NODE_ID = 'MZ797980';
const STYLE_HEALTHCARE_NODE_ID = '797703';
const STYLE_EDUCATION_NODE_ID = '797980';

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const hexToRgbString = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

const setColorInputValue = (selector: string, value: string): void => {
  cy.get(selector)
    .should('be.visible')
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get(selector).should('have.value', value);
};

const changeColorTableEntry = (tableSelector: string, value: string, nextColor: string): void => {
  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .closest('tr')
    .find('input[type="color"]')
    .should('have.length', 1)
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = nextColor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
};

const openPhyloSettingsDialog = (): void => {
  cy.get(SELECTORS.settingsButton).click({ force: true });
  cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
    .should('be.visible')
    .parents('.p-dialog')
    .as('phyloSettings');
};

const openPhyloSettingsTab = (label: 'Tree' | 'Leaves' | 'Branches'): void => {
  cy.get('@phyloSettings').contains('a', label).click({ force: true });
};

const openPhyloAccordion = (label: string): void => {
  cy.get('@phyloSettings').contains('p-accordion-panel', label).click({ force: true });
};

const setRangeValue = (selector: string, value: number): void => {
  cy.get(selector).then(($input) => {
    const input = $input.get(0) as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const setToggleState = (label: string, desired: boolean, propPath: string): void => {
  cy.window().its(propPath).then((current) => {
    if (Boolean(current) === desired) return;

    cy.get('@phyloSettings')
      .contains('.form-group.row', label)
      .find('p-selectbutton')
      .contains(desired ? 'Show' : 'Hide')
      .click({ force: true });
  });

  cy.window().its(propPath).should('equal', desired);
};

const getLeafGroupById = (nodeId: string): Cypress.Chainable<JQuery<HTMLElement>> =>
  cy.get(SELECTORS.leafGroups).then(($groups) => {
    const match = Array.from($groups).find((group) => {
      return String((group as any).__data__?.data?.id ?? '') === nodeId;
    });

    expect(match, `leaf group for ${nodeId}`).to.exist;
    return cy.wrap(match as HTMLElement);
  });

const getLeafNodeById = (nodeId: string): Cypress.Chainable<JQuery<HTMLElement>> =>
  getLeafGroupById(nodeId).find('circle');

const getLeafLabelById = (nodeId: string): Cypress.Chainable<JQuery<HTMLElement>> =>
  getLeafGroupById(nodeId).find('text');

const triggerLeafHover = (nodeId: string, eventName: 'mouseenter' | 'mouseout'): void => {
  getLeafNodeById(nodeId).then(($circle) => {
    const circle = $circle.get(0) as SVGCircleElement;
    const rect = circle.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    cy.wrap($circle).trigger(eventName, {
      force: true,
      eventConstructor: 'MouseEvent',
      button: 0,
      pageX: clientX,
      pageY: clientY,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
    });
  });
};

const extractColorTable = ($table: JQuery<HTMLElement>): ColorTable => {
  const out: ColorTable = {};

  $table.find('tr').each((index, row) => {
    if (index === 0) return;

    const $row = Cypress.$(row);
    const value = String($row.find('td[data-value]').attr('data-value') || '');
    if (!value) return;

    const rawColor = String($row.find('input[type="color"]').val() || '');
    out[value] = normalizeColor(rawColor.startsWith('#') ? hexToRgbString(rawColor) : rawColor);
  });

  return out;
};

const readRenderedLeafSnapshot = (win: WinWithMT): LeafSnapshot =>
  Array.from(win.document.querySelectorAll<SVGGElement>(SELECTORS.leafGroups))
    .reduce((acc: LeafSnapshot, group) => {
      const nodeId = String((group as any).__data__?.data?.id ?? '');
      const circle = group.querySelector('circle');
      const sessionNode = win.commonService.session.data.nodes.find((node: any) => {
        return String(node._id ?? node.id ?? '') === nodeId;
      });

      if (!nodeId || !circle || !sessionNode) {
        return acc;
      }

      acc[nodeId] = {
        cluster: String(sessionNode.cluster ?? sessionNode.Cluster ?? ''),
        color: normalizeColor(getComputedStyle(circle).fill),
      };

      return acc;
    }, {});

const assertLeafSnapshotMatchesTable = (snapshot: LeafSnapshot, table: ColorTable, label: string): void => {
  const nodeIds = Object.keys(snapshot);

  expect(nodeIds.length, `${label} rendered tree leaves`).to.be.greaterThan(0);
  nodeIds.forEach((nodeId) => {
    const state = snapshot[nodeId];
    expect(table[state.cluster], `${label} tree color table entry for cluster ${state.cluster}`).to.exist;
    expect(state.color, `${label} rendered tree leaf color for ${nodeId}`).to.equal(table[state.cluster]);
  });
};

describe('Journey Flow - Phylogenetic Tree metadata-backed controls', () => {
  beforeEach(() => {
    launchProfileToPhyloTree(METADATA_PROFILE);
    assertPhyloTreeReady();
  });

  it('applies fixed node colors and uploaded field color-by remapping on rendered tree leaves', () => {
    const fixedNodeColor = '#00ff00';
    const updatedHealthcareColor = '#123456';
    const expectedFixedNodeColor = normalizeColor(hexToRgbString(fixedNodeColor));
    const expectedHealthcareColor = normalizeColor(hexToRgbString(updatedHealthcareColor));
    let educationBaselineColor = '';

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'None');

    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'None');

    setColorInputValue('#node-color', fixedNodeColor);
    cy.closeGlobalSettings();

    cy.get(SELECTORS.leafNodes).should(($nodes) => {
      expect($nodes.length, 'rendered tree leaves').to.be.greaterThan(0);
      Array.from($nodes).forEach((node) => {
        expect(normalizeColor(getComputedStyle(node).fill), 'fixed tree node color')
          .to.equal(expectedFixedNodeColor);
      });
    });

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Profession');

    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Profession');
    cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');

    getLeafNodeById(EDUCATION_NODE_ID).then(($leaf) => {
      educationBaselineColor = normalizeColor(getComputedStyle($leaf.get(0) as SVGCircleElement).fill);
    });

    getLeafNodeById(HEALTHCARE_NODE_ID).should(($leaf) => {
      expect(normalizeColor(getComputedStyle($leaf.get(0) as SVGCircleElement).fill), 'profession color differs from education')
        .to.not.equal(educationBaselineColor);
    });

    changeColorTableEntry('#node-color-table', 'Healthcare', updatedHealthcareColor);
    cy.closeGlobalSettings();

    getLeafNodeById(HEALTHCARE_NODE_ID).should(($leaf) => {
      expect(normalizeColor(getComputedStyle($leaf.get(0) as SVGCircleElement).fill), 'updated healthcare color')
        .to.equal(expectedHealthcareColor);
    });

    getLeafNodeById(EDUCATION_NODE_ID).should(($leaf) => {
      expect(normalizeColor(getComputedStyle($leaf.get(0) as SVGCircleElement).fill), 'education color left unchanged')
        .to.equal(educationBaselineColor);
    });
  });

  it('applies the fixed global link color to rendered phylogenetic branches', () => {
    const fixedBranchColor = '#13579b';
    const expectedBranchColor = normalizeColor(hexToRgbString(fixedBranchColor));

    openGlobalStylingTab();
    selectPrimeOption('#link-tooltip-variable', 'None');

    cy.window()
      .its('commonService.session.style.widgets.link-color-variable')
      .should('equal', 'None');

    setColorInputValue('#link-color', fixedBranchColor);
    cy.window()
      .its('commonService.session.style.widgets.link-color')
      .should('equal', fixedBranchColor);
    cy.closeGlobalSettings();

    cy.get(SELECTORS.branchPaths).should(($paths) => {
      expect($paths.length, 'rendered phylogenetic branches').to.be.greaterThan(0);
      Array.from($paths).forEach((path) => {
        expect(normalizeColor(getComputedStyle(path).stroke), 'fixed branch stroke color')
          .to.equal(expectedBranchColor);
      });
    });
  });

  it('changes leaf label field and label size on metadata-backed tree leaves', () => {
    openPhyloSettingsDialog();
    openPhyloSettingsTab('Leaves');
    openPhyloAccordion('Labels and Tooltips');

    setToggleState(
      'Show Leaf Labels',
      true,
      'commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable',
    );

    cy.get('@phyloSettings').find('#leaf-label-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Lineage').click({ force: true });

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedLeafLabelVariable')
      .should('equal', 'Lineage');

    getLeafLabelById(EDUCATION_NODE_ID).should('have.text', 'B.1.617.2');

    setRangeValue('#leaf-label-size', 24);

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedLeafLabelSizeVariable')
      .should('equal', 24);

    getLeafLabelById(EDUCATION_NODE_ID).should('have.css', 'font-size', '24px');
  });

  it('toggles tree leaf tooltips and updates tooltip content to the selected uploaded field', () => {
    openPhyloSettingsDialog();
    openPhyloSettingsTab('Leaves');
    openPhyloAccordion('Labels and Tooltips');

    setToggleState(
      'Show Leaf Tooltips',
      true,
      'commonService.visuals.phylogenetic.SelectedLeafTooltipShowVariable',
    );

    cy.get('@phyloSettings').find('#leaf-tooltip-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Lineage').click({ force: true });

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedLeafTooltipVariable')
      .should('equal', 'Lineage');

    triggerLeafHover(EDUCATION_NODE_ID, 'mouseenter');
    cy.get('#phyloTooltip', { timeout: 5000 }).should('be.visible').and('have.text', 'B.1.617.2');
    triggerLeafHover(EDUCATION_NODE_ID, 'mouseout');
    cy.get('#phyloTooltip').should('not.be.visible');

    setToggleState(
      'Show Leaf Tooltips',
      false,
      'commonService.visuals.phylogenetic.SelectedLeafTooltipShowVariable',
    );

    triggerLeafHover(EDUCATION_NODE_ID, 'mouseenter');
    cy.get('#phyloTooltip').should('not.be.visible');
  });

  it('toggles leaf node visibility and supports both fixed and variable leaf sizing', () => {
    openPhyloSettingsDialog();
    openPhyloSettingsTab('Leaves');
    openPhyloAccordion('Leaf Size');

    setToggleState(
      'Show Leaf Nodes',
      false,
      'commonService.visuals.phylogenetic.SelectedLeafNodeShowVariable',
    );

    getLeafNodeById(EDUCATION_NODE_ID).should('have.css', 'opacity', '0');

    setToggleState(
      'Show Leaf Nodes',
      true,
      'commonService.visuals.phylogenetic.SelectedLeafNodeShowVariable',
    );

    getLeafNodeById(EDUCATION_NODE_ID).should('have.css', 'opacity', '1');

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedLeafNodeSizeVariable')
      .should('equal', 'None');

    setRangeValue('#leaf-size', 20);

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedLeafNodeSize')
      .should('equal', 20);

    getLeafNodeById(EDUCATION_NODE_ID).invoke('attr', 'r').should('equal', '20');

    cy.get('@phyloSettings').find('#leaf-size-var').click({ force: true });
    cy.contains('li[role="option"]', 'Degree').click({ force: true });

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['tree-leaf-node-radius-variable']).to.equal('degree');
      });

    setRangeValue('#leaf-size-min', 10);
    setRangeValue('#leaf-size-max', 30);

    getLeafNodeById(HEALTHCARE_NODE_ID).invoke('attr', 'r').then((healthcareRadius) => {
      getLeafNodeById(EDUCATION_NODE_ID).invoke('attr', 'r').then((educationRadius) => {
        const healthcare = Number(healthcareRadius);
        const education = Number(educationRadius);

        expect(healthcare, 'higher-degree node radius').to.be.greaterThan(education);
        expect(healthcare, 'higher-degree node radius above minimum').to.be.greaterThan(10);
        expect(education, 'lower-degree node radius at least minimum').to.be.at.least(10);
      });
    });
  });

  it('shows branch distance labels, branch nodes, and updates branch sizing controls', () => {
    openPhyloSettingsDialog();
    openPhyloSettingsTab('Branches');
    openPhyloAccordion('Branch Labels and Size');

    setToggleState(
      'Distance Labels',
      true,
      'commonService.visuals.phylogenetic.SelectedBranchDistanceShowVariable',
    );

    cy.get(SELECTORS.branchDistanceLabels).first().should('have.css', 'opacity', '1');

    setRangeValue('#link-size', 16);

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedBranchDistanceSizeVariable')
      .should('equal', 16);

    cy.get(SELECTORS.branchDistanceLabels).first().should('have.css', 'font-size', '16px');

    setRangeValue('#branch-size', 7);

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedBranchSizeVariable')
      .should('equal', 7);

    cy.get(SELECTORS.branchPaths).first().should('have.css', 'stroke-width', '7px');

    openPhyloAccordion('Branch Nodes');
    setToggleState(
      'Branch Nodes',
      true,
      'commonService.visuals.phylogenetic.SelectedBranchNodeShowVariable',
    );

    cy.get(SELECTORS.internalNodes).first().should('have.css', 'opacity', '1');

    setRangeValue('#branch-node-size', 8);

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedBranchNodeSizeVariable')
      .should('equal', 8);

    cy.get(SELECTORS.internalNodes).first().invoke('attr', 'r').should('equal', '8');
  });

  it('selects a rendered leaf on single click and syncs selection back into session state', () => {
    let expectedSelectedStroke = '';

    cy.window()
      .its('commonService.session.style.widgets.selected-color')
      .then((selectedColor) => {
        expectedSelectedStroke = normalizeColor(hexToRgbString(String(selectedColor)));
      });

    getLeafNodeById(EDUCATION_NODE_ID).trigger('click', {
      force: true,
      eventConstructor: 'MouseEvent',
      button: 0,
    });

    getLeafNodeById(EDUCATION_NODE_ID).should(($leaf) => {
      expect(normalizeColor(getComputedStyle($leaf.get(0) as SVGCircleElement).stroke), 'selected tree stroke color')
        .to.equal(expectedSelectedStroke);
      expect(getComputedStyle($leaf.get(0) as SVGCircleElement).strokeWidth, 'selected tree stroke width')
        .to.equal('3px');
    });

    cy.window().then((win: WinWithMT) => {
      const selectedNode = win.commonService.getVisibleNodes().find((node: any) => node._id === EDUCATION_NODE_ID);
      expect(selectedNode, 'selected session node').to.exist;
      expect(selectedNode.selected, 'selected session flag').to.equal(true);
    });
  });

  it('uses the configured selected color for tree leaf selection styling', () => {
    const selectedColor = '#ff9f1c';
    const expectedSelectedStroke = normalizeColor(hexToRgbString(selectedColor));

    openGlobalStylingTab();
    setColorInputValue('#selected-color', selectedColor);

    cy.window().its('commonService.session.style.widgets.selected-color').should('equal', selectedColor);
    cy.window().its('commonService.session.style.widgets.selected-node-stroke-color').should('equal', selectedColor);
    cy.closeGlobalSettings();

    getLeafNodeById(EDUCATION_NODE_ID).trigger('click', {
      force: true,
      eventConstructor: 'MouseEvent',
      button: 0,
    });

    getLeafNodeById(EDUCATION_NODE_ID).should(($leaf) => {
      expect(normalizeColor(getComputedStyle($leaf.get(0) as SVGCircleElement).stroke), 'configured selected tree stroke color')
        .to.equal(expectedSelectedStroke);
      expect(getComputedStyle($leaf.get(0) as SVGCircleElement).strokeWidth, 'configured selected tree stroke width')
        .to.equal('3px');
    });
  });

  it('recomputes cluster-derived tree leaf colors when threshold changes while Cluster color-by is active', () => {
    let nodeColorsBefore: ColorTable = {};
    let nodeSnapshotBefore: LeafSnapshot = {};
    let nodeColorsAfter: ColorTable = {};
    let nodeSnapshotAfter: LeafSnapshot = {};

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Cluster');

    cy.window()
      .its('commonService.session.style.widgets.node-color-variable')
      .should((value) => {
        expect(String(value).toLowerCase()).to.equal('cluster');
      });

    cy.get('#node-color-table', { timeout: 15000 }).then(($table) => {
      nodeColorsBefore = extractColorTable($table);
    });
    cy.closeGlobalSettings();

    cy.window().then((win: unknown) => {
      nodeSnapshotBefore = readRenderedLeafSnapshot(win as WinWithMT);
    });

    cy.then(() => {
      assertLeafSnapshotMatchesTable(nodeSnapshotBefore, nodeColorsBefore, 'before-threshold');
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(24);
    cy.closeGlobalSettings();

    openGlobalStylingTab();
    cy.window()
      .its('commonService.session.style.widgets.node-color-variable')
      .should((value) => {
        expect(String(value).toLowerCase()).to.equal('cluster');
      });
    cy.get('#node-color-table', { timeout: 15000 }).then(($table) => {
      nodeColorsAfter = extractColorTable($table);
    });
    cy.closeGlobalSettings();

    cy.window().then((win: unknown) => {
      nodeSnapshotAfter = readRenderedLeafSnapshot(win as WinWithMT);
    });

    cy.then(() => {
      assertLeafSnapshotMatchesTable(nodeSnapshotAfter, nodeColorsAfter, 'after-threshold');

      const changedNodeIds = Object.keys(nodeSnapshotAfter).filter((nodeId) => {
        const before = nodeSnapshotBefore[nodeId];
        const after = nodeSnapshotAfter[nodeId];
        return Boolean(before) && before.cluster !== after.cluster;
      });
      const recoloredNodeIds = changedNodeIds.filter((nodeId) => {
        return nodeSnapshotBefore[nodeId].color !== nodeSnapshotAfter[nodeId].color;
      });

      expect(changedNodeIds.length, 'tree leaf cluster membership changed after threshold').to.be.greaterThan(0);
      expect(recoloredNodeIds.length, 'changed tree leaves also recolored').to.be.greaterThan(0);
    });
  });
});

describe('Journey Flow - Phylogenetic Tree style file reflection', () => {
  beforeEach(() => {
    launchProfileToPhyloTree(STYLE_PROFILE);
    assertPhyloTreeReady();
  });

  it('applies an uploaded style file and reflects its tree layout, colors, and branch-distance styling', () => {
    const expectedEducationColor = normalizeColor(hexToRgbString('#f22020'));

    applyStyleFromProfile(STYLE_PROFILE);

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['node-color-variable']).to.equal('Profession');
        expect(widgets['tree-layout-circular']).to.equal(true);
        expect(widgets['tree-mode-smooth']).to.equal(true);
        expect(widgets['tree-type']).to.equal('dendrogram');
        expect(widgets['tree-leaf-node-radius-variable']).to.equal('degree');
        expect(widgets['tree-branch-distances-hide']).to.equal(false);
        expect(widgets['tree-branch-distance-size']).to.equal(8);
      });

    cy.window()
      .its('commonService.visuals.phylogenetic')
      .should((phylo) => {
        expect(phylo.SelectedTreeLayoutVariable).to.equal('circular');
        expect(phylo.SelectedTreeModeVariable).to.equal('smooth');
        expect(phylo.SelectedTreeTypeVariable).to.equal('dendrogram');
        expect(phylo.SelectedLeafNodeSizeVariable).to.equal('degree');
        expect(phylo.SelectedBranchDistanceShowVariable).to.equal(true);
        expect(phylo.SelectedBranchDistanceSizeVariable).to.equal(8);
        expect(phylo.SelectedLeafLabelShowVariable).to.equal(false);
      });

    cy.closeGlobalSettings();

    getLeafNodeById(STYLE_EDUCATION_NODE_ID).should(($leaf) => {
      expect(normalizeColor(getComputedStyle($leaf.get(0) as SVGCircleElement).fill), 'styled education color')
        .to.equal(expectedEducationColor);
    });

    getLeafNodeById(STYLE_HEALTHCARE_NODE_ID).invoke('attr', 'r').then((healthcareRadius) => {
      getLeafNodeById(STYLE_EDUCATION_NODE_ID).invoke('attr', 'r').then((educationRadius) => {
        expect(Number(healthcareRadius), 'style-sized healthcare leaf radius').to.be.greaterThan(0);
        expect(Number(educationRadius), 'style-sized education leaf radius').to.be.greaterThan(0);
      });
    });

    cy.get(SELECTORS.branchPaths, { timeout: 15000 }).should(($paths) => {
      expect($paths.length, 'styled tree branch paths').to.be.greaterThan(0);
    });

    cy.get(SELECTORS.branchDistanceLabels, { timeout: 15000 }).should(($labels) => {
      expect($labels.length, 'styled branch distance labels').to.be.greaterThan(0);
    });

    cy.get(SELECTORS.branchDistanceLabels).first()
      .should('have.css', 'font-size', '8px')
      .and('have.css', 'opacity', '1');
  });
});
