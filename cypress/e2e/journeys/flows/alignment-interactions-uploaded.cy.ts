/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertAlignmentReady,
  expandAccordionTabByHeader,
  launchProfileToAlignment,
  openAlignmentSettingsDialog,
} from '../../../support/journey-helpers';

type AlignmentWindow = Window & {
  commonService: {
    visuals: {
      alignment: any;
    };
    session: {
      data: {
        nodes: any[];
      };
    };
  };
};

type SequenceRow = {
  index: number;
  id: string;
};

const AA_TOOLTIP_LABELS = [
  'A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V', 'STOP', 'GAP', 'UNK',
];

function getAlignmentWindow(win: unknown): AlignmentWindow {
  return win as AlignmentWindow;
}

function getAlignmentRows(win: AlignmentWindow): SequenceRow[] {
  const alignment = win.commonService.visuals.alignment;

  return alignment.nodesWithSeq.map((index: number) => {
    const node = win.commonService.session.data.nodes[index];
    const id = node?._id ?? node?.ID ?? node?.id ?? node?.name ?? index;

    return {
      index,
      id: String(id),
    };
  });
}

function rowSelector(index: number): string {
  return `.canvasLabels > div[data-index="${index}"]`;
}

function setLargeAlignmentSize(): void {
  cy.window().then((win: unknown) => {
    const alignment = getAlignmentWindow(win).commonService.visuals.alignment;
    alignment.widgets['alignView-selectedSize'] = 'c';
    alignment.widgets['alignView-spanWidth'] = 10;
    alignment.widgets['alignView-spanHeight'] = 32;
    alignment.onSelectedSizeChanged();
  });

  assertAlignmentReady();
}

describe('Journey Flow - Alignment uploaded interactions', () => {
  const profile = getProfile('alignment-covid-node-link-excluded');
  const nodeListProfile = getProfile('alignment-angulartesting-sequence-node-list');

  beforeEach(() => {
    cy.viewport(1400, 600);
  });

  it('highlights and autoscrolls uploaded Alignment rows from the global search input', () => {
    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();
    setLargeAlignmentSize();

    cy.window().then((win: unknown) => {
      const typedWindow = getAlignmentWindow(win);
      const rows = getAlignmentRows(typedWindow);
      const targetRow = rows[rows.length - 1];
      expect(targetRow, 'search target row').to.exist;
      return targetRow;
    }).then((targetRow) => {
      cy.get('.canvasLabels').then(($labels) => {
        ($labels.get(0) as HTMLElement).scrollTop = 0;
      });

      cy.get('#search-field').select('_id');
      cy.get('#search').clear().type(targetRow.id);

      cy.get('#search-results').should('be.visible').within(() => {
        cy.contains('li', targetRow.id).should('exist');
      });

      cy.get(rowSelector(targetRow.index), { timeout: 10000 }).should('have.class', 'searchHighlight2');
      cy.get('.canvasLabels').should(($labels) => {
        expect(($labels.get(0) as HTMLElement).scrollTop, 'search autoscroll').to.be.greaterThan(0);
      });

      cy.window().then((win: unknown) => {
        const typedWindow = getAlignmentWindow(win);
        expect(
          typedWindow.commonService.session.data.nodes[targetRow.index]?.selected,
          `selected session node for ${targetRow.id}`,
        ).to.equal(true);
      });

      cy.get('#search').clear();
      cy.get(rowSelector(targetRow.index)).should('not.have.class', 'searchHighlight2');

      cy.window().then((win: unknown) => {
        const typedWindow = getAlignmentWindow(win);
        expect(
          typedWindow.commonService.session.data.nodes[targetRow.index]?.selected,
          `cleared session selection for ${targetRow.id}`,
        ).to.equal(false);
      });
    });
  });

  it('uses the uploaded Alignment mini-map to navigate and keeps scroll positions synchronized', () => {
    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();
    setLargeAlignmentSize();

    cy.window().then((win: unknown) => {
      const typedWindow = getAlignmentWindow(win);
      const alignment = typedWindow.commonService.visuals.alignment;
      const miniMap = typedWindow.document.getElementById('miniMap') as HTMLElement;
      const canvasHolder = typedWindow.document.querySelector('.canvasHolder') as HTMLElement;
      const canvasLabels = typedWindow.document.querySelector('.canvasLabels') as HTMLElement;
      const alignmentTop = typedWindow.document.getElementById('alignmentTop') as HTMLElement;

      expect(miniMap, 'mini-map element').to.exist;
      expect(canvasHolder, 'alignment canvas holder').to.exist;
      expect(canvasLabels, 'alignment labels column').to.exist;
      expect(alignmentTop, 'alignment top ruler').to.exist;

      canvasHolder.scrollLeft = 0;
      canvasHolder.scrollTop = 0;
      canvasLabels.scrollTop = 0;
      alignmentTop.scrollLeft = 0;

      const miniMapRect = miniMap.getBoundingClientRect();
      const clientX = miniMapRect.left + miniMapRect.width * 0.8;
      const clientY = miniMapRect.top + miniMapRect.height * 0.8;
      const event = {
        clientX,
        clientY,
        pageX: clientX,
        pageY: clientY,
      } as MouseEvent;

      alignment.showMiniMapHighlight(event, miniMap);
      alignment.updateMiniMapHighlight(event, miniMap);
      alignment.miniMapClick(event, miniMap, canvasHolder, canvasLabels, alignmentTop);
    });

    cy.get('#miniMapHighlight').should('be.visible').and(($highlight) => {
      expect(parseFloat($highlight.css('left')), 'mini-map highlight left').to.be.greaterThan(0);
      expect(parseFloat($highlight.css('top')), 'mini-map highlight top').to.be.greaterThan(-1);
    });

    cy.window().should((win: unknown) => {
      const typedWindow = getAlignmentWindow(win);
      const canvasHolder = typedWindow.document.querySelector('.canvasHolder') as HTMLElement;
      const canvasLabels = typedWindow.document.querySelector('.canvasLabels') as HTMLElement;
      const alignmentTop = typedWindow.document.getElementById('alignmentTop') as HTMLElement;

      expect(canvasHolder.scrollLeft, 'mini-map horizontal navigation').to.be.greaterThan(0);
      expect(canvasHolder.scrollTop, 'mini-map vertical navigation').to.be.greaterThan(0);
      expect(alignmentTop.scrollLeft, 'top ruler synced after mini-map click').to.equal(canvasHolder.scrollLeft);
      expect(canvasLabels.scrollTop, 'label column synced after mini-map click').to.equal(canvasHolder.scrollTop);
    });

    cy.window().then((win: unknown) => {
      const typedWindow = getAlignmentWindow(win);
      const alignment = typedWindow.commonService.visuals.alignment;
      const canvasHolder = typedWindow.document.querySelector('.canvasHolder') as HTMLElement;
      const canvasLabels = typedWindow.document.querySelector('.canvasLabels') as HTMLElement;
      const alignmentTop = typedWindow.document.getElementById('alignmentTop') as HTMLElement;

      const horizontalTarget = Math.floor((canvasHolder.scrollWidth - canvasHolder.clientWidth) * 0.45);
      const verticalTarget = Math.floor((canvasHolder.scrollHeight - canvasHolder.clientHeight) * 0.55);

      canvasHolder.scrollLeft = horizontalTarget;
      canvasHolder.scrollTop = verticalTarget;
      alignment.canvasScroll(canvasHolder, canvasLabels, alignmentTop);
    });

    cy.window().should((win: unknown) => {
      const typedWindow = getAlignmentWindow(win);
      const canvasHolder = typedWindow.document.querySelector('.canvasHolder') as HTMLElement;
      const canvasLabels = typedWindow.document.querySelector('.canvasLabels') as HTMLElement;
      const alignmentTop = typedWindow.document.getElementById('alignmentTop') as HTMLElement;

      expect(canvasHolder.scrollLeft, 'manual horizontal scroll').to.be.greaterThan(0);
      expect(canvasHolder.scrollTop, 'manual vertical scroll').to.be.greaterThan(0);
      expect(alignmentTop.scrollLeft, 'top ruler scroll sync').to.equal(canvasHolder.scrollLeft);
      expect(canvasLabels.scrollTop, 'label scroll sync').to.equal(canvasHolder.scrollTop);
    });
  });

  it('shows and hides the uploaded Alignment per-position tooltip', () => {
    const hoveredPosition = 10;

    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    cy.window().then((win: unknown) => {
      const typedWindow = getAlignmentWindow(win);
      const alignment = typedWindow.commonService.visuals.alignment;
      const host = typedWindow.document.querySelector('alignmentviewcomponent') as HTMLElement;
      const rect = host.getBoundingClientRect();

      alignment.showTooltip(
        {
          pageX: rect.left + 180,
          pageY: rect.top + 90,
          offsetX: hoveredPosition * alignment.spanWidth + 1,
        } as any,
        hoveredPosition,
      );
    });

    cy.get('#tooltipHolder').should('be.visible');
    cy.get('#tooltipAlign')
      .should('contain.text', `Position: ${hoveredPosition + 1}`)
      .and('contain.text', 'NT')
      .and('contain.text', '%');
    cy.get('#tooltip-table tbody tr').its('length').should('be.greaterThan', 0);

    cy.window().then((win: unknown) => {
      getAlignmentWindow(win).commonService.visuals.alignment.hideTooltip();
    });

    cy.get('#tooltipHolder').should('not.be.visible');
  });

  it('shows amino-acid tooltip content after switching uploaded Alignment into AA mode', () => {
    const hoveredPosition = 0;
    let expectedAALabel = '';

    launchProfileToAlignment(nodeListProfile);
    assertAfterLaunchCounts(nodeListProfile);
    assertAlignmentReady();

    openAlignmentSettingsDialog();
    expandAccordionTabByHeader('@alignmentSettings', 'Data');

    cy.get('@alignmentSettings')
      .find('#alignment-start-position')
      .invoke('val', '2')
      .trigger('input')
      .trigger('change');
    cy.get('@alignmentSettings')
      .find('#alignment-end-position')
      .invoke('val', '52')
      .trigger('input')
      .trigger('change');

    cy.get('@alignmentSettings')
      .find('#alignment-seq-type')
      .contains('Amino Acids')
      .click({ force: true });

    assertAlignmentReady();

    cy.get('@alignmentSettings')
      .find('button.p-dialog-close-button')
      .click({ force: true });
    cy.contains('.p-dialog-title', 'Alignment View Settings').should('not.exist');

    cy.window().then((win: unknown) => {
      const typedWindow = getAlignmentWindow(win);
      const alignment = typedWindow.commonService.visuals.alignment;
      const host = typedWindow.document.querySelector('alignmentviewcomponent') as HTMLElement;
      const rect = host.getBoundingClientRect();
      const aaIndex = alignment.proportionMatrixAA[hoveredPosition]
        .findIndex((value: number) => value > 0);

      expectedAALabel = AA_TOOLTIP_LABELS[aaIndex];

      expect(alignment.selectedSeqType, 'selected sequence type').to.equal('aa');
      expect(expectedAALabel, 'expected amino-acid tooltip label').to.not.equal(undefined);

      alignment.showTooltip(
        {
          pageX: rect.left + 180,
          pageY: rect.top + 90,
          offsetX: hoveredPosition * alignment.spanWidth + 1,
        } as any,
        hoveredPosition,
      );
    });

    cy.get('#tooltipHolder').should('be.visible');
    cy.get('#tooltipAlign')
      .should('contain.text', `Position: ${hoveredPosition + 1}`)
      .and('contain.text', 'AA')
      .and('contain.text', expectedAALabel);
    cy.get('#tooltip-table tbody tr').its('length').should('be.greaterThan', 0);

    cy.window().then((win: unknown) => {
      getAlignmentWindow(win).commonService.visuals.alignment.hideTooltip();
    });

    cy.get('#tooltipHolder').should('not.be.visible');
  });

  it('syncs externally selected uploaded nodes into highlighted Alignment rows', () => {
    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();
    setLargeAlignmentSize();

    cy.window().then((win: unknown) => {
      const typedWindow = getAlignmentWindow(win);
      const rows = getAlignmentRows(typedWindow);
      const selectedRows = rows.slice(-2);
      const unselectedRow = rows[0];

      typedWindow.commonService.session.data.nodes.forEach((node) => {
        node.selected = false;
      });
      return { selectedRows, unselectedRow };
    }).then(({ selectedRows, unselectedRow }) => {
      cy.document().trigger('node-selected');
      cy.get('.canvasLabels > div.searchHighlight2').should('have.length', 0);

      cy.get('.canvasLabels').then(($labels) => {
        ($labels.get(0) as HTMLElement).scrollTop = 0;
      });

      cy.window().then((win: unknown) => {
        const typedWindow = getAlignmentWindow(win);

        selectedRows.forEach((row) => {
          typedWindow.commonService.session.data.nodes[row.index].selected = true;
        });
      });

      cy.document().trigger('node-selected');

      cy.get('.canvasLabels > div.searchHighlight2').should('have.length', selectedRows.length);
      selectedRows.forEach((row) => {
        cy.get(rowSelector(row.index)).should('have.class', 'searchHighlight2');
      });
      cy.get(rowSelector(unselectedRow.index)).should('not.have.class', 'searchHighlight2');
      cy.get('.canvasLabels').should(($labels) => {
        expect(($labels.get(0) as HTMLElement).scrollTop, 'selection autoscroll').to.be.greaterThan(0);
      });

      cy.window().then((win: unknown) => {
        const typedWindow = getAlignmentWindow(win);

        selectedRows.forEach((row) => {
          expect(
            typedWindow.commonService.session.data.nodes[row.index]?.selected,
            `session selection for ${row.id}`,
          ).to.equal(true);
        });

        typedWindow.commonService.session.data.nodes.forEach((node) => {
          node.selected = false;
        });
      });

      cy.document().trigger('node-selected');
      cy.get('.canvasLabels > div.searchHighlight2').should('have.length', 0);
    });
  });
});
