# Table View Visual Regression Plan

## Goal

Add low-noise visual regression coverage for the Table view without turning normal UI iteration into snapshot churn.

This is not meant to replace the existing Table functional Cypress suite. It is meant to catch layout and styling regressions that the current assertions do not see.

## Fit With The Current Repo

- The repo already runs Cypress reliably in local Chrome mode.
- The repo does not currently include a screenshot-diff plugin such as `cypress-image-snapshot` or Percy.
- `cypress.config.ts` already registers custom node tasks, so a small local screenshot-compare task can be added there later.
- Add a maintained screenshot-diff dependency only when this visual comparison task is implemented.

## Low-Noise Rules

Visual coverage should follow these constraints:

- Run only in headless Chrome, not Electron.
- Use one fixed viewport for all Table screenshots.
- Use deterministic uploaded fixtures only.
- Capture the Table container, not the whole app shell.
- Avoid loading spinners, active typing carets, hover-only states, and transient notifications.
- Prefer stable states with a fixed row count.
- Keep the baseline set small and high-signal.

If a state is intentionally redesigned, the baseline for that state should be updated in the same PR.

## Recommended Scope

### Tier 1: Required Maintained Snapshots

These are the snapshots worth keeping green on normal product work:

1. `table-node-default`
- Fixture: `Cypress_MapColorNodes.csv` + `Cypress_MapColorLinks.csv`
- State: Table opened on `Node`, default columns, default paginator
- Purpose: catches general layout drift, header alignment, filter row breakage, paginator drift

2. `table-node-filtered`
- Fixture: same uploaded node/link pair
- State: `Node` table filtered to `Id = D`
- Purpose: catches filter row layout, empty-column collapse, row-height and cell-wrapping regressions

3. `table-node-selected`
- Fixture: same uploaded node/link pair
- State: selected node promoted to the top after filter clear
- Purpose: catches selected-row styling and row-order presentation regressions

4. `table-link-dataset`
- Fixture: same uploaded node/link pair
- State: switched to `Link`
- Purpose: catches dataset-switch layout issues and link-column rendering regressions

5. `table-cluster-dataset`
- Fixture: same uploaded node/link pair
- State: switched to `Cluster`
- Purpose: catches cluster-table rendering drift and singleton/summary row presentation issues

### Tier 2: Optional Snapshots

Add these only if Tier 1 stays stable:

6. `table-settings-dialog`
- State: Table settings dialog open
- Purpose: catches dialog alignment and control regressions

7. `table-export-dialog`
- State: export dialog open
- Purpose: catches modal layout and button regressions

8. `table-empty-state`
- Fixture: no uploaded data
- Purpose: catches empty-state layout regressions

9. `table-long-text-wrap`
- Fixture: a deterministic dataset with wrapped cell text
- Purpose: catches row-height and overflow regressions

## States To Avoid Snapshotting

These are poor candidates for maintained visual baselines:

- Typing in progress
- Hover-only states
- Download/export completion states
- Paginator `All` on large tables
- Browser-dependent focus rings unless explicitly normalized
- Anything relying on dynamic timestamps, generated filenames, or external rendering timing

## Proposed Test Structure

Create one dedicated spec:

- `cypress/e2e/view-state/table-visual.cy.ts`

Use one helper layer:

- `cypress/support/table-visual-helpers.ts`

Keep visual setup separate from functional setup so the existing Table journeys stay behavior-focused.

## Proposed Baseline Storage

- Baselines: `cypress/snapshots/table/`
- Actuals on failure: `cypress/snapshots/__actual__/`
- Diffs on failure: `cypress/snapshots/__diff__/`

Each baseline should use a stable name matching the state:

- `table-node-default.png`
- `table-node-filtered.png`
- `table-node-selected.png`
- `table-link-dataset.png`
- `table-cluster-dataset.png`

## Comparison Strategy

Recommended later implementation:

1. Use `cy.get('.table-wrapper').screenshot('<state-name>')` for the captured element.
2. Add a custom Cypress task that compares the screenshot against the baseline.
3. Fail when the pixel diff exceeds a small threshold.
4. Save actual and diff images only on failure.

Threshold guidance:

- Start with a small percentage threshold, not exact pixel equality.
- Keep thresholds tighter for Tier 1 than Tier 2.
- Revisit threshold only after observing real noise, not preemptively.

## Stability Controls

Before taking a screenshot, every visual spec should:

- set a fixed viewport
- load a deterministic fixture
- wait for Table readiness
- wait for fonts and dialogs to settle
- blur any active input
- avoid caret visibility in filter inputs
- ensure no loading overlay is present

If needed, a lightweight test-only style hook can be added to disable transitions and blinking carets during visual runs.

## PR Policy

When a Table UI change is intentional:

- update the relevant visual baseline in the same PR
- inspect the diff output manually
- avoid bulk re-approving all snapshots unless the UI intentionally changed across all states

When a Table UI change is not intentional:

- treat the diff as a regression and fix the UI or the unstable test setup

## Recommended Rollout

### Phase 1

Add Tier 1 only:

- `table-node-default`
- `table-node-filtered`
- `table-node-selected`
- `table-link-dataset`
- `table-cluster-dataset`

Run them only in headless Chrome.

### Phase 2

If Phase 1 stays stable for a few PRs, add:

- `table-settings-dialog`
- `table-export-dialog`
- `table-empty-state`

### Phase 3

Only if there is product value:

- long-text wrapping case
- responsive/mobile-specific Table snapshot states

## Recommendation

Start with five Table container snapshots in Chrome only. That gives useful layout protection without creating a maintenance burden, and it matches the repo's current Cypress setup better than introducing a heavier visual SaaS flow.
