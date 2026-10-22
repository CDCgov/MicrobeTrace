/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertPhyloTreeReady,
  goToPhyloTreeView,
  launchAndWaitForProcessing,
  launchProfileToPhyloTree,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

const SELECTORS = {
  treeContainer: '#phylocanvas',
  treeSvg: '#phylocanvas svg',
  settingsBtn: '#tool-btn-container-phylo a[title="Settings"]',
  exportBtn: '#tool-btn-container-phylo a[title="Export Screen"]',
};

type PhyloImageFileType = 'png' | 'jpeg' | 'svg';

const normalizeNewickText = (value: string): string => value.replace(/\r\n/g, '\n').trim();

const orderedTopology = (node: any, nameKey: 'id' | 'name'): any => {
  const children = Array.isArray(node?.children) ? node.children : [];
  return children.length
    ? children.map(child => orderedTopology(child, nameKey))
    : String(node?.[nameKey] ?? '');
};

const auspiceDisplayTopology = (node: any): any => {
  const children = Array.isArray(node?.children) ? node.children : [];
  return children.length
    ? [...children].reverse().map(auspiceDisplayTopology)
    : String(node?.name ?? '');
};

const flattenAuspiceDisplayLeaves = (node: any): string[] => {
  const children = Array.isArray(node?.children) ? node.children : [];
  return children.length
    ? [...children].reverse().flatMap(flattenAuspiceDisplayLeaves)
    : [String(node?.name ?? '')];
};

const findBootstrapSplit = (tree: any, allLeafIds: string[]): { key: string; leafIds: string[] } | null => {
  const collectLeaves = (node: any): string[] => {
    const children = Array.isArray(node?.children) ? node.children : [];
    return children.length ? children.flatMap(collectLeaves) : [String(node?.id ?? '')];
  };
  const candidates: string[][] = [];
  const visit = (node: any, isRoot: boolean): void => {
    const children = Array.isArray(node?.children) ? node.children : [];
    if (!children.length) return;
    const leaves = collectLeaves(node).sort();
    if (!isRoot && leaves.length >= 2 && leaves.length <= allLeafIds.length - 2) {
      candidates.push(leaves);
    }
    children.forEach(child => visit(child, false));
  };
  visit(tree, true);
  if (!candidates.length) return null;

  const selected = candidates[0];
  const selectedSet = new Set(selected);
  const complement = [...allLeafIds].sort().filter(id => !selectedSet.has(id));
  const selectedKey = selected.join('\u001f');
  const complementKey = complement.join('\u001f');
  const canonical = complement.length < selected.length
    || (complement.length === selected.length && complementKey < selectedKey)
    ? complement
    : selected;
  return { key: canonical.join('\u001f'), leafIds: selected };
};

const setExportFileType = (fileType: PhyloImageFileType): void => {
  cy.get('#network-export-filetype').click({ force: true });
  cy.contains('li[role="option"]', new RegExp(`^${fileType}$`, 'i')).click({ force: true });
};

const assertLeafLabelState = (visible: boolean): void => {
  cy.window()
    .its('commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable')
    .should('equal', visible);

  cy.get(SELECTORS.treeSvg)
    .find('g.tidytree-node-leaf text')
    .then(($labels) => {
      if (visible) {
        expect($labels.length, 'leaf label elements').to.be.greaterThan(0);
        cy.wrap($labels.first()).should('be.visible');
        return;
      }

      if ($labels.length > 0) {
        cy.wrap($labels.first()).should('not.be.visible');
      }
    });
};

describe('Journey Flow - Phylogenetic Tree Export (Newick file)', () => {
  const profile = getProfile('load-phylo-tree-newick-snp');

  beforeEach(() => {
    launchProfileToPhyloTree(profile);
    assertPhyloTreeReady();
  });

  context('Export', () => {
    beforeEach(() => {
      cy.get(SELECTORS.exportBtn).click();
      cy.contains('.p-dialog-title', 'Export Phylogenetic Tree').should('be.visible');
    });

    it('should open the export dialog', () => {
      cy.contains('.p-dialog-title', 'Export Phylogenetic Tree').should('be.visible');
    });

    it('should change filename and export as png', () => {
      const exportFileBase = `cypress_tree_test_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.png`;

      cy.get('#tree-image-filename')
        .invoke('val', exportFileBase)
        .trigger('input')
        .trigger('change');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeImageFilenameVariable')
        .should('equal', exportFileBase);

      cy.get('#export-tree').click();
      cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
        expect(pngBinary.length, 'exported PNG byte length').to.be.greaterThan(1000);
      });
    });

    it('should change filename and export as svg', () => {
      const exportFileBase = `cypress_tree_test_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.svg`;

      cy.get('#tree-image-filename')
        .invoke('val', exportFileBase)
        .trigger('input')
        .trigger('change');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedNetworkExportFileTypeListVariable')
        .should('equal', 'png');

      setExportFileType('svg');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedNetworkExportFileTypeListVariable')
        .should('equal', 'svg');

      cy.get('#export-tree').click();
      cy.readFile(exportPath, 'utf8', { timeout: 30000 }).should((svgText) => {
        expect(svgText, 'exported SVG contents').to.contain('<svg');
      });
    });

    it('should change filename and export as jpeg', () => {
      const exportFileBase = `cypress_tree_test_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.jpeg`;

      cy.get('#tree-image-filename')
        .invoke('val', exportFileBase)
        .trigger('input')
        .trigger('change');

      setExportFileType('jpeg');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedNetworkExportFileTypeListVariable')
        .should('equal', 'jpeg');

      cy.get('#export-tree').click();
      cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((jpegBinary) => {
        expect(jpegBinary.length, 'exported JPEG byte length').to.be.greaterThan(1000);
      });
    });

    it('should change filename and export newick string', () => {
      const exportFileBase = `cypress_tree_test_nwk_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.txt`;

      cy.contains('.p-dialog-title', 'Export Phylogenetic Tree')
        .parents('.p-dialog')
        .contains('Newick')
        .click();

      cy.get('#newick-string-filename')
        .invoke('val', exportFileBase)
        .trigger('input')
        .trigger('change');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedNewickStringFilenameVariable')
        .should('equal', exportFileBase);

      cy.get('#export-newick').click();

      cy.window().its('commonService.visuals.phylogenetic.tree.data').then((treeData: any) => {
        const expectedString = normalizeNewickText(treeData.toNewick(false));

        cy.readFile(exportPath, 'utf8', { timeout: 30000 }).should((savedText) => {
          expect(normalizeNewickText(savedText), 'saved Newick export').to.equal(expectedString);
        });
      });
    });

    it('exports a schema-shaped Auspice dataset and re-imports it into MicrobeTrace', () => {
      const exportFileBase = `cypress_tree_auspice_${Date.now()}`;
      const exportFileName = `${exportFileBase}.json`;
      const exportPath = `cypress/downloads/${exportFileName}`;
      let expectedLeafIds: string[] = [];
      let expectedTopology: any;

      cy.window().then((win: any) => {
        const session = win.commonService.session;
        const treeData = win.commonService.visuals.phylogenetic.tree.data;
        expectedLeafIds = treeData.getLeaves().map((leaf: any) => String(leaf.id));
        expectedTopology = orderedTopology(treeData, 'id');
        const split = findBootstrapSplit(treeData, expectedLeafIds);
        expect(split, 'current tree contains an exportable bootstrap split').to.exist;

        expectedLeafIds.forEach((leafId, index) => {
          const node = session.data.nodes.find((candidate: any) => (
            String(candidate?._id ?? candidate?.id ?? '') === leafId
          ));
          expect(node, `session node for ${leafId}`).to.exist;
          node.auspice_group = index % 2 ? 'group_b' : 'group_a';
          node.auspice_rank = (index % 3) + 1;
          node.auspice_date = `2026-09-${String((index % 20) + 1).padStart(2, '0')}`;
          node.auspice_country = 'United States';
          node.auspice_state = index < 2 ? 'Georgia' : 'Alabama';
          node.auspice_zip = index < 2 ? '30301' : '36602';
          node.site = index < 2 ? 'Atlanta clinic' : 'Mobile clinic';
          node.seq = 'ACGTACGT';
          delete node._lat;
          delete node._lon;
          delete node.latitude;
          delete node.longitude;
        });
        session.data.nodeFields = Array.from(new Set([
          ...(session.data.nodeFields || []),
          'auspice_group', 'auspice_rank', 'auspice_date', 'auspice_country', 'auspice_state',
          'auspice_zip', 'site', 'seq',
        ]));
        session.style.widgets['node-color-variable'] = 'auspice_group';
        session.style.nodeColorsTableKeys.auspice_group = ['group_a', 'group_b'];
        session.style.nodeColorsTable.auspice_group = ['#123456', '#abcdef'];
        session.style.nodeColorsTableHistory.auspice_group = {
          group_a: '#123456',
          group_b: '#abcdef',
        };
        session.style.nodeColorsTableKeys.auspice_rank = ['1', '2', '3'];
        session.style.nodeColorsTable.auspice_rank = ['#111111', '#555555', '#999999'];
        session.style.nodeColorsTableHistory.auspice_rank = {
          1: '#111111',
          2: '#555555',
          3: '#999999',
        };
        session.style.nodeValueNames.group_a = 'Group A label';
        session.style.nodeValueNames.group_b = 'Group B label';
        session.style.nodeValueNames['1'] = 'First rank';
        session.style.widgets['timeline-date-field'] = 'auspice_date';
        session.style.widgets['map-field-country'] = 'auspice_country';
        session.style.widgets['map-field-state'] = 'auspice_state';
        session.style.widgets['map-field-zipcode'] = 'auspice_zip';
        session.data.phylogeneticBootstrap = {
          labels: expectedLeafIds,
          supportBySplitKey: { [split!.key]: 96.5 },
          decimalLength: 1,
        };
      });

      cy.contains('.p-dialog:visible .nav-link', /^Auspice JSON$/).click({ force: true });
      cy.get('#auspice-json-filename')
        .should('have.value', 'SARSCoV2_Simulated_Sequences_NJ_tree_snp-auspice.json')
        .clear({ force: true })
        .type(exportFileBase, { delay: 0, force: true });
      cy.get('#export-auspice-json').click({ force: true });

      cy.readFile(exportPath, null, { timeout: 30000 }).then((savedContents) => {
        const savedText = Cypress.Buffer.from(savedContents).toString('utf8');
        expect(savedText, 'readable indentation').to.contain('\n  "meta":');
        const dataset = JSON.parse(savedText);
        expect(dataset.version).to.equal('v2');
        expect(dataset.meta.panels).to.deep.equal(['tree', 'map']);
        expect(dataset.meta.display_defaults.distance_measure).to.equal('div');
        expect(dataset.meta.display_defaults.color_by).to.equal('auspice_group');
        expect(dataset.meta.display_defaults.geo_resolution).to.equal('site');
        expect(dataset.meta.display_defaults.branch_label).to.equal('bootstrap');
        expect(dataset.meta.updated).to.match(/^\d{4}-\d{2}-\d{2}$/);
        expect(dataset.meta.colorings).to.deep.include({
          key: 'auspice_group', title: 'auspice_group', type: 'categorical',
          scale: [['group_a', '#123456'], ['group_b', '#abcdef']],
          legend: [
            { value: 'group_a', display: 'Group A label' },
            { value: 'group_b', display: 'Group B label' },
          ],
        });
        expect(dataset.meta.colorings).to.deep.include({
          key: 'auspice_rank', title: 'auspice_rank', type: 'ordinal',
          scale: [[1, '#111111'], [2, '#555555'], [3, '#999999']],
          legend: [{ value: 1, display: 'First rank' }, { value: 2 }, { value: 3 }],
        });
        expect(dataset.meta.colorings).to.deep.include({
          key: 'auspice_date', title: 'auspice_date', type: 'temporal',
        });
        expect(dataset.meta.filters).to.include.members(['auspice_group', 'auspice_date']);
        expect(dataset.meta.geo_resolutions.map((resolution: any) => resolution.key))
          .to.deep.equal(['country', 'state', 'zipcode', 'site']);
        expect(Object.keys(dataset.meta.geo_resolutions[0].demes)).to.deep.equal(['United States']);
        expect(Object.keys(dataset.meta.geo_resolutions[1].demes)).to.have.length(2);
        expect(Object.keys(dataset.meta.geo_resolutions[2].demes)).to.deep.equal(['30301', '36602']);
        expect(Object.keys(dataset.meta.geo_resolutions[3].demes)).to.deep.equal([
          'Mobile clinic', 'Atlanta clinic',
        ]);
        expect(auspiceDisplayTopology(dataset.tree)).to.deep.equal(expectedTopology);
        expect(flattenAuspiceDisplayLeaves(dataset.tree)).to.deep.equal(expectedLeafIds);
        expect(new Set(flattenAuspiceDisplayLeaves(dataset.tree)).size).to.equal(expectedLeafIds.length);
        expect(JSON.stringify(dataset)).not.to.contain('ACGTACGT');

        const internalNames = new Set<string>();
        let bootstrapLabels = 0;
        const assertTree = (node: any, parentDiv = 0, isRoot = true): void => {
          expect(node.node_attrs.div).to.be.a('number').and.be.at.least(parentDiv);
          if (isRoot) expect(node.node_attrs.div).to.equal(0);
          const children = Array.isArray(node.children) ? node.children : [];
          if (children.length) {
            expect(node.name).to.match(/^NODE_\d{7}$/);
            expect(internalNames.has(node.name), `unique internal name ${node.name}`).to.equal(false);
            internalNames.add(node.name);
            if (node.branch_attrs?.labels?.bootstrap === '96.5') bootstrapLabels += 1;
            children.forEach((child: any) => assertTree(child, node.node_attrs.div, false));
          }
        };
        assertTree(dataset.tree);
        expect(bootstrapLabels, 'matched bootstrap branch label').to.be.greaterThan(0);
      });

      visitAppAndAcceptEula();
      cy.get('#fileDropRef', { timeout: 15000 }).selectFile(exportPath, { force: true });
      launchAndWaitForProcessing(60000);
      goToPhyloTreeView();
      assertPhyloTreeReady();
      cy.window().then((win: any) => {
        const importedLeaves = win.commonService.visuals.phylogenetic.tree.data
          .getLeaves()
          .map((leaf: any) => String(leaf.id));
        expect(importedLeaves).to.deep.equal(expectedLeafIds);
        const mappedNode = win.commonService.session.data.nodes.find((node: any) => (
          String(node?._id ?? node?.id ?? '') === expectedLeafIds[0]
        ));
        expect(mappedNode.latitude).to.be.a('number');
        expect(mappedNode.longitude).to.be.a('number');
      });
    });

    it('exports the full tree after entering a subtree and exports the subtree when requested', () => {
      const fullExportBase = `cypress_tree_auspice_full_${Date.now()}`;
      const visibleExportBase = `cypress_tree_auspice_visible_${Date.now()}`;
      const fullExportPath = `cypress/downloads/${fullExportBase}.json`;
      const visibleExportPath = `cypress/downloads/${visibleExportBase}.json`;
      let fullLeafIds: string[] = [];
      let visibleLeafIds: string[] = [];

      cy.get('.p-dialog:visible button.p-dialog-close-button').click({ force: true });
      cy.window().then((win: any) => {
        const phylogenetic = win.commonService.visuals.phylogenetic;
        fullLeafIds = phylogenetic.tree.data.getLeaves().map((leaf: any) => String(leaf.id));
        const subtreeRoot = phylogenetic.tree.hierarchy.descendants().find((node: any) => (
          node !== phylogenetic.tree.hierarchy
          && Array.isArray(node.children)
          && node.children.length > 0
          && node.leaves().length >= 2
          && node.leaves().length < fullLeafIds.length
        ));
        expect(subtreeRoot, 'a proper internal subtree').to.exist;
        phylogenetic.viewSubtree([subtreeRoot]);
        visibleLeafIds = phylogenetic.tree.data.getLeaves().map((leaf: any) => String(leaf.id));
      });

      cy.get(SELECTORS.exportBtn).click();
      cy.contains('.p-dialog:visible .nav-link', /^Auspice JSON$/).click({ force: true });
      cy.get('#auspice-advanced-options').find('summary').click();
      cy.get('#auspice-tree-scope-full').should('be.checked');
      cy.get('#auspice-tree-scope-visible').should('not.be.checked');
      cy.get('#auspice-json-filename').clear({ force: true }).type(fullExportBase, { delay: 0, force: true });
      cy.get('#export-auspice-json').click({ force: true });

      cy.readFile(fullExportPath, 'utf8', { timeout: 30000 }).then((savedText) => {
        const dataset = typeof savedText === 'string' ? JSON.parse(savedText) : savedText;
        expect(flattenAuspiceDisplayLeaves(dataset.tree)).to.deep.equal(fullLeafIds);
      });

      cy.get(SELECTORS.exportBtn).click();
      cy.contains('.p-dialog:visible .nav-link', /^Auspice JSON$/).click({ force: true });
      cy.get('#auspice-advanced-options').find('summary').click();
      cy.get('#auspice-tree-scope-visible').check({ force: true });
      cy.get('#auspice-json-filename').clear({ force: true }).type(visibleExportBase, { delay: 0, force: true });
      cy.get('#export-auspice-json').click({ force: true });

      cy.readFile(visibleExportPath, 'utf8', { timeout: 30000 }).then((savedText) => {
        const dataset = typeof savedText === 'string' ? JSON.parse(savedText) : savedText;
        expect(flattenAuspiceDisplayLeaves(dataset.tree)).to.deep.equal(visibleLeafIds);
        expect(dataset.tree.node_attrs.div).to.equal(0);
      });
    });

    it('customizes Auspice metadata, Color By, and Filters from advanced options', () => {
      const exportFileBase = `cypress_tree_auspice_advanced_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.json`;

      cy.window().then((win: any) => {
        const session = win.commonService.session;
        session.data.nodes.forEach((node: any, index: number) => {
          node.auspice_group = index % 2 ? 'group_b' : 'group_a';
          node.auspice_private_note = `private-${index}`;
        });
        session.data.nodeFields = Array.from(new Set([
          ...(session.data.nodeFields || []),
          'auspice_group',
          'auspice_private_note',
        ]));
        session.style.widgets['node-color-variable'] = 'auspice_group';
      });

      cy.contains('.p-dialog:visible .nav-link', /^Auspice JSON$/).click({ force: true });
      cy.get('#auspice-advanced-options').should('not.have.attr', 'open');
      cy.get('#auspice-advanced-options').find('summary').click();

      cy.get('#auspice-tree-scope-full').should('be.checked');
      cy.get('#auspice-tree-scope-visible').should('not.be.checked');
      cy.get('#auspice-metadata-toggle-all').should('contain.text', 'Deselect all');
      cy.get('#auspice-colorings-toggle-all').should('contain.text', 'Deselect all');
      cy.get('#auspice-filters-toggle-all').should('contain.text', 'Deselect all');
      cy.get('#auspice-metadata-fields input[type="checkbox"]')
        .should('have.length.greaterThan', 0)
        .each(($checkbox) => cy.wrap($checkbox).should('be.checked'));

      cy.get('#auspice-metadata-toggle-all').click();
      cy.get('#auspice-metadata-auspice_group').should('not.be.checked');
      cy.get('#auspice-coloring-auspice_group').should('not.be.checked').and('be.disabled');
      cy.get('#auspice-filter-auspice_group').should('not.be.checked').and('be.disabled');
      ['#auspice-coloring-fields', '#auspice-filter-fields'].forEach((selector) => {
        cy.get(selector).then(($menu) => {
          const selectedCheckboxes = $menu.find('input[type="checkbox"]:checked:not(:disabled)');
          if (selectedCheckboxes.length) {
            cy.wrap(selectedCheckboxes)
              .each(($checkbox) => cy.wrap($checkbox).uncheck({ force: true }));
          }
        });
      });

      cy.get('#auspice-metadata-auspice_group').check();
      cy.get('#auspice-coloring-auspice_group').should('be.enabled').check();
      cy.get('#auspice-filter-auspice_group').should('be.enabled').check();

      cy.get('#auspice-json-filename')
        .clear({ force: true })
        .type(exportFileBase, { delay: 0, force: true });
      cy.get('#export-auspice-json').click({ force: true });

      cy.readFile(exportPath, 'utf8', { timeout: 30000 }).then((savedText) => {
        const dataset = typeof savedText === 'string' ? JSON.parse(savedText) : savedText;
        expect(dataset.meta.colorings.map((coloring: any) => coloring.key))
          .to.deep.equal(['auspice_group']);
        expect(dataset.meta.filters).to.deep.equal(['auspice_group']);
        expect(dataset.meta.display_defaults.color_by).to.equal('auspice_group');
        const geographyKeys = (dataset.meta.geo_resolutions || [])
          .map((resolution: any) => resolution.key);

        const visit = (node: any): void => {
          const attributeKeys = Object.keys(node.node_attrs);
          expect(attributeKeys.every(key => (
            ['div', 'auspice_group', ...geographyKeys].includes(key)
          ))).to.equal(true);
          expect(node.node_attrs.auspice_private_note).to.equal(undefined);
          if (!(node.children || []).length) {
            expect(node.node_attrs.auspice_group?.value).to.match(/^group_[ab]$/);
          }
          (node.children || []).forEach(visit);
        };
        visit(dataset.tree);
      });
    });
  });

  context('Settings', () => {
    beforeEach(() => {
      cy.get(SELECTORS.settingsBtn).click();
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .should('be.visible')
        .parents('.p-dialog')
        .as('dialog');
    });

    it('should open and close the settings dialog', () => {
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings').should('not.exist');
    });

    it('should change tree layout to vertical', () => {
      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable')
        .should('equal', 'horizontal');

      cy.get('@dialog').contains('p-accordion-panel', 'Layout').click();
      cy.get('@dialog').find('#tree-layout').click();
      cy.contains('li[role="option"]', 'Vertical').click();

      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable')
        .should('equal', 'vertical');
    });

    it('should change tree layout to circular', () => {
      cy.get('@dialog').contains('p-accordion-panel', 'Layout').click();
      cy.get('@dialog').find('#tree-layout').click();
      cy.contains('li[role="option"]', 'Circular').click();

      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable')
        .should('equal', 'circular');
    });

    it('should change tree mode to smooth', () => {
      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeModeVariable')
        .should('equal', 'square');

      cy.get('@dialog').contains('p-accordion-panel', 'Mode').click();
      cy.get('@dialog').find('#tree-mode').click();
      cy.contains('li[role="option"]', 'Smooth').click();

      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeModeVariable')
        .should('equal', 'smooth');
    });

    it('should change tree type to Dendrogram', () => {
      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeTypeVariable')
        .should('equal', 'weighted');

      cy.get('@dialog').contains('p-accordion-panel', 'Type').click();
      cy.get('@dialog').find('#tree-type').click();
      cy.contains('li[role="option"]', 'Dendrogram').click();

      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeTypeVariable')
        .should('equal', 'dendrogram');
    });

    it('should toggle leaf labels on and off', () => {
      cy.get('@dialog').contains('Leaves').click();
      cy.get('@dialog').contains('Labels and Tooltips').click();

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable')
        .then((initiallyShown) => {
          const initialState = Boolean(initiallyShown);
          const toggledState = !initialState;

          assertLeafLabelState(initialState);

          cy.get('@dialog')
            .find('#leaf-label-visibility')
            .contains(toggledState ? 'Show' : 'Hide')
            .click();

          assertLeafLabelState(toggledState);

          cy.get('@dialog')
            .find('#leaf-label-visibility')
            .contains(initialState ? 'Show' : 'Hide')
            .click();

          assertLeafLabelState(initialState);
        });
    });
  });
});
