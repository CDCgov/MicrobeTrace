import { byTestId, testIds } from '../../../support/selectors';

const loadSubsetFixture = () => {
  cy.visit('/?skipEula=1&skipDemoSession=1');
  cy.loadFiles([
    { name: 'Cypress_FilterMetricNodes.csv', datatype: 'node', field1: '_id' },
    { name: 'Cypress_FilterMetricLinks.csv', datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
  ]);
  cy.get('#launch', { timeout: 20000 }).click({ force: true });
  cy.waitForNetworkToRender();
};

const selectPrimeOption = (testId: string, label: string) => {
  cy.get(byTestId(testId), { timeout: 15000 }).click({ force: true });
  cy.get('li[role="option"]', { timeout: 10000 }).contains(label).click({ force: true });
};

const expectVisibleCounts = (nodes: number, links: number) => {
  cy.window().should((win: any) => {
    expect(win.commonService.getVisibleNodes().length, 'visible node count').to.equal(nodes);
    expect(win.commonService.getVisibleLinks().length, 'visible link count').to.equal(links);
  });
};

describe('Network subset filtering', () => {
  it('applies node and link subsets, clears them, and labels filtered exports', () => {
    loadSubsetFixture();

    expectVisibleCounts(4, 1);

    cy.openGlobalSettings();
    cy.get(byTestId(testIds.networkSubsetNodeValue)).clear().type('A');
    cy.get(byTestId(testIds.networkSubsetNodeApply)).click({ force: true });
    cy.closeGlobalSettings();

    cy.get(byTestId(testIds.networkSubsetFilterNotice), { timeout: 15000 })
      .should('contain.text', 'Subset active')
      .and('contain.text', 'Node');
    expectVisibleCounts(1, 0);

    cy.get(byTestId(testIds.networkSubsetFilterClear)).click({ force: true });
    cy.get(byTestId(testIds.networkSubsetFilterNotice)).should('not.exist');
    expectVisibleCounts(4, 1);

    cy.openGlobalSettings();
    selectPrimeOption(testIds.networkSubsetLinkField, 'Score');
    selectPrimeOption(testIds.networkSubsetLinkOperator, 'greater than');
    cy.get(byTestId(testIds.networkSubsetLinkValue)).clear().type('0.5');
    cy.get(byTestId(testIds.networkSubsetLinkApply)).click({ force: true });
    cy.closeGlobalSettings();

    cy.get(byTestId(testIds.networkSubsetFilterNotice), { timeout: 15000 })
      .should('contain.text', 'Subset active')
      .and('contain.text', 'Link');
    expectVisibleCounts(2, 1);

    cy.get(byTestId(testIds.appFileMenuButton)).click({ force: true });
    cy.get(byTestId(testIds.appFileMenuExportDashboard)).click({ force: true });
    cy.get(byTestId(testIds.dashboardExportScope), { timeout: 15000 })
      .should('contain.text', 'filtered visible network')
      .and('contain.text', 'Link');

    cy.window().then((win: any) => {
      const savedSession = JSON.parse(JSON.stringify(win.commonService.session));
      expect(savedSession.data.subsetFilter.link).to.deep.include({
        target: 'link',
        field: 'score',
        operator: 'greater-than',
        value: '0.5',
      });
    });
  });
});
