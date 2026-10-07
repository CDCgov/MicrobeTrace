/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertMetricCount,
  assertStyleTablesFromProfile,
  expandAccordionTabByHeader,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
  waitForProcessingDialogToClear,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';

describe('Journey Flow - Apply Style in 2D Network', () => {
  const profile = getProfile('style-apply-cypress-test-style');
  const targetProfile = getProfile('style-apply-cypress-test-style-threshold');
  const filteredThreshold = 0.1;
  const expectedVisibleLinksAfterThreshold = 7;
  const expectedStateGroups = ['Arizona', 'Colorado', 'Florida', 'Pennsylvania', 'Texas'];
  const roundtripMappings = {
    nodeColor: { variable: 'Profession', category: 'Healthcare', value: '#164b8c' },
    linkColor: { variable: 'Contact type', category: 'sports team', value: '#b83280' },
    nodeShape: { variable: 'Node type', category: 'Person', value: 'diamond', label: 'Diamond' },
  } as const;
  const getRenderedShapeKey = (node: any): string => String(node.data('shapeKey') || node.style('shape') || '').trim();
  const renderedNodeWidthFromWidgetSize = (size: number): number => size / 100 * 40 + 10;
  const normalizeColor = (value: string): string => {
    const normalized = String(value || '').replace(/\s+/g, '').toLowerCase();
    const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (hexMatch) {
      const expanded = hexMatch[1].length === 3
        ? hexMatch[1].split('').map((character) => `${character}${character}`).join('')
        : hexMatch[1];
      return `rgb(${parseInt(expanded.slice(0, 2), 16)},${parseInt(expanded.slice(2, 4), 16)},${parseInt(expanded.slice(4, 6), 16)})`;
    }

    const rgbMatch = normalized.match(/^rgba?\((\d+),(\d+),(\d+)(?:,[^)]+)?\)$/);
    return rgbMatch ? `rgb(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]})` : normalized;
  };

  const normalizeStyleCategoryValue = (value: any): string => {
    if (value === undefined || value === null || Number.isNaN(value)) return 'null';
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (!trimmedValue || trimmedValue.toLowerCase() === 'nan') return 'null';
      return trimmedValue;
    }
    return String(value);
  };

  const assertExactFixtureCategoryMappings = (): void => {
    cy.fixture('Cypress_Test_Style.style', 'utf8').then((contents) => {
      const fixtureStyle = JSON.parse(String(contents));
      const nodeColorVariable = String(fixtureStyle.widgets['node-color-variable']);
      const linkColorVariable = String(fixtureStyle.widgets['link-color-variable']);
      const nodeShapeVariable = String(fixtureStyle.widgets['node-symbol-variable']);
      const createExpectedMapping = (
        keys: unknown[],
        values: unknown[],
        label: string,
      ): Array<{ category: string; value: string }> => {
        expect(keys, `${label} fixture keys`).to.be.an('array').and.not.be.empty;
        expect(values, `${label} fixture values`).to.be.an('array');
        expect(values.length, `${label} fixture values cover every key`).to.be.at.least(keys.length);

        return keys.map((key, index) => ({
          category: normalizeStyleCategoryValue(key),
          value: String(values[index]),
        }));
      };
      const fixtureNodeColors = createExpectedMapping(
        fixtureStyle.nodeColorsTableKeys[nodeColorVariable],
        fixtureStyle.nodeColorsTable[nodeColorVariable],
        'node color',
      );
      const fixtureLinkColors = createExpectedMapping(
        fixtureStyle.linkColorsTableKeys[linkColorVariable],
        fixtureStyle.linkColorsTable[linkColorVariable],
        'link color',
      );
      const fixtureNodeShapes = createExpectedMapping(
        fixtureStyle.nodeSymbolsTableKeys[nodeShapeVariable],
        fixtureStyle.nodeSymbolsTable[nodeShapeVariable],
        'node shape',
      );

      cy.window().should((win: any) => {
        const sessionStyle = win.commonService.session.style;
        const tempStyle = win.commonService.temp.style;
        const cyInstance = win.cytoscapeInstance;
        const visibleNodes = cyInstance.nodes().filter((node: any) => !node.hasClass('parent') && node.visible());
        const visibleEdges = cyInstance.edges().filter((edge: any) => edge.visible());
        const getExpectedRenderedMapping = (
          elements: any,
          field: string,
          fixtureMapping: Array<{ category: string; value: string }>,
          label: string,
        ): Array<{ category: string; value: string }> => {
          const renderedCategories = Array.from(new Set(
            elements.map((element: any) => normalizeStyleCategoryValue(element.data(field))),
          )) as string[];
          const fixtureCategories = fixtureMapping.map(({ category }) => category);
          renderedCategories.forEach((category) => {
            expect(fixtureCategories, `${label} fixture includes rendered category ${category}`).to.include(category);
          });

          return fixtureMapping.filter(({ category }) => renderedCategories.includes(category));
        };
        const expectedNodeColors = getExpectedRenderedMapping(
          visibleNodes,
          nodeColorVariable,
          fixtureNodeColors,
          'node color',
        );
        const expectedLinkColors = getExpectedRenderedMapping(
          visibleEdges,
          linkColorVariable,
          fixtureLinkColors,
          'link color',
        );
        const expectedNodeShapes = getExpectedRenderedMapping(
          visibleNodes,
          nodeShapeVariable,
          fixtureNodeShapes,
          'node shape',
        );

        const assertStoredMapping = (
          actualKeys: unknown[],
          actualValues: unknown[],
          expectedMapping: Array<{ category: string; value: string }>,
          label: string,
          normalizeValue: (value: string) => string,
        ): void => {
          const normalizedActualKeys = actualKeys.map(normalizeStyleCategoryValue);
          expect([...normalizedActualKeys].sort(), `${label} stored categories`)
            .to.deep.equal(expectedMapping.map(({ category }) => category).sort());

          expectedMapping.forEach(({ category, value }) => {
            const index = normalizedActualKeys.indexOf(category);
            expect(index, `${label} stored index for ${category}`).to.be.greaterThan(-1);
            expect(normalizeValue(String(actualValues[index])), `${label} stored value for ${category}`)
              .to.equal(normalizeValue(value));
          });
        };

        const getVisibleTableValueCells = (selector: string, label: string): HTMLTableCellElement[] => {
          const table = Array.from(win.document.querySelectorAll(selector)).find((candidate: any) => {
            const computed = win.getComputedStyle(candidate);
            const rect = candidate.getBoundingClientRect();
            return computed.display !== 'none'
              && computed.visibility !== 'hidden'
              && rect.width > 0
              && rect.height > 0;
          }) as HTMLTableElement | undefined;
          expect(table, `${label} visible table`).to.exist;
          return Array.from(table!.querySelectorAll('td[data-value]')) as HTMLTableCellElement[];
        };

        const assertColorTableMapping = (
          selector: string,
          expectedMapping: Array<{ category: string; value: string }>,
          label: string,
        ): void => {
          const cells = getVisibleTableValueCells(selector, label);
          expect(cells.map((cell) => normalizeStyleCategoryValue(cell.dataset.value)).sort(), `${label} table categories`)
            .to.deep.equal(expectedMapping.map(({ category }) => category).sort());

          expectedMapping.forEach(({ category, value }) => {
            const cell = cells.find(
              (candidate) => normalizeStyleCategoryValue(candidate.dataset.value) === category,
            );
            expect(cell, `${label} table row for ${category}`).to.exist;
            const colorInput = cell!.parentElement?.querySelector('input[type="color"]') as HTMLInputElement | null;
            expect(colorInput, `${label} table swatch for ${category}`).to.exist;
            expect(normalizeColor(colorInput!.value), `${label} table color for ${category}`)
              .to.equal(normalizeColor(value));
          });
        };

        const assertRenderedMapping = (
          elements: any,
          field: string,
          expectedMapping: Array<{ category: string; value: string }>,
          getRenderedValue: (element: any) => string,
          label: string,
          normalizeValue: (value: string) => string,
        ): void => {
          expectedMapping.forEach(({ category, value }) => {
            const matchingElements = elements.filter(
              (element: any) => normalizeStyleCategoryValue(element.data(field)) === category,
            );
            expect(matchingElements.length, `${label} rendered elements for ${category}`).to.be.greaterThan(0);
            matchingElements.forEach((element: any) => {
              expect(normalizeValue(getRenderedValue(element)), `${label} rendered value for ${category}`)
                .to.equal(normalizeValue(value));
            });
          });
        };

        assertStoredMapping(
          sessionStyle.nodeColorsTableKeys[nodeColorVariable],
          sessionStyle.nodeColorsTable[nodeColorVariable],
          expectedNodeColors,
          'node color',
          normalizeColor,
        );
        assertStoredMapping(
          sessionStyle.linkColorsTableKeys[linkColorVariable],
          sessionStyle.linkColorsTable[linkColorVariable],
          expectedLinkColors,
          'link color',
          normalizeColor,
        );
        assertStoredMapping(
          sessionStyle.nodeSymbolsTableKeys[nodeShapeVariable],
          sessionStyle.nodeSymbolsTable[nodeShapeVariable],
          expectedNodeShapes,
          'node shape',
          String,
        );

        expectedNodeColors.forEach(({ category, value }) => {
          expect(normalizeColor(String(tempStyle.nodeColorMap(category))), `active node color map for ${category}`)
            .to.equal(normalizeColor(value));
        });
        expectedLinkColors.forEach(({ category, value }) => {
          expect(normalizeColor(String(tempStyle.linkColorMap(category))), `active link color map for ${category}`)
            .to.equal(normalizeColor(value));
        });
        expectedNodeShapes.forEach(({ category, value }) => {
          expect(String(tempStyle.nodeSymbolMap(category)), `active node shape map for ${category}`).to.equal(value);
        });

        assertColorTableMapping('#key-tables-node-table', expectedNodeColors, 'node color');
        assertColorTableMapping('#key-tables-link-table', expectedLinkColors, 'link color');

        const shapeCells = getVisibleTableValueCells(
          '#node-shape-table, #key-tables-node-shape-table, #nodeSymbolTable',
          'node shape',
        );
        expect(shapeCells.map((cell) => normalizeStyleCategoryValue(cell.dataset.value)).sort(), 'node shape table categories')
          .to.deep.equal(expectedNodeShapes.map(({ category }) => category).sort());
        expectedNodeShapes.forEach(({ category, value }) => {
          const cell = shapeCells.find(
            (candidate) => normalizeStyleCategoryValue(candidate.dataset.value) === category,
          );
          expect(cell, `node shape table row for ${category}`).to.exist;
          const preview = cell!.parentElement?.querySelector('img[data-shape-key]') as HTMLImageElement | null;
          expect(preview, `node shape table preview for ${category}`).to.exist;
          expect(preview!.dataset.shapeKey, `node shape table value for ${category}`).to.equal(value);
        });

        assertRenderedMapping(
          visibleNodes,
          nodeColorVariable,
          expectedNodeColors,
          (node) => String(node.style('background-color')),
          'node color',
          normalizeColor,
        );
        assertRenderedMapping(
          visibleEdges,
          linkColorVariable,
          expectedLinkColors,
          (edge) => String(edge.style('line-color')),
          'link color',
          normalizeColor,
        );
        assertRenderedMapping(
          visibleNodes,
          nodeShapeVariable,
          expectedNodeShapes,
          getRenderedShapeKey,
          'node shape',
          String,
        );
      });
    });
  };

  const assertExactGroupColorMapping = (expectedPolygonColors: string[]): void => {
    const normalizedExpectedPalette = expectedPolygonColors.map(normalizeColor);

    cy.get('#polygon-color-table', { timeout: 15000 }).should('be.visible');
    cy.window().should((win: any) => {
      const tableValueCells = Array.from(
        win.document.querySelectorAll('#polygon-color-table td[data-value]'),
      ) as HTMLTableCellElement[];
      const tableCategories = tableValueCells
        .map((cell) => String(cell.dataset.value))
        .sort();
      const storedPalette = (win.commonService.session.style.polygonColors as string[])
        .map(normalizeColor);
      const groupDefinitions = win.commonService.temp.polygonGroups as Array<{
        key: string;
        index?: number;
      }>;
      const cyInstance = win.cytoscapeInstance;

      expect(tableCategories, 'group color table categories').to.deep.equal(expectedStateGroups);
      expect(storedPalette, 'saved polygon color palette').to.deep.equal(normalizedExpectedPalette);

      expectedStateGroups.forEach((groupName) => {
        const groupDefinition = groupDefinitions.find((group) => String(group.key) === groupName);
        expect(groupDefinition, `group definition for ${groupName}`).to.exist;
        expect(groupDefinition?.index, `palette index for ${groupName}`).to.be.a('number');

        const expectedColor = normalizedExpectedPalette[groupDefinition!.index!];
        expect(expectedColor, `saved color for ${groupName}`).to.match(/^rgb\(/);

        const valueCell = tableValueCells.find((cell) => cell.dataset.value === groupName);
        expect(valueCell, `group color table row for ${groupName}`).to.exist;
        expect(valueCell?.textContent?.trim(), `group color table label for ${groupName}`).to.equal(groupName);

        const colorInput = valueCell?.parentElement?.querySelector('input[type="color"]') as HTMLInputElement | null;
        expect(colorInput, `group color table swatch for ${groupName}`).to.exist;
        expect(normalizeColor(colorInput?.value || ''), `table color for ${groupName}`).to.equal(expectedColor);
        expect(
          normalizeColor(String(win.commonService.temp.style.polygonColorMap(groupName) || '')),
          `active color map for ${groupName}`,
        ).to.equal(expectedColor);

        const parentNode = cyInstance.nodes('.parent').filter(
          (node: any) => String(node.data('label')) === groupName,
        );
        expect(parentNode.length, `rendered parent for ${groupName}`).to.equal(1);
        expect(
          normalizeColor(String(parentNode.data('nodeColor') || '')),
          `stored parent color for ${groupName}`,
        ).to.equal(expectedColor);
        expect(
          normalizeColor(String(parentNode.style('background-color') || '')),
          `rendered parent color for ${groupName}`,
        ).to.equal(expectedColor);
      });
    });
  };

  const assertFixtureGroupColorMapping = (): void => {
    cy.fixture('Cypress_Test_Style.style', 'utf8').then((contents) => {
      const style = JSON.parse(String(contents));
      assertExactGroupColorMapping(style.polygonColors.map(String));
    });
  };

  const closeTwoDSettingsDialog = (): void => {
    cy.contains('.p-dialog-title', '2D Network Settings')
      .parents('.p-dialog')
      .find('button.p-dialog-close-button')
      .should('be.visible')
      .click();
    cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
  };

  const selectGlobalStylingOption = (selector: string, label: string): void => {
    const optionIdPrefix = selector.replace(/^#/, '');
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cy.get('#global-settings-modal').find(selector).click({ force: true });
    cy.contains(
      `.p-select-overlay:visible li[role="option"][id^="${optionIdPrefix}_"]`,
      new RegExp(`^\\s*${escapedLabel}\\s*$`),
      { timeout: 15000 },
    )
      .scrollIntoView()
      .should('be.visible')
      .click({ force: true });
  };

  const changeColorTableEntry = (tableSelector: string, category: string, color: string): void => {
    cy.get(`${tableSelector} td[data-value="${category}"]`, { timeout: 15000 })
      .closest('tr')
      .find('input[type="color"]')
      .should('have.length', 1)
      .then(($input) => {
        const input = $input.get(0) as HTMLInputElement;
        const eventWindow = input.ownerDocument.defaultView!;
        input.value = color;
        input.dispatchEvent(new eventWindow.Event('input', { bubbles: true }));
        input.dispatchEvent(new eventWindow.Event('change', { bubbles: true }));
      });

    cy.get(`${tableSelector} td[data-value="${category}"]`)
      .closest('tr')
      .find('input[type="color"]')
      .should('have.value', color);
  };

  const changeNodeShapeTableEntry = (category: string, shapeLabel: string, shapeKey: string): void => {
    cy.get(`#key-tables-node-shape-table td[data-value="${category}"]`, { timeout: 15000 })
      .closest('tr')
      .scrollIntoView()
      .find('p-tree-select, .shapeDropdown, .p-treeselect')
      .first()
      .click({ force: true });
    cy.get(
      `.shapeTreeSelectPanel:visible .shape-tree-preview[data-shape-key="${shapeKey}"]`,
      { timeout: 15000 },
    )
      .should('be.visible')
      .closest('[role="treeitem"]')
      .should('contain.text', shapeLabel)
      .find('.p-tree-node-content')
      .click({ force: true });

    cy.get(`#key-tables-node-shape-table td[data-value="${category}"]`)
      .closest('tr')
      .find(`img[data-shape-key="${shapeKey}"]`)
      .should('be.visible');
  };

  const configureRoundtripMappingsThroughUi = (): void => {
    cy.openGlobalSettings();
    cy.contains('.nav-link:visible', 'Styling').click({ force: true });

    selectGlobalStylingOption('#node-color-variable', roundtripMappings.nodeColor.variable);
    cy.window().its('commonService.session.style.widgets.node-color-variable')
      .should('equal', roundtripMappings.nodeColor.variable);
    changeColorTableEntry(
      '#key-tables-node-table',
      roundtripMappings.nodeColor.category,
      roundtripMappings.nodeColor.value,
    );

    selectGlobalStylingOption('#link-tooltip-variable', roundtripMappings.linkColor.variable);
    cy.window().its('commonService.session.style.widgets.link-color-variable')
      .should('equal', roundtripMappings.linkColor.variable);
    changeColorTableEntry(
      '#key-tables-link-table',
      roundtripMappings.linkColor.category,
      roundtripMappings.linkColor.value,
    );

    selectGlobalStylingOption('#node-symbol-variable', roundtripMappings.nodeShape.variable);
    cy.window().its('commonService.session.style.widgets.node-symbol-variable')
      .should('equal', roundtripMappings.nodeShape.variable);
    changeNodeShapeTableEntry(
      roundtripMappings.nodeShape.category,
      roundtripMappings.nodeShape.label,
      roundtripMappings.nodeShape.value,
    );

    cy.closeGlobalSettings();
  };

  const assertRoundtripMappings = (stage: string): void => {
    cy.get(
      `#key-tables-node-table td[data-value="${roundtripMappings.nodeColor.category}"]`,
      { timeout: 15000 },
    )
      .closest('tr')
      .find('input[type="color"]')
      .should('have.value', roundtripMappings.nodeColor.value);
    cy.get(
      `#key-tables-link-table td[data-value="${roundtripMappings.linkColor.category}"]`,
      { timeout: 15000 },
    )
      .closest('tr')
      .find('input[type="color"]')
      .should('have.value', roundtripMappings.linkColor.value);
    cy.get(
      `#key-tables-node-shape-table td[data-value="${roundtripMappings.nodeShape.category}"]`,
      { timeout: 15000 },
    )
      .closest('tr')
      .scrollIntoView()
      .find(`img[data-shape-key="${roundtripMappings.nodeShape.value}"]`)
      .should('be.visible');

    cy.window().should((win: any) => {
      const sessionStyle = win.commonService.session.style;
      const tempStyle = win.commonService.temp.style;
      const widgets = sessionStyle.widgets;
      const cyInstance = win.cytoscapeInstance;
      const findStoredValue = (
        keysByVariable: Record<string, unknown[]>,
        valuesByVariable: Record<string, unknown[]>,
        variable: string,
        category: string,
        label: string,
      ): string => {
        const keys = keysByVariable[variable].map(normalizeStyleCategoryValue);
        const index = keys.indexOf(category);
        expect(index, `${stage} ${label} stored index`).to.be.greaterThan(-1);
        return String(valuesByVariable[variable][index]);
      };

      expect(widgets['node-color-variable'], `${stage} node color variable`)
        .to.equal(roundtripMappings.nodeColor.variable);
      expect(widgets['link-color-variable'], `${stage} link color variable`)
        .to.equal(roundtripMappings.linkColor.variable);
      expect(widgets['node-symbol-variable'], `${stage} node shape variable`)
        .to.equal(roundtripMappings.nodeShape.variable);

      expect(normalizeColor(findStoredValue(
        sessionStyle.nodeColorsTableKeys,
        sessionStyle.nodeColorsTable,
        roundtripMappings.nodeColor.variable,
        roundtripMappings.nodeColor.category,
        'node color',
      )), `${stage} stored node color`).to.equal(normalizeColor(roundtripMappings.nodeColor.value));
      expect(normalizeColor(findStoredValue(
        sessionStyle.linkColorsTableKeys,
        sessionStyle.linkColorsTable,
        roundtripMappings.linkColor.variable,
        roundtripMappings.linkColor.category,
        'link color',
      )), `${stage} stored link color`).to.equal(normalizeColor(roundtripMappings.linkColor.value));
      expect(findStoredValue(
        sessionStyle.nodeSymbolsTableKeys,
        sessionStyle.nodeSymbolsTable,
        roundtripMappings.nodeShape.variable,
        roundtripMappings.nodeShape.category,
        'node shape',
      ), `${stage} stored node shape`).to.equal(roundtripMappings.nodeShape.value);

      expect(normalizeColor(String(tempStyle.nodeColorMap(roundtripMappings.nodeColor.category))), `${stage} active node color map`)
        .to.equal(normalizeColor(roundtripMappings.nodeColor.value));
      expect(normalizeColor(String(tempStyle.linkColorMap(roundtripMappings.linkColor.category))), `${stage} active link color map`)
        .to.equal(normalizeColor(roundtripMappings.linkColor.value));
      expect(String(tempStyle.nodeSymbolMap(roundtripMappings.nodeShape.category)), `${stage} active node shape map`)
        .to.equal(roundtripMappings.nodeShape.value);

      const healthcareNodes = cyInstance.nodes().filter(
        (node: any) => !node.hasClass('parent')
          && node.visible()
          && node.data(roundtripMappings.nodeColor.variable) === roundtripMappings.nodeColor.category,
      );
      const sportsTeamEdges = cyInstance.edges().filter(
        (edge: any) => edge.visible()
          && edge.data(roundtripMappings.linkColor.variable) === roundtripMappings.linkColor.category,
      );
      const personNodes = cyInstance.nodes().filter(
        (node: any) => !node.hasClass('parent')
          && node.visible()
          && node.data(roundtripMappings.nodeShape.variable) === roundtripMappings.nodeShape.category,
      );

      expect(healthcareNodes.length, `${stage} Healthcare nodes`).to.be.greaterThan(0);
      healthcareNodes.forEach((node: any) => {
        expect(normalizeColor(String(node.style('background-color'))), `${stage} rendered Healthcare node color`)
          .to.equal(normalizeColor(roundtripMappings.nodeColor.value));
      });
      expect(sportsTeamEdges.length, `${stage} sports team links`).to.be.greaterThan(0);
      sportsTeamEdges.forEach((edge: any) => {
        expect(normalizeColor(String(edge.style('line-color'))), `${stage} rendered sports team link color`)
          .to.equal(normalizeColor(roundtripMappings.linkColor.value));
      });
      expect(personNodes.length, `${stage} Person nodes`).to.be.greaterThan(0);
      personNodes.forEach((node: any) => {
        expect(getRenderedShapeKey(node), `${stage} rendered Person node shape`)
          .to.equal(roundtripMappings.nodeShape.value);
      });
    });
  };

  const configureIssue1686StyleThroughUi = (minimumSize: number, maximumSize: number): void => {
    openTwoDSettingsDialog();
    cy.get('@twoDSettings').contains('.nav-link', 'Nodes').click({ force: true });
    cy.get('@twoDSettings')
      .find('.tab-pane:visible', { timeout: 15000 })
      .should('exist')
      .as('nodesTab');
    expandAccordionTabByHeader('@nodesTab', 'Shapes and Sizes');

    cy.get('@nodesTab').find('#node-radius-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Degree').click({ force: true });
    cy.window().its('commonService.session.style.widgets.node-radius-variable').should('equal', 'degree');
    cy.get('body').then(($body) => {
      if ($body.find('.p-select-overlay:visible').length > 0) {
        cy.get('body').type('{esc}');
      }
    });
    cy.get('.p-dialog:visible .tab-pane:visible', { timeout: 15000 })
      .should('exist')
      .as('nodesTab');
    cy.get('@nodesTab')
      .find('#node-radius-min')
      .invoke('val', String(minimumSize))
      .trigger('input', { force: true })
      .trigger('change', { force: true });
    cy.get('@nodesTab')
      .find('#node-radius-max')
      .invoke('val', String(maximumSize))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    closeTwoDSettingsDialog();
    openTwoDSettingsDialog();
    cy.get('.p-dialog:visible').contains('.nav-link', 'Grouping').click({ force: true });
    cy.get('.p-dialog:visible .tab-pane:visible', { timeout: 15000 })
      .should('exist')
      .as('groupingTab');
    expandAccordionTabByHeader('@groupingTab', 'Controls');
    cy.get('@groupingTab')
      .find('#polygons-show-toggle')
      .contains('Show')
      .click({ force: true });
    cy.get('@groupingTab').find('#polygons-foci').should('be.visible').click({ force: true });
    cy.contains('li[role="option"]', 'State').click({ force: true });

    expandAccordionTabByHeader('@groupingTab', 'Colors');
    cy.get('@groupingTab')
      .find('#colorPolygons')
      .contains('Show')
      .click({ force: true });
    cy.get('@groupingTab')
      .find('#polygon-color-table-toggle')
      .contains('Show')
      .click({ force: true });

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['node-radius-variable']).to.equal('degree');
        expect(Number(widgets['node-radius-min'])).to.equal(minimumSize);
        expect(Number(widgets['node-radius-max'])).to.equal(maximumSize);
        expect(widgets['polygons-show']).to.equal(true);
        expect(widgets['polygons-foci']).to.equal('State');
        expect(widgets['polygons-color-show']).to.equal(true);
        expect(widgets['polygon-color-table-visible']).to.equal('Show');
      });

    closeTwoDSettingsDialog();
  };

  const saveStyleFromFileMenu = (styleFileBase: string): void => {
    cy.get('#top-toolbar').contains('button', 'File').click({ force: true });
    cy.contains('button[mat-menu-item]', 'Save').click({ force: true });
    cy.contains('.p-dialog-title', 'Save Session')
      .should('exist')
      .parents('.p-dialog')
      .as('saveStyleDialog');

    cy.get('@saveStyleDialog')
      .find('#stash-name')
      .clear({ force: true })
      .type(styleFileBase, { delay: 0, force: true })
      .should('have.value', styleFileBase);
    cy.get('@saveStyleDialog').find('p-select').click({ force: true });
    cy.contains('li[role="option"]', 'style', { timeout: 15000 }).click({ force: true });
    cy.get('@saveStyleDialog')
      .find('#stash-data')
      .should('not.be.disabled')
      .click({ force: true });

    cy.contains('.p-dialog-title', 'Save Session').should('not.exist');
  };

  const applyCombinedStyleAndFilter = (): void => {
    cy.openGlobalSettings();
    cy.contains('.nav-link:visible', 'Styling').click({ force: true });
    cy.fixture('Cypress_Test_Style.style', 'utf8').then((contents) => {
      const style = JSON.parse(String(contents));
      Object.assign(style.widgets, {
        'default-distance-metric': 'tn93',
        'link-sort-variable': 'distance',
        'link-threshold': filteredThreshold,
        'polygons-show': true,
        'polygons-foci': 'State',
        'polygons-color-show': true,
        'polygon-color-table-visible': 'Show',
      });

      cy.get('#apply-style').selectFile({
        contents: Cypress.Buffer.from(JSON.stringify(style)),
        fileName: 'issue-1686.style',
        mimeType: 'application/json',
      }, { force: true });
    });
  };

  it(profile.title, () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const visibleNodes = cyInstance.nodes().filter((node: any) => !node.hasClass('parent') && node.visible());
      const visibleEdges = cyInstance.edges().filter((edge: any) => edge.visible());

      expect(visibleNodes.length, 'visible nodes present').to.be.greaterThan(0);
      expect(visibleEdges.length, 'visible edges present').to.be.greaterThan(0);

      const healthcareNodes = visibleNodes.filter((node: any) => node.data('Profession') === 'Healthcare');
      const educationNodes = visibleNodes.filter((node: any) => node.data('Profession') === 'Education');
      expect(healthcareNodes.length, 'healthcare nodes present').to.be.greaterThan(0);
      expect(educationNodes.length, 'education nodes present').to.be.greaterThan(0);

      const healthcareColor = healthcareNodes[0].style('background-color');
      const educationColor = educationNodes[0].style('background-color');
      healthcareNodes.forEach((node: any) => {
        expect(node.style('background-color')).to.equal(healthcareColor);
      });
      educationNodes.forEach((node: any) => {
        expect(node.style('background-color')).to.equal(educationColor);
      });
      expect(healthcareColor, 'different professions render different node colors').not.to.equal(educationColor);

      const personNodes = visibleNodes.filter((node: any) => node.data('Node type') === 'Person');
      const facilityNodes = visibleNodes.filter((node: any) => node.data('Node type') === 'Facility');
      expect(personNodes.length, 'person nodes present').to.be.greaterThan(0);
      expect(facilityNodes.length, 'facility nodes present').to.be.greaterThan(0);

      const personShape = getRenderedShapeKey(personNodes[0]);
      const facilityShape = getRenderedShapeKey(facilityNodes[0]);
      personNodes.forEach((node: any) => {
        expect(getRenderedShapeKey(node)).to.equal(personShape);
      });
      facilityNodes.forEach((node: any) => {
        expect(getRenderedShapeKey(node)).to.equal(facilityShape);
      });
      expect(personShape, 'different node types render different shapes').not.to.equal(facilityShape);

      const rankedByDegree = visibleNodes
        .map((node: any) => ({
          degree: Number(node.data('degree') ?? 0),
          width: parseFloat(node.style('width')),
        }))
        .sort((a: any, b: any) => a.degree - b.degree);

      const smallest = rankedByDegree[0];
      const largest = rankedByDegree[rankedByDegree.length - 1];
      expect(largest.degree, 'range of node degrees').to.be.greaterThan(smallest.degree);
      expect(largest.width, 'higher degree node renders larger').to.be.greaterThan(smallest.width);

      const sportsTeamEdges = visibleEdges.filter((edge: any) => edge.data('Contact type') === 'sports team');
      const classroomEdges = visibleEdges.filter((edge: any) => edge.data('Contact type') === 'classroom');
      expect(sportsTeamEdges.length, 'sports team edges present').to.be.greaterThan(0);
      expect(classroomEdges.length, 'classroom edges present').to.be.greaterThan(0);

      const sportsTeamColor = sportsTeamEdges[0].style('line-color');
      const classroomColor = classroomEdges[0].style('line-color');
      sportsTeamEdges.forEach((edge: any) => {
        expect(edge.style('line-color')).to.equal(sportsTeamColor);
      });
      classroomEdges.forEach((edge: any) => {
        expect(edge.style('line-color')).to.equal(classroomColor);
      });
      expect(sportsTeamColor, 'different contact types render different link colors').not.to.equal(classroomColor);
    });

    assertStyleTablesFromProfile(profile);
    assertExactFixtureCategoryMappings();
  });

  it('restores imported filtering, degree sizing, grouping, and group colors together', () => {
    launchProfileToTwoD(targetProfile);
    assertAfterLaunchCounts(targetProfile);
    applyCombinedStyleAndFilter();
    waitForProcessingDialogToClear(30000);
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.rendering')
      .should('equal', false);
    cy.closeGlobalSettings();
    assertMetricCount('#numberOfVisibleLinks', expectedVisibleLinksAfterThreshold);

    cy.window().should((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      const cyInstance = win.cytoscapeInstance;
      const microbeTrace = win.commonService.visuals.microbeTrace;
      const globalSettings = win.commonService.GlobalSettingsModel;
      const visibleEdges = cyInstance.edges().filter((edge: any) => edge.visible());
      const visibleNodes = cyInstance.nodes().filter((node: any) => !node.hasClass('parent') && node.visible());
      const rankedByDegree = visibleNodes
        .map((node: any) => ({
          degree: Number(node.data('degree') ?? 0),
          width: parseFloat(String(node.style('width'))),
        }))
        .sort((a: any, b: any) => a.degree - b.degree);
      const largest = rankedByDegree[rankedByDegree.length - 1];

      expect(widgets['default-distance-metric']).to.equal('tn93');
      expect(widgets['link-sort-variable']).to.equal('distance');
      expect(Number(widgets['link-threshold'])).to.equal(filteredThreshold);
      expect(microbeTrace.SelectedDistanceMetricVariable).to.equal('tn93');
      expect(microbeTrace.SelectedLinkSortVariable).to.equal('distance');
      expect(Number(microbeTrace.SelectedLinkThresholdVariable)).to.equal(filteredThreshold);
      expect(globalSettings.SelectedDistanceMetricVariable).to.equal('tn93');
      expect(globalSettings.SelectedLinkSortVariable).to.equal('distance');
      expect(Number(globalSettings.SelectedLinkThresholdVariable)).to.equal(filteredThreshold);
      expect(widgets['node-radius-variable']).to.equal('degree');
      expect(widgets['polygons-show']).to.equal(true);
      expect(widgets['polygons-foci']).to.equal('State');
      expect(widgets['polygons-color-show']).to.equal(true);
      expect(widgets['polygon-color-table-visible']).to.equal('Show');
      expect(visibleEdges.length, 'thresholded visible links').to.equal(expectedVisibleLinksAfterThreshold);
      visibleEdges.forEach((edge: any) => {
        expect(Number(edge.data('distance')), `visible link ${edge.id()} distance`)
          .to.be.at.most(filteredThreshold);
      });
      expect(rankedByDegree.length, 'visible nodes available for degree sizing').to.be.greaterThan(1);
      expect(largest.degree).to.be.greaterThan(rankedByDegree[0].degree);
      expect(largest.width).to.be.greaterThan(rankedByDegree[0].width);
      expect(rankedByDegree[0].width, 'configured minimum degree size')
        .to.be.closeTo(renderedNodeWidthFromWidgetSize(Number(widgets['node-radius-min'])), 1);
      expect(largest.width, 'configured maximum degree size')
        .to.be.closeTo(renderedNodeWidthFromWidgetSize(Number(widgets['node-radius-max'])), 1);

      const expectedGroups = Array.from(
        new Set(
          visibleNodes
            .map((node: any) => String(node.data('State') ?? '').trim())
            .filter((value: string) => value && value.toLowerCase() !== 'null'),
        ),
      ).sort();
      const renderedGroups = Array.from(
        new Set(cyInstance.nodes('.parent').map((node: any) => String(node.data('label')))),
      ).sort();
      expect(expectedGroups, 'State groups after imported filtering').to.deep.equal(expectedStateGroups);
      expect(renderedGroups).to.deep.equal(expectedGroups);
    });

    assertFixtureGroupColorMapping();
  });

  it('saves configured sizing, grouping, and category mappings, then applies them to a separate uploaded network', () => {
    const minimumSize = 25;
    const maximumSize = 90;
    const styleFileBase = `cypress_issue_1686_style_${Date.now()}`;
    const styleFileName = `${styleFileBase}.style`;
    const styleFilePath = `${Cypress.config('downloadsFolder')}/${styleFileName}`;
    let savedPolygonColors: string[] = [];

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    configureIssue1686StyleThroughUi(minimumSize, maximumSize);
    configureRoundtripMappingsThroughUi();
    assertRoundtripMappings('source network before save');

    installSaveAsCaptureHook();
    saveStyleFromFileMenu(styleFileBase);
    writeCapturedDownloadToDisk(styleFileName, styleFilePath);

    cy.readFile(styleFilePath, 'utf8', { timeout: 30000 }).then((savedStyle) => {
      const style = JSON.parse(String(savedStyle));
      const assertSavedMapping = (
        keysByVariable: Record<string, unknown[]>,
        valuesByVariable: Record<string, unknown[]>,
        variable: string,
        category: string,
        expectedValue: string,
        label: string,
        normalizeValue: (value: string) => string,
      ): void => {
        const keys = keysByVariable[variable].map(normalizeStyleCategoryValue);
        const index = keys.indexOf(category);
        expect(index, `saved ${label} index`).to.be.greaterThan(-1);
        expect(normalizeValue(String(valuesByVariable[variable][index])), `saved ${label}`)
          .to.equal(normalizeValue(expectedValue));
      };

      savedPolygonColors = style.polygonColors.map(String);
      expect(savedPolygonColors, 'saved polygon colors').to.have.length.greaterThan(0);
      expect(style.widgets['node-radius-variable']).to.equal('degree');
      expect(Number(style.widgets['node-radius-min'])).to.equal(minimumSize);
      expect(Number(style.widgets['node-radius-max'])).to.equal(maximumSize);
      expect(style.widgets['polygons-show']).to.equal(true);
      expect(style.widgets['polygons-foci']).to.equal('State');
      expect(style.widgets['polygons-color-show']).to.equal(true);
      expect(style.widgets['polygon-color-table-visible']).to.equal('Show');
      expect(style.widgets['node-color-variable']).to.equal(roundtripMappings.nodeColor.variable);
      expect(style.widgets['link-color-variable']).to.equal(roundtripMappings.linkColor.variable);
      expect(style.widgets['node-symbol-variable']).to.equal(roundtripMappings.nodeShape.variable);
      assertSavedMapping(
        style.nodeColorsTableKeys,
        style.nodeColorsTable,
        roundtripMappings.nodeColor.variable,
        roundtripMappings.nodeColor.category,
        roundtripMappings.nodeColor.value,
        'node color mapping',
        normalizeColor,
      );
      assertSavedMapping(
        style.linkColorsTableKeys,
        style.linkColorsTable,
        roundtripMappings.linkColor.variable,
        roundtripMappings.linkColor.category,
        roundtripMappings.linkColor.value,
        'link color mapping',
        normalizeColor,
      );
      assertSavedMapping(
        style.nodeSymbolsTableKeys,
        style.nodeSymbolsTable,
        roundtripMappings.nodeShape.variable,
        roundtripMappings.nodeShape.category,
        roundtripMappings.nodeShape.value,
        'node shape mapping',
        String,
      );
    });

    launchProfileToTwoD(targetProfile);
    assertAfterLaunchCounts(targetProfile);
    cy.openGlobalSettings();
    cy.contains('.nav-link:visible', 'Styling').click({ force: true });
    cy.get('#apply-style').selectFile(styleFilePath, { force: true });
    cy.window()
      .its('commonService.session.style.widgets', { timeout: 15000 })
      .should((widgets) => {
        expect(widgets['node-radius-variable']).to.equal('degree');
        expect(Number(widgets['node-radius-min'])).to.equal(minimumSize);
        expect(Number(widgets['node-radius-max'])).to.equal(maximumSize);
        expect(widgets['polygons-show']).to.equal(true);
        expect(widgets['polygons-foci']).to.equal('State');
        expect(widgets['polygons-color-show']).to.equal(true);
        expect(widgets['polygon-color-table-visible']).to.equal('Show');
        expect(widgets['node-color-variable']).to.equal(roundtripMappings.nodeColor.variable);
        expect(widgets['link-color-variable']).to.equal(roundtripMappings.linkColor.variable);
        expect(widgets['node-symbol-variable']).to.equal(roundtripMappings.nodeShape.variable);
      });
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear(30000);
    cy.window({ timeout: 30000 })
      .its('commonService.session.network.rendering')
      .should('equal', false);

    cy.window().should((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const visibleNodes = cyInstance.nodes().filter((node: any) => !node.hasClass('parent') && node.visible());
      const rankedByDegree = visibleNodes
        .map((node: any) => ({
          degree: Number(node.data('degree') ?? 0),
          width: parseFloat(String(node.style('width'))),
        }))
        .sort((a: any, b: any) => a.degree - b.degree);

      expect(rankedByDegree.length, 'target nodes available for saved degree sizing').to.be.greaterThan(1);
      expect(rankedByDegree[rankedByDegree.length - 1].degree, 'target degree range')
        .to.be.greaterThan(rankedByDegree[0].degree);
      expect(rankedByDegree[0].width, 'saved minimum node size on target')
        .to.be.closeTo(renderedNodeWidthFromWidgetSize(minimumSize), 1);
      expect(rankedByDegree[rankedByDegree.length - 1].width, 'saved maximum node size on target')
        .to.be.closeTo(renderedNodeWidthFromWidgetSize(maximumSize), 1);

      const expectedGroups = Array.from(
        new Set(
          visibleNodes
            .map((node: any) => String(node.data('State') ?? '').trim())
            .filter((value: string) => value && value.toLowerCase() !== 'null'),
        ),
      ).sort();
      const renderedGroups = Array.from(
        new Set(cyInstance.nodes('.parent').map((node: any) => String(node.data('label')))),
      ).sort();
      expect(renderedGroups, 'saved State grouping on target').to.deep.equal(expectedGroups);
    });

    assertRoundtripMappings('target network after apply');

    cy.then(() => {
      expect(savedPolygonColors, 'captured saved polygon colors').to.have.length.greaterThan(0);
      assertExactGroupColorMapping(savedPolygonColors);
    });
  });
});
