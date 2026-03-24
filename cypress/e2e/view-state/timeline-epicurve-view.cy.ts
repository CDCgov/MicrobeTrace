describe('Epi Curve / Timeline View', () => {
    const selectors = {
      container: '#epiCurve',
      settingsBtn: '#tool-btn-container-epi a[title="Settings"]',
      settingsPane: '#epiCurve-settings-pane',
    };
  
    beforeEach(() => {
      cy.visit('/');
      cy.wait(6000);
  
      cy.contains('button', 'Continue with Sample Dataset', { timeout: 10000 }).click({ force: true });
      cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
  
      cy.contains('button', 'View').click();
      cy.contains('button[mat-menu-item]', 'Epi Curve').click();
  
      cy.get(selectors.container, { timeout: 15000 }).should('be.visible');
    });
  
    it('renders the epi curve canvas for the sample dataset', () => {
      cy.get('#epiCurveSVG').should('exist');
      cy.contains('.p-dialog-title', 'Epi Curve Settings').should('be.visible');
  
      cy.closeSettingsPane('Epi Curve Settings');
    });
  
    context('Single Date Field Tests', () => {
      beforeEach(() => {
        selectField('Date Field', 'Date of symptom onset Date')
      })

      it("sets color to red and updates bin size to day'", () => {
        selectColor(0, '#ff0000', 0)
        selectBinSize('Day');

        cy.closeSettingsPane('Epi Curve Settings');
      });

      it("Tests Legend Positioning, Single", () => {
        selectField('Color By', 'Cluster')

        selectLegendPosition('Left')
        selectLegendPosition('Right')
        selectLegendPosition('Bottom')
        selectLegendPosition('Hide')

        cy.closeSettingsPane('Epi Curve Settings');
      })

      it("Tests Cumulative Toggle, Single", () => {
        selectBinSize('Week');

        selectCumulative(true);
        selectCumulative(false);

        cy.closeSettingsPane('Epi Curve Settings');
      })

      it('Sets color by cluster and ensures view responds to split/merging of clusters', () => {
        selectField('Color By', 'Cluster')
        selectLegendPosition('Right')
        cy.closeSettingsPane('Epi Curve Settings');
        cy.openGlobalSettings();

        let expectedClusterCount = 2
        cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
        for (let i = 0; i < 6; i++) {
          cy.get('#link-threshold').type('{uparrow}');
        }

        cy.wait(2000);
        cy.window().then((win: any) => {
          expect(win.commonService.session.style.widgets['link-threshold']).to.eq(22);
          expect(win.commonService.session.data.clusters.length).to.eq(expectedClusterCount)
        });

        cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
          .its('length')
          .then((count) => {
            expect(count).to.be.eq(expectedClusterCount);
          });

        cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
          .then(($rects) => {
            const rectFills = [...$rects]
              .map((c) => c.getAttribute('fill') || '')
              .filter(Boolean)
              .map((fill) => fill.toLowerCase());

            expect(rectFills.some((fill) => fill === '#b732cc' || fill === 'rgb(183,50,204)' || fill === 'rgb(183, 50, 204)')).to.equal(false);
          });
        
        for (let i = 0; i < 8; i++) {
          cy.get('#link-threshold').type('{downarrow}');
        }

        cy.wait(2000);
        cy.window().then((win: any) => {
          expectedClusterCount = 4
          expect(win.commonService.session.style.widgets['link-threshold']).to.eq(14);
          expect(win.commonService.session.data.clusters.length).to.eq(expectedClusterCount)
        });

        cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
          .its('length')
          .then((count) => {
            expect(count).to.be.eq(expectedClusterCount);
          });

        cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
          .then(($rects) => {
            const rectFills = [...$rects]
              .map((c) => c.getAttribute('fill') || '')
              .filter(Boolean)
              .map((fill) => fill.toLowerCase());

            expect(rectFills.some((fill) => fill === '#f47a22' || fill === 'rgb(244,122,34)' || fill === 'rgb(244, 122, 34)')).to.equal(true);
            expect(rectFills.some((fill) => fill === '#b732cc' || fill === 'rgb(183,50,204)' || fill === 'rgb(183, 50, 204)')).to.equal(true);
          });

        cy.closeGlobalSettings();
      })

      it('Sets color by "Node Color" and ensures view responds to global changes', () => {
        selectField('Color By', 'Node Color')
        selectLegendPosition('Right')
        cy.closeSettingsPane('Epi Curve Settings');

        cy.openGlobalSettings();
        cy.get('#node-color-variable').click()
        cy.get('li[role="option"]').contains('Cluster').click()
        cy.get('#node-color-table-row', { timeout: 10000 }).should('be.visible');
        cy.get('#node-color-table-row').contains('.p-selectbutton .p-togglebutton-label', 'Show').click({ force: true });

        cy.window()
          .its('commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable')
          .should('equal', 'Show');
        cy.get('#global-settings-node-color-table').should('be.visible');

        cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
        let expectedClusterCount = 4
        for (let i = 0; i < 2; i++) {
          cy.get('#link-threshold').type('{downarrow}');
        }

        cy.wait(2000);
        cy.window().then((win: any) => {
          expect(win.commonService.session.style.widgets['link-threshold']).to.eq(14);
          expect(win.commonService.session.data.clusters.length).to.eq(expectedClusterCount)
        });

        cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
          .its('length')
          .then((count) => {
            expect(count).to.be.eq(expectedClusterCount);
          });

        cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
          .then(($rects) => {
            const rectFills = [...$rects]
              .map((c) => c.getAttribute('fill') || '')
              .filter(Boolean)
              .map((fill) => fill.toLowerCase());

            expect(rectFills.some((fill) => fill === '#f47a22' || fill === 'rgb(244,122,34)' || fill === 'rgb(244, 122, 34)')).to.equal(true);
            expect(rectFills.some((fill) => fill === '#b732cc' || fill === 'rgb(183,50,204)' || fill === 'rgb(183, 50, 204)')).to.equal(true);
          });

        cy.get('#node-color-table td input').first().invoke('val', '#777777').trigger('input').trigger('change');
        cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
          .then(($rects) => {
            const rectFills = [...$rects]
              .map((c) => c.getAttribute('fill') || '')
              .filter(Boolean)
              .map((fill) => fill.toLowerCase());

            expect(rectFills.some((fill) => fill === '#3398f5' || fill === 'rgb(51,152,245)' || fill === 'rgb(51, 152, 245)')).to.equal(false);
            expect(rectFills.some((fill) => fill === '#777777' || fill === 'rgb(119,119,119)' || fill === 'rgb(119, 119, 119)')).to.equal(true);
          });

        cy.contains('#global-settings-modal .nav-link', 'Styling').click();
        cy.get('#node-color-variable').click()
        cy.get('li[role="option"]').contains('None').click()
        cy.get('#node-color').invoke('val', '#ff0000').trigger('input');

        cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
          .then(($rects) => {
            const rectFills = [...$rects]
              .map((c) => c.getAttribute('fill') || '')
              .filter(Boolean)
              .map((fill) => fill.toLowerCase());

            expect(rectFills.every((fill) => fill === '#ff0000' || fill === 'rgb(255,0,0)' || fill === 'rgb(255, 0, 0)')).to.equal(true);
          });
      })
    })

    context('Multi Date Field Tests', () => {
      beforeEach(() => {
        selectField('Graph Type', 'Multi: Side by Side')

        selectField('Date Field', 'CollectionDate')
        selectField('Date Field 2', 'Date of symptom onset Date')
        selectField('Date Field 3', 'Date symptoms resolved')
      })


      it("test multi side by side", () => {
        selectColor(0, '#aa0000', 0)
        selectColor(1, '#00aa00', 4)
        selectColor(2, '#0300aa', 8)

        selectBinSize('Week')

        cy.closeSettingsPane('Epi Curve Settings');
      })

      it("test multi overlay", () => { 
        selectField('Graph Type', 'Multi: Overlay')

        selectColor(0, '#aa0000', 0)
        selectColor(1, '#00aa00', 4)
        selectColor(2, '#0300aa', 8)

        selectBinSize('Quarter')

        cy.closeSettingsPane('Epi Curve Settings');
      })

      it("Tests Legend Positioning, Multi", () => {      
        selectLegendPosition('Left')
        selectLegendPosition('Right')
        selectLegendPosition('Bottom')
        selectLegendPosition('Hide')

        cy.closeSettingsPane('Epi Curve Settings');
      })

      it("Tests Cumulative Toggle, Multi", () => {
        selectBinSize('Week');

        selectCumulative(true, 3);
        selectCumulative(false, 3);

        cy.closeSettingsPane('Epi Curve Settings');
      })
    })

    context('Exporting Tests', () => {
      const exportFileBase = 'cypress_epi_curve_test';

      beforeEach(() => {
        selectField('Date Field', 'Date of symptom onset Date')
        cy.closeSettingsPane('Epi Curve Settings');
        cy.get('#tool-btn-container-epi a[title="Export Screen"]').click();

        cy.contains('.p-dialog-title', 'Export Epi Curve').should('be.visible');
        cy.contains('.p-dialog-title', 'Export Epi Curve')
          .parents('.p-dialog')
          .as('exportDialog');

        cy.get('@exportDialog')
          .find('input[placeholder="Filename"]')
          .clear()
          .type(exportFileBase)
          .should('have.value', exportFileBase);

        cy.window()
          .its('commonService.visuals.epiCurve.EpiExportFileName')
          .should('equal', exportFileBase);
      })

      it('exports view as a png', () => {
        cy.window()
          .its('commonService.visuals.epiCurve.EpiExportFileType')
          .should('equal', 'png');

        cy.get('@exportDialog').contains('button', 'Export').click();
        cy.wait(1500);

        cy.readFile(`cypress/downloads/${exportFileBase}.png`).should('exist');
      })

      it('exports view as an svg', () => {
        cy.get('@exportDialog')
          .find('select.form-control.form-control-sm')
          .select('svg');

        cy.window()
          .its('commonService.visuals.epiCurve.EpiExportFileType')
          .should('equal', 'svg');

        cy.get('@exportDialog').contains('button', 'Export').click();
        cy.wait(1500);

        cy.readFile(`cypress/downloads/${exportFileBase}.svg`).should('exist');
      })
    })

    let selectField = (field, value) => {
      cy.contains('.p-dialog-title', 'Epi Curve Settings')
      .parents('.p-dialog')
      .within(() => {
        cy.contains('label', field)
          .parents('.form-group.row')
          .first()
          .find('p-select')
          .click();
      });

      cy.get('p-selectitem')
        .contains('li', value)
        .click();

      const normalize = (s: string) => s.replace(/_/g, '').toLowerCase();
      let widgetLocation: string;
      if (field == 'Graph Type') {
        widgetLocation = 'commonService.session.style.widgets.epiCurve-graphType'
      } else if (field == 'Date Field') {
        widgetLocation = 'commonService.session.style.widgets.epiCurve-date-fields.0'
      } else if (field == 'Date Field 2') {
        widgetLocation = 'commonService.session.style.widgets.epiCurve-date-fields.1'
      } else if (field == 'Date Field 3') {
        widgetLocation = 'commonService.session.style.widgets.epiCurve-date-fields.2'
      } else if (field == 'Color By') {
        widgetLocation = 'commonService.session.style.widgets.epiCurve-stackColorBy'
      } else if (field == 'Bin Size') {
        widgetLocation = 'commonService.session.style.widgets.epiCurve-binSize'
      } else {
        return;
      }

      cy.window()
        .its(widgetLocation)
        .then(widgetValue =>
          expect(normalize(widgetValue)).to.equal(normalize(value))
        )

      if (field == 'Date Field' || field == 'Date Field 2' || field == 'Date Field 3' ) {
        let textBoxNumber;
        if ( field ==  'Date Field') textBoxNumber = 0
        else if ( field == 'Date Field 2') textBoxNumber = 1
        else textBoxNumber = 2;

        cy.get('#epiCurveSVG .epiCurve-epi-curve text')
          .eq(textBoxNumber)
          .invoke('text')
          .then((textValue) => {
            expect(normalize(textValue)).to.equal(normalize(value));
          });
      }
    }

    let selectColor = (fieldNumber: 0 | 1 | 2, color, rectToCheck: number) => {
      if (rectToCheck < 0) throw new Error('rectToCheck must be >= 0');
      let selector = '#epi-color-select'
      if (fieldNumber == 1) selector += '-2'
      else if (fieldNumber == 2) selector += '-3'

      cy.get(selector)
        .invoke('val', color)
        .trigger('input')
        .trigger('change');

      cy.window()
        .its(`commonService.session.style.widgets.epiCurve-colors.${fieldNumber}`)
        .should('equal', color);

      cy.get('#epiCurveSVG').should('exist');
      cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
        .its('length')
        .should((len) => {
          expect(len, 'rect count should be > rectToCheck').to.be.greaterThan(rectToCheck);
        })
      cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
        .eq(rectToCheck)
        .should('have.attr', 'fill', color);
    }

    let selectBinSize = (binSize: 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year') => {
      let previousBinSize = '';
      let previousRectCount = 0;
      let previousFirstRectWidth = 0;

      cy.window()
        .its('commonService.session.style.widgets.epiCurve-binSize')
        .then((currentBinSize) => {
          previousBinSize = currentBinSize;
        });

      cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
        .then(($rects) => {
          previousRectCount = $rects.length;
          if (previousRectCount > 0) {
            previousFirstRectWidth = Number($rects.first().attr('width') || 0);
          }
        });

      selectField('Bin Size', binSize);

      const binSizeLabel = binSize === 'Day' ? 'Daily' : `${binSize}ly`;
      cy.get('#epiCurveSVG text.x.label')
        .should('contain.text', `Date (${binSizeLabel} Bins)`);

      cy.get('#epiCurveSVG .epiCurve-epi-curve rect')
        .then(($rects) => {
          const nextRectCount = $rects.length;
          const nextFirstRectWidth = Number($rects.first().attr('width') || 0);

          expect(nextRectCount, 'rect count after bin size change').to.be.greaterThan(0);
          expect(nextFirstRectWidth, 'first rect width after bin size change').to.be.greaterThan(0);

          if (previousBinSize !== binSize) {
            const hasRectCountChanged = nextRectCount !== previousRectCount;
            const hasRectWidthChanged = nextFirstRectWidth !== previousFirstRectWidth;
            expect(
              hasRectCountChanged || hasRectWidthChanged,
              'bin size change should update rect count or rect width'
            ).to.equal(true);
          }
        });
    }

    let selectCumulative = (cumulative: boolean, dateFieldCounts: 1 | 2 | 3 = 1) => {
      const toggleLabel = cumulative ? 'Cumulative' : 'Noncumulative';
      let previousHeights: number[] = [];
      const splitByField = (heights: number[]) => {
        expect(
          heights.length % dateFieldCounts,
          `rect count (${heights.length}) should be divisible by dateFieldCounts (${dateFieldCounts})`
        ).to.equal(0);

        const fieldSize = heights.length / dateFieldCounts;
        const chunks: number[][] = [];
        for (let i = 0; i < dateFieldCounts; i++) {
          chunks.push(heights.slice(i * fieldSize, (i + 1) * fieldSize));
        }
        return chunks;
      };

      cy.get('#epiCurveSVG .epiCurve-epi-curve rect').then(($rects) => {
        previousHeights = [...$rects].map((rect) => Number(rect.getAttribute('height') || 0));
      });

      cy.contains('.p-dialog-title', 'Epi Curve Settings')
        .parents('.p-dialog')
        .within(() => {
          cy.contains('.form-group.row', 'Epi Curve')
            .find('.p-selectbutton .p-togglebutton-label')
            .contains(toggleLabel)
            .click({ force: true });
        });

      cy.window()
        .its('commonService.session.style.widgets.epiCurve-cumulative')
        .should('equal', cumulative);

      cy.get('#epiCurveSVG .epiCurve-epi-curve rect').then(($rects) => {
        const nextHeights = [...$rects].map((rect) => Number(rect.getAttribute('height') || 0));
        expect(nextHeights.length, 'rect count after cumulative toggle').to.be.greaterThan(1);
        expect(nextHeights.length, 'rect count should stay stable after cumulative toggle').to.equal(previousHeights.length);

        const nextByField = splitByField(nextHeights);
        const previousByField = splitByField(previousHeights);

        if (cumulative) {
          nextByField.forEach((fieldHeights, fieldIndex) => {
            const hasDecrease = fieldHeights.some((height, index) => index > 0 && height < fieldHeights[index - 1]);
            expect(hasDecrease, `cumulative bars should not decrease for date field ${fieldIndex + 1}`).to.equal(false);
          });
        } else {
          const hasLowerBar = nextByField.some((fieldHeights, fieldIndex) =>
            fieldHeights.some((height, index) => height < previousByField[fieldIndex][index])
          );
          expect(hasLowerBar, 'noncumulative should reduce at least one bar vs cumulative').to.equal(true);
        }
      });
    }

    let selectLegendPosition = (pos: 'Hide' | 'Left' | 'Right' | 'Bottom') => {
      cy.contains('.p-dialog-title', 'Epi Curve Settings')
        .parents('.p-dialog')
        .within(() => {
          cy.contains('label', 'Legend Position')
            .parents('.form-group.row')
            .first()
            .contains('.p-selectbutton .p-togglebutton-label', pos)
            .click({ force: true });
        });

      cy.window()
        .its('commonService.session.style.widgets.epiCurve-legendPosition')
        .should('equal', pos);

      if (pos === 'Hide') {
        cy.get('#epiCurveSVG .epiCurve-epi-curve circle').should('have.length', 0);
        return;
      }

      cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
        .should('have.length.greaterThan', 0);

      if (pos === 'Left') {
        cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
          .first()
          .should(($circle) => {
            const cx = Number($circle.attr('cx'));
            const cy = Number($circle.attr('cy'));
            expect(cx, 'left legend x position').to.be.lessThan(120);
            expect(cy, 'left legend y position').to.be.lessThan(120);
          });
      } else if (pos === 'Right') {
        cy.get('#epiCurveSVG')
          .invoke('attr', 'width')
          .then((svgWidthAttr) => {
            const svgWidth = Number(svgWidthAttr);
            cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
              .first()
              .should(($circle) => {
                const cx = Number($circle.attr('cx'));
                const cy = Number($circle.attr('cy'));
                expect(cx, 'right legend x position').to.be.greaterThan(svgWidth * 0.45);
                expect(cy, 'right legend y position').to.be.lessThan(120);
              });
          });
      } else if (pos === 'Bottom') {
        cy.get('#epiCurveSVG')
          .invoke('attr', 'height')
          .then((svgHeightAttr) => {
            const svgHeight = Number(svgHeightAttr);
            cy.get('#epiCurveSVG .epiCurve-epi-curve circle')
              .first()
              .should(($circle) => {
                const cy = Number($circle.attr('cy'));
                expect(cy, 'bottom legend y position').to.be.greaterThan(svgHeight * 0.45);
              });
          });
      }

    }
  });
