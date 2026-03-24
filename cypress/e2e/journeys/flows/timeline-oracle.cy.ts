/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  setTimelineDate,
  setTimelineField,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

describe('Journey Flow - 2D Timeline Oracle', () => {
  [
    getProfile('timeline-covid-node-link'),
    getProfile('timeline-angulartesting-mixed-origin'),
  ].forEach((profile) => {
    it(profile.title, () => {
      const timeline = profile.expectations.timeline;
      expect(timeline, 'timeline expectation').to.exist;

      const oracleSteps: OracleStep[] = [
        {
          id: 'timeline-enabled',
          kind: 'set-timeline-field',
          field: timeline!.field,
        },
        ...timeline!.checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          kind: 'set-timeline-date' as const,
          date: checkpoint.date,
        })),
        {
          id: 'timeline-disabled',
          kind: 'set-timeline-field',
          field: 'None',
        },
      ];

      computeOracleForProfile(profile, oracleSteps);

      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);

      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      setTimelineField(timeline!.field);

      getOracleSnapshot('oracleResult', 'timeline-enabled').then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      timeline!.checkpoints.forEach((checkpoint) => {
        setTimelineDate(checkpoint.date);

        getOracleSnapshot('oracleResult', checkpoint.id).then((snapshot) => {
          assertNetworkMatchesOracleSnapshot(snapshot);
        });
      });

      setTimelineField('None');

      getOracleSnapshot('oracleResult', 'timeline-disabled').then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });
    });
  });
});
