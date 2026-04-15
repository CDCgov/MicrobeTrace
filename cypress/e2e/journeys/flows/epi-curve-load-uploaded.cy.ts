/// <reference types="cypress" />

import { getProfile, type DatasetProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToEpiCurve,
  openEpiCurveSettingsDialog,
} from '../../../support/journey-helpers';
import {
  assertEpiCurveHasBars,
  countRenderableDates,
  selectEpiCurveDropdown,
} from '../../../support/epi-curve-helpers';

type EpiCurveSmokeCase = {
  title: string;
  profile: DatasetProfile;
  dateField: string;
};

const matrixWithNodeDatesProfile: DatasetProfile = {
  id: 'epi-curve-matrix-with-node-dates',
  title: 'Epi Curve: distance matrix merged with node metadata renders diagnosis-date bars',
  tags: ['epi-curve', 'matrix', 'load-to-epi-curve'],
  files: [
    {
      name: 'AngularTesting_DistanceMatrix_TN93_BS.xlsx',
      datatype: 'matrix',
    },
    {
      name: 'AngularTesting_nodelist_withseqs_TN93_BS.csv',
      datatype: 'node',
      field1: '_id',
      field2: 'seq',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.015,
    defaultView: '2D Network',
  },
  expectations: {
    afterLaunch: {
      visibleLinks: 17,
    },
  },
};

const fastaWithNodeDatesProfile: DatasetProfile = {
  id: 'epi-curve-fasta-with-node-dates',
  title: 'Epi Curve: FASTA merged with node metadata renders diagnosis-date bars',
  tags: ['epi-curve', 'fasta', 'load-to-epi-curve'],
  files: [
    {
      name: 'AngularTesting_seqs_TN93_BS.fasta',
      datatype: 'fasta',
    },
    {
      name: 'AngularTesting_nodelist_withseqs_TN93_BS.csv',
      datatype: 'node',
      field1: '_id',
      field2: 'seq',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expectations: {
    afterLaunch: {
      visibleLinks: 11,
    },
  },
};

describe('Journey Flow - Epi Curve uploaded load smoke', () => {
  const cases: EpiCurveSmokeCase[] = [
    {
      title: 'renders uploaded node + link data in Epi Curve after selecting a symptom-onset field',
      profile: getProfile('timeline-covid-node-link'),
      dateField: 'Date of symptom onset Date',
    },
    {
      title: 'renders uploaded sequence node-list data in Epi Curve after selecting Diagnosis date',
      profile: getProfile('filtering-metric-switch-sequence-node-list'),
      dateField: 'Diagnosis date',
    },
    {
      title: 'renders uploaded matrix + node metadata in Epi Curve after selecting Diagnosis date',
      profile: matrixWithNodeDatesProfile,
      dateField: 'Diagnosis date',
    },
    {
      title: 'renders uploaded FASTA + node metadata in Epi Curve after selecting Diagnosis date',
      profile: fastaWithNodeDatesProfile,
      dateField: 'Diagnosis date',
    },
    {
      title: 'renders uploaded mixed-origin node + epi-link data in Epi Curve after selecting Diagnosis date',
      profile: getProfile('timeline-angulartesting-mixed-origin'),
      dateField: 'Diagnosis date',
    },
  ];

  cases.forEach(({ title, profile, dateField }) => {
    it(title, () => {
      launchProfileToEpiCurve(profile);
      assertAfterLaunchCounts(profile);
      openEpiCurveSettingsDialog();

      countRenderableDates(dateField).should('be.greaterThan', 0);

      selectEpiCurveDropdown('Date Field', dateField);
      assertEpiCurveHasBars();

      cy.get('#epiCurveSVG text.x.label').should('contain.text', 'Date');
      cy.get('#epiCurveSVG text.y.label').should('contain.text', 'Number of Cases');

      cy.closeSettingsPane('Epi Curve Settings');
    });
  });
});
