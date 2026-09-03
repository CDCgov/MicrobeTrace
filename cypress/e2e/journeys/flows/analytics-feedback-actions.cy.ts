/// <reference types="cypress" />

type AnalyticsWindow = Window & {
  dataLayer?: Array<ArrayLike<unknown>>;
  commonService?: {
    visuals?: {
      microbeTrace?: {
        trackClassicRedirect(action: string): void;
        SelectedPruneWithTypesVariable?: string;
        onPruneWithTypesChanged?(value: string): void;
        commonService?: {
          GlobalSettingsModel?: {
            SelectedPruneWithTypesVariable?: string;
          };
        };
        analyticsService?: {
          trackFileImport(event: {
            viewName: 'files' | 'workspace' | 'map';
            fileType: 'data_table' | 'session' | 'style' | 'color_assignment' | 'custom_map' | 'floorplan';
            fileFormat: 'csv' | 'microbetrace' | 'style' | 'txt' | 'geojson' | 'jpeg';
            result: 'success' | 'fail';
          }): void;
          trackAnalysisAction(action: string): void;
          beginAnalysisLaunch(action: 'new' | 'update_preserve'): void;
          completeAnalysisLaunch(result: 'success' | 'fail' | 'canceled'): void;
          trackExport(event: {
            viewName: 'table';
            fileType: 'data_table';
            fileFormat: 'csv';
            result: 'success' | 'fail';
          }): void;
        };
      };
    };
  };
};

function getClassicRedirectCalls(win: AnalyticsWindow): unknown[][] {
  return (win.dataLayer || [])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === 'event' && entry[1] === 'classic_redirect');
}

function getFileImportCalls(win: AnalyticsWindow): unknown[][] {
  return (win.dataLayer || [])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === 'event' && entry[1] === 'file_import');
}

function getAnalysisActionCalls(win: AnalyticsWindow): unknown[][] {
  return (win.dataLayer || [])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === 'event' && entry[1] === 'analysis_action');
}

function getResultEventCalls(win: AnalyticsWindow): unknown[][] {
  return (win.dataLayer || [])
    .map((entry) => Array.from(entry))
    .filter((entry) => (
      entry[0] === 'event'
      && ['file_import', 'analysis_launch', 'export_action'].includes(String(entry[1]))
    ));
}

describe('Google Analytics feedback actions', () => {
  beforeEach(() => {
    cy.readFile('src/assets/analytics-bootstrap.js', 'utf8').then((source) => {
      const locallyEnabledSource = source.replace(
        /const analyticsDisabledForLocalHost = (?:true|false);/,
        'const analyticsDisabledForLocalHost = false;',
      );
      cy.intercept('GET', '**/assets/analytics-bootstrap.js', {
        statusCode: 200,
        headers: { 'content-type': 'application/javascript' },
        body: locallyEnabledSource,
      });
    });
    cy.intercept('GET', 'https://www.googletagmanager.com/gtag/js*', {
      statusCode: 200,
      body: '',
    });
  });

  it('reports the allowlisted MicrobeTrace Classic entry point', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');

    cy.window().then((rawWindow) => {
      const win = rawWindow as AnalyticsWindow;
      const component = win.commonService?.visuals?.microbeTrace;

      expect(component, 'MicrobeTrace component').to.exist;
      component?.trackClassicRedirect('help_menu');
      component?.trackClassicRedirect('welcome_screen');
      component?.trackClassicRedirect('auspice_dialog');
      component?.trackClassicRedirect('not_allowlisted');
    });

    cy.window().should((rawWindow) => {
      expect(getClassicRedirectCalls(rawWindow as AnalyticsWindow)).to.deep.equal([
        ['event', 'classic_redirect', { action: 'help_menu' }],
        ['event', 'classic_redirect', { action: 'welcome_screen' }],
        ['event', 'classic_redirect', { action: 'auspice_dialog' }],
      ]);
    });
  });

  it('uses success, fail, and canceled as the result contract', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');

    cy.window().then((rawWindow) => {
      const analytics = (rawWindow as AnalyticsWindow)
        .commonService
        ?.visuals
        ?.microbeTrace
        ?.analyticsService;

      expect(analytics, 'AnalyticsService').to.exist;
      analytics?.trackFileImport({
        viewName: 'files',
        fileType: 'data_table',
        fileFormat: 'csv',
        result: 'success',
      });
      analytics?.trackFileImport({
        viewName: 'files',
        fileType: 'session',
        fileFormat: 'microbetrace',
        result: 'success',
      });
      analytics?.trackFileImport({
        viewName: 'workspace',
        fileType: 'style',
        fileFormat: 'style',
        result: 'success',
      });
      analytics?.trackFileImport({
        viewName: 'workspace',
        fileType: 'color_assignment',
        fileFormat: 'txt',
        result: 'success',
      });
      analytics?.trackFileImport({
        viewName: 'map',
        fileType: 'custom_map',
        fileFormat: 'geojson',
        result: 'success',
      });
      analytics?.trackFileImport({
        viewName: 'map',
        fileType: 'floorplan',
        fileFormat: 'jpeg',
        result: 'fail',
      });
      analytics?.beginAnalysisLaunch('new');
      analytics?.completeAnalysisLaunch('fail');
      analytics?.beginAnalysisLaunch('new');
      analytics?.beginAnalysisLaunch('update_preserve');
      analytics?.completeAnalysisLaunch('success');
      analytics?.trackExport({
        viewName: 'table',
        fileType: 'data_table',
        fileFormat: 'csv',
        result: 'success',
      });
    });

    cy.window().should((rawWindow) => {
      expect(getResultEventCalls(rawWindow as AnalyticsWindow)).to.deep.equal([
        ['event', 'file_import', {
          view_name: 'files',
          file_type: 'data_table',
          file_format: 'csv',
          result: 'success',
        }],
        ['event', 'file_import', {
          view_name: 'files',
          file_type: 'session',
          file_format: 'microbetrace',
          result: 'success',
        }],
        ['event', 'file_import', {
          view_name: 'workspace',
          file_type: 'style',
          file_format: 'style',
          result: 'success',
        }],
        ['event', 'file_import', {
          view_name: 'workspace',
          file_type: 'color_assignment',
          file_format: 'txt',
          result: 'success',
        }],
        ['event', 'file_import', {
          view_name: 'map',
          file_type: 'custom_map',
          file_format: 'geojson',
          result: 'success',
        }],
        ['event', 'file_import', {
          view_name: 'map',
          file_type: 'floorplan',
          file_format: 'jpeg',
          result: 'fail',
        }],
        ['event', 'analysis_launch', { action: 'new', result: 'fail' }],
        ['event', 'analysis_launch', { action: 'new', result: 'canceled' }],
        ['event', 'analysis_launch', { action: 'update_preserve', result: 'success' }],
        ['event', 'export_action', {
          view_name: 'table',
          file_type: 'data_table',
          file_format: 'csv',
          result: 'success',
        }],
      ]);
    });
  });

  it('classifies a selected saved-session wrapper as a session import', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(
      'cypress/fixtures/dashboard-pane-lifecycle-core.microbetrace',
      { force: true },
    );

    cy.window().should((rawWindow) => {
      expect(getFileImportCalls(rawWindow as AnalyticsWindow)).to.deep.equal([
        ['event', 'file_import', {
          view_name: 'files',
          file_type: 'session',
          file_format: 'microbetrace',
          result: 'success',
        }],
      ]);
    });
  });

  it('reports analysis actions without a feature name and deduplicates each action', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');

    cy.window().then((rawWindow) => {
      const analytics = (rawWindow as AnalyticsWindow)
        .commonService
        ?.visuals
        ?.microbeTrace
        ?.analyticsService;

      expect(analytics, 'AnalyticsService').to.exist;
      analytics?.trackAnalysisAction('timeline_mode');
      analytics?.trackAnalysisAction('timeline_mode');
      analytics?.trackAnalysisAction('nearest_neighbor');
      analytics?.trackAnalysisAction('distance_metric');
      analytics?.trackAnalysisAction('distance_metric');
      analytics?.trackAnalysisAction('not_allowlisted');
    });

    cy.window().should((rawWindow) => {
      expect(getAnalysisActionCalls(rawWindow as AnalyticsWindow)).to.deep.equal([
        ['event', 'analysis_action', { action: 'timeline_mode' }],
        ['event', 'analysis_action', { action: 'nearest_neighbor' }],
        ['event', 'analysis_action', { action: 'distance_metric' }],
      ]);
    });
  });

  it('tracks Nearest Neighbor only when first enabled', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');

    cy.window().then((rawWindow) => {
      const component = (rawWindow as AnalyticsWindow).commonService?.visuals?.microbeTrace;
      const globalSettings = component?.commonService?.GlobalSettingsModel;

      expect(component?.onPruneWithTypesChanged, 'Nearest Neighbor handler').to.be.a('function');
      expect(globalSettings, 'global settings').to.exist;

      component!.SelectedPruneWithTypesVariable = 'Nearest Neighbor';
      globalSettings!.SelectedPruneWithTypesVariable = 'Nearest Neighbor';
      component!.onPruneWithTypesChanged!('None');
      component!.onPruneWithTypesChanged!('Nearest Neighbor');
      component!.onPruneWithTypesChanged!('None');
      component!.onPruneWithTypesChanged!('Nearest Neighbor');
    });

    cy.window().should((rawWindow) => {
      expect(getAnalysisActionCalls(rawWindow as AnalyticsWindow)).to.deep.equal([
        ['event', 'analysis_action', { action: 'nearest_neighbor' }],
      ]);
    });
  });

  it('tracks a genuine Distance Metric change once', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('[data-testid="files-settings-button"]', { timeout: 15000 }).click({ force: true });

    cy.get('[data-testid="files-settings-dialog"] #default-distance-metric')
      .then(($select) => {
        const originalMetric = String($select.val());
        const changedMetric = originalMetric === 'tn93' ? 'snps' : 'tn93';
        cy.wrap($select).select(changedMetric, { force: true });
        cy.wrap($select).select(originalMetric, { force: true });
      });

    cy.window().should((rawWindow) => {
      expect(getAnalysisActionCalls(rawWindow as AnalyticsWindow)).to.deep.equal([
        ['event', 'analysis_action', { action: 'distance_metric' }],
      ]);
    });
  });
});
