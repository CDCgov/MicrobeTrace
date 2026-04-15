export type KeyTableName = 'node-color' | 'link-color' | 'node-shape';

export const KEY_TABLE_NAMES: KeyTableName[] = ['node-color', 'link-color', 'node-shape'];
export const DOCKED_KEY_TABLES_VIEW_NAME = 'Docked Key Tables';

export interface KeyTablesFloatingState {
    activeTab?: string;
    selectedColorNodesBy?: string;
    selectedColorLinksBy?: string;
    selectedNodeSymbol?: string;
    selectedNodeColorTableTypesVariable?: string;
    selectedLinkColorTableTypesVariable?: string;
    selectedNodeShapeTableTypesVariable?: string;
}

export class KeyTablesController {
    private lastNonKeyTablesTab = 'Files';
    private readonly dockedTables: Record<KeyTableName, boolean> = {
        'node-color': false,
        'link-color': false,
        'node-shape': false
    };

    reset(activeTab: string = 'Files'): void {
        this.lastNonKeyTablesTab = activeTab;
        this.clearDocking();
    }

    clearDocking(): void {
        KEY_TABLE_NAMES.forEach(table => {
            this.dockedTables[table] = false;
        });
    }

    noteActiveTab(activeTab?: string): void {
        if (activeTab && activeTab !== DOCKED_KEY_TABLES_VIEW_NAME) {
            this.lastNonKeyTablesTab = activeTab;
        }
    }

    isDocked(table: KeyTableName): boolean {
        return this.dockedTables[table];
    }

    setDocked(table: KeyTableName, docked: boolean): void {
        this.dockedTables[table] = docked;
    }

    dockAll(): void {
        KEY_TABLE_NAMES.forEach(table => {
            this.dockedTables[table] = true;
        });
    }

    hasDockedTables(): boolean {
        return KEY_TABLE_NAMES.some(table => this.dockedTables[table]);
    }

    getDockButtonTitle(table: KeyTableName): string {
        return this.isDocked(table) ? 'Float table' : 'Dock table';
    }

    getContextTab(activeTab?: string): string | undefined {
        if (activeTab && activeTab !== DOCKED_KEY_TABLES_VIEW_NAME) {
            return activeTab;
        }

        return this.lastNonKeyTablesTab;
    }

    canDisplayFloatingTable(table: KeyTableName, activeTab?: string): boolean {
        const contextTab = this.getContextTab(activeTab);
        if (!contextTab) {
            return true;
        }

        if (table === 'node-shape') {
            return contextTab === '2D Network' || contextTab === 'Map' || contextTab === 'Phylogenetic Tree';
        }

        const blockedTabs = new Set([
            'Files',
            'Epi Curve',
            'Alignment View',
            'Table',
            'Crosstab',
            'Aggregate',
            'Heatmap',
            'Gantt Chart',
            'Waterfall',
            'Sankey'
        ]);

        if (blockedTabs.has(contextTab)) {
            return false;
        }

        if (table === 'link-color') {
            return contextTab !== 'Phylogenetic Tree' && contextTab !== 'Bubble';
        }

        return true;
    }

    shouldDisplayFloatingTable(table: KeyTableName, state: KeyTablesFloatingState): boolean {
        if (this.isDocked(table) || !this.canDisplayFloatingTable(table, state.activeTab)) {
            return false;
        }

        if (table === 'node-color') {
            return state.selectedNodeColorTableTypesVariable !== 'Hide' && state.selectedColorNodesBy !== 'None';
        }

        if (table === 'link-color') {
            return state.selectedLinkColorTableTypesVariable !== 'Hide' && state.selectedColorLinksBy !== 'None';
        }

        return state.selectedNodeShapeTableTypesVariable !== 'Hide' && state.selectedNodeSymbol !== 'None';
    }
}
