import { visitAppAndAcceptEula } from '../../support/journey-helpers';

describe('Global timeline responsive layout and view lifecycle', () => {
  beforeEach(() => {
    cy.viewport(1400, 900);
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });

    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Bubble').click();
    cy.get('#cyBubble', { timeout: 15000 }).should('be.visible');
    cy.closeSettingsPane('Bubble Settings');

    cy.enableTimelineMode('Date symptoms resolved');
    cy.closeGlobalSettings();
    cy.contains('.p-dialog:visible .p-dialog-title', 'Global Settings').should('not.exist');
    cy.get('#global-timeline-wrapper').should('be.visible');
  });

  it('resizes the timeline track with the viewport while preserving the active date', () => {
    let wideTrackWidth = 0;
    let activeTime = 0;

    cy.get('#global-timeline line.track-overlay').should(($track) => {
      const x1 = Number($track.attr('x1'));
      const x2 = Number($track.attr('x2'));
      wideTrackWidth = x2 - x1;
      expect(wideTrackWidth, 'wide timeline track width').to.be.greaterThan(700);
    });
    cy.window().then((win: any) => {
      activeTime = new Date(win.commonService.session.state.timeEnd).getTime();
    });

    cy.viewport(900, 700);
    cy.get('#global-timeline line.track-overlay').should(($track) => {
      const x1 = Number($track.attr('x1'));
      const x2 = Number($track.attr('x2'));
      expect(x2 - x1, 'narrow timeline track width').to.be.lessThan(wideTrackWidth - 200);
    });
    cy.window().then((win: any) => {
      expect(new Date(win.commonService.session.state.timeEnd).getTime(), 'active date after shrinking')
        .to.equal(activeTime);
    });
    cy.viewport(1600, 900);
    cy.get('#global-timeline line.track-overlay').should(($track) => {
      const x1 = Number($track.attr('x1'));
      const x2 = Number($track.attr('x2'));
      expect(x2 - x1, 'expanded timeline track width').to.be.greaterThan(wideTrackWidth);
    });

    cy.get('#timeline-play-button').click().should('contain', 'Pause');
    cy.wait(300);
    cy.viewport(1000, 700);
    cy.get('#timeline-play-button').should('contain', 'Pause');
    cy.wait(300);
    cy.window().then((win: any) => {
      expect(new Date(win.commonService.session.state.timeEnd).getTime(), 'timeline advances while resizing')
        .to.be.greaterThan(activeTime);
    });
    cy.get('#timeline-play-button').click().should('contain', 'Play');
  });

  it('continues playback after Bubble is paused and closed', () => {
    let pausedTime = 0;

    cy.get('#timeline-play-button').should('contain', 'Play').click();
    cy.get('#timeline-play-button').should('contain', 'Pause');
    cy.wait(750);
    cy.get('#timeline-play-button').click().should('contain', 'Play');
    cy.window().then((win: any) => {
      pausedTime = new Date(win.commonService.session.state.timeEnd).getTime();
    });

    cy.get('.lm_tab[title="Bubble"] > .lm_close_tab').click({ force: true });
    cy.get('#cyBubble').should('not.exist');
    cy.window().its('commonService.visuals.bubble').should('be.null');

    cy.get('#timeline-play-button').click().should('contain', 'Pause');
    cy.wait(750);
    cy.window().then((win: any) => {
      expect(new Date(win.commonService.session.state.timeEnd).getTime(), 'timeline advances after Bubble closes')
        .to.be.greaterThan(pausedTime);
      expect(win.commonService.visuals.twoD?.cy?.destroyed(), '2D remains active').to.equal(false);
    });
    cy.get('#timeline-play-button').click().should('contain', 'Play');
  });
});
