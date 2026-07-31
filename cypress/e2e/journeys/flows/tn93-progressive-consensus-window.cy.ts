/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertHeatmapReady,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  openGlobalFilteringTab,
  setGlobalDistanceMetric,
  setGlobalLinkThreshold,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type QueuedBackgroundStart = {
  runId: number;
  start: () => void;
};

type ProgressiveTn93Control = {
  queued: QueuedBackgroundStart[];
  startedRunIds: number[];
  release: (runId: number) => void;
};

type Tn93Status = {
  runId: number;
  phase: string;
  computedPairs: number;
  candidatePairs: number;
  totalPairs: number;
  provisional: boolean;
};

type WinWithProgressiveTn93 = Window & {
  commonService: any;
  __mtProgressiveTn93?: ProgressiveTn93Control;
};

const TOTAL_PAIRS = 5356;
const INITIAL_CANDIDATE_PAIRS = 2990;
const INITIAL_THRESHOLD = 0.12;
const PROMOTED_THRESHOLD = 0.122;
const SOURCE_ID = 'counterexample-source-01';
const TARGET_ID = 'counterexample-target-01';

const profile: DatasetProfile = {
  id: 'tn93-progressive-consensus-window-counterexample',
  title: 'Progressive TN93 consensus-window counterexample',
  tags: ['tn93', 'fasta', 'progressive', 'counterexample'],
  files: [{
    name: 'TN93_Progressive_Counterexample_104.fasta',
    datatype: 'fasta',
  }],
  preLaunch: {
    metric: 'tn93',
    threshold: INITIAL_THRESHOLD,
    defaultView: '2D Network',
  },
  expectations: {},
};

const getTn93Status = (win: WinWithProgressiveTn93): Tn93Status | null => (
  win.commonService.visuals?.microbeTrace?.tn93DistanceStatus || null
);

const findCounterexampleLink = (win: WinWithProgressiveTn93): any => (
  win.commonService.session.data.links.find((link: any) => (
    (link.source === SOURCE_ID && link.target === TARGET_ID)
    || (link.source === TARGET_ID && link.target === SOURCE_ID)
  ))
);

/**
 * Hold only the start-background callback returned by the production
 * coordinator. Planning, foreground computation, batching, acknowledgement,
 * merging, rendering, promotion, cancellation, and completion remain on the
 * real application paths.
 */
const installBackgroundHold = (): void => {
  cy.window().then((rawWin: unknown) => {
    const win = rawWin as WinWithProgressiveTn93;
    const coordinator = win.commonService.workerComputeService;
    const startJob = coordinator.startTn93DistanceJob.bind(coordinator);
    const control: ProgressiveTn93Control = {
      queued: [],
      startedRunIds: [],
      release(runId: number) {
        const index = this.queued.findIndex((entry) => entry.runId === runId);
        if (index < 0) {
          throw new Error(`No held TN93 background start exists for run ${runId}.`);
        }
        const [entry] = this.queued.splice(index, 1);
        entry.start();
      },
    };

    coordinator.startTn93DistanceJob = async (options: any) => {
      const result = await startJob({
        ...options,
        batchSize: 256,
        chunkSize: 256,
        maxInFlightBatches: 1,
      });
      const startBackground = result.startBackground;
      let queued = false;

      control.startedRunIds.push(result.runId);
      result.startBackground = () => {
        if (queued) return;
        queued = true;
        control.queued.push({
          runId: result.runId,
          start: startBackground,
        });
      };
      return result;
    };

    win.__mtProgressiveTn93 = control;
  });
};

const waitForHeldProvisionalRun = (): void => {
  cy.get('#tn93-distance-progress', { timeout: 60000 })
    .should('be.visible')
    .and('contain.text', 'TN93 network is provisional')
    .and('contain.text', `of ${TOTAL_PAIRS.toLocaleString()} dyads computed`);

  cy.window({ timeout: 60000 }).should((rawWin: unknown) => {
    const win = rawWin as WinWithProgressiveTn93;
    const status = getTn93Status(win);
    const heldRunIds = (win.__mtProgressiveTn93?.queued || [])
      .map((entry) => entry.runId);

    expect(status, 'TN93 status').to.exist;
    expect(status?.provisional, 'provisional status').to.equal(true);
    expect(status?.phase, 'held phase').to.equal('provisional');
    expect(status?.computedPairs, 'foreground pairs').to.equal(INITIAL_CANDIDATE_PAIRS);
    expect(status?.candidatePairs, 'candidate pairs').to.equal(INITIAL_CANDIDATE_PAIRS);
    expect(status?.totalPairs, 'eventual pairs').to.equal(TOTAL_PAIRS);
    expect(heldRunIds, 'held background run ids').to.include(status?.runId);
  });
};

const launchWithHeldBackground = (): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  installBackgroundHold();
  launchAndWaitForProcessing(60000);
  ensureTwoDNetworkView();
  waitForHeldProvisionalRun();
};

const currentRunId = (): Cypress.Chainable<number> => (
  cy.window().then((rawWin: unknown) => {
    const status = getTn93Status(rawWin as WinWithProgressiveTn93);
    expect(status, 'current TN93 status').to.exist;
    return Number(status?.runId);
  })
);

const releaseRun = (runId: number): void => {
  cy.window().then((rawWin: unknown) => {
    const win = rawWin as WinWithProgressiveTn93;
    expect(win.__mtProgressiveTn93, 'TN93 test control').to.exist;
    win.__mtProgressiveTn93?.release(runId);
  });
};

const waitForExactCompletion = (runId: number): void => {
  cy.window({ timeout: 60000 }).should((rawWin: unknown) => {
    const win = rawWin as WinWithProgressiveTn93;
    const status = getTn93Status(win);

    expect(status?.runId, 'completed run id').to.equal(runId);
    expect(status?.phase, 'completed phase').to.equal('complete');
    expect(status?.provisional, 'exact status').to.equal(false);
    expect(status?.computedPairs, 'computed all pairs').to.equal(TOTAL_PAIRS);
    expect(win.commonService.session.data.links, 'complete TN93 matrix')
      .to.have.length(TOTAL_PAIRS);
  });
  cy.get('#tn93-distance-progress').should('not.exist');
};

describe('Journey Flow - progressive TN93 consensus window', () => {
  it('renders a provisional network, gates Heatmap, and restores a deferred qualifying edge at exact completion', () => {
    launchWithHeldBackground();

    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithProgressiveTn93;
      expect(findCounterexampleLink(win), 'deferred qualifying pair before completion')
        .not.to.exist;
    });

    openGlobalFilteringTab();
    cy.get('[data-testid="threshold-stability-toggle"]')
      .scrollIntoView()
      .click({ force: true });
    cy.get('[data-testid="threshold-stability-panel"]')
      .should('contain.text', 'Threshold stability will be available after all TN93 pairwise distances finish.');
    cy.closeGlobalSettings();

    cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
    cy.contains('button[mat-menu-item]', 'Heatmap', { timeout: 15000 }).click({ force: true });
    cy.get('#heatmap', { timeout: 15000 }).should('be.visible');
    cy.get('#heatmap svg.main-svg').should('not.exist');

    currentRunId().then((runId) => {
      releaseRun(runId);
      assertHeatmapReady(60000);
      waitForExactCompletion(runId);
    });

    cy.window().should((rawWin: unknown) => {
      const link = findCounterexampleLink(rawWin as WinWithProgressiveTn93);

      expect(link, 'deferred qualifying pair after exact completion').to.exist;
      expect(Number(link.distance), 'counterexample TN93 distance')
        .to.be.at.most(INITIAL_THRESHOLD);
      expect(link.visible, 'counterexample link visibility').to.equal(true);
    });
  });

  it('prioritizes newly window-eligible pairs for a higher threshold and reuses them for a lower threshold', () => {
    launchWithHeldBackground();

    currentRunId().then((runId) => {
      openGlobalFilteringTab();
      setGlobalLinkThreshold(PROMOTED_THRESHOLD);

      cy.window({ timeout: 30000 }).should((rawWin: unknown) => {
        const win = rawWin as WinWithProgressiveTn93;
        const status = getTn93Status(win);
        const revision = win.commonService.store.networkDataRevisionValue;
        const link = findCounterexampleLink(win);

        expect(status?.runId, 'promotion stays on the active run').to.equal(runId);
        expect(status?.provisional, 'promotion remains provisional').to.equal(true);
        expect(status?.computedPairs, 'promoted computed count')
          .to.be.greaterThan(INITIAL_CANDIDATE_PAIRS);
        expect(revision?.reason, 'revision milestone').to.equal('threshold-promotion');
        expect(link, 'newly window-eligible counterexample pair').to.exist;
        expect(link.visible, 'promoted pair visibility').to.equal(true);
      });

      cy.window().then((rawWin: unknown) => {
        const status = getTn93Status(rawWin as WinWithProgressiveTn93);
        cy.wrap(status?.computedPairs, { log: false }).as('computedAfterPromotion');
      });

      setGlobalLinkThreshold(0.1);
      cy.get('@computedAfterPromotion').then((computedAfterPromotion) => {
        cy.window().should((rawWin: unknown) => {
          const win = rawWin as WinWithProgressiveTn93;
          const status = getTn93Status(win);
          const link = findCounterexampleLink(win);

          expect(status?.runId, 'lower threshold reuses the active run').to.equal(runId);
          expect(status?.computedPairs, 'lower threshold adds no work')
            .to.equal(Number(computedAfterPromotion));
          expect(link, 'promoted distance stays cached').to.exist;
          expect(link.visible, 'pair is hidden below its distance').to.equal(false);
        });
      });
      cy.closeGlobalSettings();

      releaseRun(runId);
      waitForExactCompletion(runId);
    });
  });

  it('cancels a held run on metric change and isolates a subsequent TN93 relaunch from the stale release', () => {
    launchWithHeldBackground();

    currentRunId().then((firstRunId) => {
      openGlobalFilteringTab();
      setGlobalDistanceMetric('snps');
      cy.closeGlobalSettings();

      cy.get('#tn93-distance-progress').should('not.exist');
      cy.window({ timeout: 60000 }).should((rawWin: unknown) => {
        const win = rawWin as WinWithProgressiveTn93;

        expect(
          win.commonService.session.style.widgets['default-distance-metric'],
          'active metric',
        ).to.equal('snps');
        expect(win.commonService.session.data.links, 'exhaustive SNP matrix')
          .to.have.length(TOTAL_PAIRS);
        expect(
          win.commonService.workerComputeService
            .getTn93CoordinatorTelemetry().cancelledJobs,
          'cancelled progressive runs',
        ).to.be.greaterThan(0);
      });

      openGlobalFilteringTab();
      setGlobalDistanceMetric('tn93');
      cy.closeGlobalSettings();

      cy.get('#tn93-distance-progress', { timeout: 60000 }).should('be.visible');
      cy.window({ timeout: 60000 }).should((rawWin: unknown) => {
        const win = rawWin as WinWithProgressiveTn93;
        const status = getTn93Status(win);
        const heldRunIds = (win.__mtProgressiveTn93?.queued || [])
          .map((entry) => entry.runId);

        expect(status?.provisional, 'relaunched TN93 status').to.equal(true);
        expect(status?.runId, 'new TN93 run id').to.be.greaterThan(firstRunId);
        expect(heldRunIds, 'old and new held starts')
          .to.include.members([firstRunId, status?.runId]);
      });

      currentRunId().then((secondRunId) => {
        cy.window().then((rawWin: unknown) => {
          const status = getTn93Status(rawWin as WinWithProgressiveTn93);
          cy.wrap(status?.computedPairs, { log: false }).as('relaunchedComputedPairs');
        });

        // The old closure belongs to a terminated coordinator job and must be
        // a no-op even after a newer run is active.
        releaseRun(firstRunId);
        cy.get('@relaunchedComputedPairs').then((computedPairs) => {
          cy.window().should((rawWin: unknown) => {
            const status = getTn93Status(rawWin as WinWithProgressiveTn93);
            expect(status?.runId, 'stale release cannot replace active run')
              .to.equal(secondRunId);
            expect(status?.computedPairs, 'stale release cannot merge work')
              .to.equal(Number(computedPairs));
            expect(status?.provisional, 'new run remains held').to.equal(true);
          });
        });

        releaseRun(secondRunId);
        waitForExactCompletion(secondRunId);
      });
    });
  });
});
