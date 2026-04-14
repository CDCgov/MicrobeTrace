/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  addAggregateTable,
  getAggregateFieldOption,
  readRenderedAggregateRows,
  selectAggregateField,
} from '../../../support/aggregate-helpers';
import { readRenderedCrosstab } from '../../../support/crosstab-helpers';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goToAggregateView,
  goToCrosstabView,
  launchProfileToTwoD,
  openAggregateSettingsDialog,
  setTimelineDate,
  setTimelineField,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

describe('Journey Flow - Timeline isolation for non-target uploaded views', () => {
  const profile = getProfile('timeline-covid-node-link');
  const timeline = profile.expectations.timeline!;
  const midCheckpoint = timeline.checkpoints.find((checkpoint) => checkpoint.id === 'timeline-mid') ?? timeline.checkpoints[0];

  it('keeps Aggregate node and link tables stable while timeline changes the visible graph in Bubble Map and 2D only', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    goToAggregateView();
    openAggregateSettingsDialog();
    addAggregateTable();

    getAggregateFieldOption('Link-distance').then((option) => {
      selectAggregateField(1, option.shortLabel, option.value);
    });

    cy.closeSettingsPane('Aggregate Settings');

    readRenderedAggregateRows(0).then((rows) => {
      expect(rows, 'baseline Aggregate node rows').to.have.length.greaterThan(0);
      cy.wrap(rows, { log: false }).as('aggregateNodeBaselineRows');
    });

    readRenderedAggregateRows(1).then((rows) => {
      expect(rows, 'baseline Aggregate link rows').to.have.length.greaterThan(0);
      cy.wrap(rows, { log: false }).as('aggregateLinkBaselineRows');
    });

    setTimelineField(timeline.field);
    setTimelineDate(midCheckpoint.date);
    waitForProcessingDialogToClear();

    assertMetricCount('#numberOfNodes', midCheckpoint.after.nodes!);
    assertMetricCount('#numberOfVisibleLinks', midCheckpoint.after.visibleLinks!);

    cy.get('@aggregateNodeBaselineRows').then((baselineRows) => {
      readRenderedAggregateRows(0).should((renderedRows) => {
        expect(renderedRows, 'Aggregate node rows after timeline checkpoint').to.deep.equal(baselineRows);
      });
    });

    cy.get('@aggregateLinkBaselineRows').then((baselineRows) => {
      readRenderedAggregateRows(1).should((renderedRows) => {
        expect(renderedRows, 'Aggregate link rows after timeline checkpoint').to.deep.equal(baselineRows);
      });
    });
  });

  it('keeps Crosstab rows stable while timeline changes the visible graph in Bubble Map and 2D only', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    goToCrosstabView();
    cy.closeSettingsPane('Crosstab Settings');

    readRenderedCrosstab().then((rendered) => {
      expect(rendered.body, 'baseline Crosstab body').to.have.length.greaterThan(0);
      cy.wrap(rendered, { log: false }).as('crosstabBaseline');
    });

    setTimelineField(timeline.field);
    setTimelineDate(midCheckpoint.date);
    waitForProcessingDialogToClear();

    assertMetricCount('#numberOfNodes', midCheckpoint.after.nodes!);
    assertMetricCount('#numberOfVisibleLinks', midCheckpoint.after.visibleLinks!);

    cy.get('@crosstabBaseline').then((baseline) => {
      readRenderedCrosstab().should((rendered) => {
        expect(rendered, 'Crosstab rendering after timeline checkpoint').to.deep.equal(baseline);
      });
    });
  });
});
