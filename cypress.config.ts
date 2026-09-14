import { defineConfig } from "cypress";
import { registerOracleTasks } from "./cypress/oracle/task";
import { registerPerformanceTasks } from "./cypress/performance/task";
import { configurePerformanceBrowserMemory } from "./cypress/performance/browser-memory";

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    viewportWidth: 1280,
    viewportHeight: 720,
    specPattern: [
      'cypress/e2e/ingestion/**/*.cy.ts',
      'cypress/e2e/journeys/flows/**/*.cy.ts',
      'cypress/e2e/performance/**/*.perf.cy.ts',
      'cypress/e2e/view-state/**/*.cy.ts',
    ],
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    excludeSpecPattern: ['**/*.legacy.*'],
    retries: {
      runMode: 1,
      openMode: 0,
    },
    env: {
      contractMode: 0,
      perfMode: 0,
      perfStress: 0,
      perfRealSamples: 0,
      perfDunesSamples: 0,
      parityMode: 0,
      treeValidationMode: 0,
    },
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser, launchOptions) => {
        if (config.env.rendererMemory && browser.family === 'chromium') {
          launchOptions.args.push('--js-flags=--expose-gc');
          launchOptions.args.push('--enable-precise-memory-info');
          configurePerformanceBrowserMemory(browser, launchOptions);
        }
        return launchOptions;
      });
      registerOracleTasks(on);
      registerPerformanceTasks(on);
      return config;
    },
  },
});
