import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import * as d3 from 'd3';
import {
    buildContinuousGradientCss,
    ContinuousColorStop,
    normalizeHexColor,
    ResolvedVariableColorScale,
    VariableColorScaleConfig
} from '@app/contactTraceCommonServices/variable-color-scale';

@Component({
    selector: 'continuous-color-ramp',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
    template: `
        @if (resolved?.mode === 'continuous' && resolved?.domain) {
            <section class="continuous-ramp" [class.continuous-ramp--editable]="editable">
                <div
                    class="continuous-ramp__gradient"
                    data-testid="continuous-color-gradient"
                    [style.background]="gradientCss"
                    role="img"
                    [attr.aria-label]="description">
                </div>

                <div class="continuous-ramp__ticks" aria-hidden="true">
                    @for (stop of resolved.stops; track stop.value + '-' + $index) {
                        <span [style.left.%]="getStopPercent(stop.value)">{{ formatValue(stop.value) }}</span>
                    }
                </div>

                @if (editable) {
                    <div class="continuous-ramp__domain form-group row">
                        <div class="col-5"><label [for]="controlId + '-domain-kind'">Domain</label></div>
                        <div class="col-7">
                            <select
                                class="form-control form-control-sm"
                                [id]="controlId + '-domain-kind'"
                                [ngModel]="config.domain.kind"
                                (ngModelChange)="onDomainKindChange($event)">
                                <option value="auto">Automatic (full data)</option>
                                <option value="custom">Custom bounds</option>
                            </select>
                        </div>
                    </div>

                    @if (config.domain.kind === 'custom') {
                        <div class="continuous-ramp__bounds">
                            <label>
                                Minimum
                                <input
                                    type="number"
                                    class="form-control form-control-sm"
                                    [ngModel]="config.domain.min"
                                    (ngModelChange)="onDomainBoundChange('min', $event)">
                            </label>
                            <label>
                                Maximum
                                <input
                                    type="number"
                                    class="form-control form-control-sm"
                                    [ngModel]="config.domain.max"
                                    (ngModelChange)="onDomainBoundChange('max', $event)">
                            </label>
                        </div>
                    }

                    <div class="continuous-ramp__stop-heading">
                        <strong>Color stops</strong>
                        <div>
                            <button type="button" class="btn btn-light btn-sm" (click)="reverseStops()">Reverse</button>
                            <button type="button" class="btn btn-light btn-sm" (click)="addStop()" [disabled]="resolved.constant">Add Stop</button>
                        </div>
                    </div>

                    <div class="continuous-ramp__stop-list">
                        @for (stop of resolved.stops; track stop.value + '-' + $index; let first = $first; let last = $last) {
                            <div class="continuous-ramp__stop-row">
                                <label>
                                    <span class="sr-only">Stop value</span>
                                    <input
                                        type="number"
                                        class="form-control form-control-sm"
                                        [ngModel]="stop.value"
                                        [disabled]="first || last || resolved.constant"
                                        (ngModelChange)="onStopValueChange($index, $event)">
                                </label>
                                <input
                                    type="color"
                                    [attr.aria-label]="'Color for stop ' + formatValue(stop.value)"
                                    [ngModel]="stop.color"
                                    (ngModelChange)="onStopColorChange($index, $event)">
                                <label>
                                    <span class="sr-only">Stop hex color</span>
                                    <input
                                        type="text"
                                        class="form-control form-control-sm continuous-ramp__hex"
                                        [ngModel]="stop.color"
                                        (change)="onStopColorChange($index, $any($event.target).value)">
                                </label>
                                <button
                                    type="button"
                                    class="btn btn-light btn-sm"
                                    title="Remove stop"
                                    [disabled]="first || last || resolved.constant"
                                    (click)="removeStop($index)">
                                    <i class="pi pi-times"></i>
                                </button>
                            </div>
                        }
                    </div>

                    <div class="continuous-ramp__missing form-group row">
                        <div class="col-5"><label [for]="controlId + '-missing-color'">Missing / invalid</label></div>
                        <div class="col-7 continuous-ramp__missing-controls">
                            <input
                                type="color"
                                [id]="controlId + '-missing-color'"
                                [ngModel]="config.missingColor"
                                (ngModelChange)="onMissingColorChange($event)">
                            <input
                                type="text"
                                class="form-control form-control-sm continuous-ramp__hex"
                                [ngModel]="config.missingColor"
                                (change)="onMissingColorChange($any($event.target).value)">
                        </div>
                    </div>

                    @if (validationMessage) {
                        <div class="continuous-ramp__error" role="alert">{{ validationMessage }}</div>
                    }
                } @else {
                    <div class="continuous-ramp__missing-legend">
                        <span class="continuous-ramp__missing-swatch" [style.background]="resolved.missingColor"></span>
                        <span>Missing / invalid</span>
                    </div>
                }
            </section>
        }
    `,
    styles: [`
        :host { display: block; min-width: 260px; width: 100%; }
        .continuous-ramp { padding: 10px 12px 14px; }
        .continuous-ramp__gradient { border: 1px solid #666; border-radius: 3px; height: 28px; width: 100%; }
        .continuous-ramp__ticks { height: 32px; position: relative; }
        .continuous-ramp__ticks span { font-size: 11px; position: absolute; top: 4px; transform: translateX(-50%); white-space: nowrap; }
        .continuous-ramp__ticks span:first-child { transform: none; }
        .continuous-ramp__ticks span:last-child { transform: translateX(-100%); }
        .continuous-ramp__bounds { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; margin-bottom: 12px; }
        .continuous-ramp__bounds label { font-size: 12px; margin: 0; }
        .continuous-ramp__stop-heading { align-items: center; display: flex; justify-content: space-between; margin-bottom: 6px; }
        .continuous-ramp__stop-heading .btn + .btn { margin-left: 4px; }
        .continuous-ramp__stop-list { display: grid; gap: 5px; }
        .continuous-ramp__stop-row { align-items: center; display: grid; gap: 6px; grid-template-columns: minmax(72px, 1fr) 34px minmax(82px, 1fr) 34px; }
        .continuous-ramp__stop-row label { margin: 0; min-width: 0; }
        .continuous-ramp__stop-row input[type='color'] { border: 0; height: 30px; padding: 0; width: 34px; }
        .continuous-ramp__hex { font-family: monospace; }
        .continuous-ramp__missing { margin-bottom: 0; margin-top: 12px; }
        .continuous-ramp__missing-controls { align-items: center; display: flex; gap: 6px; }
        .continuous-ramp__missing-controls input[type='color'] { border: 0; height: 30px; padding: 0; width: 36px; }
        .continuous-ramp__missing-legend { align-items: center; display: flex; font-size: 12px; gap: 7px; margin-top: 8px; }
        .continuous-ramp__missing-swatch { border: 1px solid #666; display: inline-block; height: 16px; width: 24px; }
        .continuous-ramp__error { color: #8b1a1a; font-size: 12px; margin-top: 8px; }
    `]
})
export class ContinuousColorRampComponent {
    @Input() resolved: ResolvedVariableColorScale | null = null;
    @Input() config: VariableColorScaleConfig;
    @Input() editable = false;
    @Input() controlId = 'continuous-color-ramp';
    @Output() configChange = new EventEmitter<VariableColorScaleConfig>();

    validationMessage = '';

    get gradientCss(): string {
        return this.resolved ? buildContinuousGradientCss(this.resolved) : '';
    }

    get description(): string {
        if (!this.resolved?.domain) {
            return 'Continuous color ramp';
        }
        const stops = this.resolved.stops
            .map(stop => `${this.formatValue(stop.value)} ${stop.color}`)
            .join(', ');
        return `Continuous color ramp from ${this.formatValue(this.resolved.domain.min)} to ${this.formatValue(this.resolved.domain.max)}. Stops: ${stops}. Missing or invalid values use ${this.resolved.missingColor}.`;
    }

    formatValue(value: number): string {
        return Number(value).toLocaleString(undefined, { maximumSignificantDigits: 7 });
    }

    getStopPercent(value: number): number {
        const domain = this.resolved?.domain;
        if (!domain || domain.min === domain.max) {
            return 50;
        }
        return Math.min(100, Math.max(0, ((value - domain.min) / (domain.max - domain.min)) * 100));
    }

    onDomainKindChange(kind: 'auto' | 'custom'): void {
        this.validationMessage = '';
        if (kind === 'auto') {
            this.emitConfig({ ...this.config, domain: { kind: 'auto' } });
            return;
        }

        const domain = this.resolved?.domain;
        if (!domain || domain.min === domain.max) {
            this.validationMessage = 'Custom bounds require a minimum below the maximum.';
            return;
        }
        this.emitConfig({
            ...this.config,
            domain: { kind: 'custom', min: domain.min, max: domain.max },
            stops: this.cloneResolvedStops()
        });
    }

    onDomainBoundChange(bound: 'min' | 'max', rawValue: unknown): void {
        if (this.config.domain.kind !== 'custom') {
            return;
        }
        const value = Number(rawValue);
        const min = bound === 'min' ? value : this.config.domain.min;
        const max = bound === 'max' ? value : this.config.domain.max;
        if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
            this.validationMessage = 'Minimum must be a finite number below maximum.';
            return;
        }

        const currentStops = this.cloneResolvedStops();
        const interiorStops = currentStops.slice(1, -1);
        if (interiorStops.some(stop => stop.value <= min || stop.value >= max)) {
            this.validationMessage = 'Move or remove interior stops before narrowing the domain past them.';
            return;
        }

        this.validationMessage = '';
        this.emitConfig({
            ...this.config,
            domain: { kind: 'custom', min, max },
            stops: [
                { value: min, color: currentStops[0].color },
                ...interiorStops,
                { value: max, color: currentStops[currentStops.length - 1].color }
            ]
        });
    }

    onStopValueChange(index: number, rawValue: unknown): void {
        const value = Number(rawValue);
        const stops = this.cloneResolvedStops();
        const domain = this.resolved?.domain;
        if (!domain || !Number.isFinite(value) || index <= 0 || index >= stops.length - 1) {
            return;
        }
        if (value <= stops[index - 1].value || value >= stops[index + 1].value) {
            this.validationMessage = 'Stop values must be unique and remain in increasing order.';
            return;
        }
        this.validationMessage = '';
        stops[index] = { ...stops[index], value };
        this.emitConfig({ ...this.config, stops });
    }

    onStopColorChange(index: number, rawColor: unknown): void {
        const stops = this.cloneResolvedStops();
        const color = normalizeHexColor(rawColor, '');
        if (!color || !stops[index]) {
            this.validationMessage = 'Colors must use six-digit hex notation, such as #21918c.';
            return;
        }
        this.validationMessage = '';
        stops[index] = { ...stops[index], color };
        this.emitConfig({ ...this.config, stops });
    }

    onMissingColorChange(rawColor: unknown): void {
        const color = normalizeHexColor(rawColor, '');
        if (!color) {
            this.validationMessage = 'The missing-value color must use six-digit hex notation.';
            return;
        }
        this.validationMessage = '';
        this.emitConfig({ ...this.config, missingColor: color });
    }

    addStop(): void {
        const stops = this.cloneResolvedStops();
        if (stops.length < 2 || this.resolved?.constant) {
            return;
        }

        let gapIndex = 0;
        for (let index = 1; index < stops.length - 1; index += 1) {
            if (stops[index + 1].value - stops[index].value > stops[gapIndex + 1].value - stops[gapIndex].value) {
                gapIndex = index;
            }
        }
        const value = stops[gapIndex].value + ((stops[gapIndex + 1].value - stops[gapIndex].value) / 2);
        const interpolated = this.resolved?.colorMap(value) || '#21918c';
        const color = d3.color(interpolated)?.hex() || '#21918c';
        stops.splice(gapIndex + 1, 0, { value, color });
        this.emitConfig({ ...this.config, stops });
    }

    removeStop(index: number): void {
        const stops = this.cloneResolvedStops();
        if (index <= 0 || index >= stops.length - 1) {
            return;
        }
        stops.splice(index, 1);
        this.emitConfig({ ...this.config, stops });
    }

    reverseStops(): void {
        const stops = this.cloneResolvedStops();
        const colors = stops.map(stop => stop.color).reverse();
        this.emitConfig({
            ...this.config,
            stops: stops.map((stop, index) => ({ ...stop, color: colors[index] }))
        });
    }

    private cloneResolvedStops(): ContinuousColorStop[] {
        return (this.resolved?.stops || []).map(stop => ({ ...stop }));
    }

    private emitConfig(config: VariableColorScaleConfig): void {
        this.configChange.emit(config);
    }
}
