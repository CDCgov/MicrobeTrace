/// <reference types="cypress" />

import { openSankeySettingsDialog } from './journey-helpers';
import {
  computeExpectedSankeyGraph,
  DEFAULT_SANKEY_FIELD_PREFERENCES,
  pickSankeyFields,
  type SankeyGraphExpectation,
} from './sankey-helpers';

type WinWithMT = Window & {
  commonService: any;
};

export type ResolvedSankeySelection = {
  fields: string[];
  labels: string[];
  expected: SankeyGraphExpectation;
};

function resolveFieldLabels(fieldList: Array<{ label?: string; value?: string }>, fields: string[]): string[] {
  return fields.map((field) => {
    const entry = fieldList.find((item) => item.value === field);
    return entry?.label || field;
  });
}

export function aliasSankeySelection(
  aliasName = 'sankeySelection',
  options: {
    count?: number;
    explicitFields?: string[];
    preferredFields?: string[];
  } = {},
): void {
  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const sessionNodes = w.commonService.session.data.nodes as Record<string, unknown>[];
    const nodeFields = w.commonService.session.data.nodeFields as string[];
    const fieldList = w.commonService.visuals.sankey.FieldList as Array<{ label?: string; value?: string }>;

    const candidateSelection = pickSankeyFields(
      sessionNodes,
      nodeFields,
      options.preferredFields || DEFAULT_SANKEY_FIELD_PREFERENCES,
    );

    const fieldCount = options.count ?? 2;
    const fields = options.explicitFields?.length
      ? options.explicitFields
      : candidateSelection.stats.slice(0, fieldCount).map((stat) => stat.field);

    if (fields.length < fieldCount) {
      throw new Error(`Unable to find ${fieldCount} Sankey fields from node fields: ${nodeFields.join(', ')}`);
    }

    const selection: ResolvedSankeySelection = {
      fields,
      labels: resolveFieldLabels(fieldList, fields),
      expected: computeExpectedSankeyGraph(sessionNodes, fields),
    };

    cy.wrap(selection, { log: false }).as(aliasName);
  });
}

export function addSankeyFields(selectionAlias = '@sankeySelection'): void {
  cy.get(selectionAlias).then((selection) => {
    const resolved = selection as unknown as ResolvedSankeySelection;
    openSankeySettingsDialog();

    resolved.fields.forEach((field, index) => {
      cy.get('@sankeySettings')
        .find('#sankey-variable-name')
        .should('be.visible')
        .click({ force: true });

      cy.contains('li[role="option"]', resolved.labels[index], { timeout: 15000 }).click({ force: true });

      cy.get('@sankeySettings')
        .find('#sankey-add-variable')
        .should('not.be.disabled')
        .click({ force: true });

      cy.window()
        .its('commonService.visuals.sankey.SankeyFieldNames')
        .should('deep.include', field);
    });
  });
}

export function assertRenderedSankey(selectionAlias = '@sankeySelection', timeout = 15000): void {
  cy.get(selectionAlias).then((selection) => {
    const resolved = selection as unknown as ResolvedSankeySelection;
    cy.window({ timeout }).should((win: unknown) => {
      const w = win as WinWithMT;
      const sankey = w.commonService.visuals.sankey;

      expect(sankey.SankeyFieldNames, 'selected Sankey fields').to.deep.equal(resolved.fields);
      expect(sankey.data.nodes.length, 'Sankey node count').to.equal(resolved.expected.nodeCount);
      expect(
        sankey.data.links.filter((link: { value: number }) => Number(link.value) > 0).length,
        'positive Sankey link count',
      ).to.equal(resolved.expected.positiveLinkCount);
    });

    cy.get('.sankey-axis-label', { timeout }).should('have.length', resolved.fields.length);
    cy.get('.sankey-node-rect', { timeout }).should('have.length', resolved.expected.nodeCount);
    cy.get('.sankey-link-path', { timeout }).should(($paths) => {
      const positivePaths = Array.from($paths).filter((path) => {
        const width = Number(path.getAttribute('stroke-width') || '0');
        return width > 0;
      });

      expect(positivePaths.length, 'visible rendered Sankey links').to.equal(resolved.expected.positiveLinkCount);
    });
  });
}

export function openSankeyVisualSettingsTab(): void {
  openSankeySettingsDialog();
  cy.get('@sankeySettings').contains('.nav-link', 'Visual Settings').click({ force: true });
}

export function openSankeyVariablesTab(): void {
  openSankeySettingsDialog();
  cy.get('@sankeySettings').contains('.nav-link', 'Variables').click({ force: true });
}

export function selectSankeyPrimeOption(
  dialogAlias: string,
  selector: string,
  label: string,
): void {
  cy.get(dialogAlias).find(selector).should('be.visible').click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
}

export function setSankeyLinkColorMode(mode: 'Source' | 'Target' | 'Uniform'): void {
  openSankeyVisualSettingsTab();
  cy.get('@sankeySettings').find('#sankey-link-color').should('be.visible');
  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const sankey = w.commonService.visuals.sankey as any;

    sankey.SelectedColorOption = mode;
    sankey.cdref?.detectChanges?.();
  });
  cy.window().its('commonService.visuals.sankey.SelectedColorOption').should('equal', mode);
}

export function removeSankeyField(field: string): void {
  openSankeyVariablesTab();
  cy.get('@sankeySettings')
    .find(`tr[data-field="${field}"] .sankey-remove-field-button`)
    .first()
    .then(($buttonHost) => {
      const nestedButton = $buttonHost.find('button');
      if (nestedButton.length) {
        cy.wrap(nestedButton.eq(0)).click({ force: true });
        return;
      }

      cy.wrap($buttonHost).click({ force: true });
    });
}

export function setSankeyLayerColor(index: number, color: string): void {
  openSankeyVariablesTab();
  cy.get('@sankeySettings')
    .find(`.sankey-layer-color-input[data-index="${index}"]`)
    .invoke('val', color)
    .trigger('input', { force: true })
    .trigger('change', { force: true });

  cy.window().its(`commonService.visuals.sankey.layerColors.${index}`).should('equal', color);
}

export function reorderSankeyFields(dragIndex: number, dropIndex: number): void {
  openSankeyVariablesTab();
  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const sankey = w.commonService.visuals.sankey as any;
    const fields = sankey.SankeyFieldNames as string[];
    const [movedField] = fields.splice(dragIndex, 1);

    fields.splice(dropIndex, 0, movedField);
    sankey.reorderRows({ dragIndex, dropIndex });
    sankey.cdref?.detectChanges?.();
  });
}

export function assertPositiveSankeyLinkColorsByMode(mode: 'Source' | 'Target'): void {
  cy.window().then((win: unknown) => {
    const w = win as WinWithMT;
    const layerColors = w.commonService.visuals.sankey.layerColors as string[];
    const layerAttribute = mode === 'Source' ? 'data-source-layer' : 'data-target-layer';

    cy.get('.sankey-link-path').should(($paths) => {
      const positivePaths = Array.from($paths).filter((path) => {
        const width = Number(path.getAttribute('stroke-width') || '0');
        return width > 0;
      });

      expect(positivePaths.length, `${mode} colored Sankey links`).to.be.greaterThan(0);
      positivePaths.forEach((path) => {
        const layerIndex = Number(path.getAttribute(layerAttribute));
        expect(path.getAttribute('stroke')).to.equal(layerColors[layerIndex]);
      });
    });
  });
}

export function aliasFirstPositiveSankeyLink(aliasName = 'positiveSankeyLink'): void {
  cy.get('.sankey-link-path', { timeout: 15000 }).then(($paths) => {
    const firstPositivePath = Array.from($paths).find((path) => {
      const width = Number(path.getAttribute('stroke-width') || '0');
      return width > 0;
    });

    expect(firstPositivePath, 'first positive-width Sankey link').to.exist;
    cy.wrap(firstPositivePath as SVGPathElement, { log: false }).as(aliasName);
  });
}
