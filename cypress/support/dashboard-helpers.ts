/// <reference types="cypress" />

import {
  assertAggregateReady,
  assertBubbleReady,
  assertCrosstabReady,
  assertMapReady,
  assertWaterfallReady,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
} from './journey-helpers';
import { byTestId, testIds } from './selectors';

type DashboardWindow = Window & {
  commonService: any;
  __mtCapturedConsoleErrors?: string[];
};

type DashboardFixture = {
  data?: any;
  files?: any[];
  layout?: any;
  dashboardLayout?: any;
  messages?: any[];
  meta?: any;
  network?: any;
  session?: {
    data?: any;
    files?: any[];
    layout?: any;
    messages?: any[];
    meta?: any;
    network?: any;
    state?: any;
    style?: any;
    timeline?: any;
    warnings?: any[];
  };
  state?: any;
  style?: any;
  tabs?: Array<{
    label: string;
    tabTitle?: string;
    isActive?: boolean;
  }>;
  timeline?: any;
  warnings?: any[];
};

type LoadedDashboardFixture = {
  activeLabel?: string;
  hasSerializedSession: boolean;
  layout: any;
  tabLabels: string[];
};

type DashboardApp = {
  _goldenLayoutHostComponent: {
    goldenLayout: {
      loadLayout: (layout: any) => void;
      saveLayout: () => any;
    };
    _componentRefMap: Map<any, any>;
    focusComponent: (componentId: string) => any;
    removeComponent: (componentId: string) => void;
  };
  homepageTabs: Array<{
    label: string;
    tabTitle: string;
    isActive: boolean;
    componentRef: any;
    templateRef: any;
  }>;
  activeTabIndex: number;
  commonService: any;
  Viewclick: (viewName: string) => void;
  setActiveTabProperties: (tabIndex?: number) => void;
};

type DashboardLifecycleEvent = 'resize' | 'hide' | 'show';

type DashboardOpenEntry = {
  label: string;
  tabTitle: string;
  componentRef: any;
  container: any;
};

type DashboardPaneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const dashboardPaneSelectors: Record<string, string> = {
  '2D Network': '#cy',
  Map: '.mapStyle',
  Bubble: byTestId(testIds.bubbleCanvas),
  Table: '.table-wrapper',
  Aggregate: '#tablesContainer',
  Crosstab: '.crosstab-wrapper',
  Waterfall: '#waterfall-view',
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const normalizeViewName = (value: string): string => {
  if (String(value).trim().toLowerCase() === '2d network') {
    return '2D Network';
  }

  return String(value).trim();
};

const getDashboardApp = (win: DashboardWindow): DashboardApp => {
  const app = win.commonService?.visuals?.microbeTrace as DashboardApp | undefined;

  expect(app, 'dashboard host app').to.exist;
  expect(app?._goldenLayoutHostComponent, 'golden layout host component').to.exist;

  return app as DashboardApp;
};

const countLayoutComponents = (item: any): number => {
  if (!item) return 0;
  if (item.type === 'component') return 1;

  const content = Array.isArray(item.content) ? item.content : [];
  return content.reduce((sum, child) => sum + countLayoutComponents(child), 0);
};

const getOpenDashboardEntries = (app: DashboardApp): DashboardOpenEntry[] => {
  const componentMap = app._goldenLayoutHostComponent._componentRefMap;

  expect(componentMap, 'golden layout component map').to.exist;

  return Array.from(componentMap.entries()).map(([container, componentRef]) => ({
    label: normalizeViewName(String(container?.componentType ?? container?.title ?? '')),
    tabTitle: String(container?.title ?? container?.componentType ?? ''),
    componentRef,
    container,
  }));
};

const sortDashboardEntries = (
  entries: DashboardOpenEntry[],
  orderedLabels: string[],
): DashboardOpenEntry[] => {
  if (!orderedLabels.length) return entries;

  const order = orderedLabels.map((label) => normalizeViewName(label));
  const orderIndex = new Map(order.map((label, index) => [label, index]));

  return [...entries].sort((a, b) => {
    const aIndex = orderIndex.get(a.label);
    const bIndex = orderIndex.get(b.label);

    if (aIndex === undefined && bIndex === undefined) {
      return a.label.localeCompare(b.label);
    }

    if (aIndex === undefined) return 1;
    if (bIndex === undefined) return -1;

    return aIndex - bIndex;
  });
};

const syncHomepageTabsFromLayout = (
  app: DashboardApp,
  orderedLabels: string[] = [],
  activeLabel?: string,
): void => {
  const entries = sortDashboardEntries(getOpenDashboardEntries(app), orderedLabels);
  const nextActiveLabel = normalizeViewName(activeLabel ?? orderedLabels[0] ?? entries[0]?.label ?? '');
  const activeIndex = entries.findIndex((entry) => entry.label === nextActiveLabel);
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;

  app.homepageTabs = entries.map((entry, index) => ({
    label: entry.label,
    tabTitle: entry.tabTitle || entry.label,
    isActive: index === resolvedActiveIndex,
    componentRef: entry.componentRef,
    templateRef: null,
  }));

  if (!app.homepageTabs.length) {
    app.activeTabIndex = 0;
    return;
  }

  app.activeTabIndex = resolvedActiveIndex;
  app.commonService.activeTab = app.homepageTabs[resolvedActiveIndex].label;
  app._goldenLayoutHostComponent.focusComponent(app.homepageTabs[resolvedActiveIndex].label);
  app.setActiveTabProperties(resolvedActiveIndex);
};

const applyDashboardLayout = (
  layout: any,
  orderedLabels: string[] = [],
  activeLabel?: string,
): void => {
  const expectedComponentCount = countLayoutComponents(layout?.root);

  expect(layout?.root, 'dashboard layout root').to.exist;
  expect(expectedComponentCount, 'dashboard layout component count').to.be.greaterThan(0);

  cy.window().then((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    const shouldPreserveKeyTablesState = orderedLabels
      .map((label) => normalizeViewName(label))
      .includes('Docked Key Tables');
    const wasApplyingPendingDashboardRestore = (app as any).applyingPendingDashboardRestore;

    try {
      if (shouldPreserveKeyTablesState) {
        (app as any).applyingPendingDashboardRestore = true;
      }

      app._goldenLayoutHostComponent.goldenLayout.loadLayout(layout);
    } catch (error) {
      throw new Error(`dashboard loadLayout failed: ${toErrorMessage(error)}`);
    } finally {
      (app as any).applyingPendingDashboardRestore = wasApplyingPendingDashboardRestore;
    }
  });

  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    expect(getOpenDashboardEntries(app), 'open dashboard components after loadLayout')
      .to.have.length(expectedComponentCount);
  });

  cy.window().then((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    syncHomepageTabsFromLayout(app, orderedLabels, activeLabel);

    if (typeof (app as any).publishLoadNewData === 'function') {
      (app as any).publishLoadNewData();
    }
  });
};

const buildTabStackLayout = (viewNames: string[]): any => {
  const normalizedNames = viewNames.map((viewName) => normalizeViewName(viewName));

  return {
    root: {
      type: 'stack',
      activeItemIndex: 0,
      content: normalizedNames.map((viewName) => ({
        type: 'component',
        componentType: viewName,
        title: viewName,
      })),
    },
  };
};

const buildSinglePaneStack = (viewName: string, size?: string): any => ({
  type: 'stack',
  ...(size ? { size } : {}),
  activeItemIndex: 0,
  content: [{
    type: 'component',
    componentType: viewName,
    title: viewName,
  }],
});

const buildDeterministicSplitLayout = (viewNames: string[]): any => {
  const normalizedNames = viewNames.map((viewName) => normalizeViewName(viewName));
  const requestedViews = new Set(normalizedNames);

  if (
    ['2D Network', 'Map', 'Bubble', 'Table', 'Aggregate', 'Crosstab', 'Waterfall']
      .every((viewName) => requestedViews.has(viewName))
  ) {
    return {
      root: {
        type: 'row',
        content: [
          {
            type: 'column',
            size: '34%',
            content: [
              buildSinglePaneStack('2D Network', '55%'),
              buildSinglePaneStack('Table', '45%'),
            ],
          },
          {
            type: 'column',
            size: '33%',
            content: [
              buildSinglePaneStack('Map', '55%'),
              buildSinglePaneStack('Bubble', '45%'),
            ],
          },
          {
            type: 'column',
            size: '33%',
            content: [
              buildSinglePaneStack('Aggregate', '34%'),
              buildSinglePaneStack('Crosstab', '33%'),
              buildSinglePaneStack('Waterfall', '33%'),
            ],
          },
        ],
      },
    };
  }

  if (
    normalizedNames.length === 4 &&
    ['2D Network', 'Map', 'Bubble', 'Table'].every((viewName) => requestedViews.has(viewName))
  ) {
    return {
      root: {
        type: 'column',
        content: [
          {
            type: 'row',
            size: '50%',
            content: [
              buildSinglePaneStack('2D Network', '50%'),
              buildSinglePaneStack('Map', '50%'),
            ],
          },
          {
            type: 'row',
            size: '50%',
            content: [
              buildSinglePaneStack('Bubble', '50%'),
              buildSinglePaneStack('Table', '50%'),
            ],
          },
        ],
      },
    };
  }

  return buildTabStackLayout(normalizedNames);
};

const getDashboardPaneSelector = (viewName: string): string => {
  const selector = dashboardPaneSelectors[normalizeViewName(viewName)];

  expect(selector, `dashboard selector for ${viewName}`).to.exist;

  return selector;
};

const assertNoRuntimeBanner = (): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const banner = typedWindow.document.querySelector('.runtime-error-banner');

    if (!banner) {
      return;
    }

    const details = {
      bannerText: String(banner.textContent || '').replace(/\s+/g, ' ').trim(),
      consoleErrors: [
        ...(typedWindow.__mtCapturedConsoleErrors || []),
        ...((typedWindow as any).__dashboardLayoutRestoreErrors || []),
      ].slice(-10),
    };

    throw new Error(`runtime error banner present: ${JSON.stringify(details)}`);
  });
};

export const assertNoDashboardRuntimeBanner = (): void => {
  assertNoRuntimeBanner();
};

export function assertDashboardViewReady(viewName: string): void {
  const normalizedViewName = normalizeViewName(viewName);

  switch (normalizedViewName) {
    case '2D Network':
      cy.get('#cy', { timeout: 30000 }).should('be.visible');
      cy.window({ timeout: 30000 }).should((win: any) => {
        expect(win.commonService?.visuals?.twoD, '2D component instance').to.exist;
        expect(
          win.commonService?.visuals?.twoD?.cy || win.cytoscapeInstance,
          '2D cytoscape handle',
        ).to.exist;
      });
      break;
    case 'Map':
      assertMapReady();
      break;
    case 'Bubble':
      assertBubbleReady();
      break;
    case 'Table':
      cy.get('.table-wrapper', { timeout: 30000 }).should('be.visible');
      cy.window({ timeout: 30000 }).should((win: any) => {
        const tableComp = win.commonService?.visuals?.tableComp;
        expect(tableComp, 'Table component instance').to.exist;

        if (!tableComp?.SelectedTableData && typeof tableComp?.onLoadNewData === 'function') {
          tableComp.onLoadNewData();
        }

        expect(tableComp?.SelectedTableData, 'Table selected dataset').to.exist;
      });
      break;
    case 'Aggregate':
      cy.window({ timeout: 30000 }).should((win: any) => {
        const aggregate = win.commonService?.visuals?.aggregate;

        if (
          aggregate &&
          (!Array.isArray(aggregate.SelectedDataTables) || aggregate.SelectedDataTables.length === 0) &&
          typeof aggregate.onLoadNewData === 'function'
        ) {
          aggregate.onLoadNewData();
        }
      });
      assertAggregateReady();
      break;
    case 'Crosstab':
      cy.window({ timeout: 30000 }).should((win: any) => {
        const crosstab = win.commonService?.visuals?.crossTab;

        if (!crosstab?.SelectedTableData && typeof crosstab?.onLoadNewData === 'function') {
          crosstab.onLoadNewData();
        }
      });
      assertCrosstabReady();
      break;
    case 'Waterfall':
      cy.window({ timeout: 30000 }).should((win: any) => {
        const waterfall = win.commonService?.visuals?.waterfall;

        if (waterfall?.onFilterDataChange) {
          waterfall.onFilterDataChange();
        } else if (
          waterfall &&
          (!Array.isArray(waterfall.clusterTableData) || waterfall.clusterTableData.length === 0) &&
          typeof waterfall.onLoadNewData === 'function'
        ) {
          waterfall.onLoadNewData();
        }

        if (waterfall?.goldenLayoutComponentResize) {
          waterfall.goldenLayoutComponentResize();
        }
      });
      assertWaterfallReady();
      break;
    default:
      throw new Error(`Unsupported dashboard view readiness assertion: ${normalizedViewName}`);
  }

  assertNoRuntimeBanner();
}

export function loadDashboardSessionFixture(fixtureName: string): void {
  let loadedFixture: LoadedDashboardFixture;

  cy.window().then((win: unknown) => {
    const typedWindow = win as DashboardWindow;

    if (typedWindow.__mtCapturedConsoleErrors) {
      typedWindow.__mtCapturedConsoleErrors.length = 0;
      return;
    }

    typedWindow.__mtCapturedConsoleErrors = [];
    const originalConsoleError = typedWindow.console.error.bind(typedWindow.console);

    typedWindow.console.error = (...args: unknown[]) => {
      typedWindow.__mtCapturedConsoleErrors?.push(
        args.map((arg) => {
          if (arg instanceof Error) return arg.stack || arg.message;
          if (typeof arg === 'string') return arg;

          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }).join(' '),
      );

      return originalConsoleError(...args);
    };
  });

  cy.fixture(fixtureName, 'utf8').then((rawFixture) => {
    const fixture = JSON.parse(String(rawFixture || '{}')) as DashboardFixture;

    loadedFixture = {
      layout: fixture.dashboardLayout ?? fixture.layout ?? fixture.session?.layout,
      tabLabels: (fixture.tabs || []).map((tab) => normalizeViewName(tab.label)),
      activeLabel: fixture.tabs?.find((tab) => tab.isActive)?.label,
      hasSerializedSession: Boolean(
        fixture.session?.data ||
        fixture.data ||
        fixture.session?.files ||
        fixture.files,
      ),
    };
  });

  cy.then(() => {
    expect(loadedFixture, `dashboard fixture parsed for ${fixtureName}`).to.exist;

    if (!loadedFixture.hasSerializedSession) {
      return;
    }

    cy.get('#fileDropRef', { timeout: 15000 })
      .selectFile(`${Cypress.config('fixturesFolder')}/${fixtureName}`, { force: true });

    cy.window({ timeout: 60000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);
  });

  cy.then(() => {
    expect(loadedFixture, `dashboard fixture available for ${fixtureName}`).to.exist;

    const activeLabel = loadedFixture.activeLabel ?? loadedFixture.tabLabels[0];
    applyDashboardLayout(loadedFixture.layout, loadedFixture.tabLabels, activeLabel);
  });

  cy.get(byTestId(testIds.appGoldenLayoutHost), { timeout: 15000 }).should('exist');
}

export function openDashboardViews(viewNames: string[]): void {
  const normalizedNames = viewNames.map((viewName) => normalizeViewName(viewName));

  cy.window().then((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    const filesOpen = app.homepageTabs.some((tab) => tab.label === 'Files');

    if (filesOpen) {
      app._goldenLayoutHostComponent.removeComponent('Files');
    }
  });

  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    expect(app.homepageTabs.some((tab) => tab.label === 'Files'), 'Files tab closed for dashboard work').to.equal(false);
  });

  normalizedNames.forEach((viewName) => {
    cy.window().then((win: unknown) => {
      const app = getDashboardApp(win as DashboardWindow);
      app.Viewclick(viewName);
    });

    assertDashboardViewReady(viewName);
  });

  cy.window().then((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    syncHomepageTabsFromLayout(app, normalizedNames, normalizedNames[normalizedNames.length - 1]);
  });
}

export function applyDeterministicDashboardSplitLayout(viewNames: string[], activeLabel?: string): void {
  const normalizedNames = viewNames.map((viewName) => normalizeViewName(viewName));
  const resolvedActiveLabel = normalizeViewName(activeLabel ?? normalizedNames[0] ?? '');

  applyDashboardLayout(
    buildDeterministicSplitLayout(normalizedNames),
    normalizedNames,
    resolvedActiveLabel,
  );
}

export function assertOpenDashboardTabs(expectedTitles: string[]): void {
  const normalizedTitles = expectedTitles.map((title) => normalizeViewName(title)).sort();

  cy.window().should((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    const actualTitles = app.homepageTabs.map((tab) => normalizeViewName(tab.label)).sort();

    expect(actualTitles, 'open dashboard tabs').to.deep.equal(normalizedTitles);
  });
}

export function assertActiveDashboardTab(expectedTitle: string): void {
  const normalizedTitle = normalizeViewName(expectedTitle);

  cy.window().should((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    const activeTitle = normalizeViewName(app.homepageTabs.find((tab) => tab.isActive)?.label ?? '');

    expect(activeTitle, 'active dashboard tab').to.equal(normalizedTitle);
  });
}

export function assertDashboardOpenComponentCount(expectedCount: number): void {
  cy.window().should((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    expect(getOpenDashboardEntries(app), 'open dashboard component count').to.have.length(expectedCount);
  });
}

export function captureDashboardPaneRects(viewNames: string[], alias = 'dashboardPaneRects'): void {
  const paneRects: Record<string, DashboardPaneRect> = {};

  viewNames.forEach((viewName) => {
    const normalizedViewName = normalizeViewName(viewName);
    const selector = getDashboardPaneSelector(normalizedViewName);

    cy.get(selector, { timeout: 15000 })
      .should('be.visible')
      .then(($element) => {
        const rect = $element.get(0)?.getBoundingClientRect();

        expect(rect, `pane rect for ${normalizedViewName}`).to.exist;

        paneRects[normalizedViewName] = {
          x: Number(rect?.left || 0),
          y: Number(rect?.top || 0),
          width: Number(rect?.width || 0),
          height: Number(rect?.height || 0),
        };
      });
  });

  cy.then(() => {
    cy.wrap(paneRects, { log: false }).as(alias);
  });
}

export function assertDistinctDashboardPaneRects(alias = 'dashboardPaneRects', minimumDistinctOrigins = 2): void {
  cy.get<Record<string, DashboardPaneRect>>(`@${alias}`).then((paneRects) => {
    const rects = Object.values(paneRects);

    expect(rects.length, 'captured dashboard pane count').to.be.greaterThan(0);

    rects.forEach((rect) => {
      expect(rect.width, 'captured pane width').to.be.greaterThan(0);
      expect(rect.height, 'captured pane height').to.be.greaterThan(0);
    });

    const distinctOrigins = new Set(
      rects.map((rect) => `${Math.round(rect.x / 10) * 10}:${Math.round(rect.y / 10) * 10}`),
    );

    expect(distinctOrigins.size, 'distinct dashboard pane origins').to.be.at.least(minimumDistinctOrigins);
  });
}

export function focusDashboardTab(title: string): void {
  const normalizedTitle = normalizeViewName(title);

  cy.window().then((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    app.Viewclick(normalizedTitle);
    syncHomepageTabsFromLayout(
      app,
      app.homepageTabs.map((tab) => tab.label),
      normalizedTitle,
    );
  });

  assertDashboardViewReady(normalizedTitle);
}

export function closeDashboardTab(title: string): void {
  const normalizedTitle = normalizeViewName(title);

  cy.window().then((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    app._goldenLayoutHostComponent.removeComponent(normalizedTitle);
  });

  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    expect(app.homepageTabs.some((tab) => tab.label === normalizedTitle), `${normalizedTitle} tab removed`).to.equal(false);
  });
}

export function dragGoldenLayoutSplitter(index: number, deltaX: number, deltaY: number): void {
  const wantsVerticalSplitter = deltaX !== 0;

  cy.get('.lm_splitter', { timeout: 15000 }).then(($splitters) => {
    const splitters = Cypress.$.makeArray($splitters).filter((element) => {
      const rect = element.getBoundingClientRect();
      return wantsVerticalSplitter ? rect.height > rect.width : rect.width > rect.height;
    });

    expect(splitters.length, 'matching Golden Layout splitters').to.be.greaterThan(index);

    const splitter = splitters[index] as HTMLElement;
    const rect = splitter.getBoundingClientRect();
    const startX = rect.left + (rect.width / 2);
    const startY = rect.top + (rect.height / 2);
    const endX = startX + deltaX;
    const endY = startY + deltaY;
    const midX = startX + (deltaX / 2);
    const midY = startY + (deltaY / 2);
    const win = splitter.ownerDocument.defaultView;

    expect(win, 'window for Golden Layout splitter drag').to.exist;

    const dispatchPointerEvent = (
      target: EventTarget,
      type: string,
      x: number,
      y: number,
      buttons: number,
    ): void => {
      target.dispatchEvent(new win!.PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: win!,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'mouse',
        button: 0,
        buttons,
        pageX: x,
        pageY: y,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
      }));
    };

    dispatchPointerEvent(splitter, 'pointerdown', startX, startY, 1);
    dispatchPointerEvent(win!.document, 'pointermove', midX, midY, 1);
    dispatchPointerEvent(win!.document, 'pointermove', endX, endY, 1);
    dispatchPointerEvent(win!.document, 'pointerup', endX, endY, 0);

    cy.wait(50, { log: false });
  });
}

export function emitDashboardContainerLifecycle(
  viewKey: string,
  eventName: DashboardLifecycleEvent,
): void {
  const normalizedViewKey = normalizeViewName(viewKey);

  cy.window().then((win: unknown) => {
    const app = getDashboardApp(win as DashboardWindow);
    const targetTab = app.homepageTabs.find((tab) => tab.label === normalizedViewKey);

    expect(targetTab, `dashboard tab for ${normalizedViewKey}`).to.exist;

    const container = targetTab?.componentRef?.instance?.container as any;

    expect(container, `Golden Layout container for ${normalizedViewKey}`).to.exist;

    if (eventName === 'hide') {
      container.hide();
      return;
    }

    if (eventName === 'show') {
      container.show();
      return;
    }

    if (typeof container.setSize === 'function') {
      const nextWidth = Math.max(240, Number(container.width || 0) - 120);
      const nextHeight = Math.max(220, Number(container.height || 0) - 80);
      container.setSize(nextWidth, nextHeight);
    } else {
      container.emit('resize');
    }
  });
}

export function assertPaneRect(selector: string, minWidth: number, minHeight: number): void {
  cy.get(selector, { timeout: 15000 })
    .should('be.visible')
    .then(($element) => {
      const rect = $element.get(0)?.getBoundingClientRect();

      expect(rect, `pane rect for ${selector}`).to.exist;
      expect(rect!.width, `pane width for ${selector}`).to.be.greaterThan(minWidth);
      expect(rect!.height, `pane height for ${selector}`).to.be.greaterThan(minHeight);
    });
}

export function configureDashboardMapZipcode(collapse: 'On' | 'Off' = 'Off'): void {
  focusDashboardTab('Map');
  openMapSettingsDialog();
  selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
  setMapNodeCollapsing(collapse);
  cy.closeSettingsPane('Geospatial Settings');
  assertDashboardViewReady('Map');
}

export function openDashboardExportDialog(): void {
  cy.get(byTestId(testIds.appFileMenuButton), { timeout: 15000 }).click({ force: true });
  cy.get(byTestId(testIds.appFileMenuExportDashboard), { timeout: 15000 }).click({ force: true });
  cy.get(byTestId(testIds.dashboardExportDialog), { timeout: 15000 }).should('exist');
  cy.contains('.p-dialog-title', 'Export Dashboard', { timeout: 15000 }).should('be.visible');
}

export function assertDashboardExportDialogControls(): void {
  cy.contains('.p-dialog-title', 'Export Dashboard', { timeout: 15000 })
    .parents('.p-dialog')
    .as('dashboardExportDialog');

  cy.get('@dashboardExportDialog').find(byTestId(testIds.dashboardExportFilename)).should('be.visible');
  cy.get('@dashboardExportDialog').find(byTestId(testIds.dashboardExportScale)).should('exist');
  cy.get('@dashboardExportDialog').find(byTestId(testIds.dashboardExportDimensions))
    .invoke('text')
    .should((text) => {
      expect(String(text).trim(), 'dashboard export resolution summary').to.match(/^\d+\s+x\s+\d+$/);
    });
  cy.get('@dashboardExportDialog').find(byTestId(testIds.dashboardExportConfirm)).should('be.visible');
}

export function readDashboardExportResolutionSummary(alias = 'dashboardExportResolution'): void {
  cy.get(byTestId(testIds.dashboardExportDimensions), { timeout: 15000 })
    .invoke('text')
    .then((text) => {
      cy.wrap(String(text).trim(), { log: false }).as(alias);
    });
}

export function setDashboardExportFilename(fileBase: string): void {
  cy.get(byTestId(testIds.dashboardExportFilename), { timeout: 15000 })
    .invoke('val', fileBase)
    .trigger('input')
    .trigger('change')
    .should('have.value', fileBase);

  cy.window()
    .its('commonService.visuals.microbeTrace.ExportDashboardFilename')
    .should('equal', fileBase);
}

export function setDashboardExportScale(scale: string): void {
  cy.get(byTestId(testIds.dashboardExportScale), { timeout: 15000 })
    .clear()
    .type(scale)
    .trigger('input')
    .trigger('change')
    .should('have.value', scale);

  cy.window()
    .its('commonService.visuals.microbeTrace.ExportDashboardScale')
    .should('equal', Number(scale));
}
