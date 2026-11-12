import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThresholdSensitivityPanelComponent } from './threshold-sensitivity-panel.component';

describe('ThresholdSensitivityPanelComponent', () => {
  let fixture: ComponentFixture<ThresholdSensitivityPanelComponent>;
  let component: ThresholdSensitivityPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ThresholdSensitivityPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ThresholdSensitivityPanelComponent);
    component = fixture.componentInstance;
    component.thresholdOptions = [1, 16, 77];
    component.baselineThreshold = 16;
    component.previewIndex = 2;
    component.rangeStartIndex = 0;
    component.rangeEndIndex = 2;
    component.comparison = {
      baselineThreshold: 16,
      previewThreshold: 77,
      baseline: { clusterCount: 4, singletonCount: 13 },
      preview: { clusterCount: 1, singletonCount: 3 },
      addedEdgeIds: ['added-edge'],
      removedEdgeIds: [],
      structuralEdgeIds: ['added-edge'],
      nonStructuralEdgeIds: [],
      changedNodeIds: Array.from({ length: 21 }, (_, index) => `node-${index}`),
      transitions: [
        {
          kind: 'merge',
          beforeComponentNodeIds: [['a'], ['b'], ['c'], ['d']],
          afterComponentNodeIds: [['a', 'b', 'c', 'd']],
          affectedNodeIds: Array.from({ length: 15 }, (_, index) => `merged-${index}`),
        },
        {
          kind: 'split',
          beforeComponentNodeIds: [['e', 'f', 'g', 'h', 'i', 'j']],
          afterComponentNodeIds: [['e'], ['f', 'g'], ['h', 'i', 'j']],
          affectedNodeIds: ['e', 'f', 'g', 'h', 'i', 'j'],
        },
      ],
    } as any;
    component.report = {
      series: [
        { threshold: 1, clusterCount: 2 },
        { threshold: 77, clusterCount: 1 },
      ],
      stableNodeShare: 0,
      stableClusterCount: 0,
      changingClusterCount: 4,
      structuralEventThresholdCount: 22,
    } as any;
    fixture.detectChanges();
  });

  it('places plain-language baseline changes before the stability range', () => {
    const root = fixture.nativeElement as HTMLElement;
    const changes = root.querySelector<HTMLElement>('[data-testid="threshold-sensitivity-transitions"]')!;
    const range = root.querySelector<HTMLElement>('[data-testid="threshold-sensitivity-range"]')!;

    expect(changes.compareDocumentPosition(range) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(changes.textContent).toContain('15 nodes joined together');
    expect(changes.textContent).toContain('4 separate groups at baseline and form one cluster at preview');
    expect(changes.textContent).toContain('6 nodes split apart');
    expect(changes.textContent).toContain('one cluster at baseline and are in 3 separate groups at preview');
    expect(changes.textContent).not.toContain('→');
    expect(range.textContent).toContain('A higher line means more separate clusters');

    const legend = root.querySelector<HTMLElement>('[aria-label="Threshold change colors and patterns"]')!;
    expect(legend.textContent).toContain('Added links / nodes in merges');
    expect(legend.textContent).toContain('Removed links / nodes in splits');
    expect(legend.querySelector('.threshold-sensitivity-panel__legend-line--added')).not.toBeNull();
    expect(legend.querySelector('.threshold-sensitivity-panel__legend-line--removed')).not.toBeNull();
  });
});
