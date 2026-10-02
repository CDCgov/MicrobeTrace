export interface GeometryCenterMaskViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryCenterMaskMinViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export type GeometryCenterMaskViewBoxInput =
  | string
  | GeometryCenterMaskViewBox
  | GeometryCenterMaskMinViewBox;

export type GeometryCenterMaskRasterizationMethod =
  | 'canvas-path2d'
  | 'svg-is-point-in-fill';

export interface GeometryCenterMaskOptions {
  /** Number of pixels on the longest rasterized side. */
  rasterSize?: number;
  /** Inset depth as a fraction of each component's maximum interior radius. */
  ringWidthRadiusFraction?: number;
  /** Minimum visible share retained for the hollow center when the radius rule is too restrictive. */
  minimumReadableCenterAreaFraction?: number;
  /** Detached parts below this raster area remain solid instead of receiving a hollow center. */
  minimumComponentAreaPixels?: number;
  /** Detached parts below this share of the visible shape remain solid. */
  minimumComponentAreaFraction?: number;
  /** Parts without this much interior depth remain solid. */
  minimumComponentInradiusPixels?: number;
  /** Alpha cutoff used to turn the antialiased canvas rendering into geometry. */
  alphaThreshold?: number;
  fillRule?: CanvasFillRule;
}

export interface GeometryCenterMaskComponentMetadata {
  index: number;
  sourceAreaPixels: number;
  holeFilledAreaPixels: number;
  holesFilledPixels: number;
  centerAreaPixels: number;
  centerAreaFraction: number;
  minimumReadableCenterAreaPixels: number;
  minimumReadableCenterAreaFraction: number;
  radiusBasedCenterThresholdDistancePixels: number | null;
  centerThresholdDistancePixels: number | null;
  centerThresholdDistanceViewBoxUnits: number | null;
  maximumInteriorRadiusPixels: number;
  ringWidthRadiusFraction: number;
  readabilityFloorApplied: boolean;
  skippedAsTiny: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface GeometryCenterMaskResult {
  imageDataUri: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rasterWidth: number;
  rasterHeight: number;
  rasterizationMethod: GeometryCenterMaskRasterizationMethod;
  ringWidthRadiusFraction: number;
  minimumReadableCenterAreaFraction: number;
  holesFilledPixels: number;
  components: ReadonlyArray<GeometryCenterMaskComponentMetadata>;
  algorithm: 'hole-filled-euclidean-distance-transform';
  thresholdPolicy: 'half-inradius-with-minimum-readable-center-area';
}

interface NormalizedGeometryCenterMaskOptions {
  rasterSize: number;
  ringWidthRadiusFraction: number;
  minimumReadableCenterAreaFraction: number;
  minimumComponentAreaPixels: number;
  minimumComponentAreaFraction: number;
  minimumComponentInradiusPixels: number;
  alphaThreshold: number;
  fillRule: CanvasFillRule;
}

interface WorkingComponent {
  index: number;
  holeFilledAreaPixels: number;
  holesFilledPixels: number;
  sourcePixelIndices: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ComponentEnvelopeAnalysis {
  mask: Uint8Array;
  width: number;
  height: number;
  originX: number;
  originY: number;
  holeFilledPixelIndices: number[];
  sourcePixelIndices: number[];
}

const DEFAULT_RASTER_SIZE = 384;
const DEFAULT_RING_WIDTH_RADIUS_FRACTION = 0.5;
const DEFAULT_MINIMUM_READABLE_CENTER_AREA_FRACTION = 0.25;
const DEFAULT_MINIMUM_COMPONENT_AREA_PIXELS = 16;
const DEFAULT_MINIMUM_COMPONENT_AREA_FRACTION = 0.01;
const DEFAULT_MINIMUM_COMPONENT_INRADIUS_PIXELS = 1.5;
const DEFAULT_ALPHA_THRESHOLD = 128;
const RASTER_PADDING_FRACTION = 0.02;
const SVG_HIT_TEST_FALLBACK_RASTER_SIZE = 192;
const MAX_CACHE_ENTRIES = 128;

const geometryCenterMaskCache = new Map<string, GeometryCenterMaskResult>();

function clampNumber(value: any, minimum: number, maximum: number, fallback: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, numericValue));
}

function normalizeViewBox(viewBox: GeometryCenterMaskViewBoxInput): GeometryCenterMaskViewBox | null {
  if (typeof viewBox === 'string') {
    const values = viewBox.trim().split(/[\s,]+/).map(Number);
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) {
      return null;
    }
    const [x, y, width, height] = values;
    return width > 0 && height > 0 ? { x, y, width, height } : null;
  }

  if (!viewBox || typeof viewBox !== 'object') {
    return null;
  }

  const x = Number('x' in viewBox ? viewBox.x : viewBox.minX);
  const y = Number('y' in viewBox ? viewBox.y : viewBox.minY);
  const width = Number(viewBox.width);
  const height = Number(viewBox.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

function normalizeOptions(options: GeometryCenterMaskOptions): NormalizedGeometryCenterMaskOptions {
  return {
    rasterSize: Math.round(clampNumber(options.rasterSize, 32, 1024, DEFAULT_RASTER_SIZE)),
    ringWidthRadiusFraction: clampNumber(
      options.ringWidthRadiusFraction,
      0.01,
      0.99,
      DEFAULT_RING_WIDTH_RADIUS_FRACTION
    ),
    minimumReadableCenterAreaFraction: clampNumber(
      options.minimumReadableCenterAreaFraction,
      0,
      0.95,
      DEFAULT_MINIMUM_READABLE_CENTER_AREA_FRACTION
    ),
    minimumComponentAreaPixels: Math.round(clampNumber(
      options.minimumComponentAreaPixels,
      1,
      100000,
      DEFAULT_MINIMUM_COMPONENT_AREA_PIXELS
    )),
    minimumComponentAreaFraction: clampNumber(
      options.minimumComponentAreaFraction,
      0,
      0.25,
      DEFAULT_MINIMUM_COMPONENT_AREA_FRACTION
    ),
    minimumComponentInradiusPixels: clampNumber(
      options.minimumComponentInradiusPixels,
      0,
      1000,
      DEFAULT_MINIMUM_COMPONENT_INRADIUS_PIXELS
    ),
    alphaThreshold: Math.round(clampNumber(
      options.alphaThreshold,
      1,
      255,
      DEFAULT_ALPHA_THRESHOLD
    )),
    fillRule: options.fillRule === 'evenodd' ? 'evenodd' : 'nonzero'
  };
}

function makeCacheKey(
  pathData: string,
  viewBox: GeometryCenterMaskViewBox,
  options: NormalizedGeometryCenterMaskOptions,
  rasterizationCapability: 'canvas-path2d' | 'svg-fallback' | 'unavailable'
): string {
  return JSON.stringify([
    pathData,
    viewBox.x,
    viewBox.y,
    viewBox.width,
    viewBox.height,
    options.rasterSize,
    options.ringWidthRadiusFraction,
    options.minimumReadableCenterAreaFraction,
    options.minimumComponentAreaPixels,
    options.minimumComponentAreaFraction,
    options.minimumComponentInradiusPixels,
    options.alphaThreshold,
    options.fillRule,
    rasterizationCapability
  ]);
}

function getRasterizationCapability(): 'canvas-path2d' | 'svg-fallback' | 'unavailable' {
  if (typeof document === 'undefined') {
    return 'unavailable';
  }
  if (typeof Path2D !== 'undefined') {
    try {
      new Path2D('M0 0H1V1H0Z');
      return 'canvas-path2d';
    } catch (_error) {
      // Continue to the attached SVG geometry fallback.
    }
  }
  return (
    typeof SVGGeometryElement !== 'undefined'
    && typeof SVGGeometryElement.prototype.isPointInFill === 'function'
  )
    ? 'svg-fallback'
    : 'unavailable';
}

function rememberResult(cacheKey: string, result: GeometryCenterMaskResult): void {
  if (geometryCenterMaskCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = geometryCenterMaskCache.keys().next().value;
    if (oldestKey !== undefined) {
      geometryCenterMaskCache.delete(oldestKey);
    }
  }
  geometryCenterMaskCache.set(cacheKey, result);
}

interface RasterSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  rasterWidth: number;
  rasterHeight: number;
  rasterPadding: number;
  shapeRasterWidth: number;
  shapeRasterHeight: number;
  scaleX: number;
  scaleY: number;
}

function createRasterSurface(
  viewBox: GeometryCenterMaskViewBox,
  rasterSize: number
): RasterSurface | null {
  const scale = rasterSize / Math.max(viewBox.width, viewBox.height);
  const shapeRasterWidth = Math.max(1, Math.ceil(viewBox.width * scale));
  const shapeRasterHeight = Math.max(1, Math.ceil(viewBox.height * scale));
  const rasterPadding = Math.max(2, Math.ceil(rasterSize * RASTER_PADDING_FRACTION));
  const rasterWidth = shapeRasterWidth + rasterPadding * 2;
  const rasterHeight = shapeRasterHeight + rasterPadding * 2;
  const scaleX = scale;
  const scaleY = scale;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = rasterWidth;
    canvas.height = rasterHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (
      !context
      || typeof context.createImageData !== 'function'
      || typeof context.putImageData !== 'function'
      || typeof context.clearRect !== 'function'
      || typeof canvas.toDataURL !== 'function'
    ) {
      return null;
    }

    return {
      canvas,
      context,
      rasterWidth,
      rasterHeight,
      rasterPadding,
      shapeRasterWidth,
      shapeRasterHeight,
      scaleX,
      scaleY
    };
  } catch (_error) {
    return null;
  }
}

function rasterizeWithCanvasPath(
  pathData: string,
  viewBox: GeometryCenterMaskViewBox,
  options: NormalizedGeometryCenterMaskOptions,
  surface: RasterSurface
): Uint8Array | null {
  if (typeof Path2D === 'undefined' || typeof surface.context.getImageData !== 'function') {
    return null;
  }

  try {
    const path = new Path2D(pathData);
    surface.context.setTransform(
      surface.scaleX,
      0,
      0,
      surface.scaleY,
      surface.rasterPadding - viewBox.x * surface.scaleX,
      surface.rasterPadding - viewBox.y * surface.scaleY
    );
    surface.context.fillStyle = '#000000';
    surface.context.fill(path, options.fillRule);
    surface.context.setTransform(1, 0, 0, 1, 0, 0);

    const rgba = surface.context.getImageData(
      0,
      0,
      surface.rasterWidth,
      surface.rasterHeight
    ).data;
    const mask = new Uint8Array(surface.rasterWidth * surface.rasterHeight);
    let filledPixels = 0;
    for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex++) {
      if (rgba[pixelIndex * 4 + 3] >= options.alphaThreshold) {
        mask[pixelIndex] = 1;
        filledPixels++;
      }
    }
    return filledPixels ? mask : null;
  } catch (_error) {
    try {
      surface.context.setTransform(1, 0, 0, 1, 0, 0);
      surface.context.clearRect(0, 0, surface.rasterWidth, surface.rasterHeight);
    } catch (_cleanupError) {
      // The SVG hit-test fallback below does not reuse this canvas surface.
    }
    return null;
  }
}

function rasterizeWithSvgHitTesting(
  pathData: string,
  viewBox: GeometryCenterMaskViewBox,
  options: NormalizedGeometryCenterMaskOptions,
  surface: RasterSurface
): Uint8Array | null {
  if (
    typeof document.createElementNS !== 'function'
    || typeof SVGGeometryElement === 'undefined'
    || typeof SVGGeometryElement.prototype.isPointInFill !== 'function'
  ) {
    return null;
  }

  let svg: SVGSVGElement | null = null;

  try {
    const host = document.body || document.documentElement;
    if (!host) {
      return null;
    }

    const svgNamespace = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(svgNamespace, 'svg');
    const path = document.createElementNS(svgNamespace, 'path');
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('data-mt-geometry-center-mask-rasterizer', 'true');
    svg.style.position = 'absolute';
    svg.style.left = '-10000px';
    svg.style.top = '-10000px';
    svg.style.width = '1px';
    svg.style.height = '1px';
    svg.style.opacity = '0';
    svg.style.pointerEvents = 'none';
    path.setAttribute('d', pathData);
    path.setAttribute('fill', '#000000');
    path.setAttribute('fill-rule', options.fillRule);
    svg.appendChild(path);
    host.appendChild(svg);

    const point = svg.createSVGPoint();
    const mask = new Uint8Array(surface.rasterWidth * surface.rasterHeight);
    let filledPixels = 0;
    const endX = surface.rasterPadding + surface.shapeRasterWidth;
    const endY = surface.rasterPadding + surface.shapeRasterHeight;

    for (let y = surface.rasterPadding; y < endY; y++) {
      point.y = viewBox.y + (y - surface.rasterPadding + 0.5) / surface.scaleY;
      for (let x = surface.rasterPadding; x < endX; x++) {
        point.x = viewBox.x + (x - surface.rasterPadding + 0.5) / surface.scaleX;
        if (path.isPointInFill(point)) {
          mask[y * surface.rasterWidth + x] = 1;
          filledPixels++;
        }
      }
    }
    return filledPixels ? mask : null;
  } catch (_error) {
    return null;
  } finally {
    try {
      svg?.remove();
    } catch (_cleanupError) {
      // The offscreen element is best-effort cleanup for legacy DOMs.
    }
  }
}

function buildRasterizedPathResult(
  viewBox: GeometryCenterMaskViewBox,
  surface: RasterSurface,
  mask: Uint8Array,
  rasterizationMethod: GeometryCenterMaskRasterizationMethod
): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  mask: Uint8Array;
  rasterWidth: number;
  rasterHeight: number;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  pixelsPerViewBoxUnit: number;
  rasterizationMethod: GeometryCenterMaskRasterizationMethod;
} {
  return {
    canvas: surface.canvas,
    context: surface.context,
    mask,
    rasterWidth: surface.rasterWidth,
    rasterHeight: surface.rasterHeight,
    imageX: viewBox.x - surface.rasterPadding / surface.scaleX,
    imageY: viewBox.y - surface.rasterPadding / surface.scaleY,
    imageWidth: surface.rasterWidth / surface.scaleX,
    imageHeight: surface.rasterHeight / surface.scaleY,
    pixelsPerViewBoxUnit: Math.min(surface.scaleX, surface.scaleY),
    rasterizationMethod
  };
}

function rasterizePath(
  pathData: string,
  viewBox: GeometryCenterMaskViewBox,
  options: NormalizedGeometryCenterMaskOptions
): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  mask: Uint8Array;
  rasterWidth: number;
  rasterHeight: number;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  pixelsPerViewBoxUnit: number;
  rasterizationMethod: GeometryCenterMaskRasterizationMethod;
} | null {
  if (
    typeof document === 'undefined'
    || typeof document.createElement !== 'function'
  ) {
    return null;
  }

  const canvasSurface = createRasterSurface(viewBox, options.rasterSize);
  if (canvasSurface) {
    const canvasMask = rasterizeWithCanvasPath(pathData, viewBox, options, canvasSurface);
    if (canvasMask) {
      return buildRasterizedPathResult(
        viewBox,
        canvasSurface,
        canvasMask,
        'canvas-path2d'
      );
    }
  }

  const fallbackRasterSize = Math.min(options.rasterSize, SVG_HIT_TEST_FALLBACK_RASTER_SIZE);
  const svgSurface = createRasterSurface(viewBox, fallbackRasterSize);
  if (!svgSurface) {
    return null;
  }
  const svgMask = rasterizeWithSvgHitTesting(pathData, viewBox, options, svgSurface);
  return svgMask
    ? buildRasterizedPathResult(viewBox, svgSurface, svgMask, 'svg-is-point-in-fill')
    : null;
}

/**
 * Fills only background pixels that cannot reach the canvas edge. The resulting
 * copy is used for distance measurement; the unmodified source mask is applied
 * again before output so genuine holes remain transparent.
 */
function fillInteriorHoles(sourceMask: Uint8Array, width: number, height: number): {
  mask: Uint8Array;
  holesFilledPixels: number;
} {
  const exterior = new Uint8Array(sourceMask.length);
  const queue = new Int32Array(sourceMask.length);
  let queueStart = 0;
  let queueEnd = 0;

  const enqueueExterior = (index: number): void => {
    if (!sourceMask[index] && !exterior[index]) {
      exterior[index] = 1;
      queue[queueEnd++] = index;
    }
  };

  for (let x = 0; x < width; x++) {
    enqueueExterior(x);
    enqueueExterior((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueueExterior(y * width);
    enqueueExterior(y * width + width - 1);
  }

  // Pair four-connected background with eight-connected foreground so a
  // diagonal contact does not accidentally open an otherwise enclosed hole.
  const neighborOffsets = [
    [0, -1],
    [-1, 0], [1, 0],
    [0, 1]
  ];
  while (queueStart < queueEnd) {
    const index = queue[queueStart++];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [offsetX, offsetY] of neighborOffsets) {
      const neighborX = x + offsetX;
      const neighborY = y + offsetY;
      if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) {
        continue;
      }
      enqueueExterior(neighborY * width + neighborX);
    }
  }

  const filledMask = sourceMask.slice();
  let holesFilledPixels = 0;
  for (let index = 0; index < filledMask.length; index++) {
    if (!sourceMask[index] && !exterior[index]) {
      filledMask[index] = 1;
      holesFilledPixels++;
    }
  }
  return { mask: filledMask, holesFilledPixels };
}

function labelSourceConnectedComponents(
  sourceMask: Uint8Array,
  width: number,
  height: number
): WorkingComponent[] {
  const labels = new Int32Array(sourceMask.length);
  const queue = new Int32Array(sourceMask.length);
  const components: WorkingComponent[] = [];
  const neighborOffsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],             [1, 0],
    [-1, 1],  [0, 1],   [1, 1]
  ];

  for (let seed = 0; seed < sourceMask.length; seed++) {
    if (!sourceMask[seed] || labels[seed]) {
      continue;
    }

    const component: WorkingComponent = {
      index: components.length,
      holeFilledAreaPixels: 0,
      holesFilledPixels: 0,
      sourcePixelIndices: [],
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0
    };
    const label = component.index + 1;
    let queueStart = 0;
    let queueEnd = 0;
    labels[seed] = label;
    queue[queueEnd++] = seed;

    while (queueStart < queueEnd) {
      const index = queue[queueStart++];
      const x = index % width;
      const y = Math.floor(index / width);
      component.sourcePixelIndices.push(index);
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);

      for (const [offsetX, offsetY] of neighborOffsets) {
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) {
          continue;
        }
        const neighborIndex = neighborY * width + neighborX;
        if (sourceMask[neighborIndex] && !labels[neighborIndex]) {
          labels[neighborIndex] = label;
          queue[queueEnd++] = neighborIndex;
        }
      }
    }
    components.push(component);
  }

  return components;
}

function populateComponentHoleFilledEnvelope(
  component: WorkingComponent,
  sourceMask: Uint8Array,
  width: number,
  height: number
): ComponentEnvelopeAnalysis {
  const originX = Math.max(0, component.minX - 1);
  const originY = Math.max(0, component.minY - 1);
  const endX = Math.min(width - 1, component.maxX + 1);
  const endY = Math.min(height - 1, component.maxY + 1);
  const localWidth = endX - originX + 1;
  const localHeight = endY - originY + 1;
  const componentMask = new Uint8Array(localWidth * localHeight);
  const localSourcePixelIndices = component.sourcePixelIndices.map(globalIndex => {
    const globalX = globalIndex % width;
    const globalY = Math.floor(globalIndex / width);
    const localIndex = (globalY - originY) * localWidth + globalX - originX;
    componentMask[localIndex] = 1;
    return localIndex;
  });
  const holeFilledMask = fillInteriorHoles(
    componentMask,
    localWidth,
    localHeight
  ).mask;
  const holeFilledPixelIndices: number[] = [];

  for (let localIndex = 0; localIndex < holeFilledMask.length; localIndex++) {
    if (!holeFilledMask[localIndex]) {
      continue;
    }
    holeFilledPixelIndices.push(localIndex);
    component.holeFilledAreaPixels++;
    const localX = localIndex % localWidth;
    const localY = Math.floor(localIndex / localWidth);
    const globalIndex = (localY + originY) * width + localX + originX;
    // Other visible components enclosed by this one participate in depth
    // measurement but are not counted as transparent holes.
    if (!sourceMask[globalIndex]) {
      component.holesFilledPixels++;
    }
  }
  return {
    mask: holeFilledMask,
    width: localWidth,
    height: localHeight,
    originX,
    originY,
    holeFilledPixelIndices,
    sourcePixelIndices: localSourcePixelIndices
  };
}

/** Felzenszwalb/Huttenlocher's exact one-dimensional squared-distance transform. */
function distanceTransform1D(
  source: Float64Array,
  output: Float64Array,
  length: number,
  locations: Int32Array,
  boundaries: Float64Array
): void {
  let envelopeIndex = 0;
  locations[0] = 0;
  boundaries[0] = Number.NEGATIVE_INFINITY;
  boundaries[1] = Number.POSITIVE_INFINITY;

  for (let position = 1; position < length; position++) {
    let previous = locations[envelopeIndex];
    let intersection = (
      source[position] + position * position
      - source[previous] - previous * previous
    ) / (2 * (position - previous));

    while (intersection <= boundaries[envelopeIndex]) {
      envelopeIndex--;
      previous = locations[envelopeIndex];
      intersection = (
        source[position] + position * position
        - source[previous] - previous * previous
      ) / (2 * (position - previous));
    }

    envelopeIndex++;
    locations[envelopeIndex] = position;
    boundaries[envelopeIndex] = intersection;
    boundaries[envelopeIndex + 1] = Number.POSITIVE_INFINITY;
  }

  envelopeIndex = 0;
  for (let position = 0; position < length; position++) {
    while (boundaries[envelopeIndex + 1] < position) {
      envelopeIndex++;
    }
    const offset = position - locations[envelopeIndex];
    output[position] = offset * offset + source[locations[envelopeIndex]];
  }
}

function squaredEuclideanDistanceToExterior(
  mask: Uint8Array,
  width: number,
  height: number
): { distances: Float64Array; paddedWidth: number } {
  // A one-pixel exterior border makes paths touching the viewBox edge measurable.
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const maximumSquaredDistance = paddedWidth * paddedWidth + paddedHeight * paddedHeight + 1;
  const source = new Float64Array(paddedWidth * paddedHeight);
  source.fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        source[(y + 1) * paddedWidth + x + 1] = maximumSquaredDistance;
      }
    }
  }

  const intermediate = new Float64Array(source.length);
  const distances = new Float64Array(source.length);
  const maximumLineLength = Math.max(paddedWidth, paddedHeight);
  const lineSource = new Float64Array(maximumLineLength);
  const lineOutput = new Float64Array(maximumLineLength);
  const locations = new Int32Array(maximumLineLength);
  const boundaries = new Float64Array(maximumLineLength + 1);

  for (let y = 0; y < paddedHeight; y++) {
    const rowStart = y * paddedWidth;
    for (let x = 0; x < paddedWidth; x++) {
      lineSource[x] = source[rowStart + x];
    }
    distanceTransform1D(lineSource, lineOutput, paddedWidth, locations, boundaries);
    for (let x = 0; x < paddedWidth; x++) {
      intermediate[rowStart + x] = lineOutput[x];
    }
  }

  for (let x = 0; x < paddedWidth; x++) {
    for (let y = 0; y < paddedHeight; y++) {
      lineSource[y] = intermediate[y * paddedWidth + x];
    }
    distanceTransform1D(lineSource, lineOutput, paddedHeight, locations, boundaries);
    for (let y = 0; y < paddedHeight; y++) {
      distances[y * paddedWidth + x] = lineOutput[y];
    }
  }

  return { distances, paddedWidth };
}

function getComponentCenterThreshold(
  component: WorkingComponent,
  analysis: ComponentEnvelopeAnalysis,
  distances: Float64Array,
  paddedWidth: number,
  ringWidthRadiusFraction: number,
  minimumReadableCenterAreaFraction: number
): {
  thresholdSquared: number;
  radiusBasedThresholdSquared: number;
  readabilityThresholdSquared: number;
  minimumReadableCenterAreaPixels: number;
  maximumSquaredDistance: number;
  readabilityFloorApplied: boolean;
} {
  let maximumSquaredDistance = 0;
  // Include temporarily filled holes when finding the component's true
  // interior radius. Original holes are restored when the output is written.
  analysis.holeFilledPixelIndices.forEach(index => {
    const x = index % analysis.width;
    const y = Math.floor(index / analysis.width);
    const squaredDistance = Math.max(0, distances[(y + 1) * paddedWidth + x + 1]);
    maximumSquaredDistance = Math.max(maximumSquaredDistance, squaredDistance);
  });

  const radiusBasedThresholdSquared =
    maximumSquaredDistance * ringWidthRadiusFraction * ringWidthRadiusFraction;
  const minimumReadableCenterAreaPixels = Math.ceil(
    component.sourcePixelIndices.length * minimumReadableCenterAreaFraction
  );
  let readabilityThresholdSquared = Number.POSITIVE_INFINITY;

  if (minimumReadableCenterAreaPixels > 0) {
    const countsByDistance = new Map<number, number>();
    analysis.sourcePixelIndices.forEach(index => {
      const x = index % analysis.width;
      const y = Math.floor(index / analysis.width);
      const squaredDistance = Math.max(0, distances[(y + 1) * paddedWidth + x + 1]);
      countsByDistance.set(squaredDistance, (countsByDistance.get(squaredDistance) || 0) + 1);
    });

    let retainedPixels = 0;
    const distanceLevels = Array.from(countsByDistance.keys()).sort((left, right) => right - left);
    for (const distanceLevel of distanceLevels) {
      retainedPixels += countsByDistance.get(distanceLevel) || 0;
      if (retainedPixels >= minimumReadableCenterAreaPixels) {
        readabilityThresholdSquared = distanceLevel;
        break;
      }
    }
  }

  const thresholdSquared = Math.min(radiusBasedThresholdSquared, readabilityThresholdSquared);
  return {
    thresholdSquared,
    radiusBasedThresholdSquared,
    readabilityThresholdSquared,
    minimumReadableCenterAreaPixels,
    maximumSquaredDistance,
    readabilityFloorApplied: readabilityThresholdSquared < radiusBasedThresholdSquared
  };
}

/**
 * Builds a transparent PNG containing the geometry-derived white center of an
 * SVG path. It uses canvas Path2D when available and falls back to an attached
 * SVG geometry hit test. It returns null when neither synchronous geometry
 * path can rasterize the supplied shape.
 */
export function getGeometryCenterMask(
  pathData: string,
  viewBoxInput: GeometryCenterMaskViewBoxInput,
  options: GeometryCenterMaskOptions = {}
): GeometryCenterMaskResult | null {
  const viewBox = normalizeViewBox(viewBoxInput);
  if (!viewBox || typeof pathData !== 'string' || !pathData.trim()) {
    return null;
  }

  const normalizedOptions = normalizeOptions(options);
  const rasterizationCapability = getRasterizationCapability();
  const cacheKey = makeCacheKey(
    pathData,
    viewBox,
    normalizedOptions,
    rasterizationCapability
  );
  const cachedResult = geometryCenterMaskCache.get(cacheKey);
  if (cachedResult) {
    // Refresh insertion order so frequently used shapes stay in the bounded cache.
    geometryCenterMaskCache.delete(cacheKey);
    geometryCenterMaskCache.set(cacheKey, cachedResult);
    return cachedResult;
  }

  const rasterized = rasterizePath(pathData, viewBox, normalizedOptions);
  if (!rasterized) {
    return null;
  }

  try {
    const {
      canvas,
      context,
      mask: sourceMask,
      rasterWidth,
      rasterHeight,
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      pixelsPerViewBoxUnit,
      rasterizationMethod
    } = rasterized;
    const components = labelSourceConnectedComponents(sourceMask, rasterWidth, rasterHeight);
    const outputMask = new Uint8Array(sourceMask.length);
    const totalSourceAreaPixels = components.reduce(
      (total, component) => total + component.sourcePixelIndices.length,
      0
    );
    const requestedPixelsPerViewBoxUnit = normalizedOptions.rasterSize
      / Math.max(viewBox.width, viewBox.height);
    const effectiveRasterScale = Math.min(
      1,
      pixelsPerViewBoxUnit / requestedPixelsPerViewBoxUnit
    );
    const scaledMinimumComponentAreaPixels = Math.max(
      1,
      Math.round(
        normalizedOptions.minimumComponentAreaPixels
        * effectiveRasterScale
        * effectiveRasterScale
      )
    );
    const scaledMinimumComponentInradiusPixels =
      normalizedOptions.minimumComponentInradiusPixels * effectiveRasterScale;
    const minimumSignificantComponentArea = Math.max(
      scaledMinimumComponentAreaPixels,
      Math.round(totalSourceAreaPixels * normalizedOptions.minimumComponentAreaFraction)
    );
    const filledHoleUnion = new Uint8Array(sourceMask.length);

    const componentMetadata = components.map(component => {
      const componentAnalysis = populateComponentHoleFilledEnvelope(
        component,
        sourceMask,
        rasterWidth,
        rasterHeight
      );
      componentAnalysis.holeFilledPixelIndices.forEach(localIndex => {
        const localX = localIndex % componentAnalysis.width;
        const localY = Math.floor(localIndex / componentAnalysis.width);
        const globalIndex = (localY + componentAnalysis.originY) * rasterWidth
          + localX
          + componentAnalysis.originX;
        if (!sourceMask[globalIndex]) {
          filledHoleUnion[globalIndex] = 1;
        }
      });
      const distanceResult = squaredEuclideanDistanceToExterior(
        componentAnalysis.mask,
        componentAnalysis.width,
        componentAnalysis.height
      );
      const threshold = getComponentCenterThreshold(
        component,
        componentAnalysis,
        distanceResult.distances,
        distanceResult.paddedWidth,
        normalizedOptions.ringWidthRadiusFraction,
        normalizedOptions.minimumReadableCenterAreaFraction
      );
      const maximumInteriorRadiusPixels = Math.sqrt(threshold.maximumSquaredDistance);
      const skippedAsTiny =
        component.sourcePixelIndices.length < minimumSignificantComponentArea
        || maximumInteriorRadiusPixels < scaledMinimumComponentInradiusPixels;
      let centerAreaPixels = 0;

      if (!skippedAsTiny) {
        component.sourcePixelIndices.forEach((globalIndex, componentPixelIndex) => {
          const localIndex = componentAnalysis.sourcePixelIndices[componentPixelIndex];
          const x = localIndex % componentAnalysis.width;
          const y = Math.floor(localIndex / componentAnalysis.width);
          const squaredDistance = Math.max(0,
            distanceResult.distances[(y + 1) * distanceResult.paddedWidth + x + 1]
          );
          if (squaredDistance >= threshold.thresholdSquared) {
            // Intersecting with source indices is what restores original holes.
            outputMask[globalIndex] = 1;
            centerAreaPixels++;
          }
        });
      }

      const metadata: GeometryCenterMaskComponentMetadata = {
        index: component.index,
        sourceAreaPixels: component.sourcePixelIndices.length,
        holeFilledAreaPixels: component.holeFilledAreaPixels,
        holesFilledPixels: component.holesFilledPixels,
        centerAreaPixels,
        centerAreaFraction: component.sourcePixelIndices.length
          ? centerAreaPixels / component.sourcePixelIndices.length
          : 0,
        minimumReadableCenterAreaPixels: threshold.minimumReadableCenterAreaPixels,
        minimumReadableCenterAreaFraction: normalizedOptions.minimumReadableCenterAreaFraction,
        radiusBasedCenterThresholdDistancePixels: skippedAsTiny
          ? null
          : Math.sqrt(threshold.radiusBasedThresholdSquared),
        centerThresholdDistancePixels: skippedAsTiny ? null : Math.sqrt(threshold.thresholdSquared),
        centerThresholdDistanceViewBoxUnits: skippedAsTiny
          ? null
          : Math.sqrt(threshold.thresholdSquared) / pixelsPerViewBoxUnit,
        maximumInteriorRadiusPixels,
        ringWidthRadiusFraction: normalizedOptions.ringWidthRadiusFraction,
        readabilityFloorApplied: !skippedAsTiny && threshold.readabilityFloorApplied,
        skippedAsTiny,
        bounds: {
          x: component.minX,
          y: component.minY,
          width: component.maxX - component.minX + 1,
          height: component.maxY - component.minY + 1
        }
      };
      return Object.freeze(metadata);
    });
    let holesFilledPixels = 0;
    filledHoleUnion.forEach(isFilledHole => {
      holesFilledPixels += isFilledHole;
    });

    const outputImageData = context.createImageData(rasterWidth, rasterHeight);
    for (let index = 0; index < outputMask.length; index++) {
      if (outputMask[index]) {
        const rgbaIndex = index * 4;
        outputImageData.data[rgbaIndex] = 255;
        outputImageData.data[rgbaIndex + 1] = 255;
        outputImageData.data[rgbaIndex + 2] = 255;
        outputImageData.data[rgbaIndex + 3] = 255;
      }
    }
    context.clearRect(0, 0, rasterWidth, rasterHeight);
    context.putImageData(outputImageData, 0, 0);
    const imageDataUri = canvas.toDataURL('image/png');
    if (!imageDataUri.startsWith('data:image/png')) {
      return null;
    }

    const result: GeometryCenterMaskResult = Object.freeze({
      imageDataUri,
      x: imageX,
      y: imageY,
      width: imageWidth,
      height: imageHeight,
      rasterWidth,
      rasterHeight,
      rasterizationMethod,
      ringWidthRadiusFraction: normalizedOptions.ringWidthRadiusFraction,
      minimumReadableCenterAreaFraction: normalizedOptions.minimumReadableCenterAreaFraction,
      holesFilledPixels,
      components: Object.freeze(componentMetadata),
      algorithm: 'hole-filled-euclidean-distance-transform' as const,
      thresholdPolicy: 'half-inradius-with-minimum-readable-center-area' as const
    });
    // Do not pin a lower-resolution SVG fallback under a cache key that
    // predicted a healthy canvas path; a transient or shape-specific canvas
    // failure can then recover on the next call.
    if (
      rasterizationCapability !== 'canvas-path2d'
      || rasterizationMethod === 'canvas-path2d'
    ) {
      rememberResult(cacheKey, result);
    }
    return result;
  } catch (_error) {
    return null;
  }
}

export function clearGeometryCenterMaskCache(): void {
  geometryCenterMaskCache.clear();
}

export function getGeometryCenterMaskCacheSize(): number {
  return geometryCenterMaskCache.size;
}
