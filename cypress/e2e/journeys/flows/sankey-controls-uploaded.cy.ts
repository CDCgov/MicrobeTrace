/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  goToSankeyView,
  launchProfileToTwoD,
  openSankeyExportDialog,
  openSankeySettingsDialog,
} from '../../../support/journey-helpers';
import {
  addSankeyFields,
  aliasFirstPositiveSankeyLink,
  aliasSankeySelection,
  assertPositiveSankeyLinkColorsByMode,
  assertRenderedSankey,
  removeSankeyField,
  reorderSankeyFields,
  selectSankeyPrimeOption,
  setSankeyLayerColor,
  setSankeyLinkColorMode,
} from '../../../support/sankey-ui-helpers';

const profile = getProfile('style-apply-cypress-test-style');
const THREE_FIELD_SELECTION = ['Profession', 'Node type', 'WHO_class'];

function launchUploadedSankey(): void {
  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  goToSankeyView();
}

function renderUploadedSankey(
  aliasName = 'sankeyControlsSelection',
  options: {
    count?: number;
    explicitFields?: string[];
  } = {},
): void {
  aliasSankeySelection(aliasName, options.explicitFields?.length
    ? { explicitFields: options.explicitFields }
    : { count: options.count });

  addSankeyFields(`@${aliasName}`);
  assertRenderedSankey(`@${aliasName}`);
}

function assertNoRenderedSankey(): void {
  cy.window().should((win: any) => {
    expect(win.commonService.visuals.sankey.data.nodes, 'Sankey nodes').to.have.length(0);
    expect(win.commonService.visuals.sankey.data.links, 'Sankey links').to.have.length(0);
  });

  cy.get('.sankey-axis-label').should('not.exist');
  cy.get('.sankey-node-rect').should('not.exist');
  cy.get('.sankey-link-path').should('not.exist');
}

function assertLayerColor(layerIndex: number, color: string): void {
  cy.get(`.sankey-node-rect[data-layer="${layerIndex}"]`).should(($nodes) => {
    expect($nodes.length, `nodes in Sankey layer ${layerIndex}`).to.be.greaterThan(0);
    Array.from($nodes).forEach((node) => {
      expect(node.getAttribute('fill')).to.equal(color);
    });
  });
}

function assertUniformLinkColor(color: string): void {
  cy.get('.sankey-link-path').should(($paths) => {
    const positivePaths = Array.from($paths).filter((path) => {
      const width = Number(path.getAttribute('stroke-width') || '0');
      return width > 0;
    });

    expect(positivePaths.length, 'uniform-color Sankey links').to.be.greaterThan(0);
    positivePaths.forEach((path) => {
      expect(path.getAttribute('stroke')).to.equal(color);
    });
  });
}

function assertAxisFieldOrder(expectedFields: string[]): void {
  cy.get('.sankey-axis-label').should(($labels) => {
    const renderedFields = Array.from($labels).map((label) => String(label.getAttribute('data-field')));
    expect(renderedFields).to.deep.equal(expectedFields);
  });
}

function assertSettingsFieldOrder(expectedFields: string[]): void {
  openSankeySettingsDialog();
  cy.get('@sankeySettings')
    .find('#sankey-field-table tbody tr[data-field]')
    .should(($rows) => {
      const renderedFields = Array.from($rows).map((row) => String(row.getAttribute('data-field')));
      expect(renderedFields).to.deep.equal(expectedFields);
    });
}

function ensureSankeyExportAdvancedOpen(): void {
  expandAccordionTabByHeader('@sankeyExport', 'Advanced');
  cy.get('@sankeyExport').find('#sankey-export-scale').should('be.visible');
}

describe('Journey Flow - Sankey controls on uploaded data', () => {
  it('requires two variables and returns to the warning state when uploaded fields are removed', () => {
    launchUploadedSankey();

    openSankeySettingsDialog();
    cy.get('@sankeySettings').find('#sankey-minimum-variables-warning').should('be.visible');
    assertNoRenderedSankey();

    aliasSankeySelection('twoFieldSelection', {
      explicitFields: THREE_FIELD_SELECTION.slice(0, 2),
    });
    renderUploadedSankey('threeFieldSelection', {
      explicitFields: [...THREE_FIELD_SELECTION],
    });

    removeSankeyField('WHO_class');
    cy.window().its('commonService.visuals.sankey.SankeyFieldNames').should('deep.equal', THREE_FIELD_SELECTION.slice(0, 2));
    assertRenderedSankey('@twoFieldSelection');

    removeSankeyField('Node type');
    cy.window().its('commonService.visuals.sankey.SankeyFieldNames').should('deep.equal', ['Profession']);
    cy.get('@sankeySettings').find('#sankey-minimum-variables-warning').should('be.visible');
    assertNoRenderedSankey();
  });

  it('accepts up to five Sankey variables on uploaded data and then disables further adds', () => {
    launchUploadedSankey();
    renderUploadedSankey('fiveFieldSelection', { count: 5 });

    cy.get('@fiveFieldSelection').then((selection: any) => {
      expect(selection.fields, 'resolved five-field Sankey selection').to.have.length(5);
    });

    openSankeySettingsDialog();
    cy.window().its('commonService.visuals.sankey.SankeyFieldNames').should('have.length', 5);
    cy.get('@sankeySettings').find('tr[data-field]').should('have.length', 5);
    cy.get('@sankeySettings').find('#sankey-minimum-variables-warning').should('not.exist');
    cy.get('@sankeySettings').find('#sankey-add-variable').should('be.disabled');
  });

  it('switches Sankey link coloring across Source, Target, and Uniform modes and applies per-layer color edits', () => {
    launchUploadedSankey();
    renderUploadedSankey('styledSankeySelection', {
      explicitFields: [...THREE_FIELD_SELECTION],
    });

    cy.window().then((win: any) => {
      cy.wrap([...(win.commonService.visuals.sankey.layerColors as string[])], { log: false }).as('initialLayerColors');
    });

    setSankeyLinkColorMode('Source');
    cy.get('@sankeySettings').find('#sankey-link-color-uniform').should('not.exist');
    assertPositiveSankeyLinkColorsByMode('Source');

    setSankeyLinkColorMode('Target');
    cy.get('@sankeySettings').find('#sankey-link-color-uniform').should('not.exist');
    assertPositiveSankeyLinkColorsByMode('Target');

    cy.get('@initialLayerColors').then((initialLayerColors: any) => {
      const initialColors = initialLayerColors as string[];
      const updatedLayerColor = '#ff6600';

      setSankeyLayerColor(1, updatedLayerColor);

      cy.window().should((win: any) => {
        const layerColors = win.commonService.visuals.sankey.layerColors as string[];
        expect(layerColors[0]).to.equal(initialColors[0]);
        expect(layerColors[1]).to.equal(updatedLayerColor);
        expect(layerColors[2]).to.equal(initialColors[2]);
      });

      assertLayerColor(0, initialColors[0]);
      assertLayerColor(1, updatedLayerColor);
      assertLayerColor(2, initialColors[2]);
    });

    assertPositiveSankeyLinkColorsByMode('Target');

    setSankeyLinkColorMode('Uniform');
    cy.get('@sankeySettings').find('#sankey-link-color-uniform').should('be.visible');
    cy.get('@sankeySettings')
      .find('#sankey-link-color-uniform')
      .invoke('val', '#008080')
      .trigger('input')
      .trigger('change');

    cy.window().its('commonService.visuals.sankey.SelectedColorForUniform').should('equal', '#008080');
    assertUniformLinkColor('#008080');

    cy.get('@sankeySettings')
      .find('#sankey-label-font-size')
      .invoke('val', '28')
      .trigger('input')
      .trigger('change');
    cy.get('@sankeySettings')
      .find('#sankey-axis-font-size')
      .invoke('val', '34')
      .trigger('input')
      .trigger('change');

    cy.window().its('commonService.visuals.sankey.labelFontSize').should('equal', 28);
    cy.window().its('commonService.visuals.sankey.axisFontSize').should('equal', 34);
    cy.get('.sankey-node-label').first().should('have.css', 'font-size', '28px');
    cy.get('.sankey-axis-label').first().should('have.css', 'font-size', '34px');
  });

  it('reorders uploaded Sankey variables and rebuilds the axis order, counts, and layer colors', () => {
    const reorderedFields = ['WHO_class', 'Profession', 'Node type'];

    launchUploadedSankey();
    renderUploadedSankey('initialReorderSelection', {
      explicitFields: [...THREE_FIELD_SELECTION],
    });

    setSankeyLayerColor(0, '#ff0000');
    setSankeyLayerColor(1, '#00ff00');
    setSankeyLayerColor(2, '#0000ff');

    aliasSankeySelection('reorderedSelection', {
      explicitFields: reorderedFields,
    });

    reorderSankeyFields(2, 0);

    cy.window().its('commonService.visuals.sankey.SankeyFieldNames').should('deep.equal', reorderedFields);
    cy.window().its('commonService.visuals.sankey.layerColors').should((layerColors: string[]) => {
      expect(layerColors.slice(0, 3)).to.deep.equal(['#0000ff', '#ff0000', '#00ff00']);
    });

    assertRenderedSankey('@reorderedSelection');
    assertAxisFieldOrder(reorderedFields);
    assertSettingsFieldOrder(reorderedFields);
    assertLayerColor(0, '#0000ff');
    assertLayerColor(1, '#ff0000');
    assertLayerColor(2, '#00ff00');
  });

  it('shows Sankey node and link tooltips and resets hover opacity after mouseleave', () => {
    launchUploadedSankey();
    renderUploadedSankey('tooltipSankeySelection', {
      explicitFields: [...THREE_FIELD_SELECTION],
    });

    cy.closeSettingsPane('Sankey Chart Settings');

    cy.get('.sankey-node-rect')
      .first()
      .trigger('mouseenter', {
        force: true,
        clientX: 140,
        clientY: 140,
        offsetX: 140,
        offsetY: 140,
      });

    cy.get('.custom-tooltip')
      .should('be.visible')
      .and('contain.text', 'Profession')
      .and('contain.text', 'Count');
    cy.get('.sankey-node-rect').first().trigger('mouseleave', { force: true });
    cy.get('.custom-tooltip').should('not.be.visible');

    aliasFirstPositiveSankeyLink();
    cy.get('@positiveSankeyLink')
      .trigger('mouseenter', {
        force: true,
        clientX: 180,
        clientY: 180,
        offsetX: 180,
        offsetY: 180,
      })
      .should('have.attr', 'opacity', '0.8');

    cy.get('.custom-tooltip')
      .should('be.visible')
      .and('contain.text', 'Source')
      .and('contain.text', 'Target')
      .and('contain.text', 'Count');

    cy.get('@positiveSankeyLink')
      .trigger('mouseleave', { force: true })
      .should('have.attr', 'opacity', '0.5');
    cy.get('.custom-tooltip').should('not.be.visible');
  });

  it('drags a Sankey node and updates the node transform, connected links, and same-layer bounds', () => {
    launchUploadedSankey();
    renderUploadedSankey('dragSankeySelection', {
      explicitFields: [...THREE_FIELD_SELECTION],
    });

    cy.closeSettingsPane('Sankey Chart Settings');

    cy.window().then((win: any) => {
      const sankey = win.commonService.visuals.sankey;
      const node = sankey.data.nodes.find((candidate: any) =>
        candidate.layer === 1 &&
        (candidate.sourceLinks?.length || 0) > 0 &&
        (candidate.targetLinks?.length || 0) > 0,
      );

      expect(node, 'draggable Sankey node in middle layer').to.exist;
      cy.wrap({
        name: node.name,
        layer: node.layer,
        x0: node.x0,
        y0: node.y0,
        y1: node.y1,
        centerY: (node.y0 + node.y1) / 2,
        sourceLink: {
          source: node.sourceLinks[0].source.name,
          sourceLayer: node.sourceLinks[0].source.layer,
          target: node.sourceLinks[0].target.name,
          targetLayer: node.sourceLinks[0].target.layer,
          path: sankey.getLinkPathDefinition(node.sourceLinks[0]),
        },
      }, { log: false }).as('draggableSankeyNode');
    });

    cy.get('@draggableSankeyNode').then((dragNode: any) => {
      const nodeSelector = `.sankey-node-rect[data-layer="${dragNode.layer}"][data-name="${dragNode.name}"]`;
      const targetCenterY = dragNode.centerY + 90;

      cy.get(nodeSelector).trigger('mousedown', {
        force: true,
        button: 0,
        which: 1,
      });

      cy.window().then((win: any) => {
        const sankey = win.commonService.visuals.sankey;
        const draggableNode = sankey.data.nodes.find((candidate: any) =>
          candidate.layer === dragNode.layer && candidate.name === dragNode.name,
        );

        sankey.startDrag(draggableNode);
        sankey.move({ offsetY: targetCenterY });
        sankey.endDrag();
        sankey.cdref?.detectChanges?.();
      });

      cy.window().should((win: any) => {
        const sankey = win.commonService.visuals.sankey;
        const movedNode = sankey.data.nodes.find((candidate: any) =>
          candidate.layer === dragNode.layer && candidate.name === dragNode.name,
        );
        const movedSourceLink = movedNode.sourceLinks.find((candidate: any) =>
          candidate.source.name === dragNode.sourceLink.source &&
          candidate.source.layer === dragNode.sourceLink.sourceLayer &&
          candidate.target.name === dragNode.sourceLink.target &&
          candidate.target.layer === dragNode.sourceLink.targetLayer,
        );

        expect(movedNode.y0, 'dragged node y0').to.be.greaterThan(dragNode.y0 + 20);
        expect(movedNode.x0, 'dragged node x0').to.be.closeTo(dragNode.x0, 1);
        expect(
          sankey.getNodeTransform(movedNode),
          'dragged node transform after geometry update',
        ).to.not.equal(`translate(${dragNode.x0}, ${dragNode.y0})`);
        expect(
          sankey.getLinkPathDefinition(movedSourceLink),
          'connected link geometry after drag',
        ).to.not.equal(dragNode.sourceLink.path);
        expect(sankey.draggingNode, 'dragging state after mouseup').to.equal(null);

        const sameLayerNodes = sankey.data.nodes
          .filter((candidate: any) => candidate.layer === dragNode.layer)
          .slice()
          .sort((left: any, right: any) => left.y0 - right.y0);

        sameLayerNodes.forEach((candidate: any) => {
          expect(candidate.y0, `node ${candidate.name} within top bound`).to.be.at.least(0);
          expect(candidate.y1, `node ${candidate.name} within bottom bound`).to.be.at.most(sankey.svgHeight - 70);
        });

        for (let index = 1; index < sameLayerNodes.length; index += 1) {
          expect(
            sameLayerNodes[index].y0,
            `layer ${dragNode.layer} node ${sameLayerNodes[index].name} does not overlap previous node`,
          ).to.be.at.least(sameLayerNodes[index - 1].y1);
        }
      });
    });
  });

  it('toggles Sankey export dialog state, supports advanced PNG scaling, and exports PNG plus SVG', () => {
    const cancelFileBase = `cypress_sankey_export_cancel_${Date.now()}`;
    const pngFileBase = `cypress_sankey_export_png_${Date.now()}`;
    const svgFileBase = `cypress_sankey_export_svg_${Date.now()}`;
    const pngPath = `cypress/downloads/${pngFileBase}.png`;
    const svgPath = `cypress/downloads/${svgFileBase}.svg`;

    launchUploadedSankey();
    renderUploadedSankey('exportSankeySelection', {
      explicitFields: [...THREE_FIELD_SELECTION],
    });

    cy.closeSettingsPane('Sankey Chart Settings');

    openSankeyExportDialog();
    cy.get('@sankeyExport')
      .find('#sankey-export-filename')
      .clear()
      .type(cancelFileBase)
      .should('have.value', cancelFileBase);

    ensureSankeyExportAdvancedOpen();
    cy.get('@sankeyExport').find('#sankey-export-scale').should('be.visible');

    selectSankeyPrimeOption('@sankeyExport', '#sankey-export-filetype', 'svg');
    cy.window().its('commonService.visuals.sankey.SelectedNetworkExportFileTypeListVariable').should('equal', 'svg');
    cy.get('@sankeyExport').find('#sankey-export-scale').should('not.be.visible');

    cy.get('@sankeyExport').find('#sankey-export-cancel').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Sankey Chart').should('not.exist');

    openSankeyExportDialog();
    cy.get('@sankeyExport').find('#sankey-export-filename').should('have.value', cancelFileBase);

    selectSankeyPrimeOption('@sankeyExport', '#sankey-export-filetype', 'png');
    cy.window().its('commonService.visuals.sankey.SelectedNetworkExportFileTypeListVariable').should('equal', 'png');
    ensureSankeyExportAdvancedOpen();

    cy.get('@sankeyExport')
      .find('#sankey-export-scale')
      .invoke('val', '1.4')
      .trigger('input')
      .trigger('change');
    cy.window().its('commonService.visuals.sankey.SankeyExportScaleVariable').should('equal', 1.4);
    cy.window().then((win: any) => {
      const sankey = win.commonService.visuals.sankey;
      const expectedResolution = `${Math.round(sankey.svgWidth * 1.4)} x ${Math.round(sankey.svgHeight * 1.4)}px`;
      cy.get('@sankeyExport').find('#sankey-export-resolution').should('have.text', expectedResolution);
    });

    cy.get('@sankeyExport')
      .find('#sankey-export-filename')
      .clear()
      .type(pngFileBase);
    cy.get('@sankeyExport').find('#sankey-export-submit').click({ force: true });

    cy.readFile(pngPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
      expect(pngBinary.length, 'exported PNG byte length').to.be.greaterThan(1000);
    });

    openSankeyExportDialog();
    selectSankeyPrimeOption('@sankeyExport', '#sankey-export-filetype', 'svg');
    cy.get('@sankeyExport')
      .find('#sankey-export-filename')
      .clear()
      .type(svgFileBase);
    cy.get('@sankeyExport').find('#sankey-export-submit').click({ force: true });

    cy.readFile(svgPath, 'utf8', { timeout: 30000 }).should((svgText) => {
      expect(svgText, 'exported Sankey SVG content').to.include('<svg');
      expect(svgText.length, 'exported Sankey SVG length').to.be.greaterThan(100);
    });
  });
});
