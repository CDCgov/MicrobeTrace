/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  openGlobalStylingTab,
} from '../../../support/journey-helpers';

type WinWithBubble = Window & {
  commonService: any;
};

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const hexToRgbString = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay', { timeout: 15000 })
    .last()
    .find('p-selectitem')
    .contains('li', new RegExp(`^${escapeRegExp(label)}$`))
    .click({ force: true });
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  clickVisiblePrimeOption(label);
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

const setColorInputValue = (selector: string, value: string): void => {
  cy.get(selector)
    .should('be.visible')
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get(selector).should('have.value', value);
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

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

const setUploadedBubbleAxes = (): void => {
  openBubbleSettingsDialog();
  setBubbleAxis('#bubble-axis-x', 'State', 'bubble-x', 'State');
  setBubbleAxis('#bubble-axis-y', 'NodeClass', 'bubble-y', 'Node_Class');
  cy.closeSettingsPane('Bubble Settings');
};

describe('Journey Flow - Bubble uploaded styling', () => {
  const profile = getProfile('color-by-uploaded-categorical');
  const healthcareNodeIds = ['797703', '797748'];
  const educationNodeId = '797980';

  it('keeps a fixed uploaded Bubble node color coherent in both expanded and collapsed modes', () => {
    const fixedNodeColor = '#00ff00';
    const expectedFixedNodeColor = normalizeColor(hexToRgbString(fixedNodeColor));

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();
    setUploadedBubbleAxes();

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'None');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'None');
    setColorInputValue('#node-color', fixedNodeColor);
    cy.window().its('commonService.session.style.widgets.node-color').should('equal', fixedNodeColor);
    cy.closeGlobalSettings();

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const dataNodes = getBubbleDataNodes(bubble);

      expect(dataNodes.length, 'expanded Bubble data nodes').to.equal(typedWindow.commonService.getVisibleNodes().length);
      dataNodes.forEach((node: any) => {
        expect(normalizeColor(node.style('background-color')), `expanded Bubble fixed color for ${node.id()}`)
          .to.equal(expectedFixedNodeColor);
      });
    });

    openBubbleSettingsDialog();
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const dataNodes = getBubbleDataNodes(bubble);
      const visibleNodeCount = typedWindow.commonService.getVisibleNodes().length;

      expect(dataNodes.length, 'collapsed Bubble rendered aggregates').to.be.lessThan(visibleNodeCount);
      expect(
        bubble.visibleData.reduce((sum: number, node: any) => sum + Number(node.totalCount || 0), 0),
        'collapsed Bubble totalCount sum',
      ).to.equal(visibleNodeCount);

      dataNodes.forEach((node: any) => {
        expect(normalizeColor(node.style('background-color')), `collapsed Bubble fixed color for ${node.id()}`)
          .to.equal(expectedFixedNodeColor);
      });
    });
  });

  it('updates an uploaded Bubble profession color-table entry without changing other category colors', () => {
    const updatedHealthcareColor = '#123456';
    const expectedHealthcareColor = normalizeColor(hexToRgbString(updatedHealthcareColor));
    let educationBaselineColor = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();
    setUploadedBubbleAxes();

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Profession');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Profession');
    cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');

    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const educationNode = bubble.cy.getElementById(educationNodeId);
      const healthcareNode = bubble.cy.getElementById(healthcareNodeIds[0]);

      expect(educationNode.empty(), `Bubble education node ${educationNodeId} present`).to.equal(false);
      expect(healthcareNode.empty(), `Bubble healthcare node ${healthcareNodeIds[0]} present`).to.equal(false);

      educationBaselineColor = normalizeColor(educationNode.style('background-color'));
      expect(normalizeColor(healthcareNode.style('background-color')), 'profession colors start distinct')
        .to.not.equal(educationBaselineColor);
    });

    changeColorTableEntry('#node-color-table', 'Healthcare', updatedHealthcareColor);
    cy.closeGlobalSettings();

    cy.window().should((win: unknown) => {
      const bubble = (win as WinWithBubble).commonService.visuals.bubble;
      const educationNode = bubble.cy.getElementById(educationNodeId);

      healthcareNodeIds.forEach((nodeId) => {
        const healthcareNode = bubble.cy.getElementById(nodeId);
        expect(healthcareNode.empty(), `Bubble healthcare node ${nodeId} present`).to.equal(false);
        expect(normalizeColor(healthcareNode.style('background-color')), `updated healthcare Bubble color for ${nodeId}`)
          .to.equal(expectedHealthcareColor);
      });

      expect(educationNode.empty(), `Bubble education node ${educationNodeId} present after color edit`).to.equal(false);
      expect(normalizeColor(educationNode.style('background-color')), 'education Bubble color left unchanged')
        .to.equal(educationBaselineColor);
    });
  });
});
