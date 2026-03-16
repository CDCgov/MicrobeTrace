/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

const hexToRgb = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return `rgb(${r}, ${g}, ${b})`;
};

const setColorInputValue = (selector: string, value: string): void => {
  cy.get(selector).then(($input) => {
    const el = $input.get(0) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('Journey Flow - Styling Background and Selected Color', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it('updates 2D background and selected-node color from global styling', () => {
    launchProfileToTwoD(profile);
    applyStyleFromProfile(profile);

    cy.closeGlobalSettings();

    const backgroundColor = '#1a2b3c';
    const selectedColor = '#ff9f1c';

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Styling').click();

    setColorInputValue('#selected-color', selectedColor);
    setColorInputValue('#background-color', backgroundColor);

    cy.window().its('commonService.session.style.widgets.selected-color').should('equal', selectedColor);
    cy.window().its('commonService.session.style.widgets.selected-node-stroke-color').should('equal', selectedColor);
    cy.window().its('commonService.session.style.widgets.background-color').should('equal', backgroundColor);

    cy.get('#cy').should('have.css', 'background-color', hexToRgb(backgroundColor));

    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      expect(cyInstance, 'cytoscapeInstance').to.exist;

      const firstVisibleNode = cyInstance.nodes()
        .filter((node: any) => !node.hasClass('parent') && node.visible())
        .first();

      expect(firstVisibleNode.empty(), 'visible non-parent node exists').to.equal(false);
      firstVisibleNode.select();
      firstVisibleNode.emit('tap');

      const selectedNodes = cyInstance.elements(':selected');
      expect(selectedNodes.length, 'visible nodes selected').to.be.greaterThan(0);

      expect(firstVisibleNode.style('border-color').replace(/\s+/g, ''), 'selected border color')
        .to.equal(hexToRgb(selectedColor).replace(/\s+/g, ''));
      expect(firstVisibleNode.data('selectedBorderColor'), 'selected border color data')
        .to.equal(selectedColor);
    });
  });
});
