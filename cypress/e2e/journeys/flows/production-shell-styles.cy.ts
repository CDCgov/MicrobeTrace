describe('Production shell styles', () => {
  it('loads the application stylesheet without an inline media swap', () => {
    cy.visit('/');

    cy.document().then((document) => {
      const applicationStylesheets = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
      ).filter((link) => /\/styles(?:-[A-Z0-9]+)?\.css(?:\?|$)/i.test(link.href));

      expect(applicationStylesheets, 'application stylesheet links').to.have.length(1);
      expect(applicationStylesheets[0].media, 'application stylesheet media').not.to.equal('print');
      expect(applicationStylesheets[0].getAttribute('onload'), 'inline stylesheet loader').to.equal(null);
    });

    cy.get('#top-toolbar')
      .should('be.visible')
      .then(($toolbar) => {
        expect(
          getComputedStyle($toolbar[0]).backgroundImage,
          'application toolbar background'
        ).to.contain('linear-gradient');
      });
  });
});
