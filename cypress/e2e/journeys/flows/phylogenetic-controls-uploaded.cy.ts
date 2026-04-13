/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertPhyloTreeReady,
  goToPhyloTreeView,
  launchProfileToPhyloTree,
} from '../../../support/journey-helpers';

type WinWithMT = Window & {
  commonService: any;
};

const SELECTORS = {
  treeContainer: '#phylocanvas',
  treeSvg: '#phylocanvas svg',
  treeGroup: '#phylocanvas svg > g',
  branchPaths: '#phylocanvas svg g.tidytree-link path',
  leafGroups: '#phylocanvas svg g.tidytree-node-leaf',
  leafNodes: '#phylocanvas svg g.tidytree-node-leaf circle',
  leafLabels: '#phylocanvas svg g.tidytree-node-leaf text',
  internalNodeLabels: '#phylocanvas svg g.tidytree-node-internal text',
  settingsButton: '#tool-btn-container-phylo a[title="Settings"]',
  centerButton: '#tool-btn-container-phylo a[title="Center Screen"]',
};

const normalizeCssColor = (value: string): string => value.replace(/\s+/g, '');

const hexToRgbString = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return `rgb(${r}, ${g}, ${b})`;
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

const assertLeafLabelState = (visible: boolean): void => {
  cy.window()
    .its('commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable')
    .should('equal', visible);

  cy.get(SELECTORS.leafLabels)
    .then(($labels) => {
      expect($labels.length, 'leaf label elements').to.be.greaterThan(0);
      cy.wrap($labels.first()).should(visible ? 'be.visible' : 'not.be.visible');
    });
};

const closePhyloTab = (): void => {
  cy.get('.lm_tab[title="Phylogenetic Tree"]>.lm_close_tab', { timeout: 15000 }).click({ force: true });
  cy.get(SELECTORS.treeContainer, { timeout: 15000 }).should('not.exist');
};

describe('Journey Flow - Phylogenetic Tree controls on uploaded data', () => {
  const profile = getProfile('load-phylo-tree-newick-snp-via-twod');

  beforeEach(() => {
    launchProfileToPhyloTree(profile);
    assertPhyloTreeReady();
  });

  it('updates horizontal and vertical stretch controls on uploaded Newick data', () => {
    openPhyloSettingsDialog();
    openPhyloAccordion('Stretch');

    cy.window().then((win: WinWithMT) => {
      const tree = win.commonService.visuals.phylogenetic.tree;
      cy.wrap({
        width: tree.width,
        height: tree.height,
      }).as('baselineSize');
    });

    cy.get(SELECTORS.leafGroups).first().invoke('attr', 'transform').as('baselineLeafTransform');

    setRangeValue('#horizontal-stretch', 2);

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['tree-horizontal-stretch']).to.equal(2);
      });

    cy.get('@baselineSize').then((baselineSize: any) => {
      cy.window().then((win: WinWithMT) => {
        const tree = win.commonService.visuals.phylogenetic.tree;
        expect(tree.width, 'tree width after horizontal stretch').to.be.greaterThan(baselineSize.width + 100);
      });
    });

    cy.get('@baselineLeafTransform').then((baselineLeafTransform) => {
      cy.get(SELECTORS.leafGroups).first().should(($leaf) => {
        expect(String($leaf.attr('transform')), 'leaf transform after horizontal stretch').to.not.equal(String(baselineLeafTransform));
      });
    });

    cy.get(SELECTORS.leafGroups).first().invoke('attr', 'transform').as('afterHorizontalLeafTransform');

    setRangeValue('#vertical-stretch', 1.6);

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['tree-vertical-stretch']).to.equal(1.6);
      });

    cy.get('@baselineSize').then((baselineSize: any) => {
      cy.window().then((win: WinWithMT) => {
        const tree = win.commonService.visuals.phylogenetic.tree;
        expect(tree.height, 'tree height after vertical stretch').to.be.greaterThan(baselineSize.height + 100);
      });
    });

    cy.get('@afterHorizontalLeafTransform').then((afterHorizontalLeafTransform) => {
      cy.get(SELECTORS.leafGroups).first().should(($leaf) => {
        expect(String($leaf.attr('transform')), 'leaf transform after vertical stretch').to.not.equal(String(afterHorizontalLeafTransform));
      });
    });

    cy.get(SELECTORS.leafNodes).should(($leaves) => {
      expect($leaves.length, 'rendered leaf count after stretch changes').to.be.greaterThan(0);
    });
  });

  it('shows Newick branch-node labels and updates their font size', () => {
    openPhyloSettingsDialog();
    openPhyloSettingsTab('Branches');
    openPhyloAccordion('Branch Nodes');

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedBranchLabelShowVariable')
      .should('equal', false);

    cy.get(SELECTORS.internalNodeLabels).should(($labels) => {
      expect($labels.length, 'internal node labels').to.be.greaterThan(0);
    });

    cy.get(SELECTORS.internalNodeLabels).first().should('have.css', 'opacity', '0');

    cy.get('@phyloSettings')
      .find('#branch-node-visibility2')
      .contains('Show')
      .click({ force: true });

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedBranchLabelShowVariable')
      .should('equal', true);

    cy.get(SELECTORS.internalNodeLabels).first().should('have.css', 'opacity', '1');

    cy.get('@phyloSettings')
      .contains('.form-group.row', 'Branch Node Label Size')
      .find('input[type="range"]')
      .then(($input) => {
        const input = $input.get(0) as HTMLInputElement;
        input.value = '14';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

    cy.window()
      .its('commonService.visuals.phylogenetic.SelectedBranchLabelSizeVariable')
      .should('equal', 14);

    cy.get(SELECTORS.internalNodeLabels).first().should('have.css', 'font-size', '14px');
  });

  it('recenters the tree after the viewport has moved away from the baseline transform', () => {
    cy.window().then((win: WinWithMT) => {
      const tree = win.commonService.visuals.phylogenetic.tree;
      expect(tree.transform, 'baseline tree transform').to.exist;
      cy.wrap({
        x: tree.transform.x,
        y: tree.transform.y,
        k: tree.transform.k,
      }).as('baselineTransform');

      const movedTransform = tree.transform.translate(140, 90).scale(1.75);
      tree.parent.select('svg').call(tree.zoom.transform, movedTransform);
    });

    cy.window().then((win: WinWithMT) => {
      const transform = win.commonService.visuals.phylogenetic.tree.transform;
      expect(transform.k, 'moved zoom scale').to.be.greaterThan(1);
    });

    cy.get(SELECTORS.centerButton).click({ force: true });
    cy.wait(700);

    cy.get('@baselineTransform').then((baselineTransform: any) => {
      cy.window().then((win: WinWithMT) => {
        const transform = win.commonService.visuals.phylogenetic.tree.transform;
        expect(transform.k, 'zoom scale after Center Screen').to.be.closeTo(1, 0.001);
        expect(transform.x, 'x translation after Center Screen').to.be.closeTo(baselineTransform.x, 1);
        expect(transform.y, 'y translation after Center Screen').to.be.closeTo(baselineTransform.y, 1);
      });
    });
  });

  it('responds to external node-selected events', () => {
    cy.window()
      .its('commonService.session.style.widgets')
      .then((widgets) => {
        const selectedStroke = normalizeCssColor(hexToRgbString(String(widgets['selected-color'])));

        cy.get(SELECTORS.leafNodes)
          .first()
          .invoke('attr', 'title')
          .then((nodeId) => {
            expect(nodeId, 'leaf node id').to.be.a('string').and.not.equal('');
            const leafSelector = `${SELECTORS.leafNodes}[title="${String(nodeId)}"]`;

            cy.window().then((win: WinWithMT) => {
              win.commonService.session.data.nodes.forEach((node: any) => {
                node.selected = node._id === nodeId;
              });
            });

            cy.document().trigger('node-selected');

            cy.get(leafSelector)
              .should('have.css', 'stroke-width', '3px')
              .and(($leaf) => {
                expect(normalizeCssColor($leaf.css('stroke')), 'selected leaf stroke').to.equal(selectedStroke);
              });

            cy.window().then((win: WinWithMT) => {
              const node = win.commonService.session.data.nodes.find((entry: any) => entry._id === nodeId);
              expect(node?.selected, 'externally selected session node').to.equal(true);
            });

            cy.window().then((win: WinWithMT) => {
              win.commonService.session.data.nodes.forEach((node: any) => {
                node.selected = false;
              });
            });

            cy.document().trigger('node-selected');

            cy.get(leafSelector)
              .should('have.css', 'stroke-width', '1px')
              .and(($leaf) => {
                expect(normalizeCssColor($leaf.css('stroke')), 'unselected leaf stroke').to.equal('rgb(0,0,0)');
              });
          });
      });
  });

  it('supports ctrl-click multi-select toggling on rendered leaf nodes', () => {
    cy.window().then((win: WinWithMT) => {
      win.commonService.session.data.nodes.forEach((node: any) => {
        node.selected = false;
      });
    });
    cy.document().trigger('node-selected');

    cy.get(SELECTORS.leafNodes)
      .eq(0)
      .invoke('attr', 'title')
      .then((firstNodeId) => {
        cy.get(SELECTORS.leafNodes)
          .eq(1)
          .invoke('attr', 'title')
          .then((secondNodeId) => {
            expect(firstNodeId, 'first leaf id').to.be.a('string').and.not.equal('');
            expect(secondNodeId, 'second leaf id').to.be.a('string').and.not.equal('');

            const firstLeafSelector = `${SELECTORS.leafNodes}[title="${String(firstNodeId)}"]`;
            const secondLeafSelector = `${SELECTORS.leafNodes}[title="${String(secondNodeId)}"]`;

            cy.get(firstLeafSelector).trigger('click', {
              force: true,
              ctrlKey: true,
              eventConstructor: 'MouseEvent',
            });

            cy.get(secondLeafSelector).trigger('click', {
              force: true,
              ctrlKey: true,
              eventConstructor: 'MouseEvent',
            });

            cy.window().then((win: WinWithMT) => {
              const firstNode = win.commonService.session.data.nodes.find((node: any) => node._id === firstNodeId);
              const secondNode = win.commonService.session.data.nodes.find((node: any) => node._id === secondNodeId);
              expect(firstNode?.selected, 'first selected after ctrl-click').to.equal(true);
              expect(secondNode?.selected, 'second selected after ctrl-click').to.equal(true);
            });

            cy.get(firstLeafSelector).should('have.css', 'stroke-width', '3px');
            cy.get(secondLeafSelector).should('have.css', 'stroke-width', '3px');

            cy.get(firstLeafSelector).trigger('click', {
              force: true,
              ctrlKey: true,
              eventConstructor: 'MouseEvent',
            });

            cy.window().then((win: WinWithMT) => {
              const firstNode = win.commonService.session.data.nodes.find((node: any) => node._id === firstNodeId);
              const secondNode = win.commonService.session.data.nodes.find((node: any) => node._id === secondNodeId);
              expect(firstNode?.selected, 'first toggled off after second ctrl-click').to.equal(false);
              expect(secondNode?.selected, 'second remains selected').to.equal(true);
            });

            cy.get(firstLeafSelector).should('have.css', 'stroke-width', '1px');
            cy.get(secondLeafSelector).should('have.css', 'stroke-width', '3px');
          });
      });
  });

  it('reapplies persisted tree settings after closing and reopening the tab', () => {
    openPhyloSettingsDialog();

    openPhyloAccordion('Layout');
    cy.get('@phyloSettings').find('#tree-layout').click({ force: true });
    cy.contains('li[role="option"]', 'Circular').click();

    openPhyloAccordion('Mode');
    cy.get('@phyloSettings').find('#tree-mode').click({ force: true });
    cy.contains('li[role="option"]', 'Smooth').click();

    openPhyloAccordion('Stretch');
    setRangeValue('#horizontal-stretch', 1.6);

    openPhyloSettingsTab('Leaves');
    openPhyloAccordion('Labels and Tooltips');
    cy.get('@phyloSettings').find('#leaf-label-visibility').contains('Hide').click({ force: true });

    cy.closeSettingsPane('Phylogenetic Tree Settings');

    cy.window().then((win: WinWithMT) => {
      const phylo = win.commonService.visuals.phylogenetic;
      expect(phylo.SelectedTreeLayoutVariable, 'tree layout before tab close').to.equal('circular');
      expect(phylo.SelectedTreeModeVariable, 'tree mode before tab close').to.equal('smooth');
    });
    assertLeafLabelState(false);
    cy.get(SELECTORS.branchPaths).first().invoke('attr', 'd').as('persistedBranchPath');

    closePhyloTab();
    goToPhyloTreeView();
    assertPhyloTreeReady();

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['tree-layout-circular']).to.equal(true);
        expect(widgets['tree-mode-smooth']).to.equal(true);
        expect(widgets['tree-leaf-label-show']).to.equal(false);
        expect(widgets['tree-horizontal-stretch']).to.equal(1.6);
      });

    cy.window().then((win: WinWithMT) => {
      const phylo = win.commonService.visuals.phylogenetic;
      expect(phylo.SelectedTreeLayoutVariable, 'reopened tree layout').to.equal('circular');
      expect(phylo.SelectedTreeModeVariable, 'reopened tree mode').to.equal('smooth');
      expect(phylo.SelectedLeafLabelShowVariable, 'reopened leaf-label visibility').to.equal(false);
    });

    assertLeafLabelState(false);

    cy.get('@persistedBranchPath').then((persistedBranchPath) => {
      cy.get(SELECTORS.branchPaths).first().should(($path) => {
        expect(String($path.attr('d')), 'reopened branch path geometry').to.equal(String(persistedBranchPath));
      });
    });
  });
});
