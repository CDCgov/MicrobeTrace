/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

type WinWithMT = Window & {
  commonService: any;
  cytoscapeInstance: any;
};

const profile = getProfile('style-apply-cypress-test-style');
const partialBackgroundColor = '#123456';

const hexToRgb = (hex: string): string => {
  const normalized = hex.replace('#', '');
  return `rgb(${parseInt(normalized.slice(0, 2), 16)}, ${parseInt(normalized.slice(2, 4), 16)}, ${parseInt(normalized.slice(4, 6), 16)})`;
};

const uploadRawStyle = (fileName: string, contents: string): void => {
  cy.get('#apply-style').selectFile({
    contents: Cypress.Buffer.from(contents),
    fileName,
    mimeType: 'application/json',
  }, { force: true });
};

const launchWithAppliedFixtureStyle = (): void => {
  launchProfileToTwoD(profile);
  applyStyleFromProfile(profile);
};

const assertRejectedStylePreservesCurrentState = (
  fileName: string,
  contents: string,
  expectedMessage: string,
): void => {
  let styleBeforeUpload = '';
  let firstNodeColorBeforeUpload = '';

  launchWithAppliedFixtureStyle();

  cy.window().then((rawWin: unknown) => {
    const win = rawWin as WinWithMT;
    const firstVisibleNode = win.cytoscapeInstance.nodes()
      .filter((node: any) => !node.hasClass('parent') && node.visible())
      .first();

    styleBeforeUpload = JSON.stringify(win.commonService.session.style);
    firstNodeColorBeforeUpload = String(firstVisibleNode.style('background-color'));
  });

  uploadRawStyle(fileName, contents);

  cy.get('#apply-style-status[role="alert"]', { timeout: 15000 })
    .scrollIntoView()
    .should('be.visible')
    .and('contain.text', expectedMessage);

  cy.window().should((rawWin: unknown) => {
    const win = rawWin as WinWithMT;
    const firstVisibleNode = win.cytoscapeInstance.nodes()
      .filter((node: any) => !node.hasClass('parent') && node.visible())
      .first();

    expect(JSON.stringify(win.commonService.session.style), 'session style after rejected upload')
      .to.equal(styleBeforeUpload);
    expect(String(firstVisibleNode.style('background-color')), 'rendered node color after rejected upload')
      .to.equal(firstNodeColorBeforeUpload);
  });
};

describe('Journey Flow - Apply Style validation and compatibility', () => {
  it('rejects malformed JSON without changing the current style or rendering', () => {
    assertRejectedStylePreservesCurrentState(
      'cypress-malformed.style',
      '{"widgets": {"background-color": "#123456"}',
      'not valid JSON',
    );
  });

  it('rejects an invalid style structure without changing the current style or rendering', () => {
    assertRejectedStylePreservesCurrentState(
      'cypress-invalid-structure.style',
      JSON.stringify({ widgets: [] }),
      'must include a "widgets" object',
    );
  });

  it('restores the previous style when a nested mapping fails during application', () => {
    assertRejectedStylePreservesCurrentState(
      'cypress-invalid-nested-mapping.style',
      JSON.stringify({
        widgets: {
          'node-color-variable': 'Profession',
        },
        nodeColorsTable: {
          Profession: 42,
        },
        nodeColorsTableKeys: {
          Profession: ['Healthcare'],
        },
      }),
      'The previous style was restored',
    );
  });

  it('hydrates a partial legacy style with defaults and applies its supplied widgets', () => {
    launchProfileToTwoD(profile);
    cy.openGlobalSettings();
    cy.contains('.nav-link:visible', 'Styling').click({ force: true });

    uploadRawStyle(
      'cypress-partial-legacy.style',
      JSON.stringify({
        widgets: {
          'background-color': partialBackgroundColor,
        },
      }),
    );

    cy.get('#apply-style-status[role="status"]', { timeout: 15000 })
      .scrollIntoView()
      .should('be.visible')
      .and('contain.text', 'Applied style from "cypress-partial-legacy.style"');

    cy.window().should((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const style = win.commonService.session.style;
      const defaultWidgets = win.commonService.defaultWidgets();
      const missingDefaultWidgets = Object.keys(defaultWidgets)
        .filter((key) => !Object.prototype.hasOwnProperty.call(style.widgets, key));

      expect(missingDefaultWidgets, 'default widgets missing from partial style').to.deep.equal([]);
      expect(style.widgets['background-color'], 'supplied partial-style background').to.equal(partialBackgroundColor);
      expect(style.widgets['node-color-variable'], 'default node color variable')
        .to.equal(defaultWidgets['node-color-variable']);
      expect(style.widgets['link-color-variable'], 'default link color variable')
        .to.equal(defaultWidgets['link-color-variable']);
      expect(style.widgets['bubble-size'], 'default Bubble size')
        .to.equal(defaultWidgets['bubble-size']);
      expect(style.nodeColors, 'default node palette').to.be.an('array').and.not.be.empty;
      expect(style.linkColors, 'default link palette').to.be.an('array').and.not.be.empty;
      expect(style.nodeSymbols, 'default node symbols').to.be.an('array').and.not.be.empty;
    });

    cy.get('#cy').should('have.css', 'background-color', hexToRgb(partialBackgroundColor));
  });
});
