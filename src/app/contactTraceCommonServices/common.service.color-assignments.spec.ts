import { CommonService } from './common.service';

describe('CommonService node color assignments', () => {
  function createService(style: any): CommonService {
    const service = Object.create(CommonService.prototype) as CommonService;
    (service as any).session = { data: { nodes: [], links: [] }, style };
    spyOn(service, 'createNodeColorMap');
    spyOn(service, 'createLinkColorMap');
    return service;
  }

  it('merges a partial import and retains assignments for values absent from the current data', () => {
    const service = createService({
      nodeColorAssignments: {
        MLST: { future: '#112233', repeated: '#445566' }
      }
    });

    const merged = service.applyNodeColorAssignments('MLST', {
      repeated: '#abcdef',
      current: '#123456'
    });

    expect(merged).toEqual(jasmine.objectContaining({
      future: '#112233',
      repeated: '#abcdef',
      current: '#123456'
    }));
    expect((service as any).session.style.nodeColorAssignments.MLST.future).toBe('#112233');
    expect(service.createNodeColorMap).toHaveBeenCalled();
  });

  it('initializes assignment state for a legacy style and keeps fields isolated', () => {
    const service = createService({});

    service.applyNodeColorAssignments('MLST', { shared: '#aabbcc' });
    service.applyNodeColorAssignments('Other', { shared: '#112233' });

    expect((service as any).session.style.nodeColorAssignments.MLST.shared).toBe('#aabbcc');
    expect((service as any).session.style.nodeColorAssignments.Other.shared).toBe('#112233');
  });

  it('applies imported node ramp stops with a custom domain', () => {
    const service = createService({});
    (service as any).session.data.nodes = [{ score: '0' }, { score: 5 }, { score: '10' }];

    const applied = service.applyVariableColorAssignments('node', 'score', {
      '10': '#ffffff',
      '0': '#000000',
      '5': '#ff0000'
    }, 'continuous');

    expect(applied.mode).toBe('continuous');
    expect(applied.stops).toEqual([
      { value: 0, color: '#000000' },
      { value: 5, color: '#ff0000' },
      { value: 10, color: '#ffffff' }
    ]);
    expect((service as any).session.style.variableColorScales.node.score).toEqual(jasmine.objectContaining({
      mode: 'continuous',
      domain: { kind: 'custom', min: 0, max: 10 },
      stops: applied.stops
    }));
    expect(service.createNodeColorMap).toHaveBeenCalled();
  });

  it('supports continuous and categorical link assignment files independently', () => {
    const service = createService({});
    (service as any).session.data.links = [{ distance: 0 }, { distance: 20 }];

    service.applyVariableColorAssignments('link', 'distance', {
      '0': '#000000',
      '20': '#ffffff'
    }, 'continuous');
    service.applyLinkColorAssignments('setting', { household: '#123456' });

    expect((service as any).session.style.variableColorScales.link.distance).toEqual(jasmine.objectContaining({
      mode: 'continuous',
      domain: { kind: 'custom', min: 0, max: 20 }
    }));
    expect((service as any).session.style.linkColorAssignments.setting.household).toBe('#123456');
    expect(service.createLinkColorMap).toHaveBeenCalledTimes(2);
  });

  it('rejects nonnumeric continuous assignments without changing scale state', () => {
    const service = createService({});
    (service as any).session.data.nodes = [{ score: 0 }, { score: 10 }];

    expect(() => service.applyVariableColorAssignments('node', 'score', {
      low: '#000000',
      high: '#ffffff'
    }, 'continuous')).toThrowError(/not a finite number/);
    expect((service as any).session.style.variableColorScales).toBeUndefined();
    expect(service.createNodeColorMap).not.toHaveBeenCalled();
  });
});
