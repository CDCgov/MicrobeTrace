/// <reference types="cypress" />

import {
  applyPreLaunchFileSettings, ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing, visitAppAndAcceptEula,
} from '../../support/journey-helpers';
import { applyThreeDInvestigationStyling } from '../../support/threed-helpers';
import {
  assertScenarioExpectedCounts, collectPerformanceCounts, startPerformanceCapture,
  stopPerformanceCapture, writePerformanceResult,
  type PerformanceMeasurement, type PerformanceScenario, type PerfWindow,
} from '../../support/perf-helpers';

const graphCases: Array<{ nodes: number; links: number }> = require('../../performance/threed-scenarios.json');
const describeThreeD = Cypress.env('perfMode') && Cypress.env('perfThreeD') ? describe : describe.skip;

const heap = (win: Window): number | null => (win.performance as any).memory?.usedJSHeapSize ?? null;
const percentile = (values: number[], fraction: number): number | null => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
};

// graphData() changes before the library's deferred mesh update. Count the
// attached scene objects as well when validating that a topology update painted.
function sceneCounts(graph: any): { nodes: number; links: number } {
  const counts = { nodes: 0, links: 0 };
  graph.scene().traverse((object: any) => {
    if (object.__graphObjType === 'node') counts.nodes++;
    if (object.__graphObjType === 'link') counts.links++;
  });
  return counts;
}

// Move the real camera once per application frame. This measures sustained camera
// rendering and layout contention, rather than timing a single synchronous setter.
async function cameraProbe(
  win: Window, graph: any, kind: 'orbit' | 'pan' | 'zoom',
  durationMs: number, minimumFrames = 0,
): Promise<Record<string, number | null>> {
  const controls = graph.controls();
  controls.dispatchEvent({ type: 'start' });
  const camera = { ...graph.cameraPosition() };
  const target = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
  const offset = { x: camera.x - target.x, y: camera.y - target.y, z: camera.z - target.z };
  const radius = Math.hypot(offset.x, offset.y, offset.z);
  const renderer = graph.renderer();
  const renderStart = renderer.info.render.frame;
  const gaps: number[] = [];
  let previous: number | null = null;
  let start: number | null = null;
  return new Promise(resolve => {
    const tick = (now: number) => {
      if (start === null) start = now;
      if (previous !== null) gaps.push(now - previous);
      previous = now;
      const elapsed = now - start;
      const angle = elapsed / 4000;
      if (kind === 'orbit') {
        graph.cameraPosition({
          x: target.x + offset.x * Math.cos(angle) + offset.z * Math.sin(angle),
          y: camera.y,
          z: target.z + offset.z * Math.cos(angle) - offset.x * Math.sin(angle),
        }, target, 0);
      } else if (kind === 'zoom') {
        const scale = 1 - 0.2 * Math.sin(elapsed / 1200);
        graph.cameraPosition({ x: target.x + offset.x * scale, y: target.y + offset.y * scale, z: target.z + offset.z * scale }, target, 0);
      } else {
        const dx = radius * 0.08 * Math.sin(elapsed / 1000);
        graph.cameraPosition({ x: camera.x + dx, y: camera.y, z: camera.z }, { ...target, x: target.x + dx }, 0);
      }
      if ((elapsed >= durationMs && gaps.length >= minimumFrames) || elapsed >= 12000) {
        controls.dispatchEvent({ type: 'end' });
        resolve({
          frameCount: gaps.length, observedMs: elapsed,
          renderedFrames: renderer.info.render.frame - renderStart,
          medianFrameGapMs: percentile(gaps, 0.5), p95FrameGapMs: percentile(gaps, 0.95),
          maxFrameGapMs: gaps.length ? Math.max(...gaps) : null,
          averageFps: elapsed > 0 ? 1000 * gaps.length / elapsed : null,
        });
      } else win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
  });
}

describeThreeD('3D Network opt-in capacity benchmark', { retries: 0, numTestsKeptInMemory: 0 }, () => {
  // Rotate the order across independent invocations to reduce warm-cache/order bias.
  const sampleIndex = Number(Cypress.env('perfThreeDSampleIndex') || 0);
  const filter = String(Cypress.env('perfThreeDCase') || '');
  const styled = Cypress.env('perfThreeDStyle') === 'investigation';
  const matching = graphCases.filter(item => !filter || filter.split('+').includes(`${item.nodes}n-${item.links}l`));
  const offset = sampleIndex % Math.max(1, matching.length);
  const selected = [...matching.slice(offset), ...matching.slice(0, offset)];

  selected.forEach(({ nodes, links }) => {
    const stem = `${nodes}n-${links}l`;
    const scenario: PerformanceScenario = {
      id: `threed-${stem}${styled ? '-investigation' : ''}`, title: `3D Network: ${nodes} nodes, ${links} links (${styled ? 'investigation styling' : 'default styling'})`,
      files: [
        { name: `performance/threed/${stem}-nodes.csv`, datatype: 'node', field1: '_id' },
        { name: `performance/threed/${stem}-links.csv`, datatype: 'link', field1: 'source', field2: 'target', field3: 'distance' },
      ],
      preLaunch: { metric: 'snps', threshold: 16, defaultView: '3D Network' },
      expected: { nodes, totalLinks: links, visibleLinks: links },
      metadata: { renderer: '3d-force-graph', fixtureKind: 'deterministic-generated', sampleIndex, camera: 'trackball', probeVersion: 5, styleProfile: styled ? 'investigation' : 'default' },
    };

    it(scenario.title, () => {
      let uploadStart = 0;
      let initialHeap: number | null = null;
      let measurement: PerformanceMeasurement;
      const profile: any = { ...scenario, tags: ['performance'], expectations: {} };
      visitAppAndAcceptEula({ extraQuery: { renderer: 'sigma' } });
      cy.viewport(
        Number(Cypress.env('perfThreeDViewportWidth') || Cypress.config('viewportWidth')),
        Number(Cypress.env('perfThreeDViewportHeight') || Cypress.config('viewportHeight')),
      );
      startPerformanceCapture();
      cy.window().then(win => { uploadStart = win.performance.now(); initialHeap = heap(win); });
      cy.loadFiles(scenario.files);
      applyPreLaunchFileSettings(profile);
      ensurePreLaunchProfileSynced(profile);
      cy.window().then(win => {
        const state = { launch: 0, firstPaint: 0, fullyLoaded: 0 };
        (win as any).__threeDPerf = state;
        win.document.querySelector('#launch')!.addEventListener('click', () => {
          state.launch = win.performance.now();
          const watch = () => {
            const common = (win as any).commonService;
            if (!state.fullyLoaded && common?.session?.network?.isFullyLoaded) state.fullyLoaded = win.performance.now();
            const view = common?.visuals?.threeD;
            const graph = view?.renderer?.graph;
            if (view?.error) throw new Error(view.error);
            const attached = graph ? sceneCounts(graph) : null;
            if (attached?.nodes === nodes && attached.links === links && graph.renderer().info.render.calls > 0) {
              state.firstPaint = win.performance.now();
            } else win.requestAnimationFrame(watch);
          };
          win.requestAnimationFrame(watch);
        }, { once: true });
      });
      launchAndWaitForProcessing(180000);
      if (nodes > 750 || links > 1500) {
        cy.get('[data-testid="threed-performance-continue"]', { timeout: 30000 }).should('be.visible').click();
      }
      cy.window({ timeout: 180000 }).should(win => {
        expect((win as any).__threeDPerf.firstPaint, '3D first rendered frame').to.be.greaterThan(0);
      });
      cy.window().then({ timeout: 180000 }, async rawWindow => {
        const win = rawWindow as unknown as PerfWindow;
        const common = win.commonService;
        const view = common.visuals.threeD;
        const graph = view.renderer.graph;
        const layoutBudget = { cooldownTicks: graph.cooldownTicks(), cooldownTime: Number.isFinite(graph.cooldownTime()) ? graph.cooldownTime() : null };
        const wait = (ms: number) => new Promise<void>(resolve => win.setTimeout(resolve, ms));
        const waitFor = async (predicate: () => boolean, label: string, timeout = 30000) => {
          const start = win.performance.now();
          while (!predicate()) {
            if (win.performance.now() - start > timeout) throw new Error(`Timeout: ${label}`);
            await wait(50);
          }
        };
        expect(common.visuals.twoD, 'no background 2D renderer').not.to.exist;
        expect(win.document.visibilityState, 'visible benchmark tab').to.equal('visible');
        assertScenarioExpectedCounts(scenario, collectPerformanceCounts(win));
        const marks = (win as any).__threeDPerf;
        const metrics: Record<string, number | null> = {
          launchToFirstPaintMs: marks.firstPaint - marks.launch,
          uploadToFirstPaintMs: marks.firstPaint - uploadStart,
          launchToFullyLoadedMs: marks.fullyLoaded ? marks.fullyLoaded - marks.launch : null,
        };
        const merge = (prefix: string, values: Record<string, number | null>) => {
          Object.entries(values).forEach(([key, value]) => { metrics[`${prefix}${key[0].toUpperCase()}${key.slice(1)}`] = value; });
        };
        const glRenderer = graph.renderer();
        if (styled) {
          const styleStart = win.performance.now();
          applyThreeDInvestigationStyling(win);
          await waitFor(() => graph.graphData().nodes.every((node: any) => node.label)
            && graph.graphData().links.some((link: any) => link.overlayColor && link.targetArrow), 'investigation style data');
          const frame = glRenderer.info.render.frame;
          await waitFor(() => glRenderer.info.render.frame >= frame + 3, 'investigation styling painted');
          metrics.stylingToPaintMs = win.performance.now() - styleStart;
          const styledObjects: Record<string, number> = {};
          graph.scene().traverse((object: any) => {
            if (object.visible && object.name) styledObjects[object.name] = (styledObjects[object.name] || 0) + 1;
          });
          for (const name of ['node-frame', 'node-label', 'link-label', 'origin-overlay', 'source-arrow', 'target-arrow']) {
            const count = styledObjects[name] || 0;
            expect(count, `painted investigation objects: ${name}`).to.be.greaterThan(0);
            metrics[`styledObjects:${name}`] = count;
          }
        }
        const waitForPaint = async (expectedNodes: number, expectedLinks: number) => {
          await waitFor(() => {
            const attached = sceneCounts(graph);
            return attached.nodes === expectedNodes && attached.links === expectedLinks;
          }, '3D scene objects');
          const frame = glRenderer.info.render.frame;
          await waitFor(() => glRenderer.info.render.frame >= frame + 2, '3D rendered frames');
        };
        const gl = glRenderer.getContext();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const bounds = glRenderer.domElement.getBoundingClientRect();
        const environment = {
          renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          version: gl.getParameter(gl.VERSION), contextAttributes: gl.getContextAttributes(),
          devicePixelRatio: win.devicePixelRatio, canvasCssWidth: bounds.width, canvasCssHeight: bounds.height,
          canvasWidth: glRenderer.domElement.width, canvasHeight: glRenderer.domElement.height,
          browserHeaded: Cypress.browser.isHeaded, visibility: win.document.visibilityState,
          viewportWidth: win.innerWidth, viewportHeight: win.innerHeight,
        };
        let engineStopped = false;
        let engineStopTime = 0;
        let ticks = 0;
        const originalStop = graph.onEngineStop();
        const originalTick = graph.onEngineTick();
        graph.onEngineStop(() => { engineStopped = true; engineStopTime = win.performance.now(); originalStop?.(); });
        graph.onEngineTick(() => { ticks++; originalTick?.(); });
        const layoutStart = win.performance.now();
        view.openRefreshScreen();
        merge('layoutOrbit', await cameraProbe(win, graph, 'orbit', 1500));
        metrics.layoutTicksDuringProbe = ticks;
        metrics.layoutStoppedDuringProbe = engineStopped ? 1 : 0;
        await waitFor(() => engineStopped, 'force layout cooldown', 120000);
        metrics.layoutCooldownMs = engineStopTime - layoutStart;
        metrics.layoutTotalTicks = ticks;
        expect(ticks, 'complete deterministic layout iteration budget').to.equal(150);
        graph.onEngineStop(originalStop).onEngineTick(originalTick);
        if (!view.layoutFrozen) view.toggleFrozen();
        view.openCenter();
        await wait(700); // Complete the normal fit-camera transition before sampling.
        await waitForPaint(nodes, links);
        merge('frozenOrbit', await cameraProbe(win, graph, 'orbit', 3000, 30));
        merge('frozenPan', await cameraProbe(win, graph, 'pan', 1500, 15));
        merge('frozenZoom', await cameraProbe(win, graph, 'zoom', 1500, 15));
        ['layoutOrbit', 'frozenOrbit', 'frozenPan', 'frozenZoom'].forEach(phase => {
          expect(metrics[`${phase}RenderedFrames`], `${phase} painted each sampled frame`)
            .to.be.at.least(Number(metrics[`${phase}FrameCount`]) - 2);
        });
        Object.assign(metrics, {
          drawCalls: glRenderer.info.render.calls, triangles: glRenderer.info.render.triangles,
          geometries: glRenderer.info.memory.geometries, textures: glRenderer.info.memory.textures,
        });
        const selectionStart = win.performance.now();
        const id = graph.graphData().nodes[0].id;
        view.selectNode(id, { shiftKey: false, ctrlKey: false, metaKey: false });
        await new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
        metrics.selectionToTwoFramesMs = win.performance.now() - selectionStart;
        expect(common.session.data.nodes.filter((node: any) => node.selected).length, 'node selected').to.equal(1);
        const threshold = async (value: number) => {
          common.session.style.widgets['link-threshold'] = value;
          common.setLinkVisibility(false);
          common.updateNetworkVisuals(false, true);
          await new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
          await waitFor(() => graph.graphData().links.length === common.session.data.links.filter((link: any) => link.visible === true).length, '3D filtered links');
          await waitForPaint(nodes, graph.graphData().links.length);
        };
        const filterStart = win.performance.now();
        await threshold(8);
        metrics.filterToTwoFramesMs = win.performance.now() - filterStart;
        metrics.filteredRenderedLinks = graph.graphData().links.length;
        expect(metrics.filteredRenderedLinks).to.be.lessThan(links);
        await threshold(16);
        assertScenarioExpectedCounts(scenario, collectPerformanceCounts(win));
        expect(graph.graphData().nodes.length, 'all 3D nodes restored').to.equal(nodes);
        expect(graph.graphData().links.length, 'all 3D links restored').to.equal(links);
        expect(Boolean(view.error), 'no 3D rendering error').to.equal(false);
        expect(gl.isContextLost(), 'WebGL context intact').to.equal(false);
        const finalHeap = heap(win);
        const tasks = win.__mtPerfLongTasks || [];
        measurement = {
          scenarioId: scenario.id, startedAt: new Date().toISOString(), metrics,
          counts: collectPerformanceCounts(win),
          heap: { initialUsedJSHeapSize: initialHeap, finalUsedJSHeapSize: finalHeap, deltaUsedJSHeapSize: finalHeap !== null && initialHeap !== null ? finalHeap - initialHeap : null },
          longTasks: { count: tasks.length, maxDurationMs: Math.max(0, ...tasks.map(task => task.duration)), totalDurationMs: tasks.reduce((sum, task) => sum + task.duration, 0) },
          app: { loadTimeMs: common.session.meta.loadTime ?? null, performance: { threeD: { environment,
            layout: layoutBudget, settings: view.settings } } },
        };
      });
      cy.then(() => writePerformanceResult(scenario, measurement));
      stopPerformanceCapture();
    });
  });
});
