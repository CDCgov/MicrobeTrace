import AuspiceHandler from './auspiceHandler';

describe('AuspiceHandler', () => {
  let handler: AuspiceHandler;

  beforeEach(() => {
    handler = new AuspiceHandler({} as any);
  });

  describe('addLatLong', () => {
    it('skips missing deme metadata and continues to later geographic resolutions', () => {
      const nodes: any[] = [{
        _id: 'sample',
        division: 'District of Columbia',
        region: 'North America',
      }];
      const metadata = {
        geo_resolutions: [
          {
            key: 'division',
            demes: {},
          },
          {
            key: 'region',
            demes: {
              'North America': {
                latitude: 45,
                longitude: -100,
              },
            },
          },
        ],
      };

      expect(() => handler.addLatLong(nodes, metadata)).not.toThrow();
      expect(nodes[0].latitude).toBe(45);
    });

    it('allows Auspice metadata without geographic resolutions', () => {
      const nodes = [{ _id: 'sample' }];

      expect(handler.addLatLong(nodes, {})).toEqual(nodes);
      expect(handler.addLatLong(nodes, undefined)).toEqual(nodes);
    });
  });
});
