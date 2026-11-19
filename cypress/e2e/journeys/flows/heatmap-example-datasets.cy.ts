/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { assertAfterLaunchCounts, launchProfileToHeatmap, openHeatmapSettingsDialog } from '../../../support/journey-helpers';

function selectOption(id: string, label: string): void {
  cy.get('@heatmapSettings').find(id).click();
  cy.contains('.p-select-overlay:visible li[role="option"]', new RegExp(`^${label}$`, 'i')).click();
}

function assertMatrixBorder(): void {
  cy.get('#heatmap').should('have.css', 'border-top-width', '0px').should(($plot) => {
    expect(($plot.get(0) as any)._fullLayout.width, 'plot fits the resized view').to.be.closeTo($plot.parent().width()! - 35, 1);
    const matrix = $plot.find('.xy > .heatmaplayer').get(0).getBoundingClientRect();
    const svg = $plot.find('svg.main-svg').first().get(0).getBoundingClientRect();
    for (const selector of ['.xlines-above', '.ylines-above']) {
      const border = $plot.find(selector).get(0);
      const bounds = border.getBoundingClientRect();
      const style = border.ownerDocument.defaultView!.getComputedStyle(border);
      expect(style.stroke, 'matrix border is black').to.equal('rgb(0, 0, 0)');
      expect(style.strokeWidth, 'matrix border is thin').to.equal('1px');
      expect(bounds.top, 'top border stays inside the SVG').to.be.at.least(svg.top + 0.5);
      expect(bounds.left, 'border follows cells, leaving labels outside').to.be.closeTo(matrix.left, 2);
      expect(bounds.top).to.be.closeTo(matrix.top, 2);
      expect(bounds.right).to.be.closeTo(matrix.right, 2);
      expect(bounds.bottom).to.be.closeTo(matrix.bottom, 2);
    }
  });
}

function assertExampleResults(layout: 'wide' | 'long'): void {
  cy.fixture('Heatmap_Example_Wide_20x10.csv', 'utf8').then((csv: string) => {
    const rows = csv.trimEnd().split(/\r?\n/).map(line => line.split(','));
    const columns = rows[0].slice(2);
    const expected = new Map(rows.slice(1).map(row => [row[0], row.slice(2).map(value => value === '' ? null : Number(value))]));
    cy.window().should((win: any) => {
      const trace = win.commonService.visuals.heatmap.heatmapData[0];
      expect(trace.y).to.have.length(20);
      expect(trace.x).to.have.length(10);
      expect(new Set(trace.y)).to.deep.equal(new Set(expected.keys()));
      trace.y.forEach((sample: string, row: number) => {
        trace.x.forEach((column: string, col: number) => {
          const index = layout === 'wide' ? columns.findIndex(field => field.toLowerCase() === column.toLowerCase()) : Number(column.replace('test_', '')) - 1;
          expect(index, `known result column ${column}`).to.be.within(0, 9);
          expect(trace.z[row][col], `${sample} ${column}`).to.equal(expected.get(sample)![index]);
        });
      });
      expect(trace.z.flat().filter(value => value === null)).to.have.length(14);
    });
  });
  assertMatrixBorder();
}

describe('Heatmap 20-sample 10-test example datasets', () => {
  it('loads 20 wide nodes with genetic links and renders all ten test columns', () => {
    const profile: DatasetProfile = {
      id: 'heatmap-example-wide', title: 'Wide sample/test results with genetic links', tags: ['heatmap'],
      files: [
        { name: 'Heatmap_Example_Wide_20x10.csv', datatype: 'node', field1: 'SampleID', field2: 'None' },
        { name: 'Heatmap_Example_Genetic_Links_20.csv', datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
      ],
      preLaunch: { metric: 'snps', threshold: 16, defaultView: '2D Network' },
      expectations: { afterLaunch: { nodes: 20, visibleLinks: 40, clusters: 4 } },
    };
    launchProfileToHeatmap(profile);
    assertAfterLaunchCounts(profile);
    cy.window().its('commonService.session.data.links').should('have.length', 190);
    openHeatmapSettingsDialog();
    selectOption('#heatmap-data-layout', 'One row per sample \\(wide\\)');
    cy.closeSettingsPane('Heatmap Settings');
    assertExampleResults('wide');
    cy.viewport(1024, 768);
    assertMatrixBorder();
  });

  it('loads 200 measurement nodes and reproduces the same 20 by 10 result matrix', () => {
    const profile: DatasetProfile = {
      id: 'heatmap-example-long', title: 'Long sample/test result rows', tags: ['heatmap'],
      files: [{ name: 'Heatmap_Example_Long_20x10.csv', datatype: 'node', field1: 'RowID', field2: 'None' }],
      preLaunch: { metric: 'snps', threshold: 16, defaultView: '2D Network' },
      expectations: { afterLaunch: { nodes: 200 } },
    };
    launchProfileToHeatmap(profile);
    assertAfterLaunchCounts(profile);
    openHeatmapSettingsDialog();
    selectOption('#heatmap-data-layout', 'One row per sample/test result \\(long\\)');
    selectOption('#heatmap-x-variable', 'TestID');
    selectOption('#heatmap-y-variable', 'SampleID');
    selectOption('#heatmap-value-variable', 'Result');
    cy.closeSettingsPane('Heatmap Settings');
    assertExampleResults('long');
  });

  it('switches between zoom and bounded pan without enabling internal axis resizing', () => {
    const profile: DatasetProfile = {
      id: 'heatmap-navigation', title: 'Heatmap navigation', tags: ['heatmap'],
      files: [{ name: 'Heatmap_Example_Wide_20x10.csv', datatype: 'node', field1: 'SampleID', field2: 'None' }],
      preLaunch: { metric: 'snps', threshold: 16, defaultView: '2D Network' }, expectations: {},
    };
    launchProfileToHeatmap(profile);
    openHeatmapSettingsDialog();
    selectOption('#heatmap-data-layout', 'One row per sample \\(wide\\)');
    cy.closeSettingsPane('Heatmap Settings');
    const toggle = () => cy.get('[data-testid="heatmap-drag-mode-toggle"]');
    toggle().should('contain.text', 'Zoom').and('have.attr', 'aria-pressed', 'false');
    cy.get('#heatmap .draglayer rect').should('have.length', 1).and(($rects) => {
      expect($rects[0].classList.contains('nsewdrag')).to.equal(true);
      expect(getComputedStyle($rects[0]).cursor).not.to.contain('resize');
    });
    cy.get('#heatmap .nsewdrag').then(($drag) => {
      const rect = $drag[0].getBoundingClientRect();
      const x = rect.left + rect.width * 0.25;
      const y = rect.top + rect.height * 0.25;
      cy.wrap($drag).trigger('mousedown', { eventConstructor: 'MouseEvent', clientX: x, clientY: y, button: 0, buttons: 1, force: true });
      cy.get('body').trigger('mousemove', { eventConstructor: 'MouseEvent', clientX: x + rect.width * 0.5, clientY: y + rect.height * 0.5, buttons: 1, force: true });
      cy.get('body').trigger('mouseup', { eventConstructor: 'MouseEvent', clientX: x + rect.width * 0.5, clientY: y + rect.height * 0.5, button: 0, force: true });
    });
    let zoomed: number[][];
    cy.get('#heatmap').should(($plot) => {
      const layout = ($plot[0] as any)._fullLayout;
      expect(layout.xaxis.range[1] - layout.xaxis.range[0]).to.be.within(4, 6);
      expect(layout.yaxis.range[1] - layout.yaxis.range[0]).to.be.within(9, 11);
    }).then(($plot) => {
      const layout = ($plot[0] as any)._fullLayout;
      zoomed = [layout.xaxis.range.slice(), layout.yaxis.range.slice()];
    });
    toggle().click().should('contain.text', 'Pan').and('have.attr', 'aria-pressed', 'true');
    cy.get('#heatmap').should(($plot) => {
      const layout = ($plot[0] as any)._fullLayout;
      expect([layout.xaxis.range, layout.yaxis.range], 'toggle preserves zoom').to.deep.equal(zoomed);
    });
    const pan = (dx: number, dy: number) => {
      cy.get('#heatmap .nsewdrag').then(($drag) => {
        const rect = $drag[0].getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const event = { eventConstructor: 'PointerEvent', pointerId: 1, isPrimary: true, button: 0, force: true };
        cy.wrap($drag).trigger('pointerdown', { ...event, clientX: x, clientY: y, buttons: 1 });
        cy.get('body').trigger('pointermove', { ...event, clientX: x + dx * rect.width, clientY: y + dy * rect.height, buttons: 1 });
        cy.get('body').trigger('pointerup', { ...event, clientX: x + dx * rect.width, clientY: y + dy * rect.height, buttons: 0 });
      });
    };
    for (const [dx, dy, axis, edge] of [[2, 0, 0, -0.5], [-2, 0, 0, 9.5], [0, 2, 1, 19.5], [0, -2, 1, -0.5]]) {
      pan(dx, dy);
      cy.get('#heatmap').should(($plot) => {
        const layout = ($plot[0] as any)._fullLayout;
        const ranges = [layout.xaxis.range, layout.yaxis.range];
        ranges.forEach((range, index) => {
          expect(range[1] - range[0], 'panning preserves the zoom level').to.be.closeTo(zoomed[index][1] - zoomed[index][0], 0.000001);
          expect(range[0]).to.be.at.least(-0.5);
          expect(range[1]).to.be.at.most(index === 0 ? 9.5 : 19.5);
        });
        expect(ranges[axis][edge === -0.5 ? 0 : 1], 'stops at the data edge').to.be.closeTo(edge, 0.000001);
      });
    }
    cy.get('heatmapcomponent a[title="Center Screen"]').click();
    pan(2, 2);
    cy.get('#heatmap').should(($plot) => {
      const layout = ($plot[0] as any)._fullLayout;
      expect([layout.xaxis.range, layout.yaxis.range], 'full matrix cannot pan outside the data').to.deep.equal([[-0.5, 9.5], [-0.5, 19.5]]);
    });
    assertMatrixBorder();
    cy.get('#heatmap .nsewdrag').then(($drag) => {
      const rect = $drag[0].getBoundingClientRect();
      cy.wrap($drag).trigger('mousemove', { eventConstructor: 'MouseEvent', clientX: rect.left + rect.width / 20, clientY: rect.bottom - rect.height / 40, force: true });
    });
    cy.get('#heatmap .hovertext').should('be.visible').and('contain.text', 'sample_01').and('contain.text', '30');
    cy.viewport(1024, 768);
    assertMatrixBorder();
    toggle().should('contain.text', 'Pan');
    toggle().click().should('contain.text', 'Zoom');
  });
});
