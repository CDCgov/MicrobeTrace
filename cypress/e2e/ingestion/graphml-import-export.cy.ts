/// <reference types="cypress" />

import { byTestId, testIds } from '../../support/selectors';
import { installSaveAsCaptureHook } from '../../support/journey-helpers';

describe('GraphML import/export', () => {
  const graphMLA = 'GraphML_Provenance_A.graphml';
  const graphMLB = 'GraphML_Provenance_B.graphml';
  const unsupportedGraphML = 'GraphML_Unsupported_Features.graphml';
  const staticGEXF = 'GEXF_Static_Network.gexf';
  const optionalGEXF = 'GEXF_Optional_Metadata.gexf';
  const staticCX2 = 'CX2_Static_Network.cx2';
  const staticDOT = 'DOT_Static_Network.dot';

  beforeEach(() => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  });

  it('imports GraphML files with filename-scoped edge provenance and exports GraphML', () => {
    cy.attach_files('#fileDropRef', [graphMLA, graphMLB], ['application/graphml+xml', 'application/graphml+xml']);

    [graphMLA, graphMLB].forEach((fileName) => {
      cy.contains('#file-table .file-table-row', fileName, { timeout: 20000 })
        .find('input[data-type="network"]')
        .should('be.checked');
    });

    cy.get('#launch').should('not.be.disabled').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win: any) => {
      const session = win.commonService.session;
      expect(session.data.nodes, 'imported nodes').to.have.length(6);
      expect(session.data.links, 'imported links').to.have.length(5);

      const expectedOriginCounts = {
        [`${graphMLA}-Contact.csv`]: 1,
        [`${graphMLA}-Distance.csv`]: 1,
        [`${graphMLB}-Contact.csv`]: 1,
        [`${graphMLB}-Distance.csv`]: 1,
        'Duo-Link': 1,
      };

      expect(win.commonService.createLinkColorMap()).to.deep.equal(expectedOriginCounts);

      const contactOnlyLink = session.data.links.find((link: any) =>
        link.source === 'A1' && link.target === 'A2',
      );
      expect(contactOnlyLink.hasDistance).to.equal(false);
      expect(contactOnlyLink.origin).to.deep.equal([`${graphMLA}-Contact.csv`]);
      expect(contactOnlyLink.distanceOrigin).to.be.oneOf([undefined, null]);
      expect(contactOnlyLink.graphml_edge_origin).to.equal('Contact.csv');

      const duoLink = session.data.links.find((link: any) =>
        link.source === 'A1' && link.target === 'A3',
      );
      expect(duoLink.origin).to.deep.equal([`${graphMLA}-Contact.csv`, `${graphMLA}-Distance.csv`]);
      expect(duoLink._originAll).to.deep.equal([`${graphMLA}-Contact.csv`, `${graphMLA}-Distance.csv`]);
      expect(duoLink.distanceOrigin).to.equal(`${graphMLA}-Distance.csv`);
      expect(duoLink.distanceOrigins).to.deep.equal([`${graphMLA}-Distance.csv`]);
    });

    installSaveAsCaptureHook();
    cy.get(byTestId(testIds.appFileMenuButton)).click({ force: true });
    cy.get('[data-testid="app-file-menu-export-graphml"]').click({ force: true });

    cy.window({ timeout: 30000 }).should((win: any) => {
      const captured = (win.__mtCapturedDownloads || [])
        .filter((download: any) => download.fileName === 'microbetrace.graphml');
      expect(captured.length, 'captured GraphML export').to.be.greaterThan(0);

      const dataUrl = captured[captured.length - 1].dataUrl;
      const xml = atob(String(dataUrl).split(',').pop() || '');
      expect(xml).to.contain('<graphml');
      expect(xml).to.contain('<node id="A1">');
      expect(xml).to.contain('<edge');
      expect(xml).to.contain(`${graphMLA}-Contact.csv`);
      expect(xml).to.contain(`${graphMLB}-Distance.csv`);
    });
  });

  it('warns when GraphML contains unsupported nested graphs or ports', () => {
    cy.attach_file('#fileDropRef', unsupportedGraphML, 'application/graphml+xml');

    cy.contains('#file-table .file-table-row', unsupportedGraphML, { timeout: 20000 })
      .find('input[data-type="network"]')
      .should('be.checked');

    cy.get('#launch').should('not.be.disabled').click({ force: true });

    cy.contains('.p-dialog-title', 'Network Import Warnings', { timeout: 30000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('graphMLWarningDialog');

    cy.get('@graphMLWarningDialog')
      .should('contain.text', `${unsupportedGraphML}: Nested GraphML graph elements were ignored.`)
      .and('contain.text', `${unsupportedGraphML}: Nested graph under node "U1" was ignored.`)
      .and('contain.text', `${unsupportedGraphML}: 1 GraphML port element(s) were ignored.`);

    cy.get('@graphMLWarningDialog')
      .contains('button', 'Confirm')
      .should('be.visible')
      .click({ force: true });

    cy.contains('.p-dialog-title', 'Network Import Warnings').should('not.exist');

    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links;
      expect(links, 'imported links').to.have.length(1);
      expect(links[0].origin).to.deep.equal([`${unsupportedGraphML}-Unsupported.csv`]);
    });
  });

  it('imports static GEXF topology, typed attributes, direction, and weights as Network files', () => {
    cy.attach_file('#fileDropRef', staticGEXF, 'application/gexf+xml');

    cy.contains('#file-table .file-table-row', staticGEXF, { timeout: 20000 })
      .find('input[data-type="network"]')
      .should('be.checked');

    cy.get('#launch').should('not.be.disabled').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win: any) => {
      const session = win.commonService.session;
      expect(session.data.nodes, 'imported GEXF nodes').to.have.length(3);
      expect(session.data.links, 'imported GEXF links').to.have.length(2);

      const metadata = session.files.find((file: any) => file.name === staticGEXF);
      expect(metadata.format).to.equal('network');

      const beta = session.data.nodes.find((node: any) => node._id === 'G2');
      expect(beta.label).to.equal('Beta');
      expect(beta.sample_type).to.equal('contact');
      expect(beta.viral_load).to.equal(3.75);
      expect(beta.active).to.equal(false);
      expect(beta.gexf_node_id).to.equal('G2');
      expect(beta.gexf_file).to.equal(staticGEXF);

      const directedLink = session.data.links.find((link: any) =>
        link.source === 'G1' && link.target === 'G2',
      );
      expect(directedLink.directed).to.equal(true);
      expect(directedLink.weight).to.equal(4.5);
      expect(directedLink.distance).to.equal(4.5);
      expect(directedLink.hasDistance).to.equal(true);
      expect(directedLink.distanceOrigin).to.equal(staticGEXF);
      expect(directedLink.kind).to.equal('contact');
      expect(directedLink.confirmed).to.equal(true);
      expect(directedLink.gexf_edge_id).to.equal('e1');

      const defaultUndirectedLink = session.data.links.find((link: any) =>
        link.source === 'G2' && link.target === 'G3',
      );
      expect(defaultUndirectedLink.directed).to.equal(false);
      expect(defaultUndirectedLink.distance).to.equal(7);
      expect(defaultUndirectedLink.confirmed).to.equal(false);
    });
  });

  it('warns for optional GEXF dynamic, hierarchy, and visualization metadata while preserving fields', () => {
    cy.attach_file('#fileDropRef', optionalGEXF, 'application/gexf+xml');

    cy.contains('#file-table .file-table-row', optionalGEXF, { timeout: 20000 })
      .find('input[data-type="network"]')
      .should('be.checked');

    cy.get('#launch').should('not.be.disabled').click({ force: true });

    cy.contains('.p-dialog-title', 'Network Import Warnings', { timeout: 30000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('networkWarningDialog');

    cy.get('@networkWarningDialog')
      .should('contain.text', `${optionalGEXF}: GEXF dynamic timing metadata was imported as data fields`)
      .and('contain.text', `${optionalGEXF}: GEXF visualization metadata was imported as data fields`)
      .and('contain.text', `${optionalGEXF}: GEXF hierarchy metadata was imported as data fields`);

    cy.get('@networkWarningDialog')
      .contains('button', 'Confirm')
      .should('be.visible')
      .click({ force: true });

    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win: any) => {
      const session = win.commonService.session;
      expect(session.data.nodes, 'imported GEXF metadata nodes').to.have.length(3);
      expect(session.data.links, 'imported GEXF metadata links').to.have.length(1);

      const child = session.data.nodes.find((node: any) => node._id === 'Child');
      expect(child.gexf_parent_id).to.equal('Parent');
      expect(child.gexf_start).to.equal('2026-01-01');
      expect(child.gexf_end).to.equal('2026-02-01');
      expect(child.gexf_spells).to.deep.equal([{ start: '2026-01-01', end: '2026-02-01' }]);
      expect(child.gexf_dynamic_attvalues[0]).to.include({
        field: 'state',
        value: 'infectious',
        start: '2026-01-05',
        end: '2026-01-20',
      });
      expect(child.gexf_viz_x).to.equal(10);
      expect(child.gexf_viz_y).to.equal(20);
      expect(child.gexf_viz_size).to.equal(3.5);
      expect(child.gexf_viz_shape).to.equal('diamond');

      const link = session.data.links[0];
      expect(link.directed).to.equal(true);
      expect(link.source).to.equal('Child');
      expect(link.target).to.equal('Random');
      expect(link.gexf_start).to.equal('2026-01-10');
      expect(link.gexf_spells).to.deep.equal([{ start: '2026-01-10', end: '2026-01-30' }]);
    });
  });

  it('imports CX2 topology, aliases, defaults, fragments, coordinates, and provenance as Network files', () => {
    cy.attach_file('#fileDropRef', staticCX2, 'application/json');

    cy.contains('#file-table .file-table-row', staticCX2, { timeout: 20000 })
      .find('input[data-type="network"]')
      .should('be.checked');

    cy.get('#launch').should('not.be.disabled').click({ force: true });

    cy.contains('.p-dialog-title', 'Network Import Warnings', { timeout: 30000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('networkWarningDialog');

    cy.get('@networkWarningDialog')
      .should('contain.text', `${staticCX2}: CX2 fragmented aspects were concatenated in file order.`);

    cy.get('@networkWarningDialog')
      .contains('button', 'Confirm')
      .should('be.visible')
      .click({ force: true });

    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win: any) => {
      const session = win.commonService.session;
      expect(session.data.nodes, 'imported CX2 nodes').to.have.length(3);
      expect(session.data.links, 'imported CX2 links').to.have.length(2);

      const metadata = session.files.find((file: any) => file.name === staticCX2);
      expect(metadata.format).to.equal('network');

      const beta = session.data.nodes.find((node: any) => node._id === 'Beta');
      expect(beta.cx2_node_id).to.equal('2');
      expect(beta.sample_type).to.equal('contact');
      expect(beta.viral_load).to.equal(3.75);
      expect(beta.active).to.equal(false);
      expect(beta.cx2_x).to.equal(320);
      expect(beta.cx2_y).to.equal(210);
      expect(beta.cx2_bypass_NODE_BACKGROUND_COLOR).to.equal('#3366ff');

      const gamma = session.data.nodes.find((node: any) => node._id === 'Gamma');
      expect(gamma.viral_load).to.equal(0);
      expect(gamma.active).to.equal(true);

      const contactLink = session.data.links.find((link: any) =>
        link.source === 'Alpha' && link.target === 'Beta',
      );
      expect(contactLink.cx2_edge_id).to.equal('100');
      expect(contactLink.kind).to.equal('contact');
      expect(contactLink.confirmed).to.equal(true);
      expect(contactLink.distance).to.equal(4.5);
      expect(contactLink.hasDistance).to.equal(true);
      expect(contactLink.origin).to.deep.equal([`${staticCX2}-Contact.csv`]);
      expect(contactLink.distanceOrigin).to.equal(`${staticCX2}-Contact.csv`);

      const distanceLink = session.data.links.find((link: any) =>
        link.source === 'Beta' && link.target === 'Gamma',
      );
      expect(distanceLink.cx2_edge_id).to.equal('101');
      expect(distanceLink.distance).to.equal(7);
      expect(distanceLink.origin).to.deep.equal([staticCX2]);
      expect(distanceLink.distanceOrigin).to.equal(staticCX2);
    });
  });

  it('imports DOT topology, attributes, direction, strict edges, and subgraph shorthand as Network files', () => {
    cy.attach_file('#fileDropRef', staticDOT, 'text/vnd.graphviz');

    cy.contains('#file-table .file-table-row', staticDOT, { timeout: 20000 })
      .find('input[data-type="network"]')
      .should('be.checked');

    cy.get('#launch').should('not.be.disabled').click({ force: true });
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win: any) => {
      const session = win.commonService.session;
      expect(session.data.nodes, 'imported DOT nodes').to.have.length(5);
      expect(session.data.links, 'imported DOT links').to.have.length(4);

      const metadata = session.files.find((file: any) => file.name === staticDOT);
      expect(metadata.format).to.equal('network');

      const alpha = session.data.nodes.find((node: any) => node._id === 'Alpha');
      expect(alpha.label).to.equal('Case Alpha');
      expect(alpha.sample_type).to.equal('case');
      expect(alpha.viral_load).to.equal(2.5);
      expect(alpha.active).to.equal(true);
      expect(alpha.dot_graph_id).to.equal('ContactNetwork');
      expect(alpha.dot_graph_label).to.equal('DOT fixture');

      const beta = session.data.nodes.find((node: any) => node._id === 'Beta');
      expect(beta.sample_type).to.equal('contact');
      expect(beta.active).to.equal(false);

      const gamma = session.data.nodes.find((node: any) => node._id === 'Gamma');
      expect(gamma.sample_type).to.equal('case');
      expect(gamma.active).to.equal(true);

      const delta = session.data.nodes.find((node: any) => node._id === 'Delta');
      expect(delta.dot_subgraphs).to.deep.equal(['cluster_followup']);

      const strictLink = session.data.links.find((link: any) =>
        link.source === 'Alpha' && link.target === 'Beta',
      );
      expect(strictLink.directed).to.equal(true);
      expect(strictLink.distance).to.equal(5);
      expect(strictLink.hasDistance).to.equal(true);
      expect(strictLink.origin).to.deep.equal([`${staticDOT}-Contact.csv`]);
      expect(strictLink.distanceOrigin).to.equal(`${staticDOT}-Contact.csv`);
      expect(strictLink.note).to.equal('strict replacement');
      expect(strictLink.dot_edge_origin).to.equal('Contact.csv');

      const weightedLink = session.data.links.find((link: any) =>
        link.source === 'Beta' && link.target === 'Gamma',
      );
      expect(weightedLink.kind).to.equal('genetic');
      expect(weightedLink.weight).to.equal(7);
      expect(weightedLink.distance).to.equal(7);
      expect(weightedLink.origin).to.deep.equal([staticDOT]);

      const shorthandTargets = session.data.links
        .filter((link: any) => link.source === 'Beta' && ['Delta', 'Epsilon'].includes(link.target))
        .map((link: any) => link.target)
        .sort();
      expect(shorthandTargets).to.deep.equal(['Delta', 'Epsilon']);
    });
  });
});
