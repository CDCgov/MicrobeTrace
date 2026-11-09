/// <reference types="cypress" />

const shapes = [
  { key: 'rhomboid', label: '(Rhombus)' },
  { key: 'heptagon', label: '(Heptagon)' },
  { key: 'pentagon', label: '(Pentagon)' },
  { key: 'hexagon', label: '(Hexagon)' },
  { key: 'octagon', label: '(Octagon)' },
  { key: 'star', label: '(Star)' },
  { key: 'barrel', label: '(Barrel)' },
  { key: 'tag', label: '(Tag)' },
  { key: 'vee', label: '(Vee)' },
];

describe('Sigma basic node shapes', () => {
  beforeEach(() => {
    cy.visit('/?skipEula=1');
    cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 }).click();
    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
    cy.window().should((win: any) => {
      expect(win.commonService.visuals.twoD.sigmaActive).to.equal(true);
      expect(win.commonService.visuals.twoD.sigmaLoading).to.equal(false);
    });
  });

  it('applies each basic shape through the global picker and returns to Circle', () => {
    cy.contains('Settings').first().click();
    cy.get('#node-symbol-variable').click();
    cy.contains('[role="option"]', /^None$/).click();

    [...shapes, { key: 'ellipse', label: '(Circle)' }].forEach(({ key, label }) => {
      cy.get('#node-shape-value-row .p-treeselect').click();
      cy.contains('.shapeTreeSelectPanel [role="treeitem"]', label).click();
      cy.window().should((win: any) => {
        const adapter = win.commonService.visuals.twoD.sigmaRenderer;
        const graph = adapter.getGraph();
        expect(graph.order).to.equal(33);
        graph.forEachNode((_id: string, attributes: any) => {
          expect(attributes.shapeKey).to.equal(key);
          expect(attributes.shape).to.equal(key === 'ellipse' ? 'circle' : key);
        });
        expect(adapter.usesCustomWebglNodeFeatures(), 'native Sigma program').to.equal(true);
      });
    });
  });

  it('keeps fill colors and border thickness through selection, hover, dimming, and zero-width borders', () => {
    cy.window().then(async (win: any) => {
      const twoD = win.commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer;
      const ids = adapter.getGraph().nodes().slice(0, 3);
      const fill = [23, 107, 202];
      const renderFixture = (borderWidth: number) => {
        adapter.render({
          nodes: ids.map((id: string, index: number) => ({
            id, x: index * 1000, y: 0, label: '',
            shape: 'circle', shapeKey: 'ellipse', color: '#176bca',
            opacity: 1, size: 180, selected: false, borderWidth, raw: {},
          })),
          links: [{ id: 'neighbor-link', source: ids[0], target: ids[1], color: '#dddddd', opacity: 1, size: 1, raw: {} }],
          showGroupHulls: false,
        });
        adapter.getRenderer().getCamera().setState({ ratio: 1.35 });
      };
      const snapshot = async (selectedId?: string) => {
        const renderer = adapter.getRenderer();
        const composite = await twoD.exportRendererComposite(1, false);
        const context = composite.canvas.getContext('2d', { willReadFrequently: true });
        return ids.map((id: string) => {
          const attributes = adapter.getGraph().getNodeAttributes(id);
          const point = renderer.graphToViewport(attributes);
          const radius = renderer.scaleSize(renderer.getNodeDisplayData(id).size);
          const center = Array.from(context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data).slice(0, 3);
          const left = Math.round(point.x + radius - 9);
          const pixels = context.getImageData(left, Math.round(point.y), 13, 1).data;
          let width = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const borderPixel = id === selectedId
              ? pixels[i] > 220 && pixels[i + 1] > 80 && pixels[i + 1] < 180 && pixels[i + 2] < 50
              : pixels[i] < 50 && pixels[i + 1] < 50 && pixels[i + 2] < 50;
            if (borderPixel) width++;
          }
          return { center, width };
        });
      };
      const expectFill = (actual: any[]) => actual.forEach(({ center }) => {
        fill.forEach((channel, index) => expect(center[index], 'original fill channel').to.be.closeTo(channel, 2));
      });

      adapter.setSelectedColor('#ff8300');
      renderFixture(4);
      const normal = await snapshot();
      expectFill(normal);
      normal.forEach(({ width }) => expect(width, 'visible black 4px outline').to.be.within(3, 5));

      adapter.selectNodes([ids[0]]);
      const selected = await snapshot(ids[0]);
      expectFill(selected.slice(0, 2));
      expect(selected[2].center[0], 'unrelated fill is dimmed during selection').to.be.greaterThan(200);
      selected.forEach(({ width }, index) => expect(width, 'same width after selection').to.be.closeTo(normal[index].width, 1));

      adapter.clearSelection();
      adapter.setNeighborHighlighting(true);
      adapter.handleNodeHover(ids[0], new win.MouseEvent('mousemove'));
      const hovered = await snapshot();
      expectFill(hovered.slice(0, 2));
      expect(hovered[2].center[0], 'unrelated fill is dimmed').to.be.greaterThan(200);
      hovered.forEach(({ width }, index) => expect(width, 'same width during neighbor emphasis').to.be.closeTo(normal[index].width, 1));

      adapter.handleNodeHover(null, new win.MouseEvent('mouseout'));
      renderFixture(0);
      adapter.selectNodes([ids[0]]);
      const withoutBorders = await snapshot(ids[0]);
      expectFill(withoutBorders.slice(0, 2));
      withoutBorders.forEach(({ width }) => expect(width, 'zero width stays zero when selected').to.equal(0));
    });
  });

  it('renders the basic silhouettes and requested Rhombus/Barrel adjustments through selection and export', () => {
    cy.window().then(async (win: any) => {
      const twoD = win.commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer;
      const cytoscape = await twoD.loadCytoscapeRenderer();
      const referenceHost = win.document.createElement('div');
      referenceHost.style.cssText = 'position:fixed;left:-1000px;width:300px;height:300px';
      win.document.body.appendChild(referenceHost);
      // Cytoscape validates plain objects against its own window's Object.
      const referenceOptions = win.JSON.parse('{"elements":[]}');
      referenceOptions.container = referenceHost;
      const reference = cytoscape(referenceOptions);

      try {
        adapter.render({
          nodes: shapes.map(({ key }, index) => ({
            id: key, x: (index % 3) * 1000, y: -Math.floor(index / 3) * 1000,
            label: key, shape: key, shapeKey: key,
            color: '#e00000', opacity: 1, size: 180,
            selected: false, borderWidth: 0, raw: {},
          })),
          links: [], showGroupHulls: false,
        });
        adapter.getRenderer().getCamera().setState({ ratio: 1.35 });

        const assertSilhouettes = async (selected: boolean) => {
          const renderer = adapter.getRenderer();
          const graph = adapter.getGraph();
          const composite = await twoD.exportRendererComposite(1, false);
          const actual = composite.canvas.getContext('2d', { willReadFrequently: true });
          const expectedCanvas = win.document.createElement('canvas');
          expectedCanvas.width = composite.width;
          expectedCanvas.height = composite.height;
          const expected = expectedCanvas.getContext('2d', { willReadFrequently: true });

          shapes.forEach(({ key }) => {
            const attributes = graph.getNodeAttributes(key);
            const point = renderer.graphToViewport(attributes);
            const radius = renderer.scaleSize(attributes.size) * (selected ? 1.35 : 1);
            expected.clearRect(0, 0, composite.width, composite.height);
            const diameter = 2 * (radius - 0.5);
            if (key === 'rhomboid') {
              expected.save();
              expected.translate(2 * point.x, 0);
              expected.scale(-1, 1);
              reference.renderer().nodeShapes[key].draw(expected, point.x, point.y, diameter, diameter);
              expected.restore();
            } else if (key === 'barrel') {
              const r = diameter / 2;
              const { x, y } = point;
              expected.beginPath();
              expected.moveTo(x - r, y - 0.6 * r);
              expected.lineTo(x - r, y + 0.6 * r);
              expected.quadraticCurveTo(x - r, y + r, x - 0.5 * r, y + r);
              expected.lineTo(x + 0.5 * r, y + r);
              expected.quadraticCurveTo(x + r, y + r, x + r, y + 0.6 * r);
              expected.lineTo(x + r, y - 0.6 * r);
              expected.quadraticCurveTo(x + r, y - r, x + 0.5 * r, y - r);
              expected.lineTo(x - 0.5 * r, y - r);
              expected.quadraticCurveTo(x - r, y - r, x - r, y - 0.6 * r);
              expected.closePath();
            } else {
              reference.renderer().nodeShapes[key].draw(expected, point.x, point.y, diameter, diameter);
            }
            expected.fillStyle = '#e00000';
            expected.fill();

            const extent = Math.ceil(radius + 5);
            const left = Math.round(point.x) - extent;
            const top = Math.round(point.y) - extent;
            const side = extent * 2;
            const pixels = actual.getImageData(left, top, side, side).data;
            const referencePixels = expected.getImageData(left, top, side, side).data;
            let union = 0;
            let mismatch = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              const filled = pixels[i] > 150 && pixels[i + 1] < 128 && pixels[i + 2] < 128;
              const expectedFilled = referencePixels[i + 3] > 127;
              if (filled || expectedFilled) union++;
              if (filled !== expectedFilled) mismatch++;
            }
            expect(union, `${key} visible pixels`).to.be.greaterThan(500);
            expect(mismatch / union, `${key} ${selected ? 'selected outline' : 'fill'} differs from Cytoscape`)
              .to.be.lessThan(!selected && key === 'barrel' ? 0.006 : 0.035);
          });
        };

        await assertSilhouettes(false);
        adapter.setSelectedColor('#e00000');
        adapter.selectNodes(shapes.map(({ key }) => key));
        await assertSilhouettes(true);
      } finally {
        reference.destroy();
        referenceHost.remove();
      }
    });
  });
});
