import { defineConfig } from "cypress";
import { registerOracleTasks } from "./cypress/oracle/task";

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    viewportWidth: 1280,
    viewportHeight: 720,
    specPattern: [
      'cypress/e2e/ingestion/**/*.cy.ts',
      'cypress/e2e/journeys/flows/**/*.cy.ts',
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
    },
    setupNodeEvents(on, config) {
      registerOracleTasks(on);
      return config;
    },
  },
});
