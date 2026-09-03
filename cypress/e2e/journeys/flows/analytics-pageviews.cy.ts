/// <reference types="cypress" />

type AnalyticsWindow = Window & {
  dataLayer?: Array<ArrayLike<unknown>>;
  gtag?: (...args: unknown[]) => void;
  microbeTraceAnalyticsDisabled?: boolean;
  commonService?: {
    visuals?: {
      microbeTrace?: {
        _goldenLayoutHostComponent?: {
          TabChangedEvent?: {
            emit(viewName: string): void;
          };
        };
      };
    };
  };
};

type PageViewCall = ['event', 'page_view', {
  page_title: string;
}];

type AppEntryCall = ['event', 'app_entry', {
  action: 'standard' | 'handoff' | 'url_import';
}];

function getGtagCalls(win: AnalyticsWindow): unknown[][] {
  return (win.dataLayer || []).map((entry) => Array.from(entry));
}

function getPageViewCalls(win: AnalyticsWindow): PageViewCall[] {
  return getGtagCalls(win).filter((entry) => (
    entry[0] === 'event' && entry[1] === 'page_view'
  )) as PageViewCall[];
}

function getAppEntryCalls(win: AnalyticsWindow): AppEntryCall[] {
  return getGtagCalls(win).filter((entry) => (
    entry[0] === 'event' && entry[1] === 'app_entry'
  )) as AppEntryCall[];
}

describe('Google Analytics manual page views', () => {
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

  it('tracks newly opened views without tracking tab switches', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');

    cy.window().should((rawWindow) => {
      const win = rawWindow as AnalyticsWindow;
      const configCall = getGtagCalls(win).find((entry) => entry[0] === 'config');
      const pageViews = getPageViewCalls(win);
      const appEntries = getAppEntryCalls(win);

      expect(configCall?.[2], 'automatic page-view configuration').to.deep.include({
        send_page_view: false,
        page_location: new URL('../', `${win.location.origin}/assets/analytics-bootstrap.js`).href,
      });
      expect(pageViews, 'initial manual page view').to.have.length(1);
      expect(pageViews[0][2]).to.deep.equal({
        page_title: 'Files View',
      });
      expect(appEntries, 'standard application entry').to.deep.equal([
        ['event', 'app_entry', { action: 'standard' }],
      ]);
    });

    cy.get('[data-testid="app-view-menu-button"]').click({ force: true });
    cy.get('[data-testid="app-view-menu-sankey"]').click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 15000 }).should('contain.text', 'Sankey');

    cy.window().should((rawWindow) => {
      const pageViews = getPageViewCalls(rawWindow as AnalyticsWindow);

      expect(pageViews, 'page view after opening Sankey').to.have.length(2);
      expect(pageViews[1][2]).to.deep.equal({
        page_title: 'Sankey View',
      });
    });

    cy.get('[data-testid="app-view-menu-button"]').click({ force: true });
    cy.get('[data-testid="app-view-menu-sankey"]').click({ force: true });

    cy.window().should((rawWindow) => {
      expect(
        getPageViewCalls(rawWindow as AnalyticsWindow),
        'selecting an already open view does not create a page view',
      ).to.have.length(2);
    });

    cy.window().then((rawWindow) => {
      const win = rawWindow as AnalyticsWindow;
      const tabChangedEvent = win.commonService
        ?.visuals
        ?.microbeTrace
        ?._goldenLayoutHostComponent
        ?.TabChangedEvent;

      expect(tabChangedEvent, 'GoldenLayout tab-change event').to.exist;
      tabChangedEvent?.emit('Docked Key Tables');
    });

    cy.window().should((rawWindow) => {
      expect(
        getPageViewCalls(rawWindow as AnalyticsWindow),
        'Docked Key Tables is not tracked',
      ).to.have.length(2);
    });

    cy.contains('.lm_tab', 'Files').click({ force: true });

    cy.window().should((rawWindow) => {
      expect(
        getPageViewCalls(rawWindow as AnalyticsWindow),
        'switching to the Files tab does not create a page view',
      ).to.have.length(2);
    });

    cy.contains('.lm_tab', 'Sankey').click({ force: true });

    cy.window().should((rawWindow) => {
      expect(
        getPageViewCalls(rawWindow as AnalyticsWindow),
        'switching back to the Sankey tab does not create a page view',
      ).to.have.length(2);
    });

    cy.get('[data-testid="app-view-menu-button"]').click({ force: true });
    cy.get('[data-testid="app-view-menu-epi-curve"]').click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 15000 }).should('contain.text', 'Epi Curve');

    cy.window().should((rawWindow) => {
      const pageViews = getPageViewCalls(rawWindow as AnalyticsWindow);

      expect(pageViews, 'opening Epi Curve creates a page view').to.have.length(3);
      expect(pageViews[2][2]).to.deep.equal({
        page_title: 'EpiCurve View',
      });
    });

    cy.get('.lm_tab[title="Epi Curve"]>.lm_close_tab').click({ force: true });
    cy.get('.lm_tab[title="Epi Curve"]').should('not.exist');
    cy.get('[data-testid="app-view-menu-button"]').click({ force: true });
    cy.get('[data-testid="app-view-menu-epi-curve"]').click({ force: true });

    cy.window().should((rawWindow) => {
      const pageViews = getPageViewCalls(rawWindow as AnalyticsWindow);

      expect(pageViews, 'reopening Epi Curve creates another page view').to.have.length(4);
      expect(pageViews[3][2]).to.deep.equal({
        page_title: 'EpiCurve View',
      });
    });
  });

  it('tracks a handoff without forwarding query values', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1&handoff=analytics-test&url=https%3A%2F%2Fsensitive.example%2Fdata.json&partnerId=private');

    cy.window().should((rawWindow) => {
      const win = rawWindow as AnalyticsWindow;
      const calls = getGtagCalls(win);
      const configCall = calls.find((entry) => entry[0] === 'config');
      const pageViews = getPageViewCalls(win);
      const appEntries = getAppEntryCalls(win);

      expect(win.microbeTraceAnalyticsDisabled).to.equal(false);
      expect(win.gtag).to.be.a('function');
      expect(configCall?.[2]).to.deep.include({
        send_page_view: false,
        page_location: new URL('../', `${win.location.origin}/assets/analytics-bootstrap.js`).href,
      });
      expect(pageViews, 'handoff manual page view').to.have.length(1);
      expect(pageViews[0][2]).to.deep.equal({
        page_title: 'Files View',
      });
      expect(appEntries, 'handoff application entry').to.deep.equal([
        ['event', 'app_entry', { action: 'handoff' }],
      ]);
      expect(
        win.document.querySelector('script[src*="googletagmanager.com/gtag/js"]'),
        'Google tag script',
      ).not.to.equal(null);
      expect(JSON.stringify(calls), 'analytics payloads').not.to.match(
        /skipEula|skipDemoSession|analytics-test|sensitive\.example|partnerId|private/,
      );
    });
  });

  it('classifies URL imports without forwarding the imported URL', () => {
    const importedUrl = 'https://sensitive.example/data.json?token=private';
    cy.intercept('GET', 'https://sensitive.example/data.json?token=private', {
      statusCode: 200,
      body: {},
    });

    cy.visit(`/?skipEula=1&skipDemoSession=1&url=${encodeURIComponent(importedUrl)}`);
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');

    cy.window().should((rawWindow) => {
      const win = rawWindow as AnalyticsWindow;
      const calls = getGtagCalls(win);

      expect(getAppEntryCalls(win), 'URL-import application entry').to.deep.equal([
        ['event', 'app_entry', { action: 'url_import' }],
      ]);
      expect(JSON.stringify(calls), 'analytics payloads').not.to.match(
        /sensitive\.example|data\.json|token|private/,
      );
    });
  });
});
