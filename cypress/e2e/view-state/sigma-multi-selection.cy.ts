/// <reference types="cypress" />

const adapterFor = (win: any): any => win.commonService.visuals.twoD.sigmaRenderer;

const incidentEdges = (graph: any, ids: Set<string>): string[] => graph.edges().filter((edge: string) => (
  graph.extremities(edge).some((id: string) => ids.has(id))
));

const assertEmphasis = (
  win: any, selected: Set<string>, mode: string, hovered?: string, highlightNeighbors = true,
): void => {
  const adapter = adapterFor(win);
  const graph = adapter.getGraph();
  const renderer = adapter.getRenderer();
  expect(adapter.getSelectedNodeIds().sort()).to.deep.equal([...selected].sort());
  const seeds = new Set(selected);
  if (hovered && highlightNeighbors) seeds.add(hovered);
  const expectedEdges = incidentEdges(graph, seeds);
  const visibleEdges = adapter.getDisplayGraph().edges();
  if (mode === 'all') expect(visibleEdges.length).to.equal(graph.size);
  else if (seeds.size > 0) expect(visibleEdges.sort()).to.deep.equal(expectedEdges.sort());

  const related = new Set(seeds);
  seeds.forEach(id => graph.forEachNeighbor(id, (neighbor: string) => related.add(neighbor)));
  graph.forEachNode((id: string, attributes: any) => {
    const display = renderer.getNodeDisplayData(id);
    const shouldDim = highlightNeighbors && seeds.size > 0 && !related.has(id);
    expect(display.mtFillOpacity, `fill opacity for ${id}`)
      .to.equal(shouldDim ? 0.12 : attributes.opacity);
    expect(display.color, `preserved fill for ${id}`).to.equal(attributes.color);
    expect(display.mtBorderWidth, `consistent outline for ${id}`).to.equal(attributes.borderWidth);
  });
  visibleEdges.forEach((id: string) => {
    const attributes = graph.getEdgeAttributes(id);
    const display = renderer.getEdgeDisplayData(id);
    const emphasized = expectedEdges.includes(id);
    expect(display.color, `link color for ${id}`)
      .to.equal(emphasized ? adapter.selectedColor : attributes.color);
    expect(display.size, `link width for ${id}`)
      .to.be.closeTo(attributes.size * (emphasized ? 1.75 : 1), 0.0001);
  });
};

describe('Sigma multiple selected neighborhoods', () => {
  let ids: string[];

  beforeEach(() => {
    cy.visit('/?skipEula=1');
    cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 }).click();
    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
    cy.window({ timeout: 30000 }).should((win: any) => {
      expect(win.commonService.visuals.twoD.sigmaLoading, 'network finished loading').to.equal(false);
      expect(adapterFor(win), 'Sigma renderer').to.exist;
      expect(adapterFor(win).getGraph().order, 'rendered sample nodes').to.equal(33);
    });
    cy.window().then(win => {
      const adapter = adapterFor(win);
      const graph = adapter.getGraph();
      expect(adapter.getSummary().residentNodeCount).to.equal(33);
      const nodes = graph.nodes().filter((id: string) => graph.degree(id) > 0);
      const first = [...nodes].sort((a, b) => graph.getNodeAttribute(a, 'x') - graph.getNodeAttribute(b, 'x'))[0];
      const second = nodes.filter((id: string) => id !== first && !graph.areNeighbors(first, id))
        .sort((a, b) => graph.getNodeAttribute(b, 'y') - graph.getNodeAttribute(a, 'y'))[0];
      const third = nodes.filter((id: string) => id !== first && id !== second)
        .sort((a, b) => graph.degree(b) - graph.degree(a))[0];
      ids = [first, second, third];
    });
  });

  it('updates the union when selection grows, shrinks, and clears in every link-detail mode', () => {
    ['overview', 'detail', 'all'].forEach(mode => {
      cy.window().then(win => {
        adapterFor(win).setEdgeDetailMode(mode);
        adapterFor(win).setNeighborHighlighting(true);
      });
      [[0], [0, 1], [0, 1, 2], [0, 2], [2], []].forEach(indices => {
        cy.window().then(win => adapterFor(win).selectNodes(indices.map(index => ids[index])));
        cy.window().should(win => assertEmphasis(win, new Set(indices.map(index => ids[index])), mode));
      });
    });
  });

  it('preserves selected neighborhoods while hovering elsewhere and honors Normal display mode', () => {
    cy.window().then(win => adapterFor(win).selectNodes(ids.slice(0, 2)));
    cy.window().should(win => assertEmphasis(win, new Set(ids.slice(0, 2)), 'overview'));
    cy.window().then((win: any) => adapterFor(win).handleNodeHover(ids[2], new win.MouseEvent('mousemove')));
    cy.window().should(win => assertEmphasis(win, new Set(ids.slice(0, 2)), 'overview', ids[2]));
    cy.window().then((win: any) => adapterFor(win).handleNodeHover(null, new win.MouseEvent('mouseout')));
    cy.window().should(win => assertEmphasis(win, new Set(ids.slice(0, 2)), 'overview'));
    cy.window().then(win => adapterFor(win).setNeighborHighlighting(false));
    cy.window().should(win => assertEmphasis(win, new Set(ids.slice(0, 2)), 'overview', undefined, false));
    cy.window().then(win => adapterFor(win).setNeighborHighlighting(true));
    cy.window().should(win => assertEmphasis(win, new Set(ids.slice(0, 2)), 'overview'));
  });
});
