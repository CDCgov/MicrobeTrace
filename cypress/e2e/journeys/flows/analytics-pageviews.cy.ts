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
  page_location: string;
  page_referrer?: string;
  page_title: string;
}];

function getGtagCalls(win: AnalyticsWindow): unknown[][] {
  return (win.dataLayer || []).map((entry) => Array.from(entry));
}

function getPageViewCalls(win: AnalyticsWindow): PageViewCall[] {
  return getGtagCalls(win).filter((entry) => (
    entry[0] === 'event' && entry[1] === 'page_view'
  )) as PageViewCall[];
}

describe('Google Analytics virtual page views', () => {
  beforeEach(() => {
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

      expect(configCall?.[2], 'automatic page-view configuration').to.deep.include({
        send_page_view: false,
      });
      expect(pageViews, 'initial virtual page view').to.have.length(1);
      expect(pageViews[0][2]).to.deep.include({
        page_location: new URL('files', win.document.baseURI).href,
        page_title: 'Files View',
      });
    });

    cy.get('[data-testid="app-view-menu-button"]').click({ force: true });
    cy.get('[data-testid="app-view-menu-sankey"]').click({ force: true });
    cy.get('.lm_tab.lm_active', { timeout: 15000 }).should('contain.text', 'Sankey');

    cy.window().should((rawWindow) => {
      const win = rawWindow as AnalyticsWindow;
      const pageViews = getPageViewCalls(win);
      const filesLocation = new URL('files', win.document.baseURI).href;

      expect(pageViews, 'page view after opening Sankey').to.have.length(2);
      expect(pageViews[1][2]).to.deep.include({
        page_location: new URL('sankey', win.document.baseURI).href,
        page_referrer: filesLocation,
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
      const win = rawWindow as AnalyticsWindow;
      const pageViews = getPageViewCalls(win);

      expect(pageViews, 'opening Epi Curve creates a page view').to.have.length(3);
      expect(pageViews[2][2]).to.deep.include({
        page_location: new URL('timeline', win.document.baseURI).href,
        page_referrer: new URL('sankey', win.document.baseURI).href,
        page_title: 'Timeline View',
      });
    });

    cy.get('.lm_tab[title="Epi Curve"]>.lm_close_tab').click({ force: true });
    cy.get('.lm_tab[title="Epi Curve"]').should('not.exist');
    cy.get('[data-testid="app-view-menu-button"]').click({ force: true });
    cy.get('[data-testid="app-view-menu-epi-curve"]').click({ force: true });

    cy.window().should((rawWindow) => {
      const win = rawWindow as AnalyticsWindow;
      const pageViews = getPageViewCalls(win);

      expect(pageViews, 'reopening Epi Curve creates another page view').to.have.length(4);
      expect(pageViews[3][2]).to.deep.include({
        page_location: new URL('timeline', win.document.baseURI).href,
        page_title: 'Timeline View',
      });
    });
  });

  it('does not load or queue analytics during a handoff', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1&handoff=analytics-test');

    cy.window().should((rawWindow) => {
      const win = rawWindow as AnalyticsWindow;

      expect(win.microbeTraceAnalyticsDisabled).to.equal(true);
      expect(win.gtag).to.equal(undefined);
      expect(win.dataLayer).to.equal(undefined);
      expect(
        win.document.querySelector('script[src*="googletagmanager.com/gtag/js"]'),
        'Google tag script',
      ).to.equal(null);
    });
  });
});
