import type { NetworkNodeVisualFeatures } from '@app/contactTraceCommonServices/network-node-features';
import { buildSigmaNetworkFeatureAttributes } from './sigma-network-node-program';

describe('Sigma custom network node feature program', () => {
  it('keeps four sectors and combines additional donut values into the fourth sector', () => {
    const features: NetworkNodeVisualFeatures = {
      compositionField: 'Exposure',
      donutSegments: [
        { value: 'A', count: 1, fraction: 0.1, color: '#111111' },
        { value: 'B', count: 2, fraction: 0.2, color: '#222222' },
        { value: 'C', count: 3, fraction: 0.3, color: '#333333' },
        { value: 'D', count: 2, fraction: 0.2, color: '#444444' },
        { value: 'E', count: 2, fraction: 0.2, color: '#555555' },
      ],
      qc: {
        status: 'Review',
        severity: 'warning',
        reason: 'Mixed signal',
        color: '#d97706',
        symbol: '!',
      },
      uncertainty: 0.7,
      accessibleLabel: 'feature test',
    };

    const attributes = buildSigmaNetworkFeatureAttributes(features);

    expect(attributes.mtDonutCount).toBe(4);
    expect(attributes.mtDonutStops).toEqual([0.1, 0.3, 0.6, 1]);
    expect(attributes.mtDonutColor4).toBe('#444444');
    expect(attributes.mtQcVisible).toBe(1);
    expect(attributes.mtUncertainty).toBe(0.7);
    expect(attributes.mtFeatureScale).toBe(1.65);
  });

  it('keeps ordinary nodes at their original size and disables feature layers', () => {
    const attributes = buildSigmaNetworkFeatureAttributes({
      compositionField: null,
      donutSegments: [],
      qc: null,
      uncertainty: null,
      accessibleLabel: '',
    });

    expect(attributes.mtDonutCount).toBe(0);
    expect(attributes.mtQcVisible).toBe(0);
    expect(attributes.mtUncertainty).toBe(0);
    expect(attributes.mtFeatureScale).toBe(1);
  });
});
