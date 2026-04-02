import { defineConfig } from "cypress";
import * as fs from 'fs';
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
      on('before:browser:launch', (browser, launchOptions) => {
        const userDataDir = config.env.benchmarkChromeUserDataDir;
        if (!userDataDir || browser.family !== 'chromium') {
          return launchOptions;
        }

        fs.mkdirSync(userDataDir, { recursive: true });
        launchOptions.args = (launchOptions.args || []).filter(
          (arg) => !arg.startsWith('--user-data-dir='),
        );
        launchOptions.args.push(`--user-data-dir=${userDataDir}`);

        if (!launchOptions.args.includes('--enable-precise-memory-info')) {
          launchOptions.args.push('--enable-precise-memory-info');
        }

        return launchOptions;
      });

      registerOracleTasks(on);
      return config;
    },
  },
});
