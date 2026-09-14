import {
  buildCategoricalComposition,
  buildNetworkGroupingModel,
  projectNetworkGrouping,
  projectNetworkGroupingGraph,
} from './network-grouping.model';

describe('renderer-neutral network grouping model', () => {
  const entities = [
    {
      id: 'seq-1',
      kind: 'sequence',
      selected: true,
      visible: true,
      values: { case: 'case-a', specimen: 'specimen-1' },
    },
    {
      id: 'seq-2',
      kind: 'sequence',
      visible: false,
      values: { case: 'case-a', specimen: 'specimen-1' },
    },
    {
      id: 'seq-3',
      kind: 'sequence',
      visible: true,
      values: { case: 'case-b', specimen: 'specimen-2' },
    },
  ];

  it('owns hierarchy and aggregate statistics independently of a renderer', () => {
    const model = buildNetworkGroupingModel(entities, ['case', 'specimen']);
    const caseA = model.groups.find(group => group.label === 'case-a');
    const specimen1 = model.groups.find(group => group.label === 'specimen-1');

    expect(caseA?.statistics.memberCount).toBe(2);
    expect(caseA?.statistics.visibleMemberCount).toBe(1);
    expect(caseA?.statistics.selectedMemberCount).toBe(1);
    expect(caseA?.statistics.kindCounts.sequence).toBe(2);
    expect(specimen1?.parentId).toBe(caseA?.id);
    expect(model.leafGroupByEntityId.get('seq-1')?.id).toBe(specimen1?.id);
  });

  it('projects collapsed groups without removing underlying entities', () => {
    const model = buildNetworkGroupingModel(entities, ['case', 'specimen']);
    const caseA = model.groups.find(group => group.label === 'case-a')!;
    const projection = projectNetworkGrouping(model, [caseA.id]);

    expect(projection.aggregateGroupIds).toEqual([caseA.id]);
    expect(projection.entityIds).toEqual(['seq-3']);
    expect(model.entities.map(entity => entity.id)).toEqual(['seq-1', 'seq-2', 'seq-3']);
  });

  it('represents explicit case, specimen, and sequence ownership outside either renderer', () => {
    const model = buildNetworkGroupingModel([
      { id: 'case-1', kind: 'case', values: {} },
      { id: 'specimen-1', kind: 'specimen', parentEntityId: 'case-1', values: {} },
      { id: 'sequence-1', kind: 'sequence', parentEntityId: 'specimen-1', values: {} },
    ], []);

    expect(model.rootEntityIds).toEqual(['case-1']);
    expect(model.childEntityIdsByParentId.get('case-1')).toEqual(['specimen-1']);
    expect(model.childEntityIdsByParentId.get('specimen-1')).toEqual(['sequence-1']);
    expect(model.ancestorEntityIdsByEntityId.get('sequence-1')).toEqual([
      'specimen-1',
      'case-1',
    ]);
  });

  it('builds stable mixed-value composition segments for donut renderers', () => {
    expect(buildCategoricalComposition(['A', 'B', 'A'])).toEqual([
      { value: 'A', count: 2, fraction: 2 / 3 },
      { value: 'B', count: 1, fraction: 1 / 3 },
    ]);
  });

  it('projects aggregate nodes and traceable external links without changing source data', () => {
    const model = buildNetworkGroupingModel(entities, ['case', 'specimen']);
    const caseA = model.groups.find(group => group.label === 'case-a')!;
    const relationships = [
      { id: 'within-a', source: 'seq-1', target: 'seq-2' },
      { id: 'a-to-b-1', source: 'seq-1', target: 'seq-3' },
      { id: 'a-to-b-2', source: 'seq-2', target: 'seq-3' },
    ];
    const projection = projectNetworkGroupingGraph(model, relationships, [caseA.id]);

    expect(projection.nodes.map(node => ({ id: node.id, kind: node.kind }))).toEqual([
      { id: 'seq-3', kind: 'entity' },
      { id: caseA.id, kind: 'aggregate-group' },
    ]);
    expect(projection.links).toHaveSize(1);
    expect(projection.links[0].relationshipCount).toBe(2);
    expect(projection.links[0].memberRelationshipIds).toEqual(['a-to-b-1', 'a-to-b-2']);
    expect(projection.internalRelationshipIdsByAggregateGroupId.get(caseA.id)).toEqual(['within-a']);
    expect(model.entities).toHaveSize(3);
    expect(relationships).toHaveSize(3);
  });
});
