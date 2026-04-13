/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertBubbleReady,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

type WinWithBubble = Window & {
  commonService: any;
};

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay', { timeout: 15000 })
    .last()
    .find('p-selectitem')
    .contains('li', new RegExp(`^${escapeRegExp(label)}$`))
    .click({ force: true });
};

const setBubbleAxis = (
  selector: '#bubble-axis-x' | '#bubble-axis-y',
  label: string,
  expectedWidget: 'bubble-x' | 'bubble-y',
  expectedValue: string,
): void => {
  cy.get('@bubbleSettings').find(selector).find('.p-select-dropdown').click({ force: true });
  clickVisiblePrimeOption(label);
  cy.get('@bubbleSettings').find(selector).find('.p-select-label').should('contain', label);
  cy.window().its(`commonService.session.style.widgets.${expectedWidget}`).should('equal', expectedValue);
};

const setBubbleNodeSize = (value: number): void => {
  cy.get('@bubbleSettings')
    .find('#bubble-node-size')
    .invoke('val', value)
    .trigger('input')
    .trigger('change');

  cy.window().its('commonService.session.style.widgets.bubble-size').should('equal', value);
};

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

describe('Journey Flow - Bubble style and session roundtrip on uploaded data', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it('applies an uploaded style file and reflects its Bubble color and size styling', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();

    goToBubbleView();

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['node-color-variable']).to.equal('Profession');
        expect(widgets['bubble-size']).to.equal(20);
      });

    cy.window().should((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const healthcareNode = bubble.cy.getElementById('797703');
      const educationNode = bubble.cy.getElementById('797980');

      expect(healthcareNode.empty(), 'Bubble healthcare node rendered').to.equal(false);
      expect(educationNode.empty(), 'Bubble education node rendered').to.equal(false);
      expect(normalizeColor(healthcareNode.style('background-color')), 'Bubble healthcare color from style file')
        .to.equal(normalizeColor('rgb(57, 152, 245)'));
      expect(normalizeColor(educationNode.style('background-color')), 'Bubble education color from style file')
        .to.equal(normalizeColor('rgb(242, 32, 32)'));

      getBubbleDataNodes(bubble).forEach((node: any) => {
        expect(Number(node.data('nodeSize')), `Bubble nodeSize after style-file apply for ${node.id()}`)
          .to.equal(20);
      });
    });
  });

  it('preserves Bubble axes, collapse, size, and aggregate sizing after saving and reloading a session file', () => {
    const sessionFileBase = `cypress_bubble_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;
    const roundtripBubbleSize = 24;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();

    goToBubbleView();
    openBubbleSettingsDialog();
    setBubbleAxis('#bubble-axis-x', 'State', 'bubble-x', 'State');
    setBubbleAxis('#bubble-axis-y', 'NodeClass', 'bubble-y', 'Node_Class');
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    setBubbleNodeSize(roundtripBubbleSize);
    cy.closeSettingsPane('Bubble Settings');

    saveSessionFromFileMenu(sessionFileBase);

    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      expect(savedSession, 'saved Bubble session content').to.include('"bubble-x":"State"');
      expect(savedSession, 'saved Bubble session content').to.include('"bubble-y":"Node_Class"');
      expect(savedSession, 'saved Bubble session content').to.include('"bubble-collapsed":true');
      expect(savedSession, 'saved Bubble session content').to.include(`"bubble-size":${roundtripBubbleSize}`);
      expect(savedSession, 'saved Bubble session content').to.include('"node-color-variable":"Profession"');
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });

    cy.window({ timeout: 30000 })
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['bubble-x']).to.equal('State');
        expect(widgets['bubble-y']).to.equal('Node_Class');
        expect(widgets['bubble-collapsed']).to.equal(true);
        expect(widgets['bubble-size']).to.equal(roundtripBubbleSize);
        expect(widgets['node-color-variable']).to.equal('Profession');
      });

    goToBubbleView();
    assertBubbleReady(30000);

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const visibleNodes = typedWindow.commonService.getVisibleNodes();
      const dataNodes = getBubbleDataNodes(bubble);
      const mixedAggregateNode = bubble.visibleData.find(
        (aggregateNode: any) => Number(aggregateNode.totalCount || 0) > 1
          && Array.isArray(aggregateNode.counts)
          && aggregateNode.counts.length > 1,
      );

      expect(bubble.SelectedNodeCollapsingTypeVariable, 'Bubble collapse restored after reload').to.equal(true);
      expect(dataNodes.length, 'collapsed Bubble aggregate count after reload').to.be.lessThan(visibleNodes.length);
      expect(mixedAggregateNode, 'mixed collapsed Bubble aggregate after reload').to.not.equal(undefined);

      if (!mixedAggregateNode) {
        throw new Error('Expected a mixed collapsed Bubble aggregate after reload.');
      }

      bubble.visibleData.forEach((aggregateNode: any) => {
        const renderedNode = bubble.cy.getElementById(aggregateNode.id);

        expect(renderedNode.empty(), `rendered Bubble aggregate ${aggregateNode.id} after reload`).to.equal(false);
        expect(Number(renderedNode.data('nodeSize')), `Bubble aggregate nodeSize for ${aggregateNode.id} after reload`)
          .to.be.closeTo(roundtripBubbleSize * Math.sqrt(Number(aggregateNode.totalCount || 0)), 0.001);
      });

      const mixedRenderedNode = bubble.cy.getElementById(mixedAggregateNode.id);
      const mixedBackgroundImage = String(mixedRenderedNode.style('background-image') || '');

      expect(mixedRenderedNode.empty(), `rendered mixed Bubble aggregate ${mixedAggregateNode.id} after reload`).to.equal(false);
      expect(mixedBackgroundImage, `Bubble mixed aggregate pie background for ${mixedAggregateNode.id} after reload`).not.to.equal('none');
      expect(mixedBackgroundImage, `Bubble mixed aggregate pie background URI for ${mixedAggregateNode.id} after reload`)
        .to.include('data:image/svg+xml');
    });
  });
});
