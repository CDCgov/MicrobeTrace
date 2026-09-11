import { CommonService } from './common.service';

describe('CommonService node color assignments', () => {
  function createService(style: any): CommonService {
    const service = Object.create(CommonService.prototype) as CommonService;
    (service as any).session = { style };
    spyOn(service, 'createNodeColorMap');
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
});
