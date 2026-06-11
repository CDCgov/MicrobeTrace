import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Inject, OnDestroy, OnInit, Output } from '@angular/core';
import { ComponentContainer } from 'golden-layout';
import { BaseComponentDirective } from '@app/base-component.directive';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { DOCKED_KEY_TABLES_VIEW_NAME, KeyTableName } from './key-tables.controller';

@Component({
    selector: 'keyTablesComponent',
    templateUrl: './key-tables.component.html',
    styleUrls: ['./key-tables.component.less'],
    standalone: false
})
export class KeyTablesComponent extends BaseComponentDirective implements OnInit, OnDestroy, MicobeTraceNextPluginEvents {
    static readonly componentTypeName = DOCKED_KEY_TABLES_VIEW_NAME;

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter<string>();

    viewActive = true;
    hasNodeColorTable = false;
    hasLinkColorTable = false;
    hasNodeShapeTable = false;
    hasPolygonColorTable = false;
    showPolygonColorTableCard = false;
    showNodeSettingsMenu = false;
    showLinkSettingsMenu = false;
    showNodeShapeSettingsMenu = false;
    showPolygonSettingsMenu = false;
    nodeTableCollapsed = false;
    linkTableCollapsed = false;
    nodeShapeTableCollapsed = false;
    polygonTableCollapsed = false;

    constructor(
        @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
        elRef: ElementRef,
        private cdref: ChangeDetectorRef,
        private visuals: MicrobeTraceNextVisuals
    ) {
        super(elRef.nativeElement);
        this.visuals.keyTables = this;
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
        if (this.visuals.keyTables === this) {
            this.visuals.keyTables = undefined;
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

    get selectedNodeColorValue(): string {
        return this.visuals.microbeTrace?.SelectedNodeColorVariable
            ?? this.visuals.microbeTrace?.commonService?.session?.style?.widgets?.['node-color']
            ?? '#1f77b4';
    }

    get selectedLinkColorValue(): string {
        return this.visuals.microbeTrace?.SelectedLinkColorVariable
            ?? this.visuals.microbeTrace?.commonService?.session?.style?.widgets?.['link-color']
            ?? '#a6cee3';
    }

    get symbolMappingTree() {
        return this.visuals.microbeTrace?.symbolMappingTree ?? [];
    }

    get shapeAggregates() {
        return this.visuals.microbeTrace?.shapeAggregates ?? [];
    }

    private get dockController() {
        return this.visuals.microbeTrace?.keyTablesController;
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

        this.hasNodeColorTable = this.isTableDocked('node-color') && microbeTrace.SelectedColorNodesByVariable !== 'None';
        this.hasLinkColorTable = this.isTableDocked('link-color') && microbeTrace.SelectedColorLinksByVariable !== 'None';
        this.hasNodeShapeTable = this.isTableDocked('node-shape') && microbeTrace.SelectedNodeSymbolVariable !== 'None';
        this.showPolygonColorTableCard = !!this.visuals.twoD?.isPolygonColorTableDocked;
        this.hasPolygonColorTable = !!this.visuals.twoD?.hasVisibleDockedPolygonColorTable();

        if (this.hasNodeColorTable) {
            microbeTrace.generateNodeColorTable('#key-tables-node-table');
        } else {
            $('#key-tables-node-table').empty();
        }

        if (this.hasLinkColorTable) {
            microbeTrace.generateNodeLinkTable('#key-tables-link-table');
        } else {
            $('#key-tables-link-table').empty();
        }

        if (this.hasNodeShapeTable) {
            microbeTrace.generateNodeShapeSelectionTable(microbeTrace.SelectedNodeSymbolVariable);
        }

        if (this.hasPolygonColorTable) {
            this.visuals.twoD?.renderDockedPolygonColorTable();
        } else {
            this.visuals.twoD?.clearDockedPolygonColorTable();
        }

        microbeTrace.updateCountFreqTable('node-color');
        microbeTrace.updateCountFreqTable('link-color');
        microbeTrace.updateCountFreqTable('node-shape');
        this.cdref.detectChanges();
        microbeTrace.syncNodeValueDisplayNameCells(this.rootHtmlElement);
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

    onNodeColorValueChange(value: string): void {
        const microbeTrace = this.visuals.microbeTrace;
        if (!microbeTrace || microbeTrace.SelectedNodeColorVariable === value) {
            return;
        }

        microbeTrace.SelectedNodeColorVariable = value;
        microbeTrace.onNodeColorChanged();
        this.cdref.markForCheck();
    }

    onLinkColorValueChange(value: string): void {
        const microbeTrace = this.visuals.microbeTrace;
        if (!microbeTrace || microbeTrace.SelectedLinkColorVariable === value) {
            return;
        }

        microbeTrace.SelectedLinkColorVariable = value;
        microbeTrace.onLinkColorChanged();
        this.cdref.markForCheck();
    }

    onNodeShapeByChange(value: string): void {
        const microbeTrace = this.visuals.microbeTrace;
        if (!microbeTrace || microbeTrace.SelectedNodeSymbolVariable === value) {
            return;
        }

        microbeTrace.SelectedNodeSymbolVariable = value;
        microbeTrace.onNodeShapeByChanged(false, true, value);
    }

    toggleSettingsMenu(table: KeyTableName, event?: Event): void {
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

    isTableDocked(table: KeyTableName): boolean {
        return this.dockController?.isDocked(table) ?? false;
    }

    toggleTableDocking(table: KeyTableName, event?: Event): void {
        event?.stopPropagation();
        this.visuals.microbeTrace?.toggleKeyTableDocking(table);
        this.cdref.markForCheck();
    }

    getTableDockButtonTitle(table: KeyTableName): string {
        return this.dockController?.getDockButtonTitle(table) ?? 'Float table';
    }

    getPolygonColorTableDockButtonTitle(): string {
        return this.visuals.twoD?.getPolygonColorTableDockButtonTitle() ?? 'Float table';
    }

    hideSettingsMenu(table: KeyTableName): void {
        if (table === 'node-color') {
            this.showNodeSettingsMenu = false;
        } else if (table === 'link-color') {
            this.showLinkSettingsMenu = false;
        } else {
            this.showNodeShapeSettingsMenu = false;
        }

        this.cdref.markForCheck();
    }

    togglePolygonSettingsMenu(event?: Event): void {
        event?.stopPropagation();
        this.showPolygonSettingsMenu = !this.showPolygonSettingsMenu;
        this.showNodeSettingsMenu = false;
        this.showLinkSettingsMenu = false;
        this.showNodeShapeSettingsMenu = false;
        this.cdref.markForCheck();
    }

    hidePolygonSettingsMenu(): void {
        this.showPolygonSettingsMenu = false;
        this.cdref.markForCheck();
    }

    toggleTableColumn(table: KeyTableName, column: 'tableCounts' | 'tableFreq', event?: Event): void {
        event?.stopPropagation();
        this.visuals.microbeTrace?.toggleColorTableColumns(table, column);
        this.hideSettingsMenu(table);
    }

    toggleTableCollapsed(table: KeyTableName, event?: Event): void {
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

    togglePolygonColorTableDocking(event?: Event): void {
        event?.stopPropagation();
        this.visuals.twoD?.togglePolygonColorTableDocking(event);
        this.cdref.markForCheck();
    }

    togglePolygonTableColumn(column: 'tableCounts' | 'tableFreq', event?: Event): void {
        event?.stopPropagation();
        this.visuals.twoD?.toggleTableColumns('polygon-color', column);
        this.hidePolygonSettingsMenu();
        this.refreshTables();
    }

    togglePolygonTableCollapsed(event?: Event): void {
        event?.stopPropagation();
        this.polygonTableCollapsed = !this.polygonTableCollapsed;
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

    getNodeShapeGroupDisplayName(rawValue: any): string {
        return this.visuals.microbeTrace?.getNodeValueDisplayName(rawValue)
            ?? this.formatNodeShapeGroup(String(rawValue));
    }

    onNodeShapeNameBlur(event: FocusEvent, rawValue: any): void {
        this.visuals.microbeTrace?.onNodeShapeNameBlur(event, rawValue);
        this.cdref.markForCheck();
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
        this.showPolygonSettingsMenu = false;
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
