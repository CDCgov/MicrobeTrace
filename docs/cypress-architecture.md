# Cypress Architecture

Current on `cypressTesting` as of 2026-03-10.

This is the maintained Cypress structure for MicrobeTrace. It exists to keep uploaded-data end-to-end coverage, pure view-mechanics coverage, and retired legacy specs clearly separated.

## Maintained Layers

### 1. Ingestion Flows

- Path: `cypress/e2e/ingestion/`
- Purpose: file-upload and file-settings behavior that should stay independent from the full 2D behavior matrix
- Data source: real fixtures loaded through the Files view

Use this layer for:

- file attach and remove behavior
- datatype detection and remapping
- file settings dialog behavior

### 2. Journey Flows

- Path: `cypress/e2e/journeys/flows/`
- Purpose: uploaded-data end-to-end coverage
- Data source: real fixtures loaded through the Files view
- Assertion style:
  - visible DOM stats
  - rendered Cytoscape state
  - `observed` vs `intended` expectations where current product behavior is known to differ

Use this layer for:

- file-type load coverage
- filtering behavior
- styling behavior
- grouping behavior
- cross-feature combinations

### 3. View-State Flows

- Path: `cypress/e2e/view-state/`
- Purpose: fast checks for 2D interaction mechanics that do not need uploaded-data permutations
- Data source: sample dataset or intentionally seeded state
- Assertion style:
  - rendered Cytoscape state
  - visible control behavior
  - backing model checks only when the view behavior depends on them

Use this layer for:

- pinning and relayout mechanics
- gridlines and neighbor highlighting
- label, tooltip, and layout control mechanics
- drag interactions

### 4. Legacy-Disabled Specs

- Path: `cypress/e2e/legacy-disabled/`
- Purpose: preserve stale or fixture-broken specs without letting them silently contaminate the maintained suite
- Run behavior: excluded by `cypress.config.ts` through `excludeSpecPattern`

Move a spec here when:

- it depends on fixtures that no longer exist
- it relies on obsolete UI structure
- it duplicates maintained coverage and is no longer authoritative

Do not leave broken legacy specs under active `*.cy.ts` paths.

## Support Layer

- `cypress/e2e/journeys/datasets/`
  - profile registry and typed expectations for uploaded-data journeys
- `cypress/support/journey-helpers.ts`
  - shared UI-driven helpers for launching profiles and asserting 2D behavior
- `cypress/support/selectors.ts`
  - shared `data-testid` selectors for stable Cypress targeting
- `docs/2d-network-cypress-bug-log.csv`
  - bug and deviation log for product behavior that Cypress exposes

## Selector Rules

- Prefer `data-testid` selectors for:
  - dialog open buttons
  - top-level navigation actions
  - high-risk filtering controls
  - 2D toolbar controls
- Keep raw text selectors only for dynamic option labels where the app does not yet expose a stable hook.

## Reliability Rules

- No new `cy.wait(<number>)` in maintained specs.
- Prefer retryable assertions over one-shot reads when UI state is expected to change.
- Use `commonService` as a cross-check, not the primary source of truth, for user-visible 2D behavior.
- Prelaunch session mutation is allowed only as a narrow fallback inside shared helpers when the UI does not fully persist launch settings yet.
- When a maintained journey exposes a product bug, record it in `docs/2d-network-cypress-bug-log.csv` with the observed behavior, intended behavior if known, the spec that caught it, and the regression specs that must stay green after a fix.
- New bug-log rows pushed to GitHub automatically open GitHub issues through `.github/workflows/bug-tracker-issues.yml`. Set the repository variable `BUG_TRACKER_ASSIGNEE` to force assignment to a specific GitHub login; otherwise the workflow assigns the issue to the push actor.

## Maintained Commands

Use direct Cypress commands for the maintained buckets:

- Preferred wrapper scripts:

  - `npm run e2e:journeys:flows`
  - `npm run e2e:journeys:view-state`
  - `npm run e2e:journeys:contracts`
  - `npm run e2e:journeys:all`
  - Local host equivalents (recommended for manual runs): 
    - `npm run start:local-cypress`
    - `npm run e2e`
    - `npm run e2e:journeys:flows:local`
    - `npm run e2e:journeys:flows:local:chrome`
    - `npm run e2e:journeys:view-state:local`
    - `npm run e2e:journeys:view-state:local:chrome`
    - `npm run e2e:journeys:contracts:local`
    - `npm run e2e:journeys:contracts:local:chrome`
    - `npm run e2e:journeys:all:local:chrome`
    - `npm run e2e:journeys:all:local`
    - single-spec debug: `npm run e2e:journeys:spec:local -- --spec cypress/e2e/ingestion/files-ui.cy.ts`

  - If your environment already runs a local app, pass your own base URL:
    - `npm run e2e:journeys:flows:local -- --config baseUrl=http://127.0.0.1:4211`

  Raw command equivalents:

- Maintained ingestion:
  - `npx cypress run --headless --browser electron --spec cypress/e2e/ingestion/files-ui.cy.ts`
- Maintained journeys:
  - `npx cypress run --headless --browser electron --spec cypress/e2e/ingestion/files-ui.cy.ts,cypress/e2e/journeys/flows/*.cy.ts`
- Maintained 2D view-state:
  - `npx cypress run --headless --browser electron --spec cypress/e2e/view-state/twod-view.cy.ts`
- Contracts:
  - `npx cypress run --headless --browser electron --env contractMode=1 --spec cypress/e2e/journeys/flows/behavior-contracts.cy.ts,cypress/e2e/journeys/flows/nearest-neighbor-angulartesting.contract.cy.ts`

Local default equivalents (same suites with fixed local base URL):

- `npx cypress run --headless --browser electron --config baseUrl=http://127.0.0.1:4210 --spec cypress/e2e/ingestion/files-ui.cy.ts,cypress/e2e/journeys/flows/*.cy.ts`
- `npx cypress run --headless --browser electron --config baseUrl=http://127.0.0.1:4210 --spec cypress/e2e/view-state/twod-view.cy.ts`
- `npx cypress run --headless --browser electron --config baseUrl=http://127.0.0.1:4210 --env contractMode=1 --spec cypress/e2e/journeys/flows/behavior-contracts.cy.ts,cypress/e2e/journeys/flows/nearest-neighbor-angulartesting.contract.cy.ts`

## Migration Rules

When adding new 2D coverage:

1. Put uploaded-data behavior in `journeys/flows`.
2. Put pure control mechanics in `view-state`.
3. Add or update `data-testid` hooks before leaning on brittle text selectors.
4. Update:
   - `docs/2d-network-cypress-checklist.md`
   - `docs/2d-network-cypress-qa-tracker.csv`
   - `docs/2d-network-cypress-bug-log.csv` if the new flow surfaces or fixes a product bug
5. If a legacy spec is being replaced, move it to `legacy-disabled` or delete it if git history is enough and no quarantine value remains.
