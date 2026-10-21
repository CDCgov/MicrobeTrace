import {
  clearGeometryCenterMaskCache,
  getGeometryCenterMask,
  getGeometryCenterMaskCacheSize
} from './geometry-center-mask';

async function rasterizePngDataUri(dataUri: string): Promise<ImageData> {
  const image = new Image();
  image.src = dataUri;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to rasterize geometry center mask'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable');
  }
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

describe('geometry-derived center masks', () => {
  beforeEach(() => clearGeometryCenterMaskCache());

  it('uses half of the maximum interior radius and caches the result', () => {
    const path = 'M0 0H100V100H0Z';
    const first = getGeometryCenterMask(path, '0 0 100 100', { rasterSize: 200 });
    const second = getGeometryCenterMask(path, '0 0 100 100', { rasterSize: 200 });

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(getGeometryCenterMaskCacheSize()).toBe(1);
    expect(first?.imageDataUri).toContain('data:image/png');
    expect(first?.rasterizationMethod).toBe('canvas-path2d');
    expect(first?.thresholdPolicy).toBe('half-inradius-with-minimum-readable-center-area');
    expect(first?.ringWidthRadiusFraction).toBe(0.5);
    expect(first?.components.length).toBe(1);
    expect(first?.components[0].centerAreaFraction).toBeCloseTo(0.25, 1);
    expect(first?.components[0].centerThresholdDistancePixels).toBeCloseTo(
      first!.components[0].maximumInteriorRadiusPixels * 0.5,
      6
    );
    expect(first?.components[0].radiusBasedCenterThresholdDistancePixels)
      .toBe(first?.components[0].centerThresholdDistancePixels);
    expect(first?.components[0].ringWidthRadiusFraction).toBe(0.5);
    expect(first?.components[0].minimumReadableCenterAreaFraction).toBe(0.25);
    expect(first?.components[0].readabilityFloorApplied).toBe(false);
  });

  it('fills holes for depth measurement but restores them in the output alpha', async () => {
    const result = getGeometryCenterMask(
      'M0 0H100V100H0ZM40 40H60V60H40Z',
      { minX: 0, minY: 0, width: 100, height: 100 },
      { rasterSize: 200, fillRule: 'evenodd' }
    );

    expect(result).not.toBeNull();
    expect(result?.holesFilledPixels).toBeGreaterThan(100);
    expect(result?.components[0].holesFilledPixels).toBeGreaterThan(100);

    const imageData = await rasterizePngDataUri(result!.imageDataUri);
    const centerPixelAlpha = imageData.data[(100 * imageData.width + 100) * 4 + 3];
    expect(centerPixelAlpha).toBe(0);
  });

  it('leaves detached tiny geometry solid by omitting its white center', () => {
    const result = getGeometryCenterMask(
      'M0 0H90V100H0ZM115 45H116V46H115Z',
      '0 0 120 100',
      { rasterSize: 240 }
    );

    expect(result).not.toBeNull();
    expect(result?.components.length).toBe(2);
    const tinyComponent = result!.components.find(component => component.skippedAsTiny);
    expect(tinyComponent).toBeDefined();
    expect(tinyComponent?.centerAreaPixels).toBe(0);
    expect(tinyComponent?.centerThresholdDistancePixels).toBeNull();
  });

  it('derives an independent hollow center for each significant disconnected component', () => {
    const result = getGeometryCenterMask(
      'M0 0H40V50H0ZM60 0H100V50H60Z',
      '0 0 100 50',
      { rasterSize: 240 }
    );

    expect(result).not.toBeNull();
    expect(result?.components.length).toBe(2);
    result?.components.forEach(component => {
      expect(component.skippedAsTiny).toBe(false);
      expect(component.centerAreaPixels).toBeGreaterThan(0);
      expect(component.centerThresholdDistancePixels).toBeCloseTo(
        component.maximumInteriorRadiusPixels * 0.5,
        6
      );
    });
  });

  it('keeps an island inside another component hole independent', () => {
    const result = getGeometryCenterMask(
      'M0 0H100V100H0ZM20 20H80V80H20ZM40 40H60V60H40Z',
      '0 0 100 100',
      { rasterSize: 240, fillRule: 'evenodd', minimumComponentAreaFraction: 0 }
    );

    expect(result).not.toBeNull();
    expect(result?.components.length).toBe(2);
    const componentsByArea = [...result!.components]
      .sort((left, right) => right.sourceAreaPixels - left.sourceAreaPixels);
    const outerRing = componentsByArea[0];
    const innerIsland = componentsByArea[1];
    expect(outerRing.holesFilledPixels).toBeGreaterThan(100);
    expect(innerIsland.holesFilledPixels).toBe(0);
    expect(outerRing.maximumInteriorRadiusPixels)
      .toBeGreaterThan(innerIsland.maximumInteriorRadiusPixels * 3);
    expect(innerIsland.skippedAsTiny).toBe(false);
    expect(innerIsland.centerAreaPixels).toBeGreaterThan(0);
  });

  it('uses radius depth rather than a 25%-area quantile for elongated geometry', () => {
    const result = getGeometryCenterMask(
      'M0 0H200V40H0Z',
      '0 0 200 40',
      { rasterSize: 400 }
    );

    expect(result).not.toBeNull();
    const component = result!.components[0];
    expect(component.centerThresholdDistancePixels).toBeCloseTo(
      component.maximumInteriorRadiusPixels * 0.5,
      6
    );
    expect(component.radiusBasedCenterThresholdDistancePixels)
      .toBe(component.centerThresholdDistancePixels);
    expect(component.readabilityFloorApplied).toBe(false);
    expect(component.centerThresholdDistanceViewBoxUnits).toBeCloseTo(10, 0);
    // A long rectangle retains roughly half its area after a half-inradius
    // inset. An area-quantile implementation would force this down near 25%.
    expect(component.centerAreaFraction).toBeGreaterThan(0.4);
    expect(component.centerAreaFraction).toBeLessThan(0.55);
  });

  it('relaxes the radius threshold to keep thin irregular geometry readable', () => {
    const result = getGeometryCenterMask(
      'M0 0H100V45H500V55H100V100H0Z',
      '0 0 500 100',
      { rasterSize: 500 }
    );

    expect(result).not.toBeNull();
    const component = result!.components[0];
    expect(component.radiusBasedCenterThresholdDistancePixels).toBeCloseTo(
      component.maximumInteriorRadiusPixels * 0.5,
      6
    );
    expect(component.readabilityFloorApplied).toBe(true);
    expect(component.centerThresholdDistancePixels!)
      .toBeLessThan(component.radiusBasedCenterThresholdDistancePixels!);
    expect(component.centerAreaPixels).toBeGreaterThanOrEqual(
      component.minimumReadableCenterAreaPixels
    );
    expect(component.centerAreaFraction).toBeGreaterThanOrEqual(0.25);
  });

  it('falls back to attached SVG geometry hit testing when Path2D rejects a shape', async () => {
    const path2DDescriptor = Object.getOwnPropertyDescriptor(window, 'Path2D');
    const originalPath2D = window.Path2D;
    const existingRasterizers = document.querySelectorAll(
      '[data-mt-geometry-center-mask-rasterizer="true"]'
    ).length;
    let result: ReturnType<typeof getGeometryCenterMask> = null;

    try {
      Object.defineProperty(window, 'Path2D', {
        configurable: true,
        writable: true,
        value: function RejectedPath2D(): never {
          throw new Error('Path2D rejected geometry');
        }
      });
      clearGeometryCenterMaskCache();
      result = getGeometryCenterMask(
        'M0 0H100V100H0ZM40 40H60V60H40Z',
        '0 0 100 100',
        { rasterSize: 600, fillRule: 'evenodd' }
      );
      const cachedResult = getGeometryCenterMask(
        'M0 0H100V100H0ZM40 40H60V60H40Z',
        '0 0 100 100',
        { rasterSize: 600, fillRule: 'evenodd' }
      );

      expect(result).not.toBeNull();
      expect(cachedResult).toBe(result);
      expect(result?.rasterizationMethod).toBe('svg-is-point-in-fill');
      expect(result?.rasterWidth).toBeLessThanOrEqual(200);
      expect(result?.holesFilledPixels).toBeGreaterThan(100);
      expect(result?.components[0].centerAreaFraction).toBeGreaterThanOrEqual(0.25);
      expect(document.querySelectorAll('[data-mt-geometry-center-mask-rasterizer="true"]').length)
        .toBe(existingRasterizers);
    } finally {
      if (path2DDescriptor) {
        Object.defineProperty(window, 'Path2D', path2DDescriptor);
      } else {
        Object.defineProperty(window, 'Path2D', {
          configurable: true,
          writable: true,
          value: originalPath2D
        });
      }
      clearGeometryCenterMaskCache();
    }

    const imageData = await rasterizePngDataUri(result!.imageDataUri);
    const centerX = Math.round((50 - result!.x) / result!.width * imageData.width);
    const centerY = Math.round((50 - result!.y) / result!.height * imageData.height);
    const centerPixelAlpha = imageData.data[(centerY * imageData.width + centerX) * 4 + 3];
    expect(centerPixelAlpha).toBe(0);
  });

  it('keeps component significance consistent at the lower SVG fallback resolution', () => {
    const path2DDescriptor = Object.getOwnPropertyDescriptor(window, 'Path2D');
    const originalPath2D = window.Path2D;
    const path = 'M0 0H90V100H0ZM115 45H116V46H115Z';
    const viewBox = '0 0 120 100';
    const options = {
      rasterSize: 600,
      minimumComponentAreaPixels: 16,
      minimumComponentAreaFraction: 0,
      minimumComponentInradiusPixels: 1.5
    };
    const fastResult = getGeometryCenterMask(path, viewBox, options);
    let fallbackResult: ReturnType<typeof getGeometryCenterMask> = null;

    try {
      Object.defineProperty(window, 'Path2D', {
        configurable: true,
        writable: true,
        value: function RejectedPath2D(): never {
          throw new Error('Path2D rejected geometry');
        }
      });
      fallbackResult = getGeometryCenterMask(path, viewBox, options);

      expect(fastResult?.rasterizationMethod).toBe('canvas-path2d');
      expect(fallbackResult?.rasterizationMethod).toBe('svg-is-point-in-fill');
      expect(fastResult?.components.length).toBe(2);
      expect(fallbackResult?.components.length).toBe(2);
      const fastTinyComponent = [...fastResult!.components]
        .sort((left, right) => left.sourceAreaPixels - right.sourceAreaPixels)[0];
      const fallbackTinyComponent = [...fallbackResult!.components]
        .sort((left, right) => left.sourceAreaPixels - right.sourceAreaPixels)[0];
      expect(fastTinyComponent.skippedAsTiny).toBe(false);
      expect(fallbackTinyComponent.skippedAsTiny).toBe(false);
    } finally {
      if (path2DDescriptor) {
        Object.defineProperty(window, 'Path2D', path2DDescriptor);
      } else {
        Object.defineProperty(window, 'Path2D', {
          configurable: true,
          writable: true,
          value: originalPath2D
        });
      }
    }

    const recoveredFastResult = getGeometryCenterMask(path, viewBox, options);
    expect(recoveredFastResult).toBe(fastResult);
    expect(recoveredFastResult).not.toBe(fallbackResult);
    expect(getGeometryCenterMaskCacheSize()).toBe(2);
    clearGeometryCenterMaskCache();
  });

  it('returns null for invalid geometry inputs', () => {
    expect(getGeometryCenterMask('', '0 0 100 100')).toBeNull();
    expect(getGeometryCenterMask('M0 0H10V10Z', '0 0 0 100')).toBeNull();
  });
});
