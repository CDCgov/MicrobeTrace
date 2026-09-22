# Sigma Renderer Migration Plan

## Starting point

- Implementation branch: `codex/sigma-migration`
- Base: `origin/dev` at `9317a76938e9f2bfb051c8320061a6f8188f9874`
- Preserved evaluation snapshot: `codex/sigma-evaluation-checkpoint` at `7f07b072`
- Original proof-of-concept branch: `sigma-renderer-poc` at `c1f155845839cc95f98fda13b82dbd564063e487`

The migration branch starts from current `dev`. The proof-of-concept branch is 11 commits ahead of its original base while current `dev` contains 127 commits not present in the proof of concept. The migration will therefore port the validated Sigma work selectively instead of merging the complete proof-of-concept history.

## Target architecture

Sigma becomes the primary renderer for the 2D network view. Renderer-neutral MicrobeTrace behavior remains outside the Sigma adapter, including scientific grouping, node-feature calculations, geographic positions, selection state, accessibility descriptions, export, and saved camera state.

Cytoscape Canvas remains an on-demand compatibility fallback when WebGL 2 is unavailable. It must not be instantiated or retain graph data while Sigma is active. The Cytoscape fallback should be loaded lazily so its JavaScript and renderer state do not add to the normal Sigma memory path.

## Migration sequence

### 1 Renderer foundation

- Add Sigma, Graphology, and their type dependencies to the current Angular 22 dependency tree.
- Port the Sigma adapter and custom WebGL node program.
- Port renderer-neutral graph, grouping, node-feature, geography, export, and view-state modules.
- Run unit tests for each standalone module before component integration.

### 2 Current dev integration

- Integrate the renderer selection boundary into the current `TwoDComponent` rather than replacing the component with its older proof-of-concept version.
- Route loading, rerendering, partial updates, selection, focus, grouping, camera state, export, and teardown through the active renderer.
- Preserve current `dev` behavior added after the proof-of-concept branch diverged.
- Ensure switching or closing the view destroys the active renderer, releases WebGL resources, and removes retained graph references.

### 3 Compatibility fallback

- Make Sigma the normal WebGL 2 path.
- Load Cytoscape Canvas only after an explicit WebGL 2 capability failure.
- Use a reduced or table-only presentation for datasets that are unsafe for Canvas fallback.
- Preserve the loaded dataset and saved-session state if the active WebGL context is lost.

### 4 Regression coverage

- Port shared feature-parity, session-roundtrip, WebGL recovery, startup, lifecycle, and scalability contracts.
- Keep fixtures and assertions that verify identical graph counts, grouping, selection, scientific node features, edge evidence, camera restoration, and export behavior.
- Do not port generated PDF, DOCX, spreadsheet, or screenshot artifacts into the implementation branch.

### 5 Release validation

- Run standalone unit tests after each implementation slice.
- Use Playwright-driven browser inspection for exploratory UI validation.
- Run targeted Cypress contracts after the UI behavior is verified.
- Repeat isolated large-dataset performance and complete-process memory measurements against the integrated Angular 22 build.

## Commit boundaries

1. Sigma dependencies and standalone renderer modules
2. Renderer-neutral state and feature modules
3. `TwoDComponent` integration and lazy Cytoscape fallback
4. Shared regression contracts and fixtures
5. Lifecycle and scalability validation tooling
6. Final documentation and production configuration

Each commit must build and pass its directly affected unit or browser tests. Generated evaluation artifacts remain on the checkpoint branch and are not part of the migration history.

## Conflict strategy

Do not cherry-pick the two unrelated proof-of-concept ancestors for OpenFreeMap and adaptive network rendering. Do not overwrite current `dev` versions of `TwoDComponent`, shared services, Cypress helpers, `package.json`, or `package-lock.json`.

For high-conflict files, compare the merge base, current `dev`, and the evaluation checkpoint; then reapply the Sigma behavior to the current implementation in small sections. Standalone files that do not exist on `dev` can be copied directly from the evaluation checkpoint and tested before integration.
