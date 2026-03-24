# MicrobeTrace Testing Plan

This file is the current entry point for active testing docs in this repo.

The older generic plan was retired because it no longer matched the codebase or the Cypress-first workflow now used on `cypressTesting`.

## Active Testing Docs

- `docs/cypress-architecture.md`
  - Current maintained Cypress structure, selector rules, and migration rules.
- `docs/2d-network-cypress-checklist.md`
  - Primary checklist for the 2D Network Cypress journey coverage.
- `docs/2d-network-cypress-qa-tracker.csv`
  - QA-facing tracker with priority, status, fixtures, current specs, and next flows.
- `docs/2d-network-cypress-bug-log.csv`
  - Known app bugs or observed-vs-intended deviations surfaced by Cypress, plus the regression specs tied to each one.

## Current Test Layers

- Unit and integration tests
  - Angular component and service tests run through the existing test setup.
- End-to-end tests
  - Cypress is the active E2E framework.
  - File-ingestion coverage lives under `cypress/e2e/ingestion/`.
  - Uploaded-data journeys live under `cypress/e2e/journeys/flows/`.
  - Pure 2D view-state checks live under `cypress/e2e/view-state/`.
- Legacy-disabled specs
  - Retired or fixture-broken Cypress specs live under `cypress/e2e/legacy-disabled/` and are excluded from the maintained suite.
- Contract tests
  - Known observed-vs-intended behavior differences should be tracked in Cypress contract coverage rather than normalized into smoke baselines.

## 2D Network Testing Scope

- Load to 2D from supported file types.
- General Settings filtering behavior.
- General Settings styling behavior.
- 2D settings for nodes, links, layout, and grouping.
- Cross-feature combinations such as filtering plus grouping and filtering plus style.
- Fixture gaps that block high-value automation.

## Update Rules

- Keep `docs/cypress-architecture.md` aligned with the actual folder structure and npm scripts.
- Update `docs/2d-network-cypress-checklist.md` and `docs/2d-network-cypress-qa-tracker.csv` together.
- Update `docs/2d-network-cypress-bug-log.csv` whenever maintained Cypress coverage exposes or resolves a product bug.
- When a journey is added, move its tracker row from `Missing` or `Partial` to `Covered`.
- Add the exact current Cypress spec path in the CSV once coverage exists.
- When current product behavior differs from intended behavior, keep both expectations instead of changing the intended value to make the test pass.
- Document the divergence in `docs/2d-network-cypress-bug-log.csv` and list the spec that caught it plus the specs that must remain green after the fix.
- Track missing fixtures explicitly in the CSV instead of burying them in notes.

## Immediate Priority

- Port the highest-risk sample-data-only 2D setting tests into profile-driven uploaded-data journeys.
- Add uploaded-data 2D link label and link width journeys next.
- Keep new Cypress work inside the maintained `journeys` and `view-state` buckets instead of adding more root-level mixed specs.
