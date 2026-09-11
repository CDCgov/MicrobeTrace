/// <reference types="cypress" />

import moment from 'moment';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapMatchesOracleSnapshot,
  assertMapRenderedCounts,
  computeOracleForProfile,
  getOracleSnapshot,
  goToMapView,
  launchProfileToTwoD,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
  setTimelineField,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

type WinWithMap = Window & {
  commonService: any;
};

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];

function hasMapCoordinate(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const numericValue = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(numericValue);
}

const getRenderedMapNodeIds = (win: WinWithMap): string[] =>
  win.commonService.visuals.gisMap.layers.featureGroup
    .getLayers()
    .map((layer: any) => String(layer?.data?._id || ''))
    .filter(Boolean)
    .sort();

const getRenderableVisibleMapNodeIds = (win: WinWithMap): string[] =>
  win.commonService.getVisibleNodes()
    .filter((node: any) => hasMapCoordinate(node?._jlat) && hasMapCoordinate(node?._jlon))
    .map((node: any) => String(node?._id || ''))
    .filter(Boolean)
    .sort();

const assertMapTimelineMembershipAligned = (): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    expect(
      getRenderedMapNodeIds(typedWindow),
      'rendered map node ids stay aligned with visible nodes that have map coordinates',
    ).to.deep.equal(getRenderableVisibleMapNodeIds(typedWindow));
  });
};

const clickTimelineSliderToDate = (date: string): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const x = typedWindow.commonService.visuals.microbeTrace.xAttribute(moment(date).toDate());

    cy.get('#global-timeline svg line.track-overlay').first().click(x, 0, { force: true });
  });
};

const assertTimelineSliderDate = (date: string): void => {
  const expectedLabel = moment(date).format('MMM D');

  cy.get('svg g.slider text.label', { timeout: 15000 })
    .invoke('text')
    .should((text) => {
      expect(String(text).trim(), 'timeline slider label').to.equal(expectedLabel);
    });

  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    expect(
      moment(typedWindow.commonService.session.state.timeEnd).format('M/D/YYYY'),
      'timeline slider date',
    ).to.equal(moment(date).format('M/D/YYYY'));
  });
};

describe('Journey Flow - Map uploaded timeline controls', () => {
  const profile = getProfile('timeline-covid-node-link');
  const timeline = profile.expectations.timeline!;

  it('keeps Map timeline playback aligned with renderable visible membership on uploaded data', () => {
    let initialTime = 0;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });

    setTimelineField(timeline.field);

    cy.window().then((win: unknown) => {
      const value = (win as WinWithMap).commonService.session.state.timeEnd;
      const parsed = new Date(value as string | number | Date).getTime();
      initialTime = Number.isFinite(parsed) ? parsed : 0;
    });

    cy.get('#timeline-play-button').should('contain', 'Play').click();
    cy.get('#timeline-play-button', { timeout: 15000 }).should('contain', 'Pause');

    cy.window({ timeout: 15000 }).should((win: unknown) => {
      const nextValue = (win as WinWithMap).commonService.session.state.timeEnd;
      const nextTime = new Date(nextValue as string | number | Date).getTime();
      expect(Number.isFinite(nextTime), 'timeline playback date').to.equal(true);
      expect(nextTime, 'timeline playback advanced the current date').not.to.equal(initialTime);
    });

    cy.get('#timeline-play-button').should('contain', 'Pause').click();
    cy.get('#timeline-play-button').should('contain', 'Play');

    cy.window().then((win: unknown) => {
      const value = (win as WinWithMap).commonService.session.state.timeEnd;
      const expectedLabel = moment(value as string | number | Date).format('MMM D');
      cy.get('svg g.slider text.label').should('have.text', expectedLabel);
    });

    assertMapTimelineMembershipAligned();
  });

  it('keeps manual Map timeline slider clicks aligned with oracle-backed rendered membership on uploaded data', () => {
    const midpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-mid');
    const startpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-start');

    expect(midpoint, 'timeline midpoint checkpoint').to.exist;
    expect(startpoint, 'timeline start checkpoint').to.exist;

    const oracleSteps: OracleStep[] = [
      {
        id: 'timeline-enabled',
        kind: 'set-timeline-field',
        field: timeline.field,
      },
      {
        id: midpoint!.id,
        kind: 'set-timeline-date',
        date: midpoint!.date,
      },
      {
        id: startpoint!.id,
        kind: 'set-timeline-date',
        date: startpoint!.date,
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

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });

    setTimelineField(timeline.field);

    clickTimelineSliderToDate(midpoint!.date);
    assertTimelineSliderDate(midpoint!.date);

    getOracleSnapshot('oracleResult', midpoint!.id).then((snapshot) => {
      assertMapMatchesOracleSnapshot(snapshot, { latitudeField: '_lat', longitudeField: '_lon' });
    });

    assertMapTimelineMembershipAligned();

    clickTimelineSliderToDate(startpoint!.date);
    assertTimelineSliderDate(startpoint!.date);

    getOracleSnapshot('oracleResult', startpoint!.id).then((snapshot) => {
      assertMapMatchesOracleSnapshot(snapshot, { latitudeField: '_lat', longitudeField: '_lon' });
    });

    assertMapTimelineMembershipAligned();
  });
});
