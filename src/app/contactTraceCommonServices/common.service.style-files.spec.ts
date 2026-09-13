import { CommonService } from './common.service';

describe('CommonService style-file color scales', () => {
  function createService(style: any): CommonService {
    const service = Object.create(CommonService.prototype) as CommonService;
    (service as any).session = {
      data: { nodes: [], links: [] },
      style
    };
    (service as any).temp = {
      style: {
        nodeColorMap: () => '#000000',
        nodeAlphaMap: () => 1,
        nodeColorScale: null,
        linkColorMap: () => '#000000',
        linkAlphaMap: () => 1,
        linkColorScale: null
      }
    };
    return service;
  }

  function stubStyleApplication(service: CommonService): void {
    spyOn(service, 'defaultWidgets').and.returnValue({} as any);
    spyOn(service, 'createNodeColorMap');
    spyOn(service, 'createLinkColorMap');
    spyOn(service, 'createPolygonColorMap');
    spyOn(service, 'onStyleFileApplied');
  }

  it('keeps selected fields categorical when loading a legacy style file', () => {
    const legacyStyle: any = {
      widgets: {
        'node-color-variable': 'score',
        'link-color-variable': 'distance'
      }
    };
    const service = createService({});
    stubStyleApplication(service);

    service.applyStyle(legacyStyle);

    expect(legacyStyle.variableColorScales).toEqual(jasmine.objectContaining({ version: 1 }));
    expect(legacyStyle.variableColorScales.node.score.mode).toBe('categorical');
    expect(legacyStyle.variableColorScales.link.distance.mode).toBe('categorical');
    expect(service.createNodeColorMap).toHaveBeenCalled();
    expect(service.createLinkColorMap).toHaveBeenCalled();
  });

  it('preserves explicit ramps even when a hand-authored file omits the scale-state version', () => {
    const style: any = {
      widgets: {
        'node-color-variable': 'score',
        'link-color-variable': 'distance'
      },
      variableColorScales: {
        node: {
          score: {
            mode: 'continuous',
            domain: { kind: 'custom', min: 0, max: 10 },
            stops: [
              { value: 0, color: '#000000' },
              { value: 10, color: '#ffffff' }
            ],
            missingColor: '#123456'
          }
        },
        link: {}
      }
    };
    const service = createService({});
    stubStyleApplication(service);

    service.applyStyle(style);

    expect(style.variableColorScales.version).toBe(1);
    expect(style.variableColorScales.node.score).toEqual({
      mode: 'continuous',
      domain: { kind: 'custom', min: 0, max: 10 },
      stops: [
        { value: 0, color: '#000000' },
        { value: 10, color: '#ffffff' }
      ],
      missingColor: '#123456'
    });
    expect(style.variableColorScales.link.distance.mode).toBe('categorical');
  });

  it('serializes normalized ramp state without mutating the live style', () => {
    const liveStyle: any = {
      widgets: {
        'node-color-variable': 'score',
        'link-color-variable': 'distance'
      },
      variableColorScales: {
        version: 1,
        node: {
          score: {
            mode: 'continuous',
            domain: { kind: 'custom', min: 0, max: 10 },
            stops: [
              { value: 0, color: '#440154' },
              { value: 10, color: '#fde725' }
            ],
            missingColor: '#eae553'
          }
        },
        link: {
          distance: {
            mode: 'auto',
            domain: { kind: 'auto' },
            missingColor: '#eae553'
          }
        }
      }
    };
    const service = createService(liveStyle);

    const payload = JSON.parse(service.serializeStyleFile());

    expect(payload.variableColorScales.version).toBe(1);
    expect(payload.variableColorScales.node.score.mode).toBe('continuous');
    expect(payload.variableColorScales.node.score.stops).toEqual([
      { value: 0, color: '#440154' },
      { value: 10, color: '#fde725' }
    ]);
    expect(payload.variableColorScales.link.distance.mode).toBe('auto');
    expect(payload.nodeColorAssignments).toEqual({});
    expect(payload.linkColorAssignments).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(liveStyle, 'nodeColorAssignments')).toBeFalse();
    expect(liveStyle.variableColorScales.link.distance.mode).toBe('auto');
  });

  it('upgrades a never-normalized legacy style when it is saved', () => {
    const liveStyle: any = {
      widgets: {
        'node-color-variable': 'score',
        'link-color-variable': 'distance'
      }
    };
    const service = createService(liveStyle);

    const payload = JSON.parse(service.serializeStyleFile());

    expect(payload.variableColorScales.node.score.mode).toBe('categorical');
    expect(payload.variableColorScales.link.distance.mode).toBe('categorical');
    expect(Object.prototype.hasOwnProperty.call(liveStyle, 'variableColorScales')).toBeFalse();
  });

  it('clears a cached continuous link scale when a style switches to a fixed link color', () => {
    const service = createService({
      widgets: {
        'link-color-variable': 'None',
        'link-color': '#abcdef',
        'link-opacity': 0.25
      }
    });
    (service as any).temp.style.linkColorScale = { mode: 'continuous', field: 'distance' };

    service.createLinkColorMap();

    expect((service as any).temp.style.linkColorScale).toBeNull();
    expect((service as any).temp.style.linkColorMap()).toBe('#abcdef');
    expect((service as any).temp.style.linkAlphaMap()).toBe(0.75);
  });

  it('clears a cached continuous node scale when a style switches to a fixed node color', () => {
    const service = createService({
      widgets: {
        'node-color-variable': 'None',
        'node-color': '#abcdef'
      }
    });
    (service as any).temp.style.nodeColorScale = { mode: 'continuous', field: 'score' };

    service.createNodeColorMap();

    expect((service as any).temp.style.nodeColorScale).toBeNull();
    expect((service as any).temp.style.nodeColorMap()).toBe('#abcdef');
    expect((service as any).temp.style.nodeAlphaMap()).toBe(1);
    expect((service as any).session.style.variableColorScales).toBeUndefined();
  });
});
