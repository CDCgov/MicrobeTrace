/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToMapView,
  launchProfileToTwoD,
  openGlobalStylingTab,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
  setTimelineDate,
  setTimelineField,
} from '../../../support/journey-helpers';
import { readRenderedMapNodeStyle } from '../../../support/map-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const getNodeId = (data: any): string => String(data?._id ?? data?.ID ?? data?.id ?? '');

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]:visible', label, { timeout: 15000 }).click({ force: true });
};

const assertRenderedNodeColor = (nodeId: string, expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const layer = typedWindow.commonService.visuals.gisMap.layers.featureGroup
      .getLayers()
      .find((candidate: any) => getNodeId(candidate?.data) === nodeId);

    expect(layer, `rendered Map node layer ${nodeId}`).to.exist;
    expect(readRenderedMapNodeStyle(layer).fillColor, `Map node color for ${nodeId}`).to.equal(expectedColor);
  });
};

const assertRenderedLinkColor = (linkId: string, expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const layer = typedWindow.commonService.visuals.gisMap.layers.links
      .getLayers()
      .find((candidate: any) => String(candidate?.data?.id || '') === linkId);

    expect(layer, `rendered Map link layer ${linkId}`).to.exist;
    expect(normalizeColor(layer.options.color), `Map link color for ${linkId}`).to.equal(expectedColor);
  });
};

describe('Journey Flow - Map uploaded timeline color persistence', () => {
  const profile = getProfile('timeline-covid-node-link');
  const timeline = profile.expectations.timeline!;

  it('keeps edited Map node and link colors after timeline mode is turned off', () => {
    const updatedNodeColor = '#777777';
    const updatedLinkColor = '#000000';
    const nodeColorVariable = 'Lineage';
    const expectedNodeColor = normalizeColor(updatedNodeColor);
    const expectedLinkColor = normalizeColor(updatedLinkColor);
    const midCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-mid') ?? timeline.checkpoints[0];
    let targetNodeId = '';
    let targetLinkId = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    setTimelineField(timeline.field);
    setTimelineDate(midCheckpoint.date);

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      expect(typedWindow.commonService.visuals.gisMap.layers.featureGroup.getLayers().length, 'rendered midpoint Map nodes')
        .to.be.greaterThan(0);
    });

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', nodeColorVariable);
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', nodeColorVariable);
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'None');

    cy.get('#key-tables-node-table tr', { timeout: 15000 })
      .eq(1)
      .find('input[type="color"]')
      .should('have.length', 1)
      .then(($input) => {
        const input = $input.get(0) as HTMLInputElement;
        input.value = updatedNodeColor;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    cy.get('#key-tables-node-table tr')
      .eq(1)
      .find('input[type="color"]')
      .should('have.value', updatedNodeColor);

    cy.get('#link-color').should('be.visible').then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = updatedLinkColor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    cy.get('#link-color').should('have.value', updatedLinkColor);

    cy.closeGlobalSettings();

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const nodeLayer = typedWindow.commonService.visuals.gisMap.layers.featureGroup
        .getLayers()
        .find((candidate: any) => {
          const nodeId = getNodeId(candidate?.data);
          return Boolean(nodeId) && readRenderedMapNodeStyle(candidate).fillColor === expectedNodeColor;
        });

      expect(nodeLayer, 'rendered Map node recolored during timeline mode').to.exist;
    });

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const linkLayer = typedWindow.commonService.visuals.gisMap.layers.links
        .getLayers()
        .find((candidate: any) => normalizeColor(candidate?.options?.color) === expectedLinkColor);

      expect(linkLayer, 'rendered Map link recolored during timeline mode').to.exist;
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const nodeLayer = typedWindow.commonService.visuals.gisMap.layers.featureGroup
        .getLayers()
        .find((candidate: any) => {
          const nodeId = getNodeId(candidate?.data);
          return Boolean(nodeId) && readRenderedMapNodeStyle(candidate).fillColor === expectedNodeColor;
        });

      expect(nodeLayer, 'recolored uploaded Map node to persist after teardown').to.exist;
      targetNodeId = getNodeId(nodeLayer.data);
      expect(targetNodeId, 'captured recolored uploaded Map node id').not.to.equal('');

      const linkLayer = typedWindow.commonService.visuals.gisMap.layers.links
        .getLayers()
        .find((candidate: any) => normalizeColor(candidate?.options?.color) === expectedLinkColor);

      expect(linkLayer, 'recolored uploaded Map link to persist after teardown').to.exist;
      targetLinkId = String(linkLayer?.data?.id || '');
      expect(targetLinkId, 'captured recolored uploaded Map link id').not.to.equal('');
    });

    setTimelineField('None');

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['node-timeline-variable']).to.equal('None');
        expect(widgets['timeline-date-field']).to.equal('None');
      });

    cy.then(() => {
      expect(targetNodeId, 'captured recolored uploaded Map node id after teardown').not.to.equal('');
      assertRenderedNodeColor(targetNodeId, expectedNodeColor);
      expect(targetLinkId, 'captured recolored uploaded Map link id after teardown').not.to.equal('');
      assertRenderedLinkColor(targetLinkId, expectedLinkColor);
    });

    openGlobalStylingTab();
    cy.get('#key-tables-node-table tr')
      .eq(1)
      .find('input[type="color"]')
      .should('have.value', updatedNodeColor);
    cy.get('#link-color').should('have.value', updatedLinkColor);
    cy.closeGlobalSettings();
  });
});
