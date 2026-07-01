/// <reference types="cypress" />

import { byTestId, testIds } from '../../support/selectors';
import { installSaveAsCaptureHook } from '../../support/journey-helpers';

describe('GraphML import/export', () => {
  const graphMLA = 'GraphML_Provenance_A.graphml';
  const graphMLB = 'GraphML_Provenance_B.graphml';
  const unsupportedGraphML = 'GraphML_Unsupported_Features.graphml';

  beforeEach(() => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  });

  it('imports GraphML files with filename-scoped edge provenance and exports GraphML', () => {
    cy.attach_files('#fileDropRef', [graphMLA, graphMLB], ['application/graphml+xml', 'application/graphml+xml']);

    [graphMLA, graphMLB].forEach((fileName) => {
      cy.contains('#file-table .file-table-row', fileName, { timeout: 20000 })
        .find('input[data-type="graphml"]')
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
      .find('input[data-type="graphml"]')
      .should('be.checked');

    cy.get('#launch').should('not.be.disabled').click({ force: true });

    cy.contains('.p-dialog-title', 'GraphML Import Warnings', { timeout: 30000 })
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

    cy.contains('.p-dialog-title', 'GraphML Import Warnings').should('not.exist');

    cy.window({ timeout: 30000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('be.true');

    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links;
      expect(links, 'imported links').to.have.length(1);
      expect(links[0].origin).to.deep.equal([`${unsupportedGraphML}-Unsupported.csv`]);
    });
  });
});
