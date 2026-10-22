import AuspiceHandler from './auspiceHandler';
import * as patristic from 'patristic';
import temporalMapDataset from '../../../docs/integrations/examples/microbetrace-auspice-temporal-map.json';
import {
  AUSPICE_NUM_DATE_STORAGE_KEY,
  buildAuspiceV2Dataset,
} from './auspiceExporter';

describe('AuspiceHandler MicrobeTrace geography', () => {
  it('imports the same tip order that Auspice displays', () => {
    const handler = new AuspiceHandler({} as any);
    const result: any = handler.run({
      version: 'v2',
      meta: {},
      tree: {
        name: 'root',
        node_attrs: { div: 0 },
        children: [
          {
            name: 'right',
            node_attrs: { div: 0.1 },
            children: [
              { name: 'D', node_attrs: { div: 0.3 } },
              { name: 'C', node_attrs: { div: 0.2 } },
            ],
          },
          {
            name: 'left',
            node_attrs: { div: 0.1 },
            children: [
              { name: 'B', node_attrs: { div: 0.3 } },
              { name: 'A', node_attrs: { div: 0.2 } },
            ],
          },
        ],
      },
    });

    expect(result.tree.getLeaves().map(leaf => leaf.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.newick).toMatch(/^\(\(A:/);
  });

  it('restores coordinates from a MicrobeTrace synthetic geo resolution', () => {
    const handler = new AuspiceHandler({} as any);
    const result: any = handler.run({
      version: 'v2',
      meta: {
        updated: '2026-09-22',
        panels: ['tree', 'map'],
        geo_resolutions: [{
          key: 'microbetrace_location',
          demes: {
            sample_a: { latitude: 33.7, longitude: -84.4 },
          },
        }],
      },
      tree: {
        name: 'NODE_0000000',
        node_attrs: { div: 0 },
        children: [
          {
            name: 'A',
            node_attrs: {
              div: 0.1,
              microbetrace_location: { value: 'sample_a' },
            },
          },
          { name: 'B', node_attrs: { div: 0.2 } },
        ],
      },
    });

    const mappedNode = result.nodes.find(node => node.id === 'A');
    expect(mappedNode.latitude).toBe(33.7);
    expect(mappedNode.longitude).toBe(-84.4);
    expect(result.mapData.countries.features).toContain(jasmine.objectContaining({ id: 'sample_a' }));
  });

  it('restores coordinates from the default site resolution when multiple resolutions exist', () => {
    const handler = new AuspiceHandler({} as any);
    const result: any = handler.run({
      version: 'v2',
      meta: {
        panels: ['tree', 'map'],
        display_defaults: { geo_resolution: 'site' },
        geo_resolutions: [
          {
            key: 'country',
            demes: { usa: { latitude: 39.8, longitude: -98.6 } },
          },
          {
            key: 'state',
            demes: { georgia: { latitude: 32.7, longitude: -83.3 } },
          },
          {
            key: 'site',
            demes: { atlanta_clinic: { latitude: 33.75, longitude: -84.39 } },
          },
        ],
      },
      tree: {
        name: 'NODE_0000000',
        node_attrs: { div: 0 },
        children: [
          {
            name: 'A',
            node_attrs: {
              div: 0.1,
              country: { value: 'usa' },
              state: { value: 'georgia' },
              site: { value: 'atlanta_clinic' },
            },
          },
          { name: 'B', node_attrs: { div: 0.2 } },
        ],
      },
    });

    const mappedNode = result.nodes.find(node => node.id === 'A');
    expect(mappedNode.latitude).toBe(33.75);
    expect(mappedNode.longitude).toBe(-84.39);
    expect(result.mapData.states.features).toContain(jasmine.objectContaining({ id: 'georgia' }));
    expect(result.mapData.countries.features).toContain(jasmine.objectContaining({ id: 'atlanta_clinic' }));
  });

  it('falls back to the first usable precise resolution when the configured resolution is invalid', () => {
    const handler = new AuspiceHandler({} as any);
    const result: any = handler.run({
      version: 'v2',
      meta: {
        panels: ['tree', 'map'],
        display_defaults: { geo_resolution: 'country' },
        geo_resolutions: [
          {
            key: 'location',
            demes: { legacy: { latitude: 1, longitude: 2 } },
          },
          {
            key: 'country',
            demes: { usa: { latitude: 999, longitude: -98.6 } },
          },
          {
            key: 'site',
            demes: { atlanta_clinic: { latitude: 33.75, longitude: -84.39 } },
          },
        ],
      },
      tree: {
        name: 'NODE_0000000',
        node_attrs: { div: 0 },
        children: [
          {
            name: 'A',
            node_attrs: {
              div: 0.1,
              location: { value: 'legacy' },
              country: { value: 'usa' },
              site: { value: 'atlanta_clinic' },
            },
          },
          { name: 'B', node_attrs: { div: 0.2 } },
        ],
      },
    });

    const mappedNode = result.nodes.find(node => node.id === 'A');
    expect(mappedNode.latitude).toBe(33.75);
    expect(mappedNode.longitude).toBe(-84.39);
    expect(result.mapData.countries.features).toContain(jasmine.objectContaining({ id: 'atlanta_clinic' }));
    expect(result.mapData.countries.features).not.toContain(jasmine.objectContaining({ id: 'usa' }));
  });

  it('round-trips structured num_date values without exposing private storage as node metadata', () => {
    const handler = new AuspiceHandler({} as any);
    const result: any = handler.run({
      version: 'v2',
      meta: { panels: ['tree'] },
      tree: {
        name: 'NODE_0000000',
        node_attrs: {
          div: 0,
          num_date: { value: 2020, confidence: [2019.9, 2020.1] },
        },
        children: [
          {
            name: 'B',
            node_attrs: {
              div: 0.2,
              num_date: { value: 2020.6, inferred: true, raw_value: '2020-08-XX' },
            },
          },
          {
            name: 'A',
            node_attrs: {
              div: 0.1,
              num_date: { value: 2020.4, inferred: false },
            },
          },
        ],
      },
    });

    expect(result.tree.data[AUSPICE_NUM_DATE_STORAGE_KEY]).toEqual({
      value: 2020,
      confidence: [2019.9, 2020.1],
    });
    expect(result.nodes.find(node => node.id === 'A').num_date).toBe(2020.4);
    expect(result.nodes.every(node => (
      node[AUSPICE_NUM_DATE_STORAGE_KEY] === undefined
    ))).toBeTrue();

    const dataset = buildAuspiceV2Dataset({
      tree: {
        id: 'NODE_0000000',
        length: 0,
        children: [
          { id: 'A', length: 0.1 },
          { id: 'B', length: 0.1 },
        ],
      },
      attributeTree: result.tree,
      nodes: result.nodes.filter(node => node.id === 'A' || node.id === 'B'),
      nodeFields: ['num_date'],
    });

    expect(dataset.tree.node_attrs.num_date).toEqual({
      value: 2020,
      confidence: [2019.9, 2020.1],
    });
    expect(dataset.tree.children!.find(node => node.name === 'A')!.node_attrs.num_date)
      .toEqual({ value: 2020.4, inferred: false });
    expect(dataset.tree.children!.find(node => node.name === 'B')!.node_attrs.num_date)
      .toEqual({ value: 2020.6, inferred: true, raw_value: '2020-08-XX' });
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({
      key: 'num_date',
      type: 'temporal',
    }));
    expect(JSON.stringify(dataset)).not.toContain('microbetrace_num_date');
  });

  it('round-trips the synthetic temporal map demonstration dataset', () => {
    const roundTrip = (source: any) => {
      const handler = new AuspiceHandler({} as any);
      const imported: any = handler.run(JSON.parse(JSON.stringify(source)));
      return buildAuspiceV2Dataset({
        tree: patristic.parseNewick(imported.newick) as any,
        attributeTree: imported.tree,
        nodes: imported.nodes.filter(node => !/^NODE_[0-9]{7}$/i.test(node.id)),
        nodeFields: ['sample_group', 'country', 'division', 'site'],
        colorBy: 'num_date',
        latitudeField: 'latitude',
        longitudeField: 'longitude',
        geographyFields: [
          { key: 'country', title: 'Country', field: 'country' },
          { key: 'division', title: 'Division', field: 'division' },
          { key: 'site', title: 'Site', field: 'site' },
        ],
      });
    };
    const indexNumDates = (root: any): Map<number, any> => {
      const dates = new Map<number, any>();
      const visit = (node: any): void => {
        const numDate = node.node_attrs?.num_date;
        if (numDate) dates.set(numDate.value, numDate);
        (node.children || []).forEach(visit);
      };
      visit(root);
      return dates;
    };

    const firstExport = roundTrip(temporalMapDataset);
    const secondExport = roundTrip(firstExport);
    const sourceDates = indexNumDates(temporalMapDataset.tree);

    expect(indexNumDates(firstExport.tree)).toEqual(sourceDates);
    expect(indexNumDates(secondExport.tree)).toEqual(sourceDates);
    expect(firstExport.meta.panels).toEqual(['tree', 'map']);
    expect(firstExport.meta.geo_resolutions).toEqual(temporalMapDataset.meta.geo_resolutions);
    expect(secondExport.meta.geo_resolutions).toEqual(temporalMapDataset.meta.geo_resolutions);
    expect(firstExport.meta.display_defaults).toEqual(jasmine.objectContaining({
      distance_measure: 'num_date',
      color_by: 'num_date',
      geo_resolution: 'site',
    }));
    expect(JSON.stringify(firstExport)).not.toContain(AUSPICE_NUM_DATE_STORAGE_KEY);
    expect(JSON.stringify(firstExport)).not.toContain('microbetrace_num_date');
  });
});
