/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

type HeapSnapshot = {
  label: string;
  supported: boolean;
  sampleTimeMs: number;
  usedJSHeapSize: number | null;
  totalJSHeapSize: number | null;
  jsHeapSizeLimit: number | null;
};

type PageMemorySnapshot = {
  label: string;
  supported: boolean;
  sampleTimeMs: number;
  bytes: number | null;
  error: string | null;
};

type StorageSnapshot = {
  label: string;
  supported: boolean;
  sampleTimeMs: number;
  quotaBytes: number | null;
  usageBytes: number | null;
  indexedDbBytes: number | null;
  cachesBytes: number | null;
  serviceWorkerRegistrationsBytes: number | null;
  otherBytes: number | null;
  error: string | null;
};

type BenchmarkReport = {
  dataset: string;
  generatedAt: string;
  browser: {
    name: string;
    channel: string;
    isHeaded: boolean;
    userAgent: string | null;
  };
  files: {
    nodePath: string;
    linkPath: string;
    nodeFile: string;
    linkFile: string;
  };
  expected: {
    nodeCount: number;
    edgeCount: number;
    threshold: number;
    settleMs: number;
    timeoutMs: number;
  };
  navigationTiming: Record<string, number | null>;
  timingsMs: Record<string, number | null>;
  counters: Record<string, number | null>;
  heapSnapshots: HeapSnapshot[];
  pageMemorySnapshots: PageMemorySnapshot[];
  storageSnapshots: StorageSnapshot[];
};

type FileDatatype = 'node' | 'link';

type RowField = {
  index: 1 | 2 | 3;
  value: string;
};

const getRequiredEnv = (key: string): string => {
  const value = Cypress.env(key);
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing Cypress env ${key} for network budget harness`);
  }
  return String(value);
};

const getRequiredNumberEnv = (key: string): number => {
  const raw = getRequiredEnv(key);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric Cypress env ${key}, received ${raw}`);
  }
  return parsed;
};

const basename = (value: string): string => {
  const segments = value.split(/[\\/]/).filter(Boolean);
  return segments.length ? segments[segments.length - 1] : value;
};

const parseMetricCount = (value: string): number => {
  const parsed = Number.parseInt(String(value).replace(/,/g, '').trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unable to parse metric count from "${value}"`);
  }
  return parsed;
};

const readHeapSnapshot = (label: string) => {
  return cy.window({ log: false }).then((win: any): HeapSnapshot => {
    const memory = win?.performance?.memory;
    const sampleTimeMs = Number(win.performance.now().toFixed(3));

    return {
      label,
      supported: Boolean(memory),
      sampleTimeMs,
      usedJSHeapSize: memory?.usedJSHeapSize ?? null,
      totalJSHeapSize: memory?.totalJSHeapSize ?? null,
      jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? null,
    };
  });
};

const readPageMemorySnapshot = (label: string) => {
  return cy.window({ log: false }).then(async (win: any): Promise<PageMemorySnapshot> => {
    const sampleTimeMs = Number(win.performance.now().toFixed(3));
    const measureMemory = win?.performance?.measureUserAgentSpecificMemory;

    if (typeof measureMemory !== 'function') {
      return {
        label,
        supported: false,
        sampleTimeMs,
        bytes: null,
        error: 'measureUserAgentSpecificMemory unavailable',
      };
    }

    try {
      const result = await measureMemory.call(win.performance);
      return {
        label,
        supported: true,
        sampleTimeMs,
        bytes: result?.bytes ?? null,
        error: null,
      };
    } catch (error: any) {
      return {
        label,
        supported: false,
        sampleTimeMs,
        bytes: null,
        error: error?.message ?? String(error),
      };
    }
  });
};

const readStorageSnapshot = (label: string) => {
  return cy.window({ log: false }).then(async (win: any): Promise<StorageSnapshot> => {
    const sampleTimeMs = Number(win.performance.now().toFixed(3));
    const storageEstimate = win?.navigator?.storage?.estimate;

    if (typeof storageEstimate !== 'function') {
      return {
        label,
        supported: false,
        sampleTimeMs,
        quotaBytes: null,
        usageBytes: null,
        indexedDbBytes: null,
        cachesBytes: null,
        serviceWorkerRegistrationsBytes: null,
        otherBytes: null,
        error: 'navigator.storage.estimate unavailable',
      };
    }

    try {
      const estimate = await storageEstimate.call(win.navigator.storage);
      const usageDetails = estimate?.usageDetails ?? {};
      const indexedDbBytes = usageDetails.indexedDB ?? usageDetails.indexedDb ?? null;
      const cachesBytes = usageDetails.caches ?? null;
      const serviceWorkerRegistrationsBytes = usageDetails.serviceWorkerRegistrations ?? null;
      const knownUsage = [
        indexedDbBytes,
        cachesBytes,
        serviceWorkerRegistrationsBytes,
      ].filter((value) => Number.isFinite(value))
        .reduce((sum, value) => sum + Number(value), 0);
      const otherBytes = Number.isFinite(estimate?.usage)
        ? Math.max(0, Number(estimate.usage) - knownUsage)
        : null;

      return {
        label,
        supported: true,
        sampleTimeMs,
        quotaBytes: estimate?.quota ?? null,
        usageBytes: estimate?.usage ?? null,
        indexedDbBytes,
        cachesBytes,
        serviceWorkerRegistrationsBytes,
        otherBytes,
        error: null,
      };
    } catch (error: any) {
      return {
        label,
        supported: false,
        sampleTimeMs,
        quotaBytes: null,
        usageBytes: null,
        indexedDbBytes: null,
        cachesBytes: null,
        serviceWorkerRegistrationsBytes: null,
        otherBytes: null,
        error: error?.message ?? String(error),
      };
    }
  });
};

const recordMark = (marks: Record<string, number>, name: string) => {
  return cy.window({ log: false }).then((win) => {
    marks[name] = Number(win.performance.now().toFixed(3));
  });
};

const configureUploadedRow = (
  fileName: string,
  datatype: FileDatatype,
  fields: RowField[],
) => {
  cy.contains('#file-table .file-table-row', fileName, { timeout: 120000 })
    .should('exist')
    .then(($fileRow) => {
      const row = cy.wrap($fileRow);
      const activeType = $fileRow.find('label.active input').attr('data-type');

      if (activeType !== datatype) {
        row.find(`input[data-type="${datatype}"]`).click({ force: true });
      }

      fields.forEach(({ index, value }) => {
        const selectId = `file-${fileName}-field-${index}`;

        cy.wrap($fileRow)
          .find(`select[id="${selectId}"]`)
          .should('exist')
          .then(($select) => {
            const currentValue = String($select.val());
            if (currentValue !== value) {
              cy.wrap($select).select(value, { force: true });
            }
          });

        cy.get(`select[id="${selectId}"]`, { timeout: 120000 }).should('have.value', value);
      });
    });
};

describe('Network Budget Harness', () => {
  let report: BenchmarkReport | null = null;
  let outputPath = '';

  afterEach(() => {
    if (!report || !outputPath) {
      return;
    }

    cy.task(
      'benchmark:writeReport',
      { outputPath, report },
      { log: false },
    );
  });

  it('captures upload, load, render, and memory metrics for a generated node/link network', () => {
    const dataset = getRequiredEnv('benchmarkDataset');
    const nodePath = getRequiredEnv('benchmarkNodeFile');
    const linkPath = getRequiredEnv('benchmarkLinkFile');
    outputPath = getRequiredEnv('benchmarkResultsPath');
    const threshold = getRequiredNumberEnv('benchmarkThreshold');
    const expectedNodeCount = getRequiredNumberEnv('benchmarkExpectedNodes');
    const expectedEdgeCount = getRequiredNumberEnv('benchmarkExpectedLinks');
    const settleMs = getRequiredNumberEnv('benchmarkSettleMs');
    const timeoutMs = getRequiredNumberEnv('benchmarkTimeoutMs');

    const nodeFile = basename(nodePath);
    const linkFile = basename(linkPath);

    const profile: DatasetProfile = {
      id: 'network-budget-harness',
      title: 'Network budget benchmark harness',
      tags: ['benchmark', 'budget'],
      files: [
        { name: nodeFile, datatype: 'node', field1: 'ID' },
        { name: linkFile, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
      ],
      preLaunch: {
        metric: 'tn93',
        threshold,
        defaultView: '2D Network',
      },
      expectations: {},
    };

    report = {
      dataset,
      generatedAt: new Date().toISOString(),
      browser: {
        name: Cypress.browser.name,
        channel: Cypress.browser.channel ?? 'stable',
        isHeaded: Cypress.config('isInteractive'),
        userAgent: null,
      },
      files: {
        nodePath,
        linkPath,
        nodeFile,
        linkFile,
      },
      expected: {
        nodeCount: expectedNodeCount,
        edgeCount: expectedEdgeCount,
        threshold,
        settleMs,
        timeoutMs,
      },
      navigationTiming: {},
      timingsMs: {},
      counters: {},
      heapSnapshots: [],
      pageMemorySnapshots: [],
      storageSnapshots: [],
    };

    const marks: Record<string, number> = {};

    visitAppAndAcceptEula();

    cy.window({ log: false }).then((win: any) => {
      report!.browser.userAgent = win.navigator.userAgent;
      const entry = win.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      report!.navigationTiming = {
        domContentLoadedMs: entry ? Number(entry.domContentLoadedEventEnd.toFixed(3)) : null,
        domInteractiveMs: entry ? Number(entry.domInteractive.toFixed(3)) : null,
        loadEventMs: entry ? Number(entry.loadEventEnd.toFixed(3)) : null,
      };
      report!.timingsMs.pageReadyMs = entry
        ? Number(entry.loadEventEnd.toFixed(3))
        : Number(win.performance.now().toFixed(3));
    });

    readHeapSnapshot('after-page-ready').then((snapshot) => {
      report!.heapSnapshots.push(snapshot);
    });
    readPageMemorySnapshot('after-page-ready').then((snapshot) => {
      report!.pageMemorySnapshots.push(snapshot);
    });
    readStorageSnapshot('after-page-ready').then((snapshot) => {
      report!.storageSnapshots.push(snapshot);
    });

    recordMark(marks, 'datasetStart');

    cy.get('#fileDropRef', { timeout: 15000 }).selectFile([nodePath, linkPath], { force: true });

    recordMark(marks, 'filesSelected');

    configureUploadedRow(nodeFile, 'node', [{ index: 1, value: 'ID' }]);
    configureUploadedRow(linkFile, 'link', [
      { index: 1, value: 'source' },
      { index: 2, value: 'target' },
      { index: 3, value: 'distance' },
    ]);

    applyPreLaunchFileSettings(profile);
    ensurePreLaunchProfileSynced(profile);

    cy.get('#launch', { timeout: 120000 }).should('not.be.disabled');

    recordMark(marks, 'filesReady');

    readHeapSnapshot('after-files-ready').then((snapshot) => {
      report!.heapSnapshots.push(snapshot);
    });
    readPageMemorySnapshot('after-files-ready').then((snapshot) => {
      report!.pageMemorySnapshots.push(snapshot);
    });
    readStorageSnapshot('after-files-ready').then((snapshot) => {
      report!.storageSnapshots.push(snapshot);
    });

    cy.get('#launch', { timeout: 15000 }).click({ force: true });

    recordMark(marks, 'launchClicked');

    cy.window({ timeout: timeoutMs })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    recordMark(marks, 'networkLoaded');

    waitForProcessingDialogToClear(timeoutMs);
    ensureTwoDNetworkView();

    cy.get('#numberOfNodes', { timeout: timeoutMs }).should(($metric) => {
      const count = parseMetricCount($metric.text());
      expect(count, 'visible node count after render').to.equal(expectedNodeCount);
    });

    cy.get('#numberOfVisibleLinks', { timeout: timeoutMs }).should(($metric) => {
      const count = parseMetricCount($metric.text());
      expect(count, 'visible link count after render').to.equal(expectedEdgeCount);
    });

    cy.window({ timeout: timeoutMs }).should((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      expect(cyInstance, 'cytoscapeInstance').to.exist;
      expect(cyInstance.nodes().length, 'cytoscape node count').to.equal(expectedNodeCount);
      expect(cyInstance.edges().length, 'cytoscape edge count').to.equal(expectedEdgeCount);
    });

    recordMark(marks, 'renderReady');

    readHeapSnapshot('after-render-ready').then((snapshot) => {
      report!.heapSnapshots.push(snapshot);
    });
    readPageMemorySnapshot('after-render-ready').then((snapshot) => {
      report!.pageMemorySnapshots.push(snapshot);
    });
    readStorageSnapshot('after-render-ready').then((snapshot) => {
      report!.storageSnapshots.push(snapshot);
    });

    cy.wait(settleMs, { log: false });

    recordMark(marks, 'renderSettled');

    readHeapSnapshot('after-render-settled').then((snapshot) => {
      report!.heapSnapshots.push(snapshot);
    });
    readPageMemorySnapshot('after-render-settled').then((snapshot) => {
      report!.pageMemorySnapshots.push(snapshot);
    });
    readStorageSnapshot('after-render-settled').then((snapshot) => {
      report!.storageSnapshots.push(snapshot);
    });

    cy.window().then((win: any) => {
      report!.counters = {
        sessionNodes: win.commonService.session.data.nodes.length,
        sessionLinks: win.commonService.session.data.links.length,
        domNodes: parseMetricCount(Cypress.$('#numberOfNodes').text()),
        domVisibleLinks: parseMetricCount(Cypress.$('#numberOfVisibleLinks').text()),
        cytoscapeNodes: win.cytoscapeInstance.nodes().length,
        cytoscapeEdges: win.cytoscapeInstance.edges().length,
      };
    });

    cy.then(() => {
      const round = (value: number | undefined) => (
        value === undefined ? null : Number(value.toFixed(3))
      );

      report!.timingsMs.uploadSelectMs = round(marks.filesSelected - marks.datasetStart);
      report!.timingsMs.fileRowsReadyMs = round(marks.filesReady - marks.datasetStart);
      report!.timingsMs.launchToLoadedMs = round(marks.networkLoaded - marks.launchClicked);
      report!.timingsMs.loadedToRenderMs = round(marks.renderReady - marks.networkLoaded);
      report!.timingsMs.renderSettleMs = round(marks.renderSettled - marks.renderReady);
      report!.timingsMs.totalDatasetToRenderMs = round(marks.renderReady - marks.datasetStart);
      report!.timingsMs.totalDatasetToSettledMs = round(marks.renderSettled - marks.datasetStart);
    });

    cy.task(
      'benchmark:writeReport',
      { outputPath, report },
      { log: false },
    ).then((writtenPath) => {
      cy.log(`Benchmark report written to ${writtenPath}`);
    });
  });
});
