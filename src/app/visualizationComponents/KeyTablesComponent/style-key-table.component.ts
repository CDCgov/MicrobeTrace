import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { getNodeShapePreviewDataUri } from '@app/contactTraceCommonServices/node-shapes';
import { TreeNode } from 'primeng/api';

export type StyleKeyTableControlType = 'color' | 'shape';
export type StyleKeyTableSortColumn = 'value' | 'count' | 'frequency';

export interface StyleKeyTableDuoSegment {
    color: string;
    opacity: number | string;
    value?: any;
    displayName?: string;
    index?: number;
}

export interface StyleKeyTableRow {
    rawValue: any;
    trackKey: string;
    displayName: string;
    count: number | string;
    frequency: number | string;
    color?: string;
    alpha?: number | string;
    index?: number;
    colorSegments?: StyleKeyTableDuoSegment[];
    duoSegments?: StyleKeyTableDuoSegment[];
    shapeSelection?: TreeNode<any> | null;
    shapeKey?: string | null;
}

export interface StyleKeyTableColumnNameChange {
    table: string;
    column: StyleKeyTableSortColumn;
    displayName: string;
}

export interface StyleKeyTableRowNameChange {
    row: StyleKeyTableRow;
    value: any;
    displayName: string;
}

export interface StyleKeyTableColorChange {
    row: StyleKeyTableRow;
    value: any;
    color: string;
}

export interface StyleKeyTableAlphaRequest {
    row: StyleKeyTableRow;
    value: any;
    event: MouseEvent;
}

export interface StyleKeyTableSegmentAlphaChange {
    row: StyleKeyTableRow;
    value: any;
    segment: StyleKeyTableDuoSegment;
    segmentIndex: number;
    alpha: number;
}

export interface StyleKeyTableShapeChange {
    row: StyleKeyTableRow;
    value: any;
    selectedNode: TreeNode<any> | null;
}

export interface StyleKeyTableShapePanelRequest {
    row: StyleKeyTableRow;
    value: any;
    shapeKey: string | null | undefined;
}

@Component({
    selector: 'style-key-table',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
    template: `
        <table [id]="tableId" style="width:100%;height:100%;">
            <tr>
                <th class="p-1 table-header-row">
                    <div class="header-content sortable">
                        <span
                            contenteditable
                            [attr.data-table-key]="tableKey"
                            data-column-key="value"
                            [textContent]="valueHeader"
                            (keydown)="onEditableKeydown($event)"
                            (blur)="onColumnBlur($event, 'value')">
                        </span>
                        <a class="sort-button sortName" style="cursor: pointer" (click)="sortChange.emit('value')">&#8645;</a>
                    </div>
                </th>
                @if (showCounts) {
                    <th class="table-header-row tableCount">
                        <div class="header-content sortable">
                            <span
                                contenteditable
                                [attr.data-table-key]="tableKey"
                                data-column-key="count"
                                [textContent]="countHeader"
                                (keydown)="onEditableKeydown($event)"
                                (blur)="onColumnBlur($event, 'count')">
                            </span>
                            <a class="sort-button sortCount" style="cursor: pointer" (click)="sortChange.emit('count')">&#8645;</a>
                        </div>
                    </th>
                }
                @if (showFrequencies) {
                    <th class="table-header-row tableFrequency">
                        <div class="header-content sortable">
                            <span
                                contenteditable
                                [attr.data-table-key]="tableKey"
                                data-column-key="frequency"
                                [textContent]="frequencyHeader"
                                (keydown)="onEditableKeydown($event)"
                                (blur)="onColumnBlur($event, 'frequency')">
                            </span>
                            <a class="sort-button sortFrequency" style="cursor: pointer" (click)="sortChange.emit('frequency')">&#8645;</a>
                        </div>
                    </th>
                }
                <th>{{ controlHeader }}</th>
            </tr>
            @for (row of rows; track row.trackKey) {
                <tr>
                    <td
                        [attr.data-value]="row.rawValue"
                        [attr.contenteditable]="editable ? 'true' : null"
                        [textContent]="row.displayName"
                        (keydown)="onEditableKeydown($event)"
                        (blur)="onRowNameBlur($event, row)">
                    </td>
                    @if (showCounts) {
                        <td class="tableCount">{{ row.count }}</td>
                    }
                    @if (showFrequencies) {
                        <td class="tableFrequency">{{ row.frequency }}</td>
                    }
                    <td [style.background-color]="!editable && controlType === 'color' && !getColorSegments(row).length ? row.color : null">
                        @if (controlType === 'color') {
                            @if (getColorSegments(row).length) {
                                <div
                                    class="style-key-table__color-swatch style-key-table__duo-swatch"
                                    role="img"
                                    [attr.aria-label]="(row.colorSegments?.length ? 'Mixed colors for ' : 'Link colors for ') + row.displayName"
                                    [attr.data-mixed-color-swatch]="row.colorSegments?.length ? 'true' : null">
                                    <div class="style-key-table__color-swatch-inner style-key-table__duo-inner">
                                        @for (segment of getColorSegments(row); track $index) {
                                            <span
                                                class="style-key-table__color-segment duo-link-color-segment"
                                                [attr.data-color-segment]="$index"
                                                [attr.data-duo-index]="$index"
                                                [style.background]="segment.color"
                                                [style.opacity]="segment.opacity">
                                            </span>
                                        }
                                    </div>
                                </div>
                                @if (row.colorSegments?.length) {
                                    <a
                                        class="transparency-symbol style-key-table__segment-alpha-trigger"
                                        role="button"
                                        tabindex="0"
                                        [attr.aria-label]="'Adjust transparency for mixed colors in ' + row.displayName"
                                        [attr.aria-expanded]="isSegmentAlphaEditorOpen(row)"
                                        data-mixed-alpha-trigger="true"
                                        (click)="onSegmentAlphaTriggerClick(row, $event)"
                                        (keydown)="onSegmentAlphaTriggerKeydown(row, $event)">&#8691;</a>
                                }
                                @if (row.colorSegments?.length && isSegmentAlphaEditorOpen(row)) {
                                    <div
                                        class="style-key-table__segment-alpha-editor"
                                        role="group"
                                        [style.top.px]="segmentAlphaEditorTop"
                                        [style.left.px]="segmentAlphaEditorLeft"
                                        [attr.aria-label]="'Mixed color transparency for ' + row.displayName"
                                        (click)="onSegmentAlphaEditorClick($event)">
                                        @for (segment of row.colorSegments; track $index) {
                                            <div class="style-key-table__segment-alpha-control">
                                                <label
                                                    class="style-key-table__segment-alpha-label"
                                                    [attr.for]="getSegmentAlphaControlId(row, $index)">
                                                    <span class="style-key-table__segment-alpha-name">
                                                        <span
                                                            class="style-key-table__segment-alpha-color"
                                                            [style.background]="segment.color"
                                                            [style.opacity]="segment.opacity">
                                                        </span>
                                                        {{ getSegmentDisplayName(segment, $index) }}
                                                    </span>
                                                    <span>{{ formatAlphaPercent(segment.opacity) }}</span>
                                                </label>
                                                <div class="style-key-table__segment-alpha-slider-frame">
                                                    <input
                                                        type="range"
                                                        class="custom-range style-key-table__segment-alpha-slider"
                                                        min="0"
                                                        max="1"
                                                        step="0.05"
                                                        [id]="getSegmentAlphaControlId(row, $index)"
                                                        [value]="segment.opacity"
                                                        [attr.aria-label]="getSegmentDisplayName(segment, $index) + ' transparency'"
                                                        (input)="onSegmentAlphaInput(row, segment, $index, $event)">
                                                </div>
                                            </div>
                                        }
                                    </div>
                                }
                            } @else if (editable) {
                                <input
                                    type="color"
                                    [attr.value]="row.color"
                                    [value]="row.color"
                                    [style.opacity]="row.alpha ?? 1"
                                    style="border:none"
                                    (change)="onColorInputChange(row, $event)">
                                <a class="transparency-symbol" style="cursor: pointer" (click)="onAlphaClick(row, $event)">&#8691;</a>
                            }
                        } @else {
                            <p-treeSelect
                                [options]="shapeOptions"
                                [panelStyle]="{ width: '23rem' }"
                                panelStyleClass="shapeTreeSelectPanel"
                                selectionMode="single"
                                appendTo="body"
                                class="width-percent-100"
                                [ngModel]="row.shapeSelection"
                                (ngModelChange)="onShapeSelectionChange(row, $event)"
                                styleClass="shapeDropdown"
                                (onShow)="onShapePanelShow(row)">
                                <ng-template pTemplate="value" let-node let-placeholder="placeholder">
                                    @if (node?.data) {
                                        <div class="shape-tree-value style-key-table__shape-option">
                                            <img
                                                class="style-key-table__shape-preview"
                                                [attr.data-shape-key]="node.data.key"
                                                [src]="getShapePreviewSrc(node.data.key)"
                                                alt=""
                                                aria-hidden="true">
                                            <span class="style-key-table__shape-label">{{ node.data.name }}</span>
                                        </div>
                                    } @else {
                                        <span>{{ placeholder }}</span>
                                    }
                                </ng-template>
                                <ng-template pTemplate="shape" let-node>
                                    <div class="shape-tree-node style-key-table__shape-option">
                                        <img
                                            class="style-key-table__shape-preview"
                                            [attr.data-shape-key]="node.data.key"
                                            [src]="getShapePreviewSrc(node.data.key)"
                                            alt=""
                                            aria-hidden="true">
                                        <span class="style-key-table__shape-label">{{ node.data.name }}</span>
                                    </div>
                                </ng-template>
                            </p-treeSelect>
                        }
                    </td>
                </tr>
            }
        </table>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
        }

        .style-key-table__duo-swatch {
            background: #f0f0f0;
            display: inline-flex;
            height: 25px;
            padding: 4px;
            vertical-align: middle;
            width: 50px;
        }

        .style-key-table__segment-alpha-trigger {
            cursor: pointer;
            display: inline-block;
            margin-left: 2px;
            vertical-align: middle;
        }

        .style-key-table__segment-alpha-trigger:focus-visible {
            outline: 2px solid #1474d4;
            outline-offset: 2px;
        }

        .style-key-table__duo-inner {
            border: 1px solid #777777;
            display: inline-flex;
            height: 17px;
            width: 42px;
        }

        .style-key-table__color-segment {
            display: inline-block;
            flex: 1 1 0;
            height: 100%;
            min-width: 0;
        }

        .style-key-table__segment-alpha-editor {
            align-items: flex-start;
            background: #f8f9fa;
            border: 1px solid #d8e2da;
            border-radius: 0.25rem;
            box-shadow: 0 4px 12px rgba(32, 51, 39, 0.18);
            display: flex;
            flex-direction: row;
            gap: 10px;
            padding: 8px;
            position: fixed;
            z-index: 1300;
        }

        .style-key-table__segment-alpha-control {
            align-items: center;
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 44px;
        }

        .style-key-table__segment-alpha-label,
        .style-key-table__segment-alpha-name {
            display: flex;
            align-items: center;
        }

        .style-key-table__segment-alpha-label {
            flex-direction: column;
            gap: 2px;
            margin: 0;
            font-size: 12px;
        }

        .style-key-table__segment-alpha-name {
            gap: 6px;
            min-width: 0;
        }

        .style-key-table__segment-alpha-color {
            flex: 0 0 12px;
            height: 12px;
            border: 1px solid #777777;
            border-radius: 2px;
        }

        .style-key-table__segment-alpha-slider-frame {
            height: 112px;
            position: relative;
            width: 24px;
        }

        .style-key-table__segment-alpha-slider {
            left: 50%;
            position: absolute;
            top: 50%;
            transform: translate(-50%, -50%) rotate(270deg);
            transform-origin: center;
            width: 112px;
        }

        .style-key-table__shape-option {
            align-items: center;
            display: inline-flex;
            gap: 8px;
            min-width: 0;
        }

        .style-key-table__shape-preview {
            display: inline-block;
            flex: 0 0 18px;
            height: 18px;
            object-fit: contain;
            width: 18px;
        }

        .style-key-table__shape-label {
            line-height: 1.2;
            min-width: 0;
            white-space: normal;
        }
    `]
})
export class StyleKeyTableComponent {
    @Input() tableId = '';
    @Input() tableKey = '';
    @Input() controlType: StyleKeyTableControlType = 'color';
    @Input() controlHeader = 'Color';
    @Input() valueHeader = '';
    @Input() countHeader = 'Count';
    @Input() frequencyHeader = 'Frequency';
    @Input() showCounts = false;
    @Input() showFrequencies = false;
    @Input() editable = true;
    @Input() rows: StyleKeyTableRow[] = [];
    @Input() shapeOptions: TreeNode<any>[] = [];

    @Output() columnNameChange = new EventEmitter<StyleKeyTableColumnNameChange>();
    @Output() rowNameChange = new EventEmitter<StyleKeyTableRowNameChange>();
    @Output() sortChange = new EventEmitter<StyleKeyTableSortColumn>();
    @Output() colorChange = new EventEmitter<StyleKeyTableColorChange>();
    @Output() alphaRequest = new EventEmitter<StyleKeyTableAlphaRequest>();
    @Output() segmentAlphaChange = new EventEmitter<StyleKeyTableSegmentAlphaChange>();
    @Output() shapeChange = new EventEmitter<StyleKeyTableShapeChange>();
    @Output() shapePanelRequest = new EventEmitter<StyleKeyTableShapePanelRequest>();

    private readonly shapePreviewSrcCache = new Map<string, string>();
    private expandedSegmentAlphaRowKey: string | null = null;
    segmentAlphaEditorTop = 0;
    segmentAlphaEditorLeft = 0;

    getColorSegments(row: StyleKeyTableRow): StyleKeyTableDuoSegment[] {
        return row.colorSegments?.length ? row.colorSegments : row.duoSegments ?? [];
    }

    getShapePreviewSrc(shapeKey: string | null | undefined): string {
        const key = String(shapeKey ?? '');
        if (!key) {
            return '';
        }

        const cachedPreviewSrc = this.shapePreviewSrcCache.get(key);
        if (cachedPreviewSrc) {
            return cachedPreviewSrc;
        }

        const previewSrc = getNodeShapePreviewDataUri(key);
        this.shapePreviewSrcCache.set(key, previewSrc);
        return previewSrc;
    }

    onEditableKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        (event.currentTarget as HTMLElement | null)?.blur();
    }

    onColumnBlur(event: FocusEvent, column: StyleKeyTableSortColumn): void {
        const cell = event.currentTarget as HTMLElement | null;
        this.columnNameChange.emit({
            table: this.tableKey,
            column,
            displayName: cell?.textContent ?? ''
        });
    }

    onRowNameBlur(event: FocusEvent, row: StyleKeyTableRow): void {
        const cell = event.currentTarget as HTMLElement | null;
        this.rowNameChange.emit({
            row,
            value: row.rawValue,
            displayName: cell?.textContent ?? ''
        });
    }

    onColorInputChange(row: StyleKeyTableRow, event: Event): void {
        const input = event.target as HTMLInputElement | null;
        this.colorChange.emit({
            row,
            value: row.rawValue,
            color: input?.value ?? row.color ?? '#000000'
        });
    }

    onAlphaClick(row: StyleKeyTableRow, event: MouseEvent): void {
        event.stopPropagation();
        this.alphaRequest.emit({
            row,
            value: row.rawValue,
            event
        });
    }

    isSegmentAlphaEditorOpen(row: StyleKeyTableRow): boolean {
        return this.expandedSegmentAlphaRowKey === row.trackKey;
    }

    onSegmentAlphaTriggerClick(row: StyleKeyTableRow, event: MouseEvent): void {
        if (!row.colorSegments?.length) {
            return;
        }

        event.stopPropagation();
        this.toggleSegmentAlphaEditor(row, event.currentTarget as HTMLElement | null, event.clientX, event.clientY);
    }

    onSegmentAlphaTriggerKeydown(row: StyleKeyTableRow, event: KeyboardEvent): void {
        if (!row.colorSegments?.length || (event.key !== 'Enter' && event.key !== ' ')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.toggleSegmentAlphaEditor(row, event.currentTarget as HTMLElement | null);
    }

    onSegmentAlphaEditorClick(event: MouseEvent): void {
        event.stopPropagation();
    }

    onSegmentAlphaInput(
        row: StyleKeyTableRow,
        segment: StyleKeyTableDuoSegment,
        segmentIndex: number,
        event: Event
    ): void {
        const input = event.target as HTMLInputElement | null;
        const numericAlpha = Number(input?.value ?? segment.opacity);
        const alpha = Number.isFinite(numericAlpha)
            ? Math.min(1, Math.max(0, numericAlpha))
            : 1;
        segment.opacity = alpha;
        this.segmentAlphaChange.emit({
            row,
            value: segment.value,
            segment,
            segmentIndex,
            alpha
        });
    }

    getSegmentDisplayName(segment: StyleKeyTableDuoSegment, segmentIndex: number): string {
        return String(segment.displayName ?? segment.value ?? `Color ${segmentIndex + 1}`);
    }

    getSegmentAlphaControlId(row: StyleKeyTableRow, segmentIndex: number): string {
        const safeRowKey = row.trackKey.replace(/[^A-Za-z0-9_-]/g, '-');
        return `${this.tableId || this.tableKey || 'style-key-table'}-${safeRowKey}-alpha-${segmentIndex}`;
    }

    formatAlphaPercent(alphaValue: number | string): string {
        const numericAlpha = Number(alphaValue);
        const alpha = Number.isFinite(numericAlpha)
            ? Math.min(1, Math.max(0, numericAlpha))
            : 1;
        return `${Math.round(alpha * 100)}%`;
    }

    private toggleSegmentAlphaEditor(
        row: StyleKeyTableRow,
        anchor: HTMLElement | null,
        clientX = 0,
        clientY = 0
    ): void {
        if (this.isSegmentAlphaEditorOpen(row)) {
            this.expandedSegmentAlphaRowKey = null;
            return;
        }

        const rect = anchor?.getBoundingClientRect();
        const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
        const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight;
        const editorWidth = Math.max(68, row.colorSegments!.length * 54 + 16);
        const editorHeight = 170;
        const anchorLeft = rect?.left ?? clientX;
        const anchorRight = rect?.right ?? clientX;
        const anchorTop = rect?.top ?? clientY;
        const preferredLeft = anchorRight + 8;

        this.segmentAlphaEditorLeft = preferredLeft + editorWidth <= viewportWidth - 8
            ? preferredLeft
            : Math.max(8, anchorLeft - editorWidth - 8);
        this.segmentAlphaEditorTop = Math.max(8, Math.min(anchorTop - 72, viewportHeight - editorHeight - 8));
        this.expandedSegmentAlphaRowKey = row.trackKey;
    }

    onShapeSelectionChange(row: StyleKeyTableRow, selectedNode: TreeNode<any> | null): void {
        this.shapeChange.emit({
            row,
            value: row.rawValue,
            selectedNode
        });
    }

    onShapePanelShow(row: StyleKeyTableRow): void {
        this.shapePanelRequest.emit({
            row,
            value: row.rawValue,
            shapeKey: row.shapeKey
        });
    }
}
