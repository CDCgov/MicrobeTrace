import {
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Inject,
    OnDestroy,
    OnInit,
    Output
} from '@angular/core';
import { ComponentContainer } from 'golden-layout';
import { BaseComponentDirective } from '@app/base-component.directive';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';

@Component({
    selector: 'GlobalColorTablesComponent',
    templateUrl: './global-color-tables.component.html',
    styleUrls: ['./global-color-tables.component.less'],
    standalone: false
})
export class GlobalColorTablesComponent extends BaseComponentDirective implements OnInit, OnDestroy, MicobeTraceNextPluginEvents {
    static readonly componentTypeName = 'Global Color Tables';

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter<string>();

    viewActive = true;
    hasNodeColorTable = false;
    hasLinkColorTable = false;
    hasNodeShapeTable = false;
    showNodeSettingsMenu = false;
    showLinkSettingsMenu = false;
    showNodeShapeSettingsMenu = false;
    nodeTableCollapsed = false;
    linkTableCollapsed = false;
    nodeShapeTableCollapsed = false;

    constructor(
        @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
        elRef: ElementRef,
        private cdref: ChangeDetectorRef,
        private visuals: MicrobeTraceNextVisuals
    ) {
        super(elRef.nativeElement);
        this.visuals.globalColorTables = this;
    }

    ngOnInit(): void {
        this.refreshTables();

        this.container.on('resize', () => this.refreshTables());
        this.container.on('hide', () => {
            this.viewActive = false;
            this.cdref.detectChanges();
        });
        this.container.on('show', () => {
            this.viewActive = true;
            this.refreshTables();
            this.cdref.detectChanges();
        });
    }

    ngOnDestroy(): void {
        if (this.visuals.globalColorTables === this) {
            this.visuals.globalColorTables = undefined;
        }
    }

    openStylingSettings(): void {
        this.DisplayGlobalSettingsDialogEvent.emit('Styling');
    }

    get widgets() {
        return this.visuals.microbeTrace?.widgets ?? {};
    }

    get nodeColorFieldOptions() {
        return this.visuals.microbeTrace?.FieldList ?? [];
    }

    get linkColorFieldOptions() {
        return this.visuals.microbeTrace?.ToolTipFieldList ?? [];
    }

    get nodeShapeFieldOptions() {
        return this.visuals.microbeTrace?.FieldList ?? [];
    }

    get selectedNodeColorBy(): string {
        return this.visuals.microbeTrace?.SelectedColorNodesByVariable ?? 'None';
    }

    get selectedLinkColorBy(): string {
        return this.visuals.microbeTrace?.SelectedColorLinksByVariable ?? 'None';
    }

    get selectedNodeShapeBy(): string {
        return this.visuals.microbeTrace?.SelectedNodeSymbolVariable ?? 'None';
    }

    get symbolMappingTree() {
        return this.visuals.microbeTrace?.symbolMappingTree ?? [];
    }

    get shapeAggregates() {
        return this.visuals.microbeTrace?.shapeAggregates ?? [];
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: Event): void {
        const target = event.target as Node | null;
        if (target && !this.rootHtmlElement.contains(target)) {
            this.hideSettingsMenus();
        }
    }

    refreshTables(): void {
        const microbeTrace = this.visuals.microbeTrace;
        if (!microbeTrace) {
            return;
        }

        this.hasNodeColorTable = microbeTrace.SelectedColorNodesByVariable !== 'None';
        this.hasLinkColorTable = microbeTrace.SelectedColorLinksByVariable !== 'None';
        this.hasNodeShapeTable = microbeTrace.SelectedNodeSymbolVariable !== 'None';

        if (this.hasNodeColorTable) {
            microbeTrace.generateNodeColorTable('#global-color-tables-node-table');
        } else {
            $('#global-color-tables-node-table').empty();
        }

        if (this.hasLinkColorTable) {
            microbeTrace.generateNodeLinkTable('#global-color-tables-link-table');
        } else {
            $('#global-color-tables-link-table').empty();
        }

        if (this.hasNodeShapeTable) {
            microbeTrace.generateNodeShapeSelectionTable(microbeTrace.SelectedNodeSymbolVariable);
        }

        microbeTrace.updateCountFreqTable('node-color');
        microbeTrace.updateCountFreqTable('link-color');
        microbeTrace.updateCountFreqTable('node-shape');
        this.cdref.markForCheck();
    }

    onNodeColorByChange(value: string): void {
        const microbeTrace = this.visuals.microbeTrace;
        if (!microbeTrace || microbeTrace.SelectedColorNodesByVariable === value) {
            return;
        }

        microbeTrace.SelectedColorNodesByVariable = value;
        microbeTrace.onColorNodesByChanged();
    }

    onLinkColorByChange(value: string): void {
        const microbeTrace = this.visuals.microbeTrace;
        if (!microbeTrace || microbeTrace.SelectedColorLinksByVariable === value) {
            return;
        }

        microbeTrace.SelectedColorLinksByVariable = value;
        microbeTrace.onColorLinksByChanged();
    }

    onNodeShapeByChange(value: string): void {
        const microbeTrace = this.visuals.microbeTrace;
        if (!microbeTrace || microbeTrace.SelectedNodeSymbolVariable === value) {
            return;
        }

        microbeTrace.SelectedNodeSymbolVariable = value;
        microbeTrace.onNodeShapeByChanged(false, true, value);
    }

    toggleSettingsMenu(table: 'node-color' | 'link-color' | 'node-shape', event?: Event): void {
        event?.stopPropagation();

        if (table === 'node-color') {
            this.showNodeSettingsMenu = !this.showNodeSettingsMenu;
            this.showLinkSettingsMenu = false;
            this.showNodeShapeSettingsMenu = false;
        } else if (table === 'link-color') {
            this.showLinkSettingsMenu = !this.showLinkSettingsMenu;
            this.showNodeSettingsMenu = false;
            this.showNodeShapeSettingsMenu = false;
        } else {
            this.showNodeShapeSettingsMenu = !this.showNodeShapeSettingsMenu;
            this.showNodeSettingsMenu = false;
            this.showLinkSettingsMenu = false;
        }

        this.cdref.markForCheck();
    }

    hideSettingsMenu(table: 'node-color' | 'link-color' | 'node-shape'): void {
        if (table === 'node-color') {
            this.showNodeSettingsMenu = false;
        } else if (table === 'link-color') {
            this.showLinkSettingsMenu = false;
        } else {
            this.showNodeShapeSettingsMenu = false;
        }

        this.cdref.markForCheck();
    }

    toggleTableColumn(table: 'node-color' | 'link-color' | 'node-shape', column: 'tableCounts' | 'tableFreq', event?: Event): void {
        event?.stopPropagation();
        this.visuals.microbeTrace?.toggleColorTableColumns(table, column);
        this.hideSettingsMenu(table);
    }

    toggleTableCollapsed(table: 'node-color' | 'link-color' | 'node-shape', event?: Event): void {
        event?.stopPropagation();

        if (table === 'node-color') {
            this.nodeTableCollapsed = !this.nodeTableCollapsed;
        } else if (table === 'link-color') {
            this.linkTableCollapsed = !this.linkTableCollapsed;
        } else {
            this.nodeShapeTableCollapsed = !this.nodeShapeTableCollapsed;
        }

        this.cdref.markForCheck();
    }

    onNodeShapeSort(sortBy: string): void {
        this.visuals.microbeTrace?.onNodeShapeSort(sortBy);
        this.cdref.markForCheck();
    }

    getNodeShapeTableValue(group: any) {
        return this.visuals.microbeTrace?.getNodeShapeTableValue(group) ?? null;
    }

    getNodeShapeValue(group: any): string | null {
        return this.visuals.microbeTrace?.commonService?.temp?.style?.nodeSymbolMap?.(group) ?? null;
    }

    getSelectedNodeShapeTreeSelection() {
        return this.visuals.microbeTrace?.getSelectedNodeShapeTreeSelection() ?? null;
    }

    getSelectedNodeShapeValue(): string | null {
        return this.visuals.microbeTrace?.getSelectedNodeShapeValue() ?? null;
    }

    formatNodeShapeGroup(key: string): string {
        return this.visuals.microbeTrace?.commonService?.titleize(key) ?? key;
    }

    onNodeShapeTreeChange(selectedNode: any): void {
        this.visuals.microbeTrace?.onNodeShapeTreeChange(selectedNode);
        this.cdref.markForCheck();
    }

    onNodeShapeTableTreeChange(selectedNode: any, group: any): void {
        this.visuals.microbeTrace?.onNodeShapeTableTreeChange(selectedNode, group);
        this.cdref.markForCheck();
    }

    onShapeTreeShow(shapeKey: string | null | undefined): void {
        this.visuals.microbeTrace?.onShapeTreeShow(shapeKey);
    }

    private hideSettingsMenus(): void {
        this.showNodeSettingsMenu = false;
        this.showLinkSettingsMenu = false;
        this.showNodeShapeSettingsMenu = false;
        this.cdref.markForCheck();
    }

    updateNodeColors() {
        this.refreshTables();
    }

    updateNodeShapes() {
        this.refreshTables();
    }

    updateVisualization() {
        this.refreshTables();
    }

    applyStyleFileSettings() {
        this.refreshTables();
    }

    updateLinkColor() {
        this.refreshTables();
    }

    openRefreshScreen() {}

    onRecallSession() {
        this.refreshTables();
    }

    onLoadNewData() {
        this.refreshTables();
    }

    onFilterDataChange() {
        this.refreshTables();
    }

    openExport() {}
}
