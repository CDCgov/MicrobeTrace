import { normalizeThreeDViewState, threeDNodeId, type ThreeDGraphData, type ThreeDPoint, type ThreeDViewState, type ThreeDSettings } from './three-d-network.model';

export const THREE_D_LAYOUT = { algorithm: 'phyllotaxis-id-order-v1', forceSeed: 1, iterationLimit: 150 } as const;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Only call on renderer-owned records; input order must not change force evaluation order. */
export function orderThreeDLayout(data: ThreeDGraphData): void {
  data.nodes.sort((a, b) => compare(a.id, b.id));
  data.links.sort((a, b) => compare(threeDNodeId(a.source), threeDNodeId(b.source))
    || compare(threeDNodeId(a.target), threeDNodeId(b.target)) || compare(a.key, b.key));
}

export function initialThreeDPosition(index: number): ThreeDPoint {
  const radius = 20 * Math.cbrt(index + 0.5);
  const roll = index * Math.PI * (3 - Math.sqrt(5));
  const yaw = index * Math.PI * 20 / (9 + Math.sqrt(221));
  return { x: radius * Math.sin(roll) * Math.cos(yaw), y: radius * Math.cos(roll), z: radius * Math.sin(roll) * Math.sin(yaw) };
}

/** Reset each force's local jiggle source when D3 reinitializes it, including recalculation. */
export function seedThreeDForce(force: { initialize?: (...args: any[]) => void }): void {
  if (!force?.initialize) return;
  const initialize = force.initialize.bind(force);
  force.initialize = (nodes, _random, dimensions) => {
    let state: number = THREE_D_LAYOUT.forceSeed;
    const random = () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
    initialize(nodes, random, dimensions);
  };
}

export interface ThreeDLayoutFile {
  format: 'microbetrace-3d-layout';
  version: 1;
  createdAt: string;
  application: { version: string; commit: string };
  layout: typeof THREE_D_LAYOUT & { linkLength: number; frozenAtCapture: boolean };
  viewport: { width: number; height: number };
  viewState: ThreeDViewState;
  links: Array<{ source: string; target: string }>;
  rendering?: { shapeVersion: 1 | 2; nodeDetail: ThreeDSettings['nodeDetail']; lightingMode: ThreeDSettings['lightingMode']; sizePolicy: 'mean-projected-area-v1'; exportDetail: 'balanced' | 'fine' };
}

export function buildThreeDLayoutFile(
  data: ThreeDGraphData, state: ThreeDViewState, viewport: ThreeDLayoutFile['viewport'],
  application: ThreeDLayoutFile['application'], linkLength: number, settings?: ThreeDSettings,
): ThreeDLayoutFile {
  const positions = Object.fromEntries(data.nodes.map(node => [node.id, state.positions[node.id]]));
  const viewState = normalizeThreeDViewState({ ...state, positions, layoutFrozen: true });
  if (!viewState || Object.keys(viewState.positions).length !== data.nodes.length) throw new Error('Wait for the network to finish loading before saving its layout.');
  return {
    format: 'microbetrace-3d-layout', version: 1, createdAt: new Date().toISOString(), application: { ...application },
    layout: { ...THREE_D_LAYOUT, linkLength, frozenAtCapture: state.layoutFrozen }, viewport: { ...viewport }, viewState,
    links: data.links.map(link => ({ source: threeDNodeId(link.source), target: threeDNodeId(link.target) })),
    ...(settings ? { rendering: { shapeVersion: settings.shapeVersion, nodeDetail: settings.nodeDetail, lightingMode: settings.lightingMode,
      sizePolicy: 'mean-projected-area-v1' as const, exportDetail: settings.nodeDetail === 'fine' ? 'fine' as const : 'balanced' as const } } : {}),
  };
}

/** Restore exact coordinates only onto the same visible network, without changing global filters. */
export function readThreeDLayoutFile(value: any, data: ThreeDGraphData): ThreeDViewState {
  if (value?.format !== 'microbetrace-3d-layout' || value.version !== 1) throw new Error('Choose a MicrobeTrace 3D layout JSON file.');
  if (value.rendering && (![1, 2].includes(value.rendering.shapeVersion) || !['auto', 'balanced', 'fine'].includes(value.rendering.nodeDetail)
    || !['fixed', 'camera'].includes(value.rendering.lightingMode) || value.rendering.sizePolicy !== 'mean-projected-area-v1'
    || !['balanced', 'fine'].includes(value.rendering.exportDetail))) throw new Error('This file uses unsupported 3D shape or lighting settings.');
  const state = normalizeThreeDViewState(value.viewState);
  if (!state) throw new Error('The layout file contains invalid camera settings.');
  const ids = data.nodes.map(node => node.id).sort(compare);
  const savedIds = Object.keys(state.positions).sort(compare);
  const linkKeys = (links: Array<{ source: any; target: any }>) => links.map(link => JSON.stringify([threeDNodeId(link.source), threeDNodeId(link.target)])).sort(compare);
  if (JSON.stringify(ids) !== JSON.stringify(savedIds) || !Array.isArray(value.links)
    || value.links.some(link => !link || typeof link.source !== 'string' || typeof link.target !== 'string')
    || JSON.stringify(linkKeys(data.links)) !== JSON.stringify(linkKeys(value.links))) {
    throw new Error('Load the same network and apply the same filters before restoring this layout. The visible node IDs and links must match.');
  }
  return { ...state, layoutFrozen: true };
}
