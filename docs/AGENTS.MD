# AGENTS.md

This repo uses Cypress for E2E tests. UI is Angular + PrimeNG. Only the 2D Network view uses Cytoscape. Other views use different rendering stacks (example: Phylogenetic Tree is D3 + SVG, Map is Leaflet).

## Cypress locations

* Tests live in `cypress/e2e/`
* Shared commands live in `cypress/support/commands.ts`
* Fixtures live in `cypress/fixtures/`

## What to test where

* View-level tests

  * Keep per-view tests in `cypress/e2e/<view>-plugin.cy.ts` (example: `phylogenetic-plugin.cy.ts`, `map-plugin.cy.ts`, `twod-plugin.cy.ts`).
  * These should validate: view opens, view settings affect view output, export works (when supported).
* Cross-view user journeys

  * Put high-value end-to-end flows in `cypress/e2e/journeys/*`.
  * Example journey: app load -> upload files -> launch -> open a view -> change settings -> verify UI and internal state.

## Shared UI patterns (applies to all views)

* First load overlay

  * Either click `Continue with Sample Dataset`, or upload files via `#fileDropRef`.
  * Always wait for overlay to disappear: `cy.get('#overlay').should('not.be.visible', { timeout: 10000 })`
* View navigation (top toolbar)

  * Open a view via:

    * `cy.contains('button', 'View').click()`
    * `cy.contains('button[mat-menu-item]', '<View Name>').click()`
* Global Settings (top toolbar)

  * Open with the shared command: `cy.openGlobalSettings()`
  * Close with: `cy.closeGlobalSettings()`
  * Assert dialog title: `.p-dialog-title` contains `Global Settings`
* View Settings and Export (per-view tool button containers)

  * Each view has its own tool container and its own dialogs (examples: `#tool-btn-container-phylo`, `#tool-btn-container-map`, `TwoDComponent #tool-btn-container`)
  * Use `cy.closeSettingsPane('<Dialog Title>')` to close PrimeNG dialogs by title.

## PrimeNG dialog rules (applies to all views)

* PrimeNG uses `appendTo="body"`, so hidden duplicates can exist.
* Always scope actions under the active dialog container:

  * Find dialog by title, then alias its `.p-dialog` root.

```ts
cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
  .parents('.p-dialog')
  .as('dialogContainer');

cy.get('@dialogContainer')
  .contains('p-accordionTab', 'Layout')
  .click();
```

* Use `{ force: true }` when overlays intercept clicks.

## Fixtures and file uploads

* Use `cy.attach_file(selector, fixtureName, mimeType?)`
* Fixtures must be in `cypress/fixtures/`
* Upload patterns

  * Initial upload: `#fileDropRef`
  * Additional upload buttons often point to other inputs (example: `#data-files1`)
* After launching or processing files, wait for completion:

  * If loading modal is active: `cy.get('#loading-information', { timeout: 10000 }).should('not.exist')`
  * Then wait for the target view readiness (see view-specific sections below)

## License Agreement modal

* A "License Agreement" dialog may appear on first load.
* Do not rely on ids.
* If present, close it by clicking the `Accept` button by text.

## Failure triage: test issue vs app issue

When a test fails, do not immediately weaken the test. First identify which layer broke.

* Prove readiness first

  * If the view container is not visible or the app is still processing, treat it as setup/timing until proven otherwise.
* Prove the action happened in the intended layer

  * If you changed UI, assert the backing state changed (usually `window.commonService.session.style.widgets.*` or a view state variable under `window.commonService.visuals.*`).
* Prove the render sync happened

  * If state updated but the DOM did not, likely an app bug (missing update call, missed event wiring, missing change detection).
  * If DOM changed but state did not, likely an app bug (UI not persisting to widgets/model).
* Prefer a minimal reproduction

  * Reduce to: open view -> do one action -> assert one thing.
* For suspected app bugs, document divergence explicitly

  * Example: widget changed but SVG did not update, or Cytoscape moved but `session.data.nodes[*].x/y` stayed stale.

Tip: keep diagnostic logs inside the spec while debugging, but remove noisy logging before committing.

## View readiness checks (per view)

* 2D Network

  * Use `cy.waitForNetworkToRender()` and `cy.window().should('have.property', 'cytoscapeInstance')`
* Phylogenetic Tree

  * Wait for `#phylocanvas` and `#phylocanvas svg` to exist and be visible.
* Map

  * Wait for `.mapStyle` to be visible.
  * Avoid relying on online tiles for correctness assertions (see Map caveats).

## 2D Network (Cytoscape) rules

Only the 2D Network view uses Cytoscape. These rules do not apply to other views.

The 2D Network has 3 state layers that must stay consistent:

* App state (widgets + model)

  * `window.commonService.session.style.widgets`
  * `window.commonService.session.data.*`
  * `window.commonService.session.network.*`
* Cytoscape element state (data + computed style)

  * `node.data(...)`, `edge.data(...)`
  * `node.style(...)`, `edge.style(...)`
* Cytoscape geometry state (positions + rendered canvas)

  * `node.position()`

Most failing tests update only one layer and assert on another.

### Always access Cytoscape through the exposed singleton

* Use `cy.window().its('cytoscapeInstance')`
* Do not create a new Cytoscape instance in tests.

Helper:

```ts
import { Core } from 'cytoscape';

const getCy = () =>
  cy.window({ log: false }).its('cytoscapeInstance') as Cypress.Chainable<Core>;
```

### Prefer the TwoD test harness for interactions

The app exposes a Cypress harness for TwoD:

* `window.Cypress.test.*`

For interactions that must run inside Angular zone (dragging, some toggles), prefer calling helpers instead of pointer simulation.

### Use .data(...) vs .style(...) correctly

* Use `node.data('label')` to validate stored metadata.
* Use `node.style('width')`, `node.style('font-size')`, `edge.style('line-opacity')` to validate computed rendering.

Common failure mode:

* Asserting `node.data('width')` when width is computed via stylesheet.

  * Correct: `parseFloat(node.style('width'))`

### Target stable node ids

Avoid `cyInstance.nodes()[0]`. It can be a parent node, hidden, or layout-mutated.

Use known ids and sanity checks:

```ts
getCy().then(cyInstance => {
  const nodeId = 'MZ740979';
  const node = cyInstance.getElementById(nodeId);

  expect(node.empty(), `node ${nodeId} should exist`).to.be.false;
  expect(node.children().length, 'should not be compound parent').to.equal(0);
  expect(node.hasClass('parent'), 'should not have parent class').to.be.false;
  expect(node.hasClass('hidden'), 'should not be hidden').to.be.false;
});
```

### Dragging caveats

Do not set position directly and expect app model sync.

This only updates Cytoscape geometry:

* `node.position({ x, y })`

Correct approach:

* `win.Cypress.test.dragNodeDelta(nodeId, dx, dy)`

A correct drag test validates both:

* geometry moved (Cytoscape)
* model updated (`commonService.session.data.nodes[*].x/y`)

```ts
cy.window().then(win => {
  const after = win.Cypress.test.dragNodeDelta('MZ740979', 100, 50);
  expect(after, 'drag helper returned a position').to.not.be.null;

  const backing =
    win.commonService.session.data.nodes.find((n: any) => n._id === 'MZ740979');
  expect(backing.x).to.be.closeTo(after.x, 1);
  expect(backing.y).to.be.closeTo(after.y, 1);
});
```

### Selection caveats

Two selection pathways exist:

* Cytoscape-only selection (visual state only)

  * `node.select()`
  * Assert with `cyInstance.elements(':selected')`

* App-model-driven selection (preferred when testing sync)

  * Set `commonService.session.data.nodes[*].selected`
  * Trigger: `cy.document().trigger('node-selected')`
  * Assert via Cytoscape selection.

```ts
cy.window().then(win => {
  win.commonService.session.data.nodes.forEach((n: any) => (n.selected = false));
  const n = win.commonService.session.data.nodes.find((x: any) => x._id === 'MZ375596');
  n.selected = true;
});

cy.document().trigger('node-selected');

getCy().then(cyInstance => {
  expect(cyInstance.elements(':selected').length).to.equal(1);
});
```

### Layout and rerender caveats

2D can re-layout via:

* `_rerender`
* `_partialUpdate`
* `gatherGroups`
* `fit()`

So position-sensitive tests should:

* assert deltas (not absolute coordinates), or
* use pinned mode, or
* use the drag helper and assert immediately after.

### Tooltips

2D tooltips are currently unstable and should not be required targets for new tests.
Do not generate new tooltip tests unless verified end-to-end.

### TwoD anti-patterns

* Using `cyInstance.nodes()[0]` without sanity checks
* Expecting geometry change from model-only mutation without triggering `node-selected`
* Expecting model change from `node.position(...)` without going through the sync path
* Asserting visual properties from `.data(...)` instead of `.style(...)`
* Clicking/dragging canvas while dialogs are open and expecting pointer events to work

## Phylogenetic Tree view (D3 + SVG) notes

* The rendered tree lives under `#phylocanvas svg`.
* Many assertions should be DOM-based:

  * leaf node circles: `#phylocanvas svg g.tidytree-node-leaf circle`
  * leaf labels: `#phylocanvas svg g.tidytree-node-leaf text`
* Settings patterns

  * Open settings via `#tool-btn-container-phylo a[title="Settings"]`
  * Use dialog title `Phylogenetic Tree Settings` to scope actions.
* Export patterns

  * Open export via `#tool-btn-container-phylo a[title="Export Screen"]`
  * Assert downloaded files in `cypress/downloads/*` when the export writes files.

## Map view (Leaflet) notes

* The view container is `.mapStyle`.
* Map rendering depends on Leaflet layers and sometimes online tiles.
* Prefer offline or internal-state assertions for stability

  * Example: assert values under `window.commonService.session.style.widgets.*` or `window.commonService.visuals.gisMap.*` after toggles.
* Avoid enabling Basemap or Satellite in tests unless you control network stability

  * Those layers download tiles from the internet and can be flaky in CI or sandboxed environments.
