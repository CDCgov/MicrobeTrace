/// <reference types="cypress" />

import { visitAppAndAcceptEula } from '../../support/journey-helpers';
import { selectEpiCurveDropdown } from '../../support/epi-curve-helpers';

const launchSample = (): void => {
  visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
  cy.window().its('commonService.session.data.nodes').should('have.length.greaterThan', 0);
};

const useNodeColorField = (field: string): void => {
  cy.window().then((win: any) => {
    const app = win.commonService.visuals.microbeTrace;
    app.SelectedColorNodesByVariable = field;
    app.onColorNodesByChanged();
  });
};

const useLinkColorField = (field: string): void => {
  cy.window().then((win: any) => {
    const app = win.commonService.visuals.microbeTrace;
    app.SelectedColorLinksByVariable = field;
    app.onColorLinksByChanged();
  });
};

const closeSettingsPaneIfVisible = (title: string): void => {
  cy.get('body').then(($body) => {
    const visibleTitle = $body.find('.p-dialog-title:visible').filter((_index, element) =>
      element.textContent?.trim() === title
    );
    if (visibleTitle.length > 0) {
      cy.closeSettingsPane(title);
    }
  });
};

describe('Continuous numeric color ramps', () => {
  beforeEach(() => {
    launchSample();
  });

  it('uses a full-data node ramp, renders a docked legend, and restores categorical history', () => {
    useNodeColorField('degree');

    cy.window().should((win: any) => {
      const common = win.commonService;
      const resolved = common.temp.style.nodeColorScale;
      const allDegrees = common.session.data.nodes.map((node: any) => Number(node.degree));

      expect(resolved.mode).to.equal('continuous');
      expect(resolved.requestedMode).to.equal('auto');
      expect(resolved.domain.min).to.equal(Math.min(...allDegrees));
      expect(resolved.domain.max).to.equal(Math.max(...allDegrees));
      expect(resolved.colorMap(resolved.domain.min)).not.to.equal(resolved.colorMap(resolved.domain.max));
      expect(resolved.colorMap('not numeric').toLowerCase()).to.equal('#eae553');
    });

    cy.get('#key-tables-node-legend', { timeout: 15000 }).should('be.visible');
    cy.get('#key-tables-node-legend .continuous-ramp__label')
      .should('be.visible')
      .and('have.text', 'Node Color: Degree');
    cy.get('#key-tables-node-legend [data-testid="continuous-color-gradient"]')
      .should('have.attr', 'role', 'img')
      .and('have.attr', 'aria-label')
      .and('contain', 'Continuous color ramp');
    cy.get('#key-tables-node-legend').should('contain.text', 'Missing / invalid');
    cy.get('#key-tables-node-table').should('not.exist');

    cy.get('[data-testid="key-tables-node-color-ramp-edit"]')
      .should('have.attr', 'aria-label', 'Edit node color ramp')
      .click();
    cy.contains('.p-dialog:visible .p-dialog-title', 'Global Settings').should('be.visible');
    cy.get('#node-continuous-color-editor').scrollIntoView().should('be.visible');
    cy.focused().should('have.id', 'node-continuous-color-editor-domain-kind');
    cy.get('#key-tables-node-legend').should('be.visible');
    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const app = win.commonService.visuals.microbeTrace;
      const common = win.commonService;
      app.onVariableColorModeChanged('node', 'categorical');
      const savedHistory = JSON.stringify(common.session.style.nodeColorsTableHistory.degree);
      expect(savedHistory).to.not.equal('{}');

      app.onVariableColorModeChanged('node', 'continuous');
      expect(JSON.stringify(common.session.style.nodeColorsTableHistory.degree)).to.equal(savedHistory);

      app.onVariableColorModeChanged('node', 'categorical');
      expect(JSON.stringify(common.session.style.nodeColorsTableHistory.degree)).to.equal(savedHistory);
      const firstNode = common.session.data.nodes[0];
      expect(common.temp.style.nodeColorMap(firstNode.degree))
        .to.equal(common.session.style.nodeColorsTableHistory.degree[String(firstNode.degree)]);
    });

    cy.get('#key-tables-node-table', { timeout: 15000 }).should('be.visible');
  });

  it('applies custom arbitrary stops to links while keeping the domain stable across visibility changes', () => {
    useLinkColorField('distance');

    cy.window().then((win: any) => {
      const app = win.commonService.visuals.microbeTrace;
      app.onVariableColorConfigChanged('link', {
        mode: 'continuous',
        domain: { kind: 'custom', min: 0, max: 20 },
        stops: [
          { value: 0, color: '#000000' },
          { value: 4, color: '#ff0000' },
          { value: 20, color: '#ffffff' },
        ],
        missingColor: '#123456',
      });
    });

    cy.window().should((win: any) => {
      const common = win.commonService;
      const before = common.temp.style.linkColorScale;
      expect(before.domain).to.deep.equal({ min: 0, max: 20 });
      expect(before.stops.map((stop: any) => stop.value)).to.deep.equal([0, 4, 20]);
      expect(before.colorMap(-10).replace(/\s/g, '')).to.match(/rgb\(0,0,0\)|#000000/);
      expect(before.colorMap(100).replace(/\s/g, '')).to.match(/rgb\(255,255,255\)|#ffffff/);
      expect(before.colorMap('invalid')).to.equal('#123456');

      common.session.data.links.slice(0, 5).forEach((link: any) => { link.visible = false; });
      common.createLinkColorMap();
      expect(common.temp.style.linkColorScale.domain).to.deep.equal({ min: 0, max: 20 });
    });

    cy.get('#key-tables-link-legend', { timeout: 15000 }).should('be.visible');
    cy.get('#key-tables-link-legend .continuous-ramp__label')
      .should('be.visible')
      .and('have.text', 'Link Color: Distance');
    cy.get('#key-tables-link-legend [data-testid="continuous-color-gradient"]')
      .should('have.attr', 'aria-label')
      .and('contain', '0 #000000')
      .and('contain', '4 #ff0000')
      .and('contain', '20 #ffffff');

    cy.openGlobalSettings();
    cy.get('#link-color-table-row', { timeout: 15000 })
      .scrollIntoView()
      .should('be.visible')
      .contains('.p-togglebutton-label', 'Show')
      .click({ force: true });
    cy.closeGlobalSettings();

    cy.get('#global-settings-link-color-table', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="floating-link-color-ramp-edit"]')
      .should('have.attr', 'aria-label', 'Edit link color ramp')
      .click();
    cy.contains('.p-dialog:visible .p-dialog-title', 'Global Settings').should('be.visible');
    cy.get('#link-continuous-color-editor').scrollIntoView().should('be.visible');
    cy.focused().should('have.id', 'link-continuous-color-editor-domain-kind');
    cy.get('#global-settings-link-color-table').should('be.visible');
  });

  it('exports labeled continuous legends beside the 2D network', () => {
    const exportFileBase = `continuous_ramp_export_${Date.now()}`;
    const exportPath = `${Cypress.config('downloadsFolder')}/${exportFileBase}.svg`;

    useNodeColorField('degree');
    useLinkColorField('distance');

    cy.get('#tool-btn-container a[title="Export Screen"]').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Network Image')
      .should('be.visible')
      .parents('.p-dialog')
      .as('exportDialog');

    cy.get('@exportDialog')
      .find('#network-export-filename')
      .invoke('val', exportFileBase)
      .trigger('input')
      .trigger('change');
    cy.get('@exportDialog').find('#network-export-filetype').click({ force: true });
    cy.contains('li[role="option"]', 'svg').click({ force: true });
    cy.window()
      .its('commonService.visuals.twoD.SelectedNetworkExportFileTypeListVariable')
      .should('equal', 'svg');
    cy.get('@exportDialog').find('#network-export').should('be.visible').click();
    cy.contains('.p-dialog-title', 'Export Network Image', { timeout: 15000 }).should('not.exist');

    cy.readFile(exportPath, 'utf8', { timeout: 30000 }).then((svgText: string) => {
      ['Node Color: Degree', 'Link Color: Distance'].forEach((label) => {
        const positionedLegend = new RegExp(
          `<g transform="translate\\(([1-9]\\d*(?:\\.\\d+)?),\\s*\\d+(?:\\.\\d+)?\\)" fill="none"><g aria-label="${label}\\.`
        );
        expect(svgText, `${label} export position`).to.match(positionedLegend);
        expect(svgText, `${label} visible label`).to.include(`>${label}</text>`);
        expect(svgText, `${label} accessible title`).to.include(`<title>${label}.`);
      });
    });
  });

  it('imports continuous assignment files for nodes and links through Global Settings', () => {
    cy.openGlobalSettings();

    cy.get('[data-testid="node-color-assignment-file"]').selectFile({
      contents: Cypress.Buffer.from([
        'degree,color,mode',
        '1,#440154,continuous',
        '7,#21918c,continuous',
        '13,#fde725,continuous',
      ].join('\n')),
      fileName: 'degree-ramp.csv',
      mimeType: 'text/csv',
    }, { force: true });
    cy.get('[data-testid="node-color-assignment-status"]', { timeout: 15000 })
      .should('contain.text', 'Applied 3 continuous color ramp stops');

    cy.get('[data-testid="link-color-assignment-file"]').selectFile({
      contents: Cypress.Buffer.from([
        'distance,color,mode',
        '0,#000004,continuous',
        '20,#b5367a,continuous',
        '80,#fcfdbf,continuous',
      ].join('\n')),
      fileName: 'distance-ramp.csv',
      mimeType: 'text/csv',
    }, { force: true });
    cy.get('[data-testid="link-color-assignment-status"]', { timeout: 15000 })
      .should('contain.text', 'Applied 3 continuous color ramp stops');

    cy.window().should((win: any) => {
      const app = win.commonService.visuals.microbeTrace;
      const style = win.commonService.session.style;

      expect(app.SelectedColorNodesByVariable).to.equal('degree');
      expect(style.variableColorScales.node.degree.mode).to.equal('continuous');
      expect(style.variableColorScales.node.degree.stops.map((stop: any) => stop.value)).to.deep.equal([1, 7, 13]);
      expect(app.SelectedColorLinksByVariable).to.equal('distance');
      expect(style.variableColorScales.link.distance.mode).to.equal('continuous');
      expect(style.variableColorScales.link.distance.stops.map((stop: any) => stop.value)).to.deep.equal([0, 20, 80]);
    });
  });

  it('uses the same continuous node and link colors in every shared visual consumer', () => {
    useNodeColorField('degree');
    useLinkColorField('distance');

    const canonicalColor = (win: any, color: string): string => {
      const context = win.document.createElement('canvas').getContext('2d');
      context.fillStyle = '#000000';
      context.fillStyle = color;
      return context.fillStyle.toLowerCase();
    };

    cy.window().should((win: any) => {
      const common = win.commonService;
      const twoD = common.visuals.twoD;
      const dataNode = common.session.data.nodes.find((node: any) => Number.isFinite(Number(node.degree)));
      const renderedNode = twoD.cy.getElementById(dataNode._id);
      expect(renderedNode.empty(), '2D node exists').to.equal(false);
      expect(canonicalColor(win, renderedNode.style('background-color')), '2D node color')
        .to.equal(canonicalColor(win, common.getNodeFillStyle(dataNode).color));

      const renderedLink = twoD.cy.edges().filter((edge: any) => Number.isFinite(Number(edge.data('distance')))).first();
      expect(renderedLink.empty(), '2D link exists').to.equal(false);
      expect(canonicalColor(win, renderedLink.style('line-color')), '2D link color')
        .to.equal(canonicalColor(win, common.temp.style.linkColorMap(renderedLink.data('distance'))));
    });

    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Map').click();
    cy.get('.mapStyle', { timeout: 15000 }).should('be.visible');
    cy.get('#tool-btn-container-map a[title="Settings"]').click({ force: true });
    cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');
    cy.get('#map-field-zipcode').click();
    cy.contains('li[role="option"]', 'Zipcode').click();
    cy.closeSettingsPane('Geospatial Settings');
    cy.window().should((win: any) => {
      const common = win.commonService;
      const map = common.visuals.gisMap;
      const nodeLayers = [
        ...Object.values(map.layers.featureGroup?._layers || {}),
        ...Object.values(map.layers.markerClusterGroup?._featureGroup?._layers || {}),
      ];
      const nodeLayer = nodeLayers
        .find((layer: any) => layer.data && Number.isFinite(Number(layer.data.degree))) as any;
      const linkLayer = Object.values(map.layers.links._layers)
        .find((layer: any) => layer.data && Number.isFinite(Number(layer.data.distance))) as any;
      expect(nodeLayer, 'Map node layer').to.exist;
      expect(linkLayer, 'Map link layer').to.exist;
      expect(canonicalColor(win, nodeLayer.options.fillColor), 'Map node color')
        .to.equal(canonicalColor(win, common.getNodeFillStyle(nodeLayer.data).color));
      expect(canonicalColor(win, linkLayer.options.color), 'Map link color')
        .to.equal(canonicalColor(win, common.temp.style.linkColorMap(linkLayer.data.distance)));
    });

    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Bubble').click();
    cy.get('#cyBubble', { timeout: 15000 }).should('be.visible');
    closeSettingsPaneIfVisible('Bubble Settings');
    cy.window().should((win: any) => {
      const common = win.commonService;
      const bubble = common.visuals.bubble;
      const dataNode = common.session.data.nodes.find((node: any) => Number.isFinite(Number(node.degree)));
      const renderedNode = bubble.cy.getElementById(dataNode._id);
      expect(renderedNode.empty(), 'Bubble node exists').to.equal(false);
      expect(canonicalColor(win, renderedNode.style('background-color')), 'Bubble node color')
        .to.equal(canonicalColor(win, common.getNodeFillStyle(dataNode).color));
    });

    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Phylogenetic Tree').click();
    cy.get('#phylocanvas svg', { timeout: 15000 }).should('be.visible');
    closeSettingsPaneIfVisible('Phylogenetic Tree Settings');
    cy.get('#phylocanvas svg g.tidytree-node-leaf circle').should(($circles) => {
      const win = $circles[0].ownerDocument.defaultView as any;
      const common = win.commonService;
      const expectedColors = new Set(common.session.data.nodes.map((node: any) =>
        canonicalColor(win, common.getNodeFillStyle(node).color)
      ));
      const renderedColors = new Set(Array.from($circles).map((circle: Element) =>
        canonicalColor(win, win.getComputedStyle(circle).fill)
      ));

      expect(renderedColors.size, 'Phylogenetic ramp colors').to.be.greaterThan(1);
      renderedColors.forEach((color) => expect(expectedColors.has(color), `Phylogenetic color ${color}`).to.equal(true));
    });
  });

  it('uses fixed equal-width continuous Node Color bins in the Epi Curve', () => {
    useNodeColorField('degree');

    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Epi Curve').click();
    cy.get('#epiCurve', { timeout: 15000 }).should('be.visible');

    selectEpiCurveDropdown('Date Field', 'Date of symptom onset Date');
    selectEpiCurveDropdown('Color By', 'Node Color');

    cy.get('#epi-continuous-bin-count', { timeout: 15000 })
      .scrollIntoView()
      .should('be.visible')
      .clear()
      .type('7')
      .trigger('change');

    cy.window().then((win: any) => {
      expect(win.commonService.visuals.epiCurve.widgets['epiCurve-continuousBinCount']).to.equal(7);
    });

    cy.get('#epi-continuous-bin-count', { timeout: 15000 })
      .should('be.visible')
      .and('have.value', '7');
    cy.get('#epi-stack-order-list').should('not.exist');
    cy.get('#epiCurveSVG .epiCurve-epi-curve text')
      .invoke('text')
      .should('match', /\[[^\]]+,\s*[^\]]+[\)\]]/);

    cy.window().should((win: any) => {
      const epi = win.commonService.visuals.epiCurve;
      expect(epi.widgets['epiCurve-continuousBinCount']).to.equal(7);
      epi.widgets['epiCurve-cumulative'] = true;
      epi.setCumulative();
      expect(epi.widgets['epiCurve-continuousBinCount']).to.equal(7);
    });
  });
});
