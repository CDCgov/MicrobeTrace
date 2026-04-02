/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  openGlobalFilteringTab,
  ensurePreLaunchProfileSynced,
  waitForProcessingDialogToClear,
  launchProfileToTwoD,
  visitAppAndAcceptEula,
  setGlobalLinkThreshold,
  launchAndWaitForProcessing,
  ensureTwoDNetworkView,
  applyPreLaunchFileSettings,
} from '../../../support/journey-helpers';

const buildLargeStarNewick = (leafCount: number): string => {
  const leaves = Array.from({ length: leafCount }, (_, index) => `L${index}:1`);
  return `(${leaves.join(',')});`;
};

const buildDenseStarNewick = (leafCount: number, branchLength: number): string => {
  const leaves = Array.from({ length: leafCount }, (_, index) => `D${index}:${branchLength}`);
  return `(${leaves.join(',')});`;
};

const validNewickProfile = getProfile('load-twod-newick-tn93-angular-testing');
const validAuspiceProfile = getProfile('load-twod-auspice-patristic');
const tinySourceNewickProfile = getProfile('load-twod-newick-tiny-replace-source');
const tinyTargetNewickProfile = getProfile('load-twod-newick-tiny-replace-target');

const malformedNewickProfile = {
  id: 'load-twod-newick-malformed',
  title: 'Load malformed Newick parser failure remains safe',
  tags: ['load-to-twod-newick-error', 'newick', 'malformed'],
  files: [
    {
      name: 'AngularTesting_malformed_Newick.nwk',
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93' as const,
    threshold: 0.015,
    defaultView: '2D Network',
  },
  expectations: {},
};

type InvalidNewickCase = {
  name: string;
  title: string;
  expectedMessageFragments: string[];
};

const invalidNewickCases: InvalidNewickCase[] = [
  {
    name: 'AngularTesting_malformed_Newick.nwk',
    title: 'surfaces malformed Newick parser errors and keeps launch complete state',
    expectedMessageFragments: [
      'Failed to parse Newick',
      'Invalid Newick',
      'Error processing Newick',
    ],
  },
  {
    name: 'AngularTesting_duplicate_leaf_Newick.nwk',
    title: 'surfaces duplicate tip name Newick parser errors and keeps launch complete state',
    expectedMessageFragments: [
      'Duplicate leaf name',
      'requires unique taxa',
      'Error processing Newick',
    ],
  },
  {
    name: 'AngularTesting_negative_branch_Newick.nwk',
    title: 'surfaces negative branch-length Newick errors and keeps launch complete state',
    expectedMessageFragments: [
      'Negative branch length',
      'may indicate a malformed tree',
      'Error processing Newick',
    ],
  },
  {
    name: 'AngularTesting_empty_Newick.nwk',
    title: 'surfaces empty Newick string errors and keeps launch complete state',
    expectedMessageFragments: [
      'Empty Newick',
      'Error processing Newick',
      'Failed to parse Newick',
    ],
  },
];

const buildInvalidNewickProfile = (name: string) => ({
  ...malformedNewickProfile,
  id: `load-twod-newick-${name}`,
  title: `Load invalid Newick file ${name}`,
  files: [
    {
      name,
      datatype: 'newick',
    },
  ],
});

const benchmarkProfile = {
  id: 'load-twod-newick-benchmark',
  title: 'Load synthetic Newick tree benchmark',
  preLaunch: {
    metric: 'tn93' as const,
    threshold: 0,
    defaultView: '2D Network',
  },
  files: [
    {
      name: 'synthetic-benchmark.nwk',
      datatype: 'newick',
    },
  ],
  expectations: {},
};

const runPatristicBenchmark = (leafCount: number, budgetMs: number, targetMs: number) => {
  const fileName = `benchmark-${leafCount}-taxa.nwk`;
  const newick = buildLargeStarNewick(leafCount);

  visitAppAndAcceptEula();

  cy.get('#fileDropRef', { timeout: 15000 }).selectFile(
    {
      contents: Cypress.Buffer.from(newick, 'utf8'),
      fileName,
      mimeType: 'text/plain',
    },
    { force: true }
  );

  cy.contains('#file-table .file-table-row', fileName, { timeout: 15000 }).should('exist').within(() => {
    cy.get('input[data-type="newick"]').click({ force: true });
  });

  applyPreLaunchFileSettings({
    ...benchmarkProfile,
    files: [{ name: fileName, datatype: 'newick' }],
  } as any);
  ensurePreLaunchProfileSynced({
    ...benchmarkProfile,
    files: [{ name: fileName, datatype: 'newick' }],
  } as any);

  let startMs = 0;

  cy.window().then(() => {
    startMs = performance.now();
  });

  cy.get('#launch').should('not.be.disabled');
  launchAndWaitForProcessing(120000);

  ensureTwoDNetworkView();

  cy.window().its('commonService.session.network.isFullyLoaded', { timeout: 120000 }).should('equal', true);
  cy.window().then((win: any) => {
    const elapsedMs = performance.now() - startMs;
    expect(elapsedMs, `benchmark runtime for ${leafCount} taxa`).to.be.lessThan(budgetMs);

    if (elapsedMs > targetMs) {
      cy.log(`Observed ${leafCount} taxa runtime ${elapsedMs.toFixed(0)}ms exceeds target ${targetMs}ms but is under benchmark budget ${budgetMs}ms`);
    } else {
      cy.log(`Benchmark ${leafCount} taxa runtime ${elapsedMs.toFixed(0)}ms`);
    }

    expect(win.commonService.session.data.nodes.length, `${leafCount} leaf nodes from synthetic benchmark`).to.equal(
      leafCount
    );
    expect(win.commonService.session.data.links.length, 'threshold 0 should emit no links before UI filtering').to.equal(0);
  });
};

const runInvalidNewickCase = (newickCase: InvalidNewickCase) => {
  it(newickCase.title, () => {
    const malformedMessages: string[] = [];
    let restoreLoadingMessageUpdated: (() => void) | null = null;

    visitAppAndAcceptEula();
    cy.window().then((win: any) => {
      const store = win?.commonService?.store;
      expect(store, 'shared loading message store should be available').to.exist;
      const originalSetLoadingMessageUpdated = store.setLoadingMessageUpdated.bind(store);
      store.setLoadingMessageUpdated = (message: string) => {
        if (message) {
          malformedMessages.push(message);
        }
        return originalSetLoadingMessageUpdated(message);
      };
      restoreLoadingMessageUpdated = () => {
        store.setLoadingMessageUpdated = originalSetLoadingMessageUpdated;
      };
    });

    const profile = buildInvalidNewickProfile(newickCase.name);
    cy.loadFiles(profile.files);
    applyPreLaunchFileSettings(profile);
    ensurePreLaunchProfileSynced(profile);
    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
    cy.get('#launch').click({ force: true });

    cy.window()
      .its('commonService.session.network.isFullyLoaded', { timeout: 60000 })
      .should('equal', true);

    cy.window().then(() => {
      const hadParserFailureMessage = malformedMessages.some((message) =>
        newickCase.expectedMessageFragments.some((fragment) => message.includes(fragment))
      );
      expect(
        hadParserFailureMessage,
        `invalid Newick input (${newickCase.name}) should emit a Newick processing error message`,
      ).to.equal(true);
      restoreLoadingMessageUpdated?.();
    });

    cy.window().then((win: any) => {
      expect(win.commonService.session.data.nodes.length, 'nodes from malformed newick should be empty')
        .to.equal(0);
      expect(win.commonService.session.data.links.length, 'links from malformed newick should stay empty')
        .to.equal(0);
      expect(win.commonService.session.network.isFullyLoaded).to.equal(true);
    });
  });
};

const assertTwoDVisibleLinkMaterialization = () => {
  cy.window().should((win: any) => {
    const twoD = win?.commonService?.visuals?.twoD;
    expect(twoD, '2D component should be available').to.exist;

    const links = win?.commonService?.session?.data?.links || [];
    const nodes = win?.commonService?.session?.data?.nodes || [];

    expect(links.length, 'patristic data links should be present').to.be.greaterThan(0);
    expect(nodes.length, 'patristic data nodes should be present').to.be.greaterThan(1);

    const visibleCandidate = links.find((link: any) => link.visible);
    expect(visibleCandidate, 'visible patristic link should exist').to.exist;
    if (!visibleCandidate) return;

    const sourceNode = nodes.find((node: any) => node._id === visibleCandidate.source);
    const targetNode = nodes.find((node: any) => node._id === visibleCandidate.target);
    expect(sourceNode, 'visible link source node should exist').to.exist;
    expect(targetNode, 'visible link target node should exist').to.exist;

    const visibleInput = {
      ...visibleCandidate,
      id: `${visibleCandidate.id}-visible-for-materialization`,
      origin: ['Patristic Materialization Test'],
      distanceOrigin: 'Materialization Test',
      hasDistance: true,
    };

    const hiddenCandidate = {
      ...visibleCandidate,
      id: `${visibleCandidate.id}-hidden-for-materialization`,
      visible: false,
      origin: ['Patristic Materialization Test'],
      distanceOrigin: 'Materialization Test',
      hasDistance: true,
    };

    const elements = twoD.mapDataToCytoscapeElements({
      nodes: [sourceNode, targetNode],
      links: [visibleInput, hiddenCandidate],
    }, false);

    expect(elements.edges.length, 'only visible links should become Cytoscape edges').to.equal(1);
    const edgeIds = elements.edges.map((edge: any) => edge.data.id);
    expect(edgeIds.includes(visibleInput.id), 'visible link should be materialized').to.equal(true);
    expect(edgeIds.includes(hiddenCandidate.id), 'hidden link should not be materialized').to.equal(false);
  });
};

const loadPatristicTreeInCurrentSession = (profile: {
  files: { name: string; datatype: 'newick' }[];
  preLaunch: { metric: 'tn93' | 'snps'; threshold: number; defaultView?: string };
}) => {
  cy.loadFiles(profile.files);
  launchAndWaitForProcessing();
  ensureTwoDNetworkView();
};

describe('Journey Flow - Patristic computation integration', () => {
  it('loads valid Newick inputs and keeps visible parsed-link behavior on 2D', () => {
    launchProfileToTwoD(validNewickProfile);
    assertAfterLaunchCounts(validNewickProfile);
  });

  it('replaces an existing Newick network when loading a different Newick', () => {
    let sourceNodes: string[] = [];
    let sourceLinks = 0;

    visitAppAndAcceptEula();
    loadPatristicTreeInCurrentSession(tinySourceNewickProfile);
    assertAfterLaunchCounts(tinySourceNewickProfile);

    cy.window().then((win: any) => {
      sourceNodes = win.commonService.session.data.nodes.map((node: any) => String(node._id));
      sourceLinks = win.commonService.session.data.links.length;
    });

    cy.wrap(null).then(() => {
      expect(sourceNodes.length).to.equal(3);
      expect(sourceLinks).to.equal(3);
    });

    cy.contains('#file-table .file-table-row', tinySourceNewickProfile.files[0].name, { timeout: 15000 })
      .within(() => {
        cy.get('a[title="Remove this file"]').click({ force: true });
      });
    cy.contains('#file-table .file-table-row', tinySourceNewickProfile.files[0].name).should('not.exist');

    loadPatristicTreeInCurrentSession(tinyTargetNewickProfile);
    assertAfterLaunchCounts(tinyTargetNewickProfile);

    cy.window().then((win: any) => {
      const targetNodes: string[] = win.commonService.session.data.nodes.map((node: any) => String(node._id));
      const targetLinks = win.commonService.session.data.links.length;

      expect(targetNodes.length).to.equal(2);
      expect(targetLinks).to.equal(1);
      expect(targetNodes.some((node: string) => sourceNodes.includes(node))).to.equal(false);
    });
  });

  it('loads valid Auspice inputs and keeps visible patristic-link behavior on 2D', () => {
    launchProfileToTwoD(validAuspiceProfile);
    assertAfterLaunchCounts(validAuspiceProfile);
  });

  it('maps only visible links into Cytoscape elements for patristic sessions', () => {
    launchProfileToTwoD(validNewickProfile);
    assertAfterLaunchCounts(validNewickProfile);
    assertTwoDVisibleLinkMaterialization();
  });

  invalidNewickCases.forEach(runInvalidNewickCase);

  it('can cancel a long-running patristic computation request before completion', () => {
    visitAppAndAcceptEula();

    const largeLeafCount = 35000;
    const largeStarNewick = buildLargeStarNewick(largeLeafCount);

    cy.window().then(async (win: any) => {
      const workerCompute = win?.commonService?.workerComputeService || win?.workerComputeService;
      expect(workerCompute, 'worker compute service should be exposed for cancellation test').to.exist;
      const worker = (workerCompute as any)?.computer?.getPatristicWorker?.();
      expect(worker, 'patristic worker should be available for cancellation test').to.exist;

      const postMessages: any[] = [];
      const originalPostMessage = worker.postMessage.bind(worker);
      worker.postMessage = (message: any, transfer: Transferable[] = []) => {
        postMessages.push(message);
        return originalPostMessage(message, transfer);
      };

      let runSettled = false;
      let linkCount = 0;

      const run = workerCompute.computePatristicEdges(
        largeStarNewick,
        0,
        () => {
          linkCount += 1;
          return 1;
        },
        (value: string) => value,
        {
          origin: ['cypress-patristic-cancel'],
          distanceOrigin: 'cypress-cancel',
        },
      );

      run.then(
        () => {
          runSettled = true;
        },
        () => {
          runSettled = true;
        },
      );

      try {
        await new Promise((resolve) => setTimeout(resolve, 40));
        workerCompute.cancelPatristicJob();

        await new Promise((resolve) => setTimeout(resolve, 600));

        const postedCancel = postMessages.some((message) => message.type === 'CANCEL');
        const postedBuildEdges = postMessages.some((message) => message.type === 'BUILD_EDGES');
        expect(postedCancel, 'cancelPatristicJob should post CANCEL').to.equal(true);
        expect(postedBuildEdges, 'compute should issue BUILD_EDGES before cancel').to.equal(true);
        expect(linkCount, 'canceled compute should not add links before cancellation').to.equal(0);

        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(runSettled, 'canceled compute remains incomplete without terminal worker response').to.equal(false);
      } finally {
        worker.postMessage = originalPostMessage;
        workerCompute.terminatePatristicWorker();
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(linkCount, 'canceled compute does not emit links').to.equal(0);
    });
  });

  it('does not reinitialize patristic tree when Newick threshold is updated in filtering', () => {
    let initPatristicTreeSpy: any = null;
    let buildPatristicEdgesSpy: any = null;

    launchProfileToTwoD(validNewickProfile);
    assertAfterLaunchCounts(validNewickProfile);

    cy.window().then((win: any) => {
      const workerCompute = win?.commonService?.workerComputeService || win?.workerComputeService;
      expect(workerCompute, 'worker compute service should be available').to.exist;
      initPatristicTreeSpy = Cypress.sinon.spy(workerCompute, 'initPatristicTree');
      buildPatristicEdgesSpy = Cypress.sinon.spy(workerCompute, 'buildPatristicEdges');
    });

    openGlobalFilteringTab();
    cy.then(() => {
      initPatristicTreeSpy.resetHistory();
      buildPatristicEdgesSpy.resetHistory();
    });
    setGlobalLinkThreshold(0.05);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    cy.then(() => {
      expect(initPatristicTreeSpy.called, 'threshold update should reuse cached patristic tree').to.equal(false);
      expect(buildPatristicEdgesSpy.called, 'threshold update should request BUILD_EDGES').to.equal(true);

      const buildCall = buildPatristicEdgesSpy
        .getCalls()
        .find((call: any) => Number(call.args[0]) === 0.05);

      expect(buildCall, 'BUILD_EDGES should reflect slider threshold').to.exist;
    });

    cy.then(() => {
      initPatristicTreeSpy?.restore?.();
      buildPatristicEdgesSpy?.restore?.();
      initPatristicTreeSpy = null;
      buildPatristicEdgesSpy = null;
    });
  });

  it('exports a full patristic distance matrix from Heatmap without materializing hidden links', () => {
    const exportProfile = {
      id: 'load-twod-newick-tiny-export-matrix',
      title: 'Load tiny Newick tree for export-only matrix coverage',
      files: [
        {
          name: 'AngularTesting_tiny_export_newick.nwk',
          datatype: 'newick' as const,
        },
      ],
      preLaunch: {
        metric: 'tn93' as const,
        threshold: 0.015,
        defaultView: '2D Network',
      },
      expectations: {},
    };
    const exportFileName = `patristic-distance-matrix-${Date.now()}.csv`;
    const exportPath = `${Cypress.config('downloadsFolder')}/${exportFileName}`;
    let exportMatrixSpy: any = null;

    visitAppAndAcceptEula();
    cy.loadFiles(exportProfile.files);
    applyPreLaunchFileSettings(exportProfile as any);
    ensurePreLaunchProfileSynced(exportProfile as any);
    launchAndWaitForProcessing();
    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      const materializedDistances = win.commonService.session.data.links.map((link: any) => Number(link.distance));
      expect(materializedDistances.length, 'thresholded launch should still materialize some patristic links').to.be.greaterThan(0);
      expect(
        materializedDistances.every((distance: number) => distance <= 0.015),
        'materialized patristic links should all respect the launch threshold',
      ).to.equal(true);
      const workerCompute = win?.commonService?.workerComputeService || win?.workerComputeService;
      expect(workerCompute, 'worker compute service should be available').to.exist;
      exportMatrixSpy = Cypress.sinon.spy(workerCompute, 'exportPatristicDistanceMatrix');
    });

    cy.get('[data-testid="app-view-menu-button"]', { timeout: 15000 }).click({ force: true });
    cy.contains('button[mat-menu-item]', 'Heatmap', { timeout: 15000 }).click({ force: true });
    cy.get('#heatmap', { timeout: 15000 }).should('exist');
    cy.window().then((win: any) => {
      const heatmap = win?.commonService?.visuals?.heatmap;
      expect(heatmap, 'heatmap component should be available').to.exist;
      heatmap.heatmapShowLabels = true;
    });

    cy.then(() => {
      expect(exportMatrixSpy.called, 'opening Heatmap should not trigger export-only matrix mode').to.equal(false);
    });

    cy.get('heatmapcomponent a[title="Export Screen"]', { timeout: 15000 })
      .filter(':visible')
      .first()
      .click({ force: true });
    cy.window().then((win: any) => {
      const heatmap = win?.commonService?.visuals?.heatmap;
      expect(heatmap, 'heatmap component should be available for export').to.exist;
      heatmap.SelectedDistanceMatrixFilenameVariable = exportFileName;
      heatmap.saveDistanceMatrix();
    });

    cy.then(() => {
      expect(exportMatrixSpy.calledOnce, 'heatmap export should use worker-backed full matrix export').to.equal(true);
    });

    cy.readFile(exportPath, { timeout: 20000 }).should((contents: string) => {
      expect(contents).to.contain(',A,B,C');
      expect(contents).to.contain('A,0,0.003,0.0145');
      expect(contents).to.contain('B,0.003,0,0.0155');
      expect(contents).to.contain('C,0.0145,0.0155,0');
    });

    cy.then(() => {
      exportMatrixSpy?.restore?.();
      exportMatrixSpy = null;
    });
  });

  it('caps dense patristic launches by displayed edges instead of blocking on taxa count', () => {
    const leafCount = 150;
    const denseStarNewick = buildDenseStarNewick(leafCount, 0.1);
    const fileName = `dense-star-${leafCount}.nwk`;
    const guardrailMessages: string[] = [];
    let restoreLoadingMessageUpdated: (() => void) | null = null;

    visitAppAndAcceptEula();
    cy.window().then((win: any) => {
      const store = win?.commonService?.store;
      expect(store, 'shared loading message store should be available').to.exist;
      const originalSetLoadingMessageUpdated = store.setLoadingMessageUpdated.bind(store);
      store.setLoadingMessageUpdated = (message: string) => {
        if (message) {
          guardrailMessages.push(message);
        }
        return originalSetLoadingMessageUpdated(message);
      };
      restoreLoadingMessageUpdated = () => {
        store.setLoadingMessageUpdated = originalSetLoadingMessageUpdated;
      };
    });

    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(
      {
        contents: Cypress.Buffer.from(denseStarNewick, 'utf8'),
        fileName,
        mimeType: 'text/plain',
      },
      { force: true }
    );

    cy.contains('#file-table .file-table-row', fileName, { timeout: 15000 }).should('exist').within(() => {
      cy.get('input[data-type="newick"]').click({ force: true });
    });

    applyPreLaunchFileSettings({
      id: 'load-twod-newick-dense-guardrail',
      title: 'Dense star patristic guardrail launch',
      files: [{ name: fileName, datatype: 'newick' as const }],
      preLaunch: {
        metric: 'tn93' as const,
        threshold: 0.21,
        defaultView: '2D Network',
      },
      expectations: {},
    } as any);
    ensurePreLaunchProfileSynced({
      id: 'load-twod-newick-dense-guardrail',
      title: 'Dense star patristic guardrail launch',
      files: [{ name: fileName, datatype: 'newick' as const }],
      preLaunch: {
        metric: 'tn93' as const,
        threshold: 0.21,
        defaultView: '2D Network',
      },
      expectations: {},
    } as any);

    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
    launchAndWaitForProcessing();
    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      const workerCompute = win?.commonService?.workerComputeService || win?.workerComputeService;
      const buildStats = workerCompute.getLastPatristicBuildStats();

      expect(win.commonService.session.data.nodes.length, 'dense star launch should still add all taxa').to.equal(
        leafCount
      );
      expect(
        win.commonService.session.data.links.length,
        'dense star launch should cap displayed patristic edges instead of failing on taxa count',
      ).to.equal(10000);
      expect(buildStats?.maxEdgesReached, 'dense star launch should stop when display cap is reached').to.equal(true);
      expect(buildStats?.totalLeafPairs, 'build stats should still describe the full candidate space').to.equal(11175);

      const emittedGuardrail = guardrailMessages.some((message) =>
        message.includes('Only the first 10,000 qualifying patristic edges will be displayed')
      );
      expect(emittedGuardrail, 'dense star launch should emit a display-cap guardrail message').to.equal(true);

      restoreLoadingMessageUpdated?.();
    });
  });

  it('benchmarks synthetic 500-taxon Newick patristic load path', () => {
    runPatristicBenchmark(500, 8000, 2000);
  });

  it('benchmarks synthetic 1000-taxon Newick patristic load path', () => {
    runPatristicBenchmark(1000, 15000, 5000);
  });

  it('benchmarks synthetic 2000-taxon Newick patristic load path', () => {
    runPatristicBenchmark(2000, 30000, 15000);
  });
});
