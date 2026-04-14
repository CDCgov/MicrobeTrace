/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapRenderedCounts,
  goToMapView,
  launchProfileToTwoD,
  openGlobalStylingTab,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
} from '../../../support/journey-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
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

  cy.get(`${tableSelector} td[data-value="${value}"]`)
    .closest('tr')
    .find('input[type="color"]')
    .should('have.value', nextColor);
};

const getRenderedMapNodeLayersByValue = (win: WinWithMap, field: string, value: string) =>
  win.commonService.visuals.gisMap.layers.featureGroup
    .getLayers()
    .filter((layer: any) => layer?.data?.[field] === value);

const getRenderedMapLinkLayersByValue = (win: WinWithMap, field: string, value: string) =>
  win.commonService.visuals.gisMap.layers.links
    .getLayers()
    .filter((layer: any) => layer?.data?.[field] === value);

const assertMapNodeCategoryColors = (field: string, firstValue: string, secondValue: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const firstNodes = getRenderedMapNodeLayersByValue(typedWindow, field, firstValue);
    const secondNodes = getRenderedMapNodeLayersByValue(typedWindow, field, secondValue);

    expect(firstNodes.length, `${firstValue} map nodes present`).to.be.greaterThan(0);
    expect(secondNodes.length, `${secondValue} map nodes present`).to.be.greaterThan(0);

    const firstColor = normalizeColor(firstNodes[0].options.fillColor);
    const secondColor = normalizeColor(secondNodes[0].options.fillColor);

    firstNodes.forEach((node: any) => {
      expect(normalizeColor(node.options.fillColor), `${firstValue} map node color`).to.equal(firstColor);
    });

    secondNodes.forEach((node: any) => {
      expect(normalizeColor(node.options.fillColor), `${secondValue} map node color`).to.equal(secondColor);
    });

    expect(firstColor, 'distinct node categories render different map colors').not.to.equal(secondColor);
  });
};

const assertMapLinkCategoryColors = (field: string, firstValue: string, secondValue: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const firstLinks = getRenderedMapLinkLayersByValue(typedWindow, field, firstValue);
    const secondLinks = getRenderedMapLinkLayersByValue(typedWindow, field, secondValue);

    expect(firstLinks.length, `${firstValue} map links present`).to.be.greaterThan(0);
    expect(secondLinks.length, `${secondValue} map links present`).to.be.greaterThan(0);

    const firstColor = normalizeColor(firstLinks[0].options.color);
    const secondColor = normalizeColor(secondLinks[0].options.color);

    firstLinks.forEach((link: any) => {
      expect(normalizeColor(link.options.color), `${firstValue} map link color`).to.equal(firstColor);
    });

    secondLinks.forEach((link: any) => {
      expect(normalizeColor(link.options.color), `${secondValue} map link color`).to.equal(secondColor);
    });

    expect(firstColor, 'distinct link categories render different map colors').not.to.equal(secondColor);
  });
};

describe('Journey Flow - Map uploaded color-by controls', () => {
  const profile = getProfile('map-color-by-uploaded');

  it('updates rendered Map node and link colors from Global Settings and respects color table edits', () => {
    const updatedHealthcareColor = '#123456';
    const updatedSportsTeamColor = '#654321';
    const expectedHealthcareColor = normalizeColor(updatedHealthcareColor);
    const expectedSportsTeamColor = normalizeColor(updatedSportsTeamColor);
    let educationBaseline = '';
    let classroomBaseline = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 4,
      links: 4,
    });

    openGlobalStylingTab();

    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'None');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'None');

    selectPrimeOption('#node-color-variable', 'Profession');
    selectPrimeOption('#link-tooltip-variable', 'Contact type');

    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Profession');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'Contact type');

    cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');
    cy.get('#global-settings-link-color-table', { timeout: 15000 }).should('be.visible');

    assertMapNodeCategoryColors('Profession', 'Healthcare', 'Education');
    assertMapLinkCategoryColors('Contact type', 'sports team', 'classroom');

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const educationNodes = getRenderedMapNodeLayersByValue(typedWindow, 'Profession', 'Education');
      const classroomLinks = getRenderedMapLinkLayersByValue(typedWindow, 'Contact type', 'classroom');

      expect(educationNodes.length, 'education map nodes present').to.be.greaterThan(0);
      expect(classroomLinks.length, 'classroom map links present').to.be.greaterThan(0);

      educationBaseline = normalizeColor(educationNodes[0].options.fillColor);
      classroomBaseline = normalizeColor(classroomLinks[0].options.color);
    });

    changeColorTableEntry('#node-color-table', 'Healthcare', updatedHealthcareColor);
    changeColorTableEntry('#link-color-table', 'sports team', updatedSportsTeamColor);

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const healthcareNodes = getRenderedMapNodeLayersByValue(typedWindow, 'Profession', 'Healthcare');
      const educationNodes = getRenderedMapNodeLayersByValue(typedWindow, 'Profession', 'Education');
      const sportsTeamLinks = getRenderedMapLinkLayersByValue(typedWindow, 'Contact type', 'sports team');
      const classroomLinks = getRenderedMapLinkLayersByValue(typedWindow, 'Contact type', 'classroom');

      expect(healthcareNodes.length, 'healthcare map nodes present').to.be.greaterThan(0);
      expect(educationNodes.length, 'education map nodes present').to.be.greaterThan(0);
      expect(sportsTeamLinks.length, 'sports team map links present').to.be.greaterThan(0);
      expect(classroomLinks.length, 'classroom map links present').to.be.greaterThan(0);

      healthcareNodes.forEach((node: any) => {
        expect(normalizeColor(node.options.fillColor), 'updated healthcare map color').to.equal(expectedHealthcareColor);
      });

      educationNodes.forEach((node: any) => {
        expect(normalizeColor(node.options.fillColor), 'unchanged education map color').to.equal(educationBaseline);
      });

      sportsTeamLinks.forEach((link: any) => {
        expect(normalizeColor(link.options.color), 'updated sports team map color').to.equal(expectedSportsTeamColor);
      });

      classroomLinks.forEach((link: any) => {
        expect(normalizeColor(link.options.color), 'unchanged classroom map color').to.equal(classroomBaseline);
      });
    });
  });
});
