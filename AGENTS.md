# Repository Instructions

## UI Debugging Workflow

When debugging UI behavior, use Playwright MCP as a general-purpose browser agent.

1. Start the local development server with `npm start`.
2. Open `http://localhost:4200`.
3. Navigate through the affected flow and inspect the page with browser automation:
   - click, type, and navigate like a user
   - inspect DOM and accessibility state
   - read console and network errors
   - take screenshots when visual state matters
   - run ad hoc browser-side code only when it clarifies the bug
4. Patch the app based on observed behavior.
5. Reload and verify the fix in the browser.
6. Run the relevant Cypress spec or suite afterward for regression coverage.

Use Cypress for repeatable regression and end-to-end test verification, not as the first tool for exploratory UI debugging.

Useful Cypress commands:

- `npm run e2e` starts the local Cypress server on `http://127.0.0.1:4210` and runs the full local Chrome journey suite.
- `npm run e2e:journeys:spec:local -- --spec "cypress/e2e/path/to/spec.cy.ts"` runs a targeted local spec against `http://127.0.0.1:4210`.
- `npm run e2e:journeys:flows:local:chrome` runs ingestion and journey flow specs.
- `npm run e2e:journeys:view-state:local:chrome` runs view-state specs.
- `npm run e2e:journeys:contracts:local:chrome` runs contract-mode specs.
