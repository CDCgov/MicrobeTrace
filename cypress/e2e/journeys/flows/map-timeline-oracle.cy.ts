/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  goToMapView,
  launchProfileToTwoD,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
  setTimelineDate,
  setTimelineField,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

describe('Journey Flow - Map Timeline Oracle', () => {
  const profile = getProfile('timeline-covid-node-link');

  it('applies deterministic timeline checkpoints on Map while keeping zipcode-rendered membership aligned with the oracle', () => {
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
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    getOracleSnapshot().then((snapshot) => {
      assertMapMatchesOracleSnapshot(snapshot, { latitudeField: '_lat', longitudeField: '_lon' });
    });

    setTimelineField(timeline!.field);

    getOracleSnapshot('oracleResult', 'timeline-enabled').then((snapshot) => {
      assertMapMatchesOracleSnapshot(snapshot, { latitudeField: '_lat', longitudeField: '_lon' });
    });

    timeline!.checkpoints.forEach((checkpoint) => {
      setTimelineDate(checkpoint.date);

      getOracleSnapshot('oracleResult', checkpoint.id).then((snapshot) => {
        assertMapMatchesOracleSnapshot(snapshot, { latitudeField: '_lat', longitudeField: '_lon' });
      });
    });

    setTimelineField('None');

    getOracleSnapshot('oracleResult', 'timeline-disabled').then((snapshot) => {
      assertMapMatchesOracleSnapshot(snapshot, { latitudeField: '_lat', longitudeField: '_lon' });
    });
  });
});
