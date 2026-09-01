/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapReady,
  goToMapView,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  openMapSettingsDialog,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';

type BoundaryPoint = { x: number; y: number };
type WinWithMap = Window & { commonService: any };
type GeneratedPositions = Record<string, [number, number]>;

const profile = getProfile('map-color-by-uploaded');
const imageFixture = 'map-floorplan-square.svg';
const imageMimeType = 'image/svg+xml';
const healthcareNodeIds = ['A', 'C'];
const educationNodeIds = ['B', 'D'];
const rectangle: BoundaryPoint[] = [
  { x: 10, y: 10 },
  { x: 60, y: 10 },
  { x: 60, y: 60 },
  { x: 10, y: 60 },
];

const aliasVisibleMapSettings = (): void => {
  cy.contains('.p-dialog-title', 'Geospatial Settings', { timeout: 15000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('mapSettings');
};

const openCustomMapTab = (): void => {
  cy.get('@mapSettings').contains('.nav-link', 'Custom Map').click({ force: true });
  cy.get('@mapSettings').find('#map-floorplan-background-file').should('exist');
};

const uploadImageFloorplan = (): void => {
  cy.attach_file('#map-floorplan-background-file', imageFixture, imageMimeType);
  cy.get('@mapSettings')
    .find('.map-user-geojson-summary', { timeout: 15000 })
    .should('contain.text', imageFixture)
    .and('contain.text', '100 x 100px');
  cy.get('@mapSettings').should('contain.text', 'Boundary Labels');
};

const selectBoundaryField = (fieldLabel: string): void => {
  cy.get('@mapSettings').find('#map-floorplan-boundary-field').click({ force: true });
  cy.contains('li[role="option"]', new RegExp(`^${fieldLabel}$`), { timeout: 15000 })
    .click({ force: true });
  cy.window()
    .its('commonService.session.data.floorplanBoundaryField')
    .should('equal', fieldLabel);
};

const setupImageBoundaryMap = (): void => {
  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  goToMapView();
  openMapSettingsDialog();
  openCustomMapTab();
  cy.get('@mapSettings').find('#map-floorplan-boundary-field').should('not.exist');
  uploadImageFloorplan();
  selectBoundaryField('Profession');
};

const fireBoundaryPoint = (point: BoundaryPoint): void => {
  cy.window().then((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    mapView.lmap.fire('click', {
      latlng: mapView.floorplanPointToLatLng(point),
    });
  });
};

const startPolygon = (points: BoundaryPoint[]): void => {
  cy.get('@mapSettings').find('#map-boundary-draw-polygon').click({ force: true });
  cy.contains('.p-dialog-title', 'Geospatial Settings').should('not.exist');
  cy.get('[aria-label="Boundary editor"]').should('contain.text', 'Draw polygon');
  points.forEach(fireBoundaryPoint);
};

const finishAndSaveBoundary = (label: string): void => {
  cy.get('#map-boundary-finish').should('not.be.disabled').click({ force: true });
  cy.get('#map-floorplan-boundary-label').should('be.visible').clear().type(label, { delay: 0 });
  cy.get('#map-boundary-save').should('not.be.disabled').click({ force: true });
  aliasVisibleMapSettings();
};

const drawPolygon = (label: string, points: BoundaryPoint[] = rectangle): void => {
  startPolygon(points);
  finishAndSaveBoundary(label);
};

const dispatchFreehand = (points: BoundaryPoint[]): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const mapView = typedWindow.commonService.visuals.gisMap;
    const container = mapView.lmap.getContainer() as HTMLElement;
    const rect = container.getBoundingClientRect();
    const pixelPoints = points.map((point) => {
      const pixel = mapView.lmap.latLngToContainerPoint(mapView.floorplanPointToLatLng(point));
      return { clientX: rect.left + pixel.x, clientY: rect.top + pixel.y };
    });
    const dispatch = (type: string, point: { clientX: number; clientY: number }) => {
      container.dispatchEvent(new (typedWindow as any).PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 17,
        pointerType: 'mouse',
        button: 0,
        clientX: point.clientX,
        clientY: point.clientY,
      }));
    };

    dispatch('pointerdown', pixelPoints[0]);
    pixelPoints.slice(1).forEach((point) => dispatch('pointermove', point));
    dispatch('pointerup', pixelPoints[pixelPoints.length - 1]);
  });
};

const drawFreehand = (label: string): void => {
  cy.get('@mapSettings').find('#map-boundary-draw-freehand').click({ force: true });
  cy.contains('.p-dialog-title', 'Geospatial Settings').should('not.exist');
  cy.get('[aria-label="Boundary editor"]').should('contain.text', 'Draw freehand area');
  dispatchFreehand([...rectangle, rectangle[0]]);
  cy.get('[aria-label="Boundary editor"]').should('contain.text', 'Label boundary');
  cy.get('#map-floorplan-boundary-label').type(label, { delay: 0 });
  cy.get('#map-boundary-save').click({ force: true });
  aliasVisibleMapSettings();
};

const getNode = (win: WinWithMap, nodeId: string): any =>
  win.commonService.session.data.nodes.find((node: any) => String(node._id) === nodeId);

const readGeneratedPositions = (nodeIds: string[]): Cypress.Chainable<GeneratedPositions> =>
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMap;
    return nodeIds.reduce((positions, nodeId) => {
      const node = getNode(typedWindow, nodeId);
      positions[nodeId] = [
        Number(node.map_floorplan_boundary_x),
        Number(node.map_floorplan_boundary_y),
      ];
      return positions;
    }, {} as GeneratedPositions);
  });

const assertGeneratedInsideRectangle = (nodeIds: string[]): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    nodeIds.forEach((nodeId) => {
      const node = getNode(typedWindow, nodeId);
      expect(node.map_floorplan_boundary_id, `${nodeId} boundary id`).to.be.a('string').and.not.be.empty;
      expect(Number(node.map_floorplan_boundary_x), `${nodeId} boundary x`).to.be.within(10, 60);
      expect(Number(node.map_floorplan_boundary_y), `${nodeId} boundary y`).to.be.within(10, 60);
    });
  });
};

const assertNoGeneratedPosition = (nodeIds: string[]): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    nodeIds.forEach((nodeId) => {
      const node = getNode(typedWindow, nodeId);
      expect(node.map_floorplan_boundary_id == null, `${nodeId} cleared boundary id`).to.equal(true);
      expect(node.map_floorplan_boundary_x == null, `${nodeId} cleared boundary x`).to.equal(true);
      expect(node.map_floorplan_boundary_y == null, `${nodeId} cleared boundary y`).to.equal(true);
    });
  });
};

const boundaryRow = (label: string): Cypress.Chainable<JQuery<HTMLElement>> =>
  cy.get('@mapSettings')
    .contains('.map-boundary-list-label', new RegExp(`^${label}$`))
    .parents('.map-boundary-list-item');

describe('Journey Flow - Image floorplan labeled boundaries', () => {
  it('draws a polygon, keeps placements stable, honors manual precedence, and restores the saved session', () => {
    const sessionFileBase = `cypress_floorplan_boundaries_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;
    let rerolledPositions: GeneratedPositions;

    setupImageBoundaryMap();
    drawPolygon(' healthcare ');

    cy.get('@mapSettings').should('contain.text', '2 matched / 2 unmatched');
    boundaryRow('healthcare').should('exist');
    assertGeneratedInsideRectangle(healthcareNodeIds);
    assertNoGeneratedPosition(educationNodeIds);

    readGeneratedPositions(healthcareNodeIds).then((beforeRedraw) => {
      cy.window().then((win: unknown) => {
        (win as WinWithMap).commonService.visuals.gisMap.refreshRenderedCoordinates(false);
      });
      readGeneratedPositions(healthcareNodeIds).should('deep.equal', beforeRedraw);
    });

    readGeneratedPositions(healthcareNodeIds).then((beforeReroll) => {
      cy.get('@mapSettings').find('#map-boundary-reposition-all').click({ force: true });
      readGeneratedPositions(healthcareNodeIds).should((afterReroll) => {
        expect(afterReroll, 'Reposition All changes generated points').not.to.deep.equal(beforeReroll);
        rerolledPositions = afterReroll;
      });
    });

    cy.get('@mapSettings').find('#map-manual-positioning').contains('On').click({ force: true });
    cy.get('@mapSettings').find('#map-manual-position-node').click({ force: true });
    cy.contains('li[role="option"]', /^A \(/, { timeout: 15000 }).click({ force: true });
    fireBoundaryPoint({ x: 5, y: 5 });

    cy.window().should((win: unknown) => {
      const node = getNode(win as WinWithMap, 'A');
      expect(Number(node.map_floorplan_x), 'manual x').to.be.closeTo(5, 0.0001);
      expect(Number(node.map_floorplan_y), 'manual y').to.be.closeTo(5, 0.0001);
      expect(Number(node._lon), 'manual rendered x').to.be.closeTo(5, 0.0001);
      expect(Number(node._lat), 'manual rendered y').to.be.closeTo(5, 0.0001);
    });

    cy.get('@mapSettings').find('#map-boundary-reposition-all').click({ force: true });
    cy.window().should((win: unknown) => {
      const node = getNode(win as WinWithMap, 'A');
      expect(Number(node._lon), 'manual x wins after boundary reroll').to.be.closeTo(5, 0.0001);
      expect(Number(node._lat), 'manual y wins after boundary reroll').to.be.closeTo(5, 0.0001);
    });
    readGeneratedPositions(healthcareNodeIds).then((positions) => {
      rerolledPositions = positions;
    });

    cy.get('@mapSettings').find('#map-floorplan-background-show-hide').contains('Hide').click({ force: true });
    cy.window().should((win: unknown) => {
      const mapView = (win as WinWithMap).commonService.visuals.gisMap;
      const node = getNode(win as WinWithMap, 'C');
      expect(node.map_floorplan_boundary_id, 'generated position remains stored while hidden').to.be.a('string');
      expect(mapView.lmap.hasLayer(mapView.layers.floorplanBoundaries), 'boundary layer hidden').to.equal(false);
    });
    cy.get('@mapSettings').find('#map-floorplan-background-show-hide').contains('Show').click({ force: true });
    assertGeneratedInsideRectangle(healthcareNodeIds);

    cy.closeSettingsPane('Geospatial Settings');
    installSaveAsCaptureHook();
    saveSessionFromFileMenu(sessionFileBase);
    writeCapturedDownloadToDisk(`${sessionFileBase}.microbetrace`, sessionFilePath);
    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      expect(savedSession).to.include('"floorplanBoundaryField"');
      expect(savedSession).to.include('"floorplanBoundaries"');
      expect(savedSession).to.include('"map_floorplan_boundary_id"');
      expect(savedSession).to.include('"map-floorplan-boundaries-show"');
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    assertMapReady(30000);
    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const data = typedWindow.commonService.session.data;
      expect(data.floorplanBoundaryField).to.equal('Profession');
      expect(data.floorplanBoundaries).to.have.length(1);
      expect(data.floorplanBoundaries[0].label).to.equal('healthcare');
      expect(getNode(typedWindow, 'A').map_floorplan_x, 'manual position restored').to.equal(5);
      expect(getNode(typedWindow, 'C').map_floorplan_boundary_x, 'generated position restored')
        .to.equal(rerolledPositions.C[0]);
    });

    openMapSettingsDialog();
    openCustomMapTab();
    cy.get('@mapSettings').find('#map-floorplan-boundary-field').should('exist');
    cy.get('@mapSettings').find('button').contains(/^Clear$/).click({ force: true });
    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      expect(typedWindow.commonService.session.data.floorplanBoundaries).to.deep.equal([]);
      expect(typedWindow.commonService.session.data.floorplanBoundaryField).to.equal('None');
    });
    assertNoGeneratedPosition(healthcareNodeIds);
  });

  it('supports freehand drawing, visibility, vertex editing, rename, delete, and image replacement', () => {
    let originalBoundaryId = '';
    let beforeEdit: GeneratedPositions;

    setupImageBoundaryMap();
    drawFreehand('Education');
    cy.get('@mapSettings').should('contain.text', '2 matched / 2 unmatched');
    assertGeneratedInsideRectangle(educationNodeIds);

    cy.window().then((win: unknown) => {
      originalBoundaryId = (win as WinWithMap).commonService.session.data.floorplanBoundaries[0].id;
    });
    cy.get('@mapSettings').find('#map-floorplan-boundary-show-hide').contains('Hide').click({ force: true });
    cy.window().should((win: unknown) => {
      const mapView = (win as WinWithMap).commonService.visuals.gisMap;
      expect(mapView.lmap.hasLayer(mapView.layers.floorplanBoundaries)).to.equal(false);
    });
    cy.get('@mapSettings').find('#map-floorplan-boundary-show-hide').contains('Show').click({ force: true });

    readGeneratedPositions(educationNodeIds).then((positions) => {
      beforeEdit = positions;
    });
    boundaryRow('Education').contains('button', 'Edit').click({ force: true });
    cy.contains('.p-dialog-title', 'Geospatial Settings').should('not.exist');
    cy.get('.map-boundary-midpoint-handle').first().click({ force: true });
    cy.window()
      .its('commonService.visuals.gisMap.floorplanBoundaryDraftVertices.length')
      .should('equal', 5);
    cy.get('#map-boundary-remove-vertex').should('not.be.disabled').click({ force: true });
    cy.window()
      .its('commonService.visuals.gisMap.floorplanBoundaryDraftVertices.length')
      .should('equal', 4);
    cy.get('#map-boundary-save').click({ force: true });
    aliasVisibleMapSettings();
    readGeneratedPositions(educationNodeIds).should((afterEdit) => {
      expect(afterEdit, 'editing rerolls only the edited boundary').not.to.deep.equal(beforeEdit);
    });

    boundaryRow('Education').contains('button', 'Rename').click({ force: true });
    cy.get('@mapSettings')
      .find('#map-floorplan-boundary-label')
      .should('have.value', 'Education')
      .type('{selectall}{backspace}School', { delay: 0 })
      .should('have.value', 'School');
    cy.get('@mapSettings').find('#map-boundary-save').click({ force: true });
    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      expect(typedWindow.commonService.session.data.floorplanBoundaries[0].id, 'stable id after rename')
        .to.equal(originalBoundaryId);
      expect(typedWindow.commonService.session.data.floorplanBoundaries[0].label).to.equal('School');
    });
    assertNoGeneratedPosition(educationNodeIds);

    boundaryRow('School').contains('button', 'Rename').click({ force: true });
    cy.get('@mapSettings').find('#map-floorplan-boundary-label').clear().type('Education', { delay: 0 });
    cy.get('@mapSettings').find('#map-boundary-save').click({ force: true });
    assertGeneratedInsideRectangle(educationNodeIds);

    cy.on('window:confirm', () => true);
    boundaryRow('Education').contains('button', 'Delete').click({ force: true });
    cy.window()
      .its('commonService.session.data.floorplanBoundaries')
      .should('deep.equal', []);
    assertNoGeneratedPosition(educationNodeIds);

    drawFreehand('Education');
    cy.attach_file('#map-floorplan-background-file', imageFixture, imageMimeType);
    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      expect(typedWindow.commonService.session.data.floorplanBoundaries, 'replacement clears boundaries')
        .to.deep.equal([]);
      expect(typedWindow.commonService.session.data.floorplanBoundaryField).to.equal('None');
    });
    assertNoGeneratedPosition(educationNodeIds);
  });

  it('guides polygon corners and rejects crossing edges before save', () => {
    setupImageBoundaryMap();

    startPolygon([
      { x: 10, y: 10 },
      { x: 60, y: 60 },
      { x: 10, y: 60 },
    ]);
    cy.get('.map-boundary-drawing-vertex').should('have.length', 3);
    cy.get('.map-boundary-drawing-vertex-first').should('contain.text', '1');
    cy.get('.map-boundary-drawing-vertex-latest').should('contain.text', '3');

    fireBoundaryPoint({ x: 60, y: 10 });
    cy.get('[aria-label="Boundary editor"] [role="alert"]')
      .should('contain.text', 'new red edge cross the boundary');
    cy.get('.map-boundary-drawing-vertex').should('have.length', 3);
    cy.get('#map-boundary-cancel-drawing').click({ force: true });
    aliasVisibleMapSettings();

    startPolygon([
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 10, y: 60 },
      { x: 60, y: 60 },
    ]);
    cy.get('[aria-label="Boundary editor"] [role="status"]')
      .should('contain.text', 'red dashed closing edge crosses');
    cy.get('#map-boundary-finish').should('be.disabled');
    cy.get('#map-boundary-cancel-drawing').click({ force: true });
    aliasVisibleMapSettings();
  });

  it('rejects blank and case-insensitive duplicate labels', () => {
    setupImageBoundaryMap();

    startPolygon(rectangle);
    cy.get('#map-boundary-finish').click({ force: true });
    cy.get('#map-floorplan-boundary-label').should('have.value', '');
    cy.get('#map-boundary-save').should('be.disabled');
    cy.get('#map-floorplan-boundary-label').type('Healthcare', { delay: 0 });
    cy.get('#map-boundary-save').click({ force: true });
    aliasVisibleMapSettings();

    startPolygon([
      { x: 15, y: 15 },
      { x: 55, y: 15 },
      { x: 55, y: 55 },
      { x: 15, y: 55 },
    ]);
    cy.get('#map-boundary-finish').click({ force: true });
    cy.get('#map-floorplan-boundary-label').type('  HEALTHCARE  ', { delay: 0 });
    cy.get('#map-boundary-save').click({ force: true });
    cy.get('[aria-label="Boundary editor"] [role="alert"]')
      .should('contain.text', 'Boundary labels must be unique');
    cy.window()
      .its('commonService.session.data.floorplanBoundaries.length')
      .should('equal', 1);
    cy.get('#map-boundary-cancel').click({ force: true });
  });
});
