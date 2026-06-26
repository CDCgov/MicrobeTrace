export type KeyTableName = 'node-color' | 'link-color' | 'node-shape';

export const KEY_TABLE_NAMES: KeyTableName[] = ['node-color', 'link-color', 'node-shape'];
export const DOCKED_KEY_TABLES_VIEW_NAME = 'Docked Key Tables';

export interface KeyTablesFloatingState {
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

    private hasSelectedValue(value?: string): boolean {
        return !!value && value !== 'None';
    }

    shouldDisplayFloatingTable(table: KeyTableName, state: KeyTablesFloatingState): boolean {
        if (this.isDocked(table)) {
            return false;
        }

        if (table === 'node-color') {
            return state.selectedNodeColorTableTypesVariable === 'Show'
                && this.hasSelectedValue(state.selectedColorNodesBy);
        }

        if (table === 'link-color') {
            return state.selectedLinkColorTableTypesVariable === 'Show'
                && this.hasSelectedValue(state.selectedColorLinksBy);
        }

        return state.selectedNodeShapeTableTypesVariable === 'Show'
            && this.hasSelectedValue(state.selectedNodeSymbol);
    }
}
