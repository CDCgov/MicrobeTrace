/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import { launchProfileToTwoD } from '../../../support/journey-helpers';

const views: Array<[string, string]> = [
  ['2D Network', '[data-testid="twod-settings-button"]'],
  ['Aggregate', '[data-testid="aggregate-settings-button"]'],
  ['Alignment View', '[data-testid="alignment-settings-button"]'],
  ['Bubble', '[data-testid="bubble-settings-button"]'],
  ['CrossTab', '[data-testid="crosstab-settings-button"]'],
  ['Epi Curve', 'app-timeline-component [title="Settings"]'],
  ['Gantt Chart', 'ganttcomponent [title="Settings"]'],
  ['Heatmap', 'heatmapcomponent [title="Settings"]'],
  ['Map', 'mapcomponent [title="Settings"]'],
  ['Network Statistics', 'networkstatisticscomponent [title="Settings"]'],
  ['Phylogenetic Tree', 'phylogeneticcomponent [title="Settings"]'],
  ['Sankey', '[data-testid="sankey-settings-button"]'],
  ['Table', 'tablecomponent [title="Settings"]'],
  ['Transmission Chain Explorer', '[data-testid="transmission-chain-settings-button"]'],
];

function assertCollapsedLayout(): void {
  cy.get('@settingsDialog').then(($dialog) => {
    $dialog.find('.p-accordionheader[aria-expanded="true"]:visible').each((_index, header) => {
      cy.wrap(header).click();
    });
  });
  cy.get('@settingsDialog').should(($dialog) => {
    const dialog = $dialog.get(0);
    const content = dialog.querySelector('.p-dialog-content') as HTMLElement;
    const tabset = content.querySelector('tabset') as HTMLElement | null;
    const regions = Array.from(dialog.querySelectorAll('.p-accordioncontent[data-p-active="false"]'));
    regions.forEach(region => expect(region.getBoundingClientRect().height, 'collapsed panel height').to.be.lessThan(1));
    if (tabset) {
      // Use layout pixels: Cypress can scale the app while displaying its runner.
      // Allow the dialog padding and the inline tabset's surrounding line boxes.
      expect(content.clientHeight - tabset.offsetHeight, 'space below tab contents').to.be.at.most(64);
      const active = $dialog.find('.tab-pane.active:visible').last();
      const independentControls = active.find('input,select,p-select,p-slider,button').filter((_index, element) => (
        !element.closest('p-accordion-content') && !element.closest('p-accordion-header')
      ));
      if (active.find('p-accordion-header').length && !independentControls.length) {
        expect(content.scrollHeight, 'no scroll area from hidden panels').to.be.at.most(content.clientHeight + 2);
      }
    }
  });
}

describe('Settings dialogs size to their visible contents', () => {
  const requestedViews = String(Cypress.expose('settingsView') || '').split('+').filter(Boolean);
  for (const [view, settingsButton] of views.filter(([name]) => !requestedViews.length || requestedViews.some(prefix => name.startsWith(prefix)))) {
    it(`keeps ${view} settings compact after switching tabs and collapsing panels`, () => {
      launchProfileToTwoD(getProfile('alignment-angulartesting-sequence-node-list'));
      cy.get('[data-testid="app-view-menu-button"]').click();
      cy.contains('button[mat-menu-item]', new RegExp(`^\\s*${view}\\s*$`)).click();
      cy.get(`${settingsButton}:visible`, { timeout: 30000 }).first().then(($button) => {
        const appDocument = $button.get(0).ownerDocument;
        const visuals = (appDocument.defaultView as any).commonService.visuals;
        // These views open settings before the dialog's entrance animation finishes.
        const alreadyOpen = view === 'Epi Curve' ? visuals.epiCurve.ShowEpiSettingsPane
          : view === 'Transmission Chain Explorer' ? visuals.transmissionChain.settingsDialog.isVisible
          : Cypress.$(appDocument).find('.p-dialog:visible').length > 0;
        if (!alreadyOpen) cy.wrap($button).click();
      });
      cy.get('.p-dialog:visible').last().as('settingsDialog', { type: 'static' });
      cy.get('@settingsDialog').then(($dialog) => {
        const title = $dialog.find('.p-dialog-title').text().trim();
        const tabs = $dialog.find('ul.nav-tabs').first().find('a.nav-link').toArray().map(tab => tab.textContent!.trim());
        for (const tab of tabs.length ? tabs : ['Settings']) {
          if (tabs.length) cy.get('@settingsDialog').find('ul.nav-tabs').first().contains('a.nav-link', tab).click();
          assertCollapsedLayout();
        }
        cy.closeSettingsPane(title);
      });
    });
  }
});
