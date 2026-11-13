/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { launchProfileToHeatmap, openHeatmapSettingsDialog } from '../../../support/journey-helpers';

const profile: DatasetProfile = {
  id: 'heatmap-image-centering', title: 'Heatmap export spacing', tags: ['heatmap'],
  files: [{ name: 'Heatmap_Example_Wide_20x10.csv', datatype: 'node', field1: 'SampleID', field2: 'None' }],
  preLaunch: { metric: 'snps', threshold: 16, defaultView: '2D Network' }, expectations: {},
};

function assertImagePadding(path: string, format: 'svg' | 'png'): void {
  cy.readFile(path, format === 'svg' ? 'utf8' : 'base64', { timeout: 30000 }).then((imageData: string) => {
    cy.window().then(win => new Cypress.Promise<{ top: number; bottom: number }>((resolve, reject) => {
      const image = new win.Image();
      image.onerror = () => reject(new Error(`Could not render exported ${format}`));
      image.onload = () => {
        try {
          const canvas = win.document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true })!;
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let first = -1;
          let last = -1;
          for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
              const offset = (y * canvas.width + x) * 4;
              if (Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 245) {
                if (first < 0) first = y;
                last = y;
                break;
              }
            }
          }
          expect(first, 'image contains visible heatmap content').to.be.at.least(0);
          resolve({ top: first, bottom: canvas.height - last - 1 });
        } catch (error) { reject(error); }
      };
      image.src = format === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(imageData)}` : `data:image/png;base64,${imageData}`;
    })).then(({ top, bottom }) => {
      expect(top, `${format} top padding`).to.be.at.least(10);
      expect(bottom, `${format} bottom padding`).to.be.at.least(10);
      expect(Math.abs(top - bottom), `${format} vertical balance`).to.be.at.most(4);
    });
  });
}

describe('Heatmap image export vertical centering', () => {
  for (const labels of [true, false]) {
    it(`balances SVG and PNG whitespace with larger labels ${labels ? 'shown' : 'hidden'}`, () => {
      launchProfileToHeatmap(profile);
      openHeatmapSettingsDialog();
      cy.get('@heatmapSettings').find('#heatmap-data-layout').click();
      cy.contains('.p-select-overlay:visible li[role="option"]', 'One row per sample (wide)').click();
      cy.get('@heatmapSettings').contains('.nav-link', 'Appearance').click();
      cy.get('@heatmapSettings').contains('.p-accordionheader', 'Labels').click();
      cy.get('@heatmapSettings').find('#heatmap-axis-label-size').invoke('val', 2).trigger('input').trigger('change');
      if (!labels) {
        cy.get('@heatmapSettings').find('#show-labels p-togglebutton').eq(1).click();
      }
      cy.closeSettingsPane('Heatmap Settings');
      let liveLayout: { height: number; margin: any };
      cy.window().then((win: any) => {
        const plot = win.document.getElementById('heatmap');
        liveLayout = { height: plot._fullLayout.height, margin: JSON.parse(JSON.stringify(plot.layout.margin)) };
      });
      cy.get('heatmapcomponent a[title="Export Screen"]:visible').click();
      cy.contains('.p-dialog-title', 'Export Heatmap').parents('.p-dialog').as('imageExport');
      for (const format of ['svg', 'png'] as const) {
        const name = `heatmap-centered-${labels}-${format}-${Date.now()}`;
        cy.get('@imageExport').find('#tree-image-filename').clear().type(name);
        cy.get('@imageExport').find('#network-export-filetype').click();
        cy.contains('.p-select-overlay:visible li[role="option"]', new RegExp(`^${format}$`)).click();
        cy.get('@imageExport').find('#export-tree').click();
        assertImagePadding(`${Cypress.config('downloadsFolder')}/${name}.${format}`, format);
        if (format === 'svg' && labels) {
          cy.readFile(`${Cypress.config('downloadsFolder')}/${name}.svg`, 'utf8').then(svg => {
            const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
            for (const axis of ['x', 'y']) {
              const ticks = [...document.querySelectorAll(`.${axis}tick text`)];
              expect(ticks.length, `exported ${axis} labels`).to.be.greaterThan(0);
              ticks.forEach(tick => expect((tick as SVGElement).style.fontSize).to.equal('24px'));
            }
          });
        }
      }
      cy.window().should((win: any) => {
        const plot = win.document.getElementById('heatmap');
        expect(plot._fullLayout.height, 'live view height after export').to.equal(liveLayout.height);
        expect(plot.layout.margin, 'live view margins after export').to.deep.equal(liveLayout.margin);
      });
    });
  }
});
