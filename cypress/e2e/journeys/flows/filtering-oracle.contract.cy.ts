/// <reference types="cypress" />

import { getProfile, type DatasetProfile } from '../datasets/profile';
import type { OracleComputationResult, OracleManifest, OracleStep } from '../../../oracle/types';

const contractMode =
  Cypress.env('contractMode') === true ||
  Cypress.env('contractMode') === '1' ||
  Cypress.env('contractMode') === 1;

const computeOracle = (manifest: OracleManifest): Cypress.Chainable<OracleComputationResult> => {
  return cy.task<OracleComputationResult>('oracle:compute', manifest, { log: false });
};

const manifestFromProfile = (profile: DatasetProfile, steps: OracleStep[]): OracleManifest => ({
  files: profile.files,
  preLaunch: profile.preLaunch,
  steps,
});

(contractMode ? describe : describe.skip)('Filtering Oracle Contracts', () => {
  it('keeps stable undirected ids and adds epsilon edges along MST paths', () => {
    computeOracle({
      files: [
        {
          name: 'OracleSynthetic_distance_links.csv',
          datatype: 'link',
          field1: 'source',
          field2: 'target',
          field3: 'distance',
        },
      ],
      preLaunch: {
        metric: 'snps',
        threshold: 2,
      },
      steps: [
        { id: 'after-nn', kind: 'set-nearest-neighbor', enabled: true },
        { id: 'after-epsilon', kind: 'set-epsilon', exponent: -1 },
      ],
    }).then((result) => {
      expect(result.snapshots.initial.visibleLinkIds).to.deep.equal([
        'A-B',
        'A-C',
        'A-D',
        'B-C',
        'B-D',
        'C-D',
      ]);
      expect(result.snapshots['after-nn'].visibleLinkIds).to.deep.equal([
        'A-B',
        'B-C',
        'B-D',
        'C-D',
      ]);
      expect(result.snapshots['after-epsilon'].visibleLinkIds).to.deep.equal([
        'A-B',
        'A-C',
        'B-C',
        'B-D',
        'C-D',
      ]);
    });
  });

  it('preserves mixed-origin links through nearest-neighbor and threshold pruning and recomputes counts', () => {
    computeOracle({
      files: [
        {
          name: 'OracleSynthetic_nodes.csv',
          datatype: 'node',
          field1: '_id',
          field2: 'seq',
        },
        {
          name: 'OracleSynthetic_epi_links.csv',
          datatype: 'link',
          field1: 'source',
          field2: 'target',
        },
      ],
      preLaunch: {
        metric: 'snps',
        threshold: 2,
      },
      steps: [
        { id: 'after-nn', kind: 'set-nearest-neighbor', enabled: true },
        { id: 'after-threshold', kind: 'set-threshold', threshold: 1 },
      ],
    }).then((result) => {
      const afterNearestNeighbor = result.snapshots['after-nn'];
      const afterThreshold = result.snapshots['after-threshold'];

      expect(afterNearestNeighbor.visibleLinkIds).to.deep.equal([
        'A-B',
        'A-C',
        'A-E',
        'B-C',
        'B-D',
        'C-E',
      ]);
      expect(afterNearestNeighbor.visibleLinks).to.equal(6);
      expect(afterNearestNeighbor.components).to.equal(1);
      expect(afterNearestNeighbor.singletons).to.equal(0);
      expect(afterNearestNeighbor.linkDebug['A-B'].visible).to.equal(true);
      expect(afterNearestNeighbor.linkDebug['A-B'].prunedByNN).to.equal(true);
      expect(afterNearestNeighbor.linkDebug['A-B'].preservedByNonDistanceOrigin).to.equal(true);

      expect(afterThreshold.visibleLinkIds).to.deep.equal([
        'A-B',
        'A-C',
        'A-E',
        'B-C',
        'C-E',
      ]);
      expect(afterThreshold.visibleLinks).to.equal(5);
      expect(afterThreshold.components).to.equal(1);
      expect(afterThreshold.singletons).to.equal(1);
      expect(afterThreshold.linkDebug['A-B'].visible).to.equal(true);
      expect(afterThreshold.linkDebug['A-B'].prunedByThreshold).to.equal(true);
      expect(afterThreshold.linkDebug['A-B'].preservedByNonDistanceOrigin).to.equal(true);
    });
  });

  it('resets thresholds to the default values when the distance metric changes', () => {
    computeOracle({
      files: [
        {
          name: 'OracleSynthetic_nodes.csv',
          datatype: 'node',
          field1: '_id',
          field2: 'seq',
        },
      ],
      preLaunch: {
        metric: 'tn93',
        threshold: 0.015,
      },
      steps: [
        { id: 'to-snps', kind: 'set-distance-metric', metric: 'snps' },
        { id: 'back-to-tn93', kind: 'set-distance-metric', metric: 'tn93' },
      ],
    }).then((result) => {
      expect(result.snapshots.initial.metric).to.equal('tn93');
      expect(result.snapshots.initial.threshold).to.equal(0.015);
      expect(result.snapshots['to-snps'].metric).to.equal('snps');
      expect(result.snapshots['to-snps'].threshold).to.equal(16);
      expect(result.snapshots['back-to-tn93'].metric).to.equal('tn93');
      expect(result.snapshots['back-to-tn93'].threshold).to.equal(0.015);
    });
  });

  it('matches the AngularTesting TN93 edge-list expectations across nearest-neighbor and epsilon', () => {
    const profile = getProfile('nn-angulartesting-tn93-edgelist');

    computeOracle(manifestFromProfile(profile, [
      { id: 'after-nn', kind: 'set-nearest-neighbor', enabled: true },
      { id: 'epsilon-minus-one', kind: 'set-epsilon', exponent: -1 },
      { id: 'epsilon-zero', kind: 'set-epsilon', exponent: 0 },
    ])).then((result) => {
      expect(result.snapshots.initial.visibleLinks).to.equal(17);
      expect(result.snapshots['after-nn'].visibleLinks).to.equal(10);
      expect(result.snapshots['epsilon-minus-one'].visibleLinks).to.equal(12);
      expect(result.snapshots['epsilon-zero'].visibleLinks).to.equal(17);
    });
  });

  it('matches the AngularTesting TN93 matrix nearest-neighbor expectations', () => {
    const profile = getProfile('nn-angulartesting-tn93-matrix');

    computeOracle(manifestFromProfile(profile, [
      { id: 'after-nn', kind: 'set-nearest-neighbor', enabled: true },
    ])).then((result) => {
      expect(result.snapshots.initial.visibleLinks).to.equal(17);
      expect(result.snapshots['after-nn'].visibleLinks).to.equal(10);
    });
  });

  it('matches the AngularTesting FASTA nearest-neighbor expectations', () => {
    const profile = getProfile('nn-angulartesting-snps16-fasta');

    computeOracle(manifestFromProfile(profile, [
      { id: 'after-nn', kind: 'set-nearest-neighbor', enabled: true },
    ])).then((result) => {
      expect(result.snapshots.initial.visibleLinks).to.equal(11);
      expect(result.snapshots['after-nn'].visibleLinks).to.equal(7);
    });
  });

  it('leaves visible membership unchanged when a timeline date is set without an active timeline field', () => {
    const profile = getProfile('timeline-covid-node-link');

    computeOracle(manifestFromProfile(profile, [
      { id: 'date-without-field', kind: 'set-timeline-date', date: '6/28/2021' },
    ])).then((result) => {
      expect(result.snapshots['date-without-field'].visibleNodeIds)
        .to.deep.equal(result.snapshots.initial.visibleNodeIds);
      expect(result.snapshots['date-without-field'].visibleLinkIds)
        .to.deep.equal(result.snapshots.initial.visibleLinkIds);
    });
  });

  it('matches the COVID timeline checkpoints and backfills blank date fields to the earliest date', () => {
    const profile = getProfile('timeline-covid-node-link');

    computeOracle(manifestFromProfile(profile, [
      { id: 'timeline-enabled', kind: 'set-timeline-field', field: 'Date of symptom onset Date' },
      { id: 'timeline-start', kind: 'set-timeline-date', date: '6/28/2021' },
      { id: 'timeline-mid', kind: 'set-timeline-date', date: '7/16/2021' },
      { id: 'timeline-max', kind: 'set-timeline-date', date: '8/21/2021' },
    ])).then((result) => {
      expect(result.snapshots['timeline-enabled'].visibleNodeIds)
        .to.deep.equal([
          'MZ591568',
          'MZ787305',
          'P1',
          'P2',
          'P3',
        ]);
      expect(result.snapshots['timeline-enabled'].visibleLinkIds).to.deep.equal([]);

      expect(result.snapshots['timeline-start'].visibleNodeIds).to.deep.equal([
        'MZ591568',
        'MZ787305',
        'P1',
        'P2',
        'P3',
      ]);
      expect(result.snapshots['timeline-start'].visibleLinkIds).to.deep.equal([]);
      ['P1', 'P2', 'P3'].forEach((nodeId) => {
        expect(result.snapshots['timeline-start'].nodeDebug[nodeId].backfilledMissingDate).to.equal(true);
        expect(result.snapshots['timeline-start'].nodeDebug[nodeId].visible).to.equal(true);
      });
      expect(result.snapshots['timeline-start'].linkDebug['MZ637292-MZ797703'].hiddenByTimeline).to.equal(true);

      expect(result.snapshots['timeline-mid'].visibleNodeIds).to.deep.equal([
        'MZ415508',
        'MZ505967',
        'MZ591568',
        'MZ637292',
        'MZ696569',
        'MZ727689',
        'MZ727698',
        'MZ727700',
        'MZ727701',
        'MZ740979',
        'MZ744285',
        'MZ745181',
        'MZ745515',
        'MZ759709',
        'MZ787305',
        'MZ797703',
        'MZ797748',
        'P1',
        'P2',
        'P3',
      ]);
      expect(result.snapshots['timeline-mid'].visibleLinkIds).to.deep.equal([
        'MZ637292-MZ745181',
        'MZ637292-MZ797703',
        'MZ637292-MZ797748',
        'MZ727689-MZ727698',
        'MZ727689-MZ727700',
        'MZ727700-MZ727701',
        'MZ745181-MZ797703',
        'MZ745181-MZ797748',
        'MZ797703-MZ797748',
      ]);
      expect(result.snapshots['timeline-mid'].visibleLinks).to.equal(9);
      expect(result.snapshots['timeline-mid'].components).to.equal(2);
      expect(result.snapshots['timeline-mid'].singletons).to.equal(12);

      expect(result.snapshots['timeline-max'].visibleNodeIds)
        .to.deep.equal(result.snapshots.initial.visibleNodeIds);
      expect(result.snapshots['timeline-max'].visibleLinkIds)
        .to.deep.equal(result.snapshots.initial.visibleLinkIds);
    });
  });

  it('matches the mixed-origin diagnosis-date checkpoints and restores the baseline network at the max date', () => {
    const profile = getProfile('timeline-angulartesting-mixed-origin');

    computeOracle(manifestFromProfile(profile, [
      { id: 'timeline-enabled', kind: 'set-timeline-field', field: 'Diagnosis date' },
      { id: 'timeline-early', kind: 'set-timeline-date', date: '9/24/2014' },
      { id: 'timeline-max', kind: 'set-timeline-date', date: '4/27/2015' },
    ])).then((result) => {
      expect(result.snapshots['timeline-enabled'].visibleNodeIds)
        .to.deep.equal(['KF773578']);
      expect(result.snapshots['timeline-enabled'].visibleLinkIds).to.deep.equal([]);

      expect(result.snapshots['timeline-early'].visibleNodeIds).to.deep.equal([
        'KF773425',
        'KF773426',
        'KF773427',
        'KF773430',
        'KF773432',
        'KF773476',
        'KF773477',
        'KF773571',
        'KF773576',
        'KF773578',
        'KF773579',
      ]);
      expect(result.snapshots['timeline-early'].visibleLinkIds).to.deep.equal([
        'KF773425-KF773426',
        'KF773425-KF773427',
        'KF773426-KF773427',
        'KF773426-KF773571',
        'KF773426-KF773578',
        'KF773426-KF773579',
        'KF773430-KF773432',
        'KF773571-KF773576',
        'KF773571-KF773578',
        'KF773571-KF773579',
        'KF773576-KF773578',
        'KF773576-KF773579',
        'KF773578-KF773579',
      ]);
      expect(result.snapshots['timeline-early'].visibleLinks).to.equal(13);
      expect(result.snapshots['timeline-early'].components).to.equal(2);
      expect(result.snapshots['timeline-early'].singletons).to.equal(2);

      expect(result.snapshots['timeline-max'].visibleNodeIds)
        .to.deep.equal(result.snapshots.initial.visibleNodeIds);
      expect(result.snapshots['timeline-max'].visibleLinkIds)
        .to.deep.equal(result.snapshots.initial.visibleLinkIds);
    });
  });

  it('matches the mixed-origin threshold, nearest-neighbor, and reveal expectations', () => {
    const profile = getProfile('filtering-mixed-origin-nearest-neighbor');

    computeOracle(manifestFromProfile(profile, [
      { id: 'after-threshold', kind: 'set-threshold', threshold: 0.01 },
      { id: 'after-nn', kind: 'set-nearest-neighbor', enabled: true },
      { id: 'after-reveal', kind: 'reveal-everything' },
    ])).then((result) => {
      expect(result.snapshots.initial.visibleLinks).to.equal(17);
      expect(result.snapshots['after-threshold'].visibleLinks).to.equal(11);
      expect(result.snapshots['after-nn'].visibleLinks).to.equal(9);
      expect(result.snapshots['after-reveal'].visibleLinks).to.equal(9);

      ['KF773429-KF773430', 'KF773426-KF773578'].forEach((linkId) => {
        expect(result.snapshots['after-threshold'].linkDebug[linkId].visible).to.equal(true);
        expect(result.snapshots['after-threshold'].linkDebug[linkId].preservedByNonDistanceOrigin)
          .to.equal(true);
      });

      ['KF773576-KF773579', 'KF773429-KF773430'].forEach((linkId) => {
        expect(result.snapshots['after-nn'].linkDebug[linkId].visible).to.equal(true);
        expect(result.snapshots['after-nn'].linkDebug[linkId].preservedByNonDistanceOrigin)
          .to.equal(true);
      });
    });
  });
});
