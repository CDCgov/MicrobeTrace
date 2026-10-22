import { canonicalSplitKey } from '@app/workers/phylogenetic-bootstrap-utils';
import Ajv from 'ajv';
import draft6MetaSchema from 'ajv/dist/refs/json-schema-draft-06.json';
import annotationsSchema from './testData/auspice-annotations-schema.pinned.json';
import auspiceConfigSchema from './testData/auspice-config-v2-schema.pinned.json';
import rootSequenceSchema from './testData/auspice-root-sequence-schema.pinned.json';
import auspiceV2Schema from './testData/auspice-v2-schema.pinned.json';
import temporalMapDataset from '../../../docs/integrations/examples/microbetrace-auspice-temporal-map.json';
import { parseDatedNewick } from './datedNewick';
import {
  AUSPICE_NUM_DATE_STORAGE_KEY,
  AuspiceExportError,
  buildAuspiceV2Dataset,
  ensureAuspiceJsonFilename,
  getAuspiceExportFieldOptions,
  resolveAuspiceExportNodeCoordinates,
} from './auspiceExporter';

describe('Auspice v2 exporter', () => {
  const auspiceDisplayLeafOrder = (node: any): string[] => {
    const children = Array.isArray(node?.children) ? node.children : [];
    return children.length
      ? [...children].reverse().flatMap(auspiceDisplayLeafOrder)
      : [String(node?.name ?? '')];
  };

  const fourTipTree = () => ({
    id: 'original-root',
    length: 0,
    children: [
      {
        id: 'left-clade',
        length: 0.1,
        children: [
          { id: 'A', length: 0.2 },
          { id: 'B', length: 0.3 },
        ],
      },
      {
        id: '',
        length: 0.4,
        children: [
          { id: 'C', length: 0.5 },
          { id: 'D', length: 0.6 },
        ],
      },
    ],
  });

  const fourTipNumDateTree = () => {
    const tree: any = fourTipTree();
    tree.data = {
      [AUSPICE_NUM_DATE_STORAGE_KEY]: {
        value: 2020,
        confidence: [2019.9, 2020.1],
      },
    };
    tree.children[0].data = {
      [AUSPICE_NUM_DATE_STORAGE_KEY]: { value: 2020.1 },
    };
    tree.children[0].children[0].data = {
      [AUSPICE_NUM_DATE_STORAGE_KEY]: {
        value: 2020.4,
        confidence: [2020.35, 2020.45],
        inferred: false,
      },
    };
    tree.children[0].children[1].data = {
      [AUSPICE_NUM_DATE_STORAGE_KEY]: {
        value: 2020.5,
        inferred: true,
        raw_value: '2020-07-XX',
      },
    };
    tree.children[1].data = {
      [AUSPICE_NUM_DATE_STORAGE_KEY]: { value: 2020.2 },
    };
    tree.children[1].children[0].data = {
      [AUSPICE_NUM_DATE_STORAGE_KEY]: { value: 2020.6 },
    };
    tree.children[1].children[1].data = {
      [AUSPICE_NUM_DATE_STORAGE_KEY]: { value: 2020.7 },
    };
    return tree;
  };

  it('creates a deterministic v2 divergence tree and preserves current Auspice display order', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: fourTipTree(),
      title: 'Current tree',
      updated: '2026-09-22',
    });

    expect(dataset.version).toBe('v2');
    expect(dataset.meta).toEqual(jasmine.objectContaining({
      title: 'Current tree',
      updated: '2026-09-22',
      panels: ['tree'],
      display_defaults: { distance_measure: 'div' },
    }));
    expect(dataset.tree.name).toBe('NODE_0000000');
    expect(dataset.tree.node_attrs.div).toBe(0);
    expect(dataset.tree.branch_attrs?.labels?.microbetrace).toBe('original-root');

    const left = dataset.tree.children!.find(child => (
      child.branch_attrs?.labels?.microbetrace === 'left-clade'
    ))!;
    const right = dataset.tree.children!.find(child => child !== left)!;
    expect(left.name).toBe('NODE_0000001');
    expect(right.name).toBe('NODE_0000002');
    expect(left.node_attrs.div).toBeCloseTo(0.1, 10);
    expect(left.children!.map(child => child.name)).toEqual(['B', 'A']);
    expect(left.children!.find(child => child.name === 'A')!.node_attrs.div).toBeCloseTo(0.3, 10);
    expect(left.children!.find(child => child.name === 'B')!.node_attrs.div).toBeCloseTo(0.4, 10);
    expect(right.children!.map(child => child.name)).toEqual(['D', 'C']);
    expect(right.children!.find(child => child.name === 'C')!.node_attrs.div).toBeCloseTo(0.9, 10);
    expect(right.children!.find(child => child.name === 'D')!.node_attrs.div).toBeCloseTo(1, 10);
    expect(auspiceDisplayLeafOrder(dataset.tree)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('avoids collisions between generated internal names and sample IDs', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: {
        children: [
          { id: 'NODE_0000000', length: 1 },
          { id: 'sample-2', length: 1 },
        ],
      },
    });

    expect(dataset.tree.name).toBe('NODE_0000001');
    expect(dataset.tree.children!.map(child => child.name)).toEqual(['sample-2', 'NODE_0000000']);
    expect(auspiceDisplayLeafOrder(dataset.tree)).toEqual(['NODE_0000000', 'sample-2']);
  });

  it('preserves a complete num_date tree without changing divergence', () => {
    const tree = fourTipNumDateTree();
    const fieldOptions = getAuspiceExportFieldOptions({ tree, colorBy: 'num_date' });
    const dataset = buildAuspiceV2Dataset({ tree, colorBy: 'num_date' });

    expect(fieldOptions).toContain(jasmine.objectContaining({
      key: 'num_date',
      title: 'Sampling date',
      type: 'temporal',
      synthetic: true,
    }));
    expect(dataset.meta.colorings?.[0]).toEqual({
      key: 'num_date',
      title: 'Sampling date',
      type: 'temporal',
    });
    expect(dataset.meta.filters).toContain('num_date');
    expect(dataset.meta.display_defaults).toEqual(jasmine.objectContaining({
      distance_measure: 'num_date',
      color_by: 'num_date',
    }));
    expect(dataset.tree.node_attrs.div).toBe(0);
    expect(dataset.tree.node_attrs.num_date).toEqual({
      value: 2020,
      confidence: [2019.9, 2020.1],
    });

    const left = dataset.tree.children!.find(child => (
      child.branch_attrs?.labels?.microbetrace === 'left-clade'
    ))!;
    expect(left.node_attrs.num_date).toEqual({ value: 2020.1 });
    expect(left.children!.find(child => child.name === 'A')!.node_attrs.num_date).toEqual({
      value: 2020.4,
      confidence: [2020.35, 2020.45],
      inferred: false,
    });
    expect(left.children!.find(child => child.name === 'B')!.node_attrs.num_date).toEqual({
      value: 2020.5,
      inferred: true,
      raw_value: '2020-07-XX',
    });
    expect(JSON.stringify(dataset)).not.toContain(AUSPICE_NUM_DATE_STORAGE_KEY);
  });

  it('matches explicit dated-Newick attributes to the displayed tree without inference', () => {
    const datedNewick = parseDatedNewick(
      '((A:2[&num_date=2024],B:2.5[&num_date=2024.5])left-clade:1[&num_date=2022],'
      + '(C:2.75[&num_date=2025],D:3.25[&num_date=2025.5]):1.25[&num_date=2022.25])'
      + 'original-root:0[&num_date=2020];',
    );
    expect(datedNewick?.complete).toBeTrue();

    const dataset = buildAuspiceV2Dataset({
      tree: fourTipTree(),
      attributeTree: datedNewick!.tree,
    });

    expect(dataset.meta.display_defaults.distance_measure).toBe('num_date');
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({
      key: 'num_date',
      type: 'temporal',
    }));
    expect(dataset.tree.node_attrs.num_date).toEqual({ value: 2020 });
    const left = dataset.tree.children!.find(child => (
      child.branch_attrs?.labels?.microbetrace === 'left-clade'
    ))!;
    expect(left.node_attrs.num_date).toEqual({ value: 2022 });
    expect(left.children!.find(child => child.name === 'A')!.node_attrs.num_date)
      .toEqual({ value: 2024 });
    expect(left.children!.find(child => child.name === 'B')!.node_attrs.num_date)
      .toEqual({ value: 2024.5 });
  });

  it('falls back to divergence-only output for incomplete num_date data', () => {
    const incompleteTree = fourTipNumDateTree();
    delete incompleteTree.children[1].children[1].data[AUSPICE_NUM_DATE_STORAGE_KEY];
    const incomplete = buildAuspiceV2Dataset({ tree: incompleteTree });

    expect(incomplete.meta.colorings).toBeUndefined();
    expect(incomplete.meta.display_defaults).toEqual({ distance_measure: 'div' });
    expect(JSON.stringify(incomplete)).not.toContain('num_date');

  });

  it('preserves source num_date values when the imported tree contains date reversals', () => {
    const tree = fourTipNumDateTree();
    tree.children[0].children[0].data[AUSPICE_NUM_DATE_STORAGE_KEY].value = 2019;
    const dataset = buildAuspiceV2Dataset({ tree });

    const left = dataset.tree.children!.find(child => (
      child.branch_attrs?.labels?.microbetrace === 'left-clade'
    ))!;
    expect(left.children!.find(child => child.name === 'A')!.node_attrs.num_date)
      .toEqual(jasmine.objectContaining({ value: 2019 }));
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({
      key: 'num_date',
      type: 'temporal',
    }));
  });

  it('exports all safe scalars, infers coloring types, and remaps reserved fields', () => {
    const nodes = [
      {
        _id: 'A', id: 'A', group: 'alpha', score: 1.5, event_date: '2026-01-01',
        selected: true, visible: false, div: 'source-div', 'field with spaces': 'one',
        seq: 'ACGT', _diff: 'A1G', length: 0.1, depth: 2, x: 50, index: 0, hasDistance: false, nodeSize: 20,
        nested: { unsafe: true }, values: ['unsafe'],
      },
      {
        _id: 'B', id: 'B', group: 'beta', score: 2.5, event_date: '2026-01-02',
        selected: false, visible: true, div: 'source-div-2', 'field with spaces': 'two',
        seq: 'AGGT', _diff: 'C2T', length: 0.2, depth: 2, x: 75, index: 1, hasDistance: true, nodeSize: 20,
        nested: { unsafe: true }, values: ['unsafe'],
      },
    ];
    const dataset = buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes,
      nodeFields: [
        '_id', 'id', 'group', 'score', 'event_date', 'selected', 'visible', 'div',
        'field with spaces', 'seq', '_diff', 'length', 'depth', 'x', 'index', 'hasDistance', 'nodeSize',
        'nested', 'values',
      ],
      colorBy: 'group',
      temporalFields: ['event_date'],
    });

    const colorings = dataset.meta.colorings!;
    expect(colorings).toContain(jasmine.objectContaining({ key: 'group', type: 'categorical' }));
    expect(colorings).toContain(jasmine.objectContaining({ key: 'score', type: 'continuous' }));
    expect(colorings).toContain(jasmine.objectContaining({ key: 'event_date', type: 'temporal' }));
    expect(colorings).toContain(jasmine.objectContaining({ key: 'selected', type: 'boolean' }));
    expect(colorings).toContain(jasmine.objectContaining({ key: 'visible', type: 'boolean' }));
    expect(colorings).toContain(jasmine.objectContaining({ key: 'microbetrace_div', title: 'div' }));
    expect(colorings).toContain(jasmine.objectContaining({ key: 'microbetrace_field_with_spaces', title: 'field with spaces' }));
    expect(colorings.some(coloring => (
      ['seq', '_diff', 'length', 'depth', 'x', 'index', 'hasDistance', 'nodeSize', 'nested', 'values'].includes(coloring.key)
    ))).toBeFalse();
    expect(dataset.meta.display_defaults.color_by).toBe('group');
    expect(dataset.meta.filters).toEqual(colorings.map(coloring => coloring.key));

    const leafA = dataset.tree.children!.find(child => child.name === 'A')!;
    expect(leafA.node_attrs.group).toEqual({ value: 'alpha' });
    expect(leafA.node_attrs.score).toEqual({ value: 1.5 });
    expect(leafA.node_attrs.selected).toEqual({ value: true });
    expect(leafA.node_attrs.microbetrace_div).toEqual({ value: 'source-div' });
    expect(leafA.node_attrs.seq).toBeUndefined();
    expect(JSON.stringify(dataset)).not.toContain('ACGT');
  });

  it('preserves categorical scales and legend labels and supports ordinal colorings', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes: [
        { _id: 'A', group: 'alpha', rank: 1, severity: 'low' },
        { _id: 'B', group: 'beta', rank: 2, severity: 'high' },
      ],
      nodeFields: ['group', 'rank', 'severity'],
      coloringStyles: {
        group: {
          scale: [
            ['beta', '#445566'],
            ['alpha', '#112233'],
            ['unused', '#778899'],
            ['alpha', 'not-a-color'],
          ],
          legend: [
            { value: 'alpha', display: 'Alpha display' },
            { value: 'beta', display: 'Beta display' },
            { value: 'unused', display: 'Unused display' },
          ],
        },
        rank: {
          scale: [[2, '#abcdef'], [1, '#fedcba']],
          legend: [{ value: 1, display: 'First' }, { value: 2, display: 'Second' }],
        },
        severity: { type: 'ordinal' },
      },
    });

    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({
      key: 'group',
      type: 'categorical',
      scale: [['beta', '#445566'], ['alpha', '#112233']],
      legend: [
        { value: 'alpha', display: 'Alpha display' },
        { value: 'beta', display: 'Beta display' },
      ],
    }));
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({
      key: 'rank',
      type: 'ordinal',
      scale: [[2, '#abcdef'], [1, '#fedcba']],
      legend: [{ value: 1, display: 'First' }, { value: 2, display: 'Second' }],
    }));
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({
      key: 'severity',
      type: 'ordinal',
    }));
  });

  it('preserves safe scalar metadata on identifiable internal nodes without inferring it', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: fourTipTree(),
      nodes: [
        { _id: 'original-root', clade: 'root-state', score: 4, selected: true, seq: 'AAAA' },
        { _id: 'left-clade', clade: 'left-state', score: 2, selected: false, seq: 'CCCC' },
        { _id: '', clade: 'must-not-be-attached' },
        { _id: 'A', clade: 'tip-state' },
        { _id: 'B' },
        { _id: 'C' },
        { _id: 'D' },
      ],
      nodeFields: ['clade', 'score', 'selected', 'seq'],
    });

    const root = dataset.tree;
    const left = root.children!.find(child => (
      child.branch_attrs?.labels?.microbetrace === 'left-clade'
    ))!;
    const unnamed = root.children!.find(child => child !== left)!;

    expect(root.node_attrs.clade).toEqual({ value: 'root-state' });
    expect(root.node_attrs.score).toEqual({ value: 4 });
    expect(root.node_attrs.selected).toEqual({ value: true });
    expect(root.node_attrs.seq).toBeUndefined();
    expect(left.node_attrs.clade).toEqual({ value: 'left-state' });
    expect(left.node_attrs.score).toEqual({ value: 2 });
    expect(left.node_attrs.selected).toEqual({ value: false });
    expect(unnamed.node_attrs.clade).toBeUndefined();
    expect(unnamed.node_attrs.score).toBeUndefined();
  });

  it('uses the saved full tree or the currently visible subtree according to tree scope', () => {
    const fullTree = fourTipTree();
    const visibleTree = {
      id: 'left-clade',
      length: 0,
      children: fullTree.children[0].children,
    };
    const options = {
      tree: visibleTree,
      fullTree,
      nodes: ['A', 'B', 'C', 'D'].map(_id => ({ _id, visible: _id !== 'B' })),
      nodeFields: ['visible'],
    };
    const fullDataset = buildAuspiceV2Dataset({ ...options, treeScope: 'full' });
    const visibleDataset = buildAuspiceV2Dataset({ ...options, treeScope: 'visible' });

    expect(auspiceDisplayLeafOrder(fullDataset.tree)).toEqual(['A', 'B', 'C', 'D']);
    expect(auspiceDisplayLeafOrder(visibleDataset.tree)).toEqual(['A', 'B']);
    expect(visibleDataset.tree.node_attrs.div).toBe(0);
    expect(visibleDataset.tree.children!.find(child => child.name === 'B')!.node_attrs.visible)
      .toEqual({ value: false });
  });

  it('preserves internal-node attributes in a visible subtree using the full attribute tree', () => {
    const attributeTree = fourTipTree();
    (attributeTree.children[0] as any).data = {
      id: 'left-clade',
      lineage: 'left-ancestor',
      confidence: 0.98,
    };
    const visibleTree = {
      id: '',
      length: 0,
      children: attributeTree.children[0].children,
    };
    const dataset = buildAuspiceV2Dataset({
      tree: visibleTree,
      fullTree: attributeTree,
      attributeTree,
      treeScope: 'visible',
      nodeFields: ['lineage', 'confidence'],
    });

    expect(dataset.tree.branch_attrs?.labels?.microbetrace).toBe('left-clade');
    expect(dataset.tree.node_attrs.lineage).toEqual({ value: 'left-ancestor' });
    expect(dataset.tree.node_attrs.confidence).toEqual({ value: 0.98 });
  });

  it('preserves internal-node attributes when rerooting replaces a clade with its complement', () => {
    const attributeTree = {
      id: 'original-root',
      length: 0,
      children: [
        { id: 'A', length: 0.1 },
        { id: 'B', length: 0.1 },
        {
          id: 'cd-ancestor',
          length: 0.2,
          data: {
            id: 'cd-ancestor',
            lineage: 'shared-branch-ancestor',
            confidence: 0.96,
          },
          children: [
            { id: 'C', length: 0.1 },
            { id: 'D', length: 0.1 },
          ],
        },
      ],
    };
    const rerootedTree = {
      id: 'rerooted',
      length: 0,
      children: [
        { id: 'C', length: 0.1 },
        {
          id: '',
          length: 0.1,
          children: [
            { id: 'D', length: 0.1 },
            {
              id: '',
              length: 0.2,
              children: [
                { id: 'A', length: 0.1 },
                { id: 'B', length: 0.1 },
              ],
            },
          ],
        },
      ],
    };
    const dataset = buildAuspiceV2Dataset({
      tree: rerootedTree,
      attributeTree,
      nodeFields: ['lineage', 'confidence'],
    });
    const descendantNames = (node: any): string[] => (
      Array.isArray(node.children) && node.children.length
        ? node.children.flatMap(descendantNames)
        : [node.name]
    );
    const findClade = (node: any, expected: string[]): any => {
      const actual = descendantNames(node).sort();
      if (actual.join('|') === [...expected].sort().join('|')) return node;
      for (const child of node.children || []) {
        const match = findClade(child, expected);
        if (match) return match;
      }
      return undefined;
    };
    const complementClade = findClade(dataset.tree, ['A', 'B']);

    expect(complementClade).toBeDefined();
    expect(complementClade.node_attrs.lineage).toEqual({ value: 'shared-branch-ancestor' });
    expect(complementClade.node_attrs.confidence).toEqual({ value: 0.96 });
    expect(complementClade.branch_attrs?.labels?.microbetrace).toBe('cd-ancestor');
  });

  it('rejects ambiguous duplicate session node identifiers', () => {
    expect(() => buildAuspiceV2Dataset({
      tree: fourTipTree(),
      nodes: [
        { _id: 'left-clade', clade: 'first' },
        { id: 'left-clade', clade: 'second' },
      ],
      nodeFields: ['clade'],
    })).toThrowError(
      AuspiceExportError,
      /duplicate node IDs.*"left-clade".*Make these node IDs unique/,
    );
  });

  it('rejects tree leaf names that do not exactly match a session node identifier', () => {
    expect(() => buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes: [{ _id: 'A' }, { _id: 'b' }],
    })).toThrowError(
      AuspiceExportError,
      /tip IDs with no matching session node: "B".*exactly match.*ID or _id/,
    );
  });

  it('independently selects exported metadata, colorings, and filters', () => {
    const options = {
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes: [
        { _id: 'A', group: 'alpha', score: 1, note: 'first', _lat: 33.7, _lon: -84.4 },
        { _id: 'B', group: 'beta', score: 2, note: 'second' },
      ],
      nodeFields: ['group', 'score', 'note'],
      colorBy: 'group',
    };
    const fieldOptions = getAuspiceExportFieldOptions(options);
    const dataset = buildAuspiceV2Dataset({
      ...options,
      metadataFieldKeys: ['group', 'note'],
      coloringFieldKeys: ['group'],
      filterFieldKeys: ['note'],
    });

    expect(fieldOptions).toContain(jasmine.objectContaining({
      key: 'microbetrace_location',
      synthetic: true,
    }));
    expect(dataset.meta.colorings).toEqual([
      { key: 'group', title: 'group', type: 'categorical' },
    ]);
    expect(dataset.meta.filters).toEqual(['note']);
    expect(dataset.meta.display_defaults.color_by).toBe('group');
    expect(dataset.meta.geo_resolutions?.[0].key).toBe('microbetrace_location');

    const leafA = dataset.tree.children!.find(child => child.name === 'A')!;
    expect(leafA.node_attrs.group).toEqual({ value: 'alpha' });
    expect(leafA.node_attrs.note).toEqual({ value: 'first' });
    expect(leafA.node_attrs.score).toBeUndefined();
    expect(leafA.node_attrs.microbetrace_location).toEqual({ value: 'Location 1' });
  });

  it('groups identical coordinates in a partial map', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: fourTipTree(),
      nodes: [
        { _id: 'A', _lat: 13.4, _lon: 144.7 },
        { _id: 'B', latitude: '13.4N', longitude: '144.7E' },
        { _id: 'C', lat_field: '34.1', lon_field: '-118.2' },
        { _id: 'D', latitude: 95, longitude: 200 },
      ],
      latitudeField: 'lat_field',
      longitudeField: 'lon_field',
    });

    expect(dataset.meta.panels).toEqual(['tree', 'map']);
    expect(dataset.meta.display_defaults.geo_resolution).toBe('microbetrace_location');
    expect(dataset.meta.geo_resolutions).toEqual([jasmine.objectContaining({
      key: 'microbetrace_location',
      title: 'MicrobeTrace location',
      demes: {
        'Location 1': { latitude: 13.4, longitude: 144.7 },
        'Location 2': { latitude: 34.1, longitude: -118.2 },
      },
    })]);
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({
      key: 'microbetrace_location',
      type: 'categorical',
    }));

    const leaves = dataset.tree.children!.flatMap(branch => branch.children || []);
    expect(leaves.find(leaf => leaf.name === 'A')!.node_attrs.microbetrace_location)
      .toEqual({ value: 'Location 1' });
    expect(leaves.find(leaf => leaf.name === 'B')!.node_attrs.microbetrace_location)
      .toEqual({ value: 'Location 1' });
    expect(leaves.find(leaf => leaf.name === 'C')!.node_attrs.microbetrace_location)
      .toEqual({ value: 'Location 2' });
    expect(leaves.find(leaf => leaf.name === 'D')!.node_attrs.microbetrace_location).toBeUndefined();
  });

  it('resolves export-only coordinates from bundled ZIP and state lookups', () => {
    const sourceNodes = [
      { _id: 'A', state_name: 'Georgia', postal_code: '30301' },
      { _id: 'B', state_name: 'Alabama', postal_code: 'missing' },
      { _id: 'C', state_name: 'Georgia', postal_code: '30301', latitude: 10, longitude: 20 },
    ];
    const nodes = resolveAuspiceExportNodeCoordinates({
      nodes: sourceNodes,
      geographyFields: [
        { key: 'state', title: 'State', field: 'state_name' },
        { key: 'zipcode', title: 'ZIP code', field: 'postal_code' },
      ],
    }, {
      states: {
        features: [
          { properties: { name: 'Georgia', usps: 'GA', _lat: 32.7, _lon: -83.3 } },
          { properties: { name: 'Alabama', usps: 'AL', _lat: 32.8, _lon: -86.8 } },
        ],
      },
      zipcodes: [
        { zipcode: '30301', _lat: 33.844371, _lon: -84.47405 },
      ],
    });

    expect(nodes[0]).toEqual(jasmine.objectContaining({ _lat: 33.844371, _lon: -84.47405 }));
    expect(nodes[1]).toEqual(jasmine.objectContaining({ _lat: 32.8, _lon: -86.8 }));
    expect(nodes[2]).toEqual(jasmine.objectContaining({ _lat: 10, _lon: 20 }));
    expect(sourceNodes.every(node => node['_lat'] === undefined && node['_lon'] === undefined)).toBeTrue();

    const dataset = buildAuspiceV2Dataset({
      tree: { children: nodes.map(node => ({ id: node._id, length: 0.1 })) },
      nodes,
      nodeFields: ['state_name', 'postal_code'],
      geographyFields: [
        { key: 'state', title: 'State', field: 'state_name' },
        { key: 'zipcode', title: 'ZIP code', field: 'postal_code' },
      ],
    });
    expect(dataset.meta.panels).toEqual(['tree', 'map']);
    expect(dataset.meta.geo_resolutions?.map(resolution => resolution.key))
      .toEqual(['state', 'zipcode', 'microbetrace_location']);
    expect(dataset.meta.display_defaults.color_by).toBe('microbetrace_location');
  });

  it('rejects partially parsed and axis-incompatible coordinate strings', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes: [
        { _id: 'A', _lat: '34abc', _lon: '-118.2' },
        { _id: 'B', _lat: '34.1 N', _lon: '118.2 W' },
      ],
    });

    expect(dataset.meta.geo_resolutions?.[0].demes).toEqual({
      'Location 1': { latitude: 34.1, longitude: -118.2 },
    });
    const leafA = dataset.tree.children!.find(leaf => leaf.name === 'A')!;
    const leafB = dataset.tree.children!.find(leaf => leaf.name === 'B')!;
    expect(leafA.node_attrs.microbetrace_location).toBeUndefined();
    expect(leafB.node_attrs.microbetrace_location).toEqual({ value: 'Location 1' });

    const axisDataset = buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes: [
        { _id: 'A', _lat: '34.1 E', _lon: '118.2 N' },
        { _id: 'B' },
      ],
    });
    expect(axisDataset.meta.panels).toEqual(['tree']);
    expect(axisDataset.meta.geo_resolutions).toBeUndefined();
  });

  it('uses real calendar dates, including supported unknown components, for temporal inference', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes: [
        {
          _id: 'A', real_date: '2024-02-29', impossible_date: '2023-02-29',
          partial_date: '2026-02-XX', invalid_partial_date: '2026-XX-15',
        },
        {
          _id: 'B', real_date: '2024-12-31', impossible_date: '2024-04-31',
          partial_date: '2026-XX-XX', invalid_partial_date: '2026-01-15',
        },
      ],
      temporalFields: ['real_date', 'impossible_date', 'partial_date', 'invalid_partial_date'],
    });

    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({ key: 'real_date', type: 'temporal' }));
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({ key: 'partial_date', type: 'temporal' }));
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({ key: 'impossible_date', type: 'categorical' }));
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({ key: 'invalid_partial_date', type: 'categorical' }));
  });

  it('exports named country, state, and coordinate-grouped site resolutions', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: fourTipTree(),
      nodes: [
        { _id: 'A', country_name: 'United States', region: 'Georgia', clinic: 'Downtown', _lat: 33.75, _lon: -84.39 },
        { _id: 'B', country_name: 'United States', region: 'Georgia', clinic: 'Secondary', _lat: 33.75, _lon: -84.39 },
        { _id: 'C', country_name: 'United States', region: 'Alabama', clinic: 'Mobile', _lat: 30.69, _lon: -88.04 },
        { _id: 'D', country_name: 'Canada', region: 'Ontario', clinic: 'Toronto' },
      ],
      geographyFields: [
        { key: 'country', title: 'Country', field: 'country_name' },
        { key: 'state', title: 'State', field: 'region' },
        { key: 'site', title: 'Site', field: 'clinic' },
      ],
    });

    expect(dataset.meta.panels).toEqual(['tree', 'map']);
    expect(dataset.meta.display_defaults.geo_resolution).toBe('site');
    expect(dataset.meta.geo_resolutions?.map(resolution => resolution.key))
      .toEqual(['country', 'state', 'site']);
    const country = dataset.meta.geo_resolutions!.find(resolution => resolution.key === 'country')!;
    const state = dataset.meta.geo_resolutions!.find(resolution => resolution.key === 'state')!;
    const site = dataset.meta.geo_resolutions!.find(resolution => resolution.key === 'site')!;
    expect(Object.keys(country.demes)).toEqual(['United States']);
    expect(country.demes['United States'].latitude).toBeCloseTo(32.74, 1);
    expect(country.demes['United States'].longitude).toBeCloseTo(-85.63, 1);
    expect(state.demes).toEqual({
      Alabama: { latitude: 30.69, longitude: -88.04 },
      Georgia: { latitude: 33.75, longitude: -84.39 },
    });
    expect(site.demes).toEqual({
      Downtown: { latitude: 33.75, longitude: -84.39 },
      Mobile: { latitude: 30.69, longitude: -88.04 },
    });
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({ key: 'country', type: 'categorical' }));
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({ key: 'state', type: 'categorical' }));
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({ key: 'site', type: 'categorical' }));

    const leaves = dataset.tree.children!.flatMap(branch => branch.children || []);
    const leafA = leaves.find(leaf => leaf.name === 'A')!;
    const leafB = leaves.find(leaf => leaf.name === 'B')!;
    const leafD = leaves.find(leaf => leaf.name === 'D')!;
    expect(leafA.node_attrs.country).toEqual({ value: 'United States' });
    expect(leafA.node_attrs.state).toEqual({ value: 'Georgia' });
    expect(leafA.node_attrs.site).toEqual({ value: 'Downtown' });
    expect(leafB.node_attrs.site).toEqual({ value: 'Downtown' });
    expect(leafD.node_attrs.site).toBeUndefined();
  });

  it('omits shared geographic trait values which have no matching deme', () => {
    const dataset = buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes: [
        { _id: 'A', country: 'United States', _lat: 33.75, _lon: -84.39 },
        { _id: 'B', country: 'Canada' },
      ],
      nodeFields: ['country'],
      geographyFields: [{ key: 'country', title: 'Country', field: 'country' }],
    });

    expect(dataset.meta.geo_resolutions?.[0]).toEqual(jasmine.objectContaining({
      key: 'country',
      demes: {
        'United States': { latitude: 33.75, longitude: -84.39 },
      },
    }));
    const leafA = dataset.tree.children!.find(leaf => leaf.name === 'A')!;
    const leafB = dataset.tree.children!.find(leaf => leaf.name === 'B')!;
    expect(leafA.node_attrs.country).toEqual({ value: 'United States' });
    expect(leafB.node_attrs.country).toBeUndefined();
  });

  it('remaps geography keys that collide with metadata from a different source field', () => {
    const options = {
      tree: { children: [{ id: 'A', length: 0.1 }, { id: 'B', length: 0.2 }] },
      nodes: [
        {
          _id: 'A', country: 'metadata-a', mapped_country: 'United States',
          _lat: 33.75, _lon: -84.39,
        },
        {
          _id: 'B', country: 'metadata-b', mapped_country: 'Canada',
          _lat: 43.65, _lon: -79.38,
        },
      ],
      nodeFields: ['country', 'mapped_country'],
      geographyFields: [
        { key: 'country', title: 'Mapped country', field: 'mapped_country' },
      ],
    };
    const fieldOptions = getAuspiceExportFieldOptions(options);
    const dataset = buildAuspiceV2Dataset({
      ...options,
      metadataFieldKeys: ['mapped_country'],
      coloringFieldKeys: ['microbetrace_country'],
      filterFieldKeys: ['microbetrace_country'],
    });

    const countryMetadataOption = fieldOptions.find(field => field.key === 'country');
    expect(countryMetadataOption).toBeDefined();
    expect(countryMetadataOption?.synthetic).toBeUndefined();
    expect(fieldOptions).toContain(jasmine.objectContaining({
      key: 'microbetrace_country',
      title: 'Mapped country',
      synthetic: true,
    }));
    expect(dataset.meta.geo_resolutions?.map(resolution => resolution.key))
      .toEqual(['microbetrace_country', 'microbetrace_location']);
    expect(dataset.meta.colorings).toContain(jasmine.objectContaining({
      key: 'microbetrace_country',
      title: 'Mapped country',
    }));
    expect(dataset.meta.filters).toEqual(['microbetrace_country']);

    const leafA = dataset.tree.children!.find(leaf => leaf.name === 'A')!;
    expect(leafA.node_attrs.country).toBeUndefined();
    expect(leafA.node_attrs.mapped_country).toEqual({ value: 'United States' });
    expect(leafA.node_attrs.microbetrace_country).toEqual({ value: 'United States' });
  });

  it('exports stored bootstrap support as a default branch label', () => {
    const tree = fourTipTree();
    const splitKey = canonicalSplitKey(['A', 'B'], ['A', 'B', 'C', 'D'])!;
    const dataset = buildAuspiceV2Dataset({
      tree,
      bootstrap: {
        labels: ['A', 'B', 'C', 'D'],
        supportBySplitKey: { [splitKey]: 97.25 },
        decimalLength: 2,
      },
    });

    expect(dataset.meta.display_defaults.branch_label).toBe('bootstrap');
    const left = dataset.tree.children!.find(child => (
      child.branch_attrs?.labels?.microbetrace === 'left-clade'
    ))!;
    expect(left.branch_attrs?.labels?.bootstrap).toBe('97.25');
    expect(left.branch_attrs?.labels?.microbetrace).toBe('left-clade');
  });

  it('rejects missing, duplicate, negative, and non-finite tree values', () => {
    expect(() => buildAuspiceV2Dataset({ tree: { children: [{ id: '', length: 1 }] } }))
      .toThrowError(AuspiceExportError, /non-empty sample ID/);
    expect(() => buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: 1 }, { id: 'A', length: 2 }] },
    })).toThrowError(AuspiceExportError, /duplicate sample ID/);
    expect(() => buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: -1 }, { id: 'B', length: 2 }] },
    })).toThrowError(AuspiceExportError, /negative branch length/);
    expect(() => buildAuspiceV2Dataset({
      tree: { children: [{ id: 'A', length: Number.NaN }, { id: 'B', length: 2 }] },
    })).toThrowError(AuspiceExportError, /non-finite branch length/);
  });

  it('normalizes download filenames', () => {
    expect(ensureAuspiceJsonFilename('tree')).toBe('tree.json');
    expect(ensureAuspiceJsonFilename('tree.JSON')).toBe('tree.JSON');
    expect(ensureAuspiceJsonFilename('')).toBe('microbetrace-auspice.json');
  });

  it('validates generated and demonstration fixtures against the pinned Auspice v2 schema', () => {
    const splitKey = canonicalSplitKey(['A', 'B'], ['A', 'B', 'C', 'D'])!;
    const dataset = buildAuspiceV2Dataset({
      tree: fourTipNumDateTree(),
      title: 'Synthetic compatibility fixture',
      updated: '2026-09-22',
      nodes: [
        { _id: 'A', cluster: 'one', score: 1, selected: true, visible: true, country: 'united_states', site_name: 'atlanta', _lat: 33.7, _lon: -84.4 },
        { _id: 'B', cluster: 'one', score: 2, selected: false, visible: true, country: 'united_states', site_name: 'new_york', _lat: 40.7, _lon: -74 },
        { _id: 'C', cluster: 'two', score: 3, selected: false, visible: false },
        { _id: 'D', cluster: 'two', score: 4, selected: true, visible: true },
      ],
      nodeFields: ['_id', 'cluster', 'score', 'selected', 'visible', 'country', 'site_name'],
      geographyFields: [
        { key: 'country', title: 'Country', field: 'country' },
        { key: 'site', title: 'Site', field: 'site_name' },
      ],
      coloringStyles: {
        cluster: {
          scale: [['one', '#112233'], ['two', '#445566']],
          legend: [{ value: 'one', display: 'Cluster one' }],
        },
        score: {
          scale: [[1, '#111111'], [2, '#222222'], [3, '#333333'], [4, '#444444']],
        },
      },
      colorBy: 'cluster',
      bootstrap: {
        labels: ['A', 'B', 'C', 'D'],
        supportBySplitKey: { [splitKey]: 98 },
      },
    });
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addMetaSchema(draft6MetaSchema);
    ajv.addSchema(auspiceConfigSchema);
    ajv.addSchema(annotationsSchema);
    ajv.addSchema(rootSequenceSchema);
    const validate = ajv.compile(auspiceV2Schema);

    expect(validate(dataset))
      .withContext(JSON.stringify(validate.errors, null, 2))
      .toBeTrue();
    expect(validate(temporalMapDataset))
      .withContext(JSON.stringify(validate.errors, null, 2))
      .toBeTrue();
  });
});
