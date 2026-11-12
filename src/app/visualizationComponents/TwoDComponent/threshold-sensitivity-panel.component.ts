import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type {
  ThresholdSensitivityComparison,
  ThresholdStabilityReport,
} from '@app/contactTraceCommonServices/threshold-sensitivity';

@Component({
  selector: 'app-threshold-sensitivity-panel',
  templateUrl: './threshold-sensitivity-panel.component.html',
  styleUrls: ['./threshold-sensitivity-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ThresholdSensitivityPanelComponent {
  @Input() thresholdOptions: number[] = [];
  @Input() baselineThreshold = 0;
  @Input() previewIndex = 0;
  @Input() rangeStartIndex = 0;
  @Input() rangeEndIndex = 0;
  @Input() comparison: ThresholdSensitivityComparison | null = null;
  @Input() report: ThresholdStabilityReport | null = null;
  @Input() metric = 'distance';
  @Input() distanceMetric = 'snps';
  @Input() cohortSize = 0;
  @Input() applying = false;
  @Input() overlayTruncated = false;

  @Output() previewIndexChange = new EventEmitter<number>();
  @Output() rangeStartIndexChange = new EventEmitter<number>();
  @Output() rangeEndIndexChange = new EventEmitter<number>();
  @Output() applyThreshold = new EventEmitter<void>();
  @Output() closePanel = new EventEmitter<void>();

  get maxIndex(): number {
    return Math.max(0, this.thresholdOptions.length - 1);
  }

  get previewThreshold(): number {
    return this.thresholdOptions[this.previewIndex] ?? this.baselineThreshold;
  }

  get chartPoints(): string {
    const series = this.report?.series || [];
    if (!series.length) return '';
    const minThreshold = Math.min(...series.map(point => point.threshold));
    const maxThreshold = Math.max(...series.map(point => point.threshold));
    const maxClusters = Math.max(1, ...series.map(point => point.clusterCount));
    return series.map(point => {
      const x = maxThreshold === minThreshold
        ? 130
        : ((point.threshold - minThreshold) / (maxThreshold - minThreshold)) * 260;
      const y = 52 - (point.clusterCount / maxClusters) * 44;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  formatThreshold(value: number): string {
    if (!Number.isFinite(value)) return '—';
    if (String(this.distanceMetric).toLowerCase() === 'tn93') {
      return `${(value * 100).toFixed(value < 0.01 ? 3 : 2)}%`;
    }
    return Number.isInteger(value) ? String(value) : Number(value.toPrecision(5)).toString();
  }

  emitPreview(event: Event): void {
    this.previewIndexChange.emit(Number((event.target as HTMLInputElement).value));
  }

  emitRangeStart(event: Event): void {
    this.rangeStartIndexChange.emit(Number((event.target as HTMLInputElement).value));
  }

  emitRangeEnd(event: Event): void {
    this.rangeEndIndexChange.emit(Number((event.target as HTMLInputElement).value));
  }
}
