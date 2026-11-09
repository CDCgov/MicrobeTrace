import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { TreeNode } from 'primeng/api';
import { NODE_SHAPE_TREE_SELECT_PASS_THROUGH } from '@app/contactTraceCommonServices/node-shape-picker';
import { StyleKeyTableRow, StyleKeyTableSortColumn } from '../KeyTablesComponent/style-key-table.component';
import { THREE_D_SHAPE_TREE, threeDShapePreview } from './three-d-shape-previews';

export interface ThreeDShapeLegendModel {
  fields: Array<{ label: string; value: string }>;
  field: string;
  uniformShape: TreeNode;
  rows: StyleKeyTableRow[];
  headers: Record<StyleKeyTableSortColumn, string>;
  mode: 'Show' | 'Dock' | 'Hide';
  collapsed: boolean;
  showCounts: boolean;
  showFrequencies: boolean;
}

export type ThreeDShapeLegendChange =
  | { type: 'field' | 'shape' | 'mode'; value: string; category?: string }
  | { type: 'counts' | 'frequencies' | 'collapsed' }
  | { type: 'sort'; value: StyleKeyTableSortColumn }
  | { type: 'rowName'; value: string; category: string }
  | { type: 'columnName'; value: string; column: StyleKeyTableSortColumn };

@Component({
  selector: 'three-d-shape-legend', standalone: false,
  styleUrls: ['../KeyTablesComponent/key-table-card.less'],
  styles: [':host{display:contents}.key-table-card--docked{max-height:380px}.key-table-card__table{max-height:50vh}.shape-tree-value{display:flex;align-items:center;gap:8px}.shape-tree-value img{width:22px;height:22px}.key-table-card__header{grid-template-columns:minmax(125px,max-content) minmax(0,1fr)}'],
  template: `
    <section class="key-table-card" data-testid="threed-shape-legend" [class.key-table-card--collapsed]="model.collapsed" [class.key-table-card--docked]="model.mode === 'Dock'">
      <div class="key-table-card__header">
        <div class="key-table-card__identity"><h5>3D Node Shapes</h5><span class="key-table-card__scope">3D Network</span></div>
        <div class="key-table-card__controls">
          <p-select class="key-table-card__select" [options]="model.fields" optionLabel="label" optionValue="value" appendTo="body"
            ariaLabel="3D Shape By" [ngModel]="model.field" (ngModelChange)="change.emit({type:'field',value:$event})"></p-select>
          <div class="key-table-card__menu-anchor">
            <button type="button" title="Settings" aria-label="3D shape table settings" class="btn btn-sm btn-clean btn-icon btn-icon-md" (click)="menuOpen = !menuOpen; $event.stopPropagation()"><i class="pi pi-cog"></i></button>
            <div class="dropdown-menu key-table-card__menu" [class.show]="menuOpen" (click)="$event.stopPropagation()">
              <button class="dropdown-item" (click)="change.emit({type:'counts'})"><span>Show Counts</span><i aria-hidden="true" [className]="model.showCounts ? 'pi pi-check' : 'pi pi-times'"></i></button>
              <button class="dropdown-item" (click)="change.emit({type:'frequencies'})"><span>Show Frequencies</span><i aria-hidden="true" [className]="model.showFrequencies ? 'pi pi-check' : 'pi pi-times'"></i></button>
              <button class="dropdown-item" (click)="change.emit({type:'mode',value:'Hide'}); menuOpen=false">Hide Table</button>
            </div>
          </div>
          <button type="button" [title]="model.mode === 'Dock' ? 'Float table' : 'Dock table'" [attr.aria-label]="model.mode === 'Dock' ? 'Float 3D shape table' : 'Dock 3D shape table'"
            class="btn btn-sm btn-clean btn-icon btn-icon-md" (click)="change.emit({type:'mode',value:model.mode === 'Dock' ? 'Show' : 'Dock'})"><i class="pi pi-window-minimize"></i></button>
          <button type="button" [title]="model.collapsed ? 'Expand table' : 'Collapse table'" [attr.aria-label]="model.collapsed ? 'Expand 3D shape table' : 'Collapse 3D shape table'"
            class="btn btn-sm btn-clean btn-icon btn-icon-md" (click)="change.emit({type:'collapsed'})"><i [className]="model.collapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'"></i></button>
        </div>
      </div>
      @if (!model.collapsed) {
        @if (model.field === 'None') {
          <div class="key-table-card__fallback"><label>Default Shape</label>
            <p-tree-select [options]="shapes" [pt]="shapePassThrough" appendTo="body" panelStyleClass="shapeTreeSelectPanel" class="width-percent-100 shapeDropdown"
              [panelStyle]="{width:'23rem'}" ariaLabel="Default 3D shape" [ngModel]="model.uniformShape" (ngModelChange)="change.emit({type:'shape',value:$event?.data?.key})">
              <ng-template #value let-node><span class="shape-tree-value"><img [src]="node?.data?.previewSrc" alt=""><span>{{node?.data?.name}}</span></span></ng-template>
            </p-tree-select>
            <p class="key-table-card__empty">Choose a value for Shape By to configure category assignments.</p>
          </div>
        } @else {
          <div class="key-table-card__table">
            <style-key-table [tableId]="tableId" tableKey="3d-node-shape" controlType="shape" controlHeader="Shape"
              [rows]="model.rows" [shapeOptions]="shapes" [shapePreview]="preview" [valueHeader]="model.headers.value" [countHeader]="model.headers.count" [frequencyHeader]="model.headers.frequency"
              [showCounts]="model.showCounts" [showFrequencies]="model.showFrequencies"
              (sortChange)="change.emit({type:'sort',value:$event})"
              (rowNameChange)="change.emit({type:'rowName',category:$event.value,value:$event.displayName})"
              (columnNameChange)="change.emit({type:'columnName',column:$event.column,value:$event.displayName})"
              (shapeChange)="change.emit({type:'shape',category:$event.value,value:$event.selectedNode?.data?.key})"></style-key-table>
          </div>
        }
      }
    </section>
  `,
})
export class ThreeDShapeLegendComponent {
  @Input() model: ThreeDShapeLegendModel;
  @Input() tableId = 'threed-shape-table';
  @Output() change = new EventEmitter<ThreeDShapeLegendChange>();
  shapes = THREE_D_SHAPE_TREE;
  preview = threeDShapePreview;
  shapePassThrough = NODE_SHAPE_TREE_SELECT_PASS_THROUGH;
  menuOpen = false;
  @HostListener('document:click') closeMenu(): void { this.menuOpen = false; }
}
