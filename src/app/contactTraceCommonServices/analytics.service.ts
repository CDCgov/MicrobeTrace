import { Injectable } from '@angular/core';

interface AnalyticsWindow extends Window {
    gtag?: (...args: any[]) => void;
    microbeTraceAnalyticsDisabled?: boolean;
}

interface VirtualPageDefinition {
    title: string;
}

interface PageViewParameters extends Record<string, string> {
    page_title: string;
}

export type AnalyticsResult = 'success' | 'fail' | 'canceled';
export type FileImportResult = Exclude<AnalyticsResult, 'canceled'>;
export type ExportResult = Exclude<AnalyticsResult, 'canceled'>;

export type AnalysisLaunchAction = 'new' | 'update_preserve' | 'update_reset';
export type AppEntryAction = 'standard' | 'handoff' | 'url_import';

export type AnalysisAction =
    | 'node_subset'
    | 'link_subset'
    | 'node_and_link_subset'
    | 'link_filter_field'
    | 'link_threshold'
    | 'threshold_stability_applied'
    | 'minimum_cluster_size'
    | 'nearest_neighbor'
    | 'distance_metric'
    | 'timeline_mode';
export type ClassicRedirectAction = 'help_menu' | 'welcome_screen' | 'auspice_dialog';

export type FileViewName =
    | 'dashboard'
    | 'workspace'
    | 'files'
    | '2d_network'
    | 'map'
    | 'table'
    | 'network_statistics'
    | 'epi_curve'
    | 'phylogenetic_tree'
    | 'alignment'
    | 'crosstab'
    | 'aggregate'
    | 'gantt'
    | 'heatmap'
    | 'bubble'
    | 'sankey';

export type FileType =
    | 'image'
    | 'data_table'
    | 'network'
    | 'session'
    | 'style'
    | 'sequence'
    | 'tree'
    | 'source_data'
    | 'matrix'
    | 'geospatial'
    | 'color_assignment'
    | 'custom_map'
    | 'floorplan'
    | 'mixed'
    | 'other';

export type FileFormat =
    | 'png'
    | 'jpeg'
    | 'gif'
    | 'webp'
    | 'svg'
    | 'csv'
    | 'tsv'
    | 'txt'
    | 'xls'
    | 'xlsx'
    | 'json'
    | 'geojson'
    | 'fasta'
    | 'fas'
    | 'fa'
    | 'newick'
    | 'graphml'
    | 'gexf'
    | 'xgmml'
    | 'cx'
    | 'cx2'
    | 'dot'
    | 'gv'
    | 'gml'
    | 'microbetrace'
    | 'hivtrace'
    | 'zip'
    | 'style'
    | 'meg'
    | 'pdf'
    | 'mixed'
    | 'other';

interface FileAnalyticsEvent {
    viewName: FileViewName;
    fileType: FileType;
    fileFormat: string;
    result: FileImportResult | ExportResult;
}

export interface FileImportAnalyticsEvent extends FileAnalyticsEvent {}

export interface ExportAnalyticsEvent extends FileAnalyticsEvent {}

const VIRTUAL_PAGES: Readonly<Record<string, VirtualPageDefinition>> = {
    'Files': { title: 'Files View' },
    '2D Network': { title: '2D Network View' },
    'Map': { title: 'Map View' },
    'Table': { title: 'Table View' },
    'Network Statistics': { title: 'Network Statistics View' },
    'Epi Curve': { title: 'EpiCurve View' },
    'Phylogenetic Tree': { title: 'Phylogenetic Tree View' },
    'Alignment View': { title: 'Alignment View' },
    'Crosstab': { title: 'Crosstab View' },
    'Aggregate': { title: 'Aggregate View' },
    'Gantt Chart': { title: 'Gantt Chart View' },
    'Heatmap': { title: 'Heatmap View' },
    'Bubble': { title: 'Bubble View' },
    'Sankey': { title: 'Sankey View' },
    'Waterfall': { title: 'Waterfall View' }
};

const FILE_IMPORT_TYPES_BY_VIEW = new Map<FileViewName, ReadonlySet<FileType>>([
    ['files', new Set<FileType>([
        'data_table',
        'sequence',
        'tree',
        'matrix',
        'network',
        'geospatial',
        'session',
        'mixed',
        'other'
    ])],
    ['workspace', new Set<FileType>(['style', 'color_assignment'])],
    ['map', new Set<FileType>(['custom_map', 'floorplan'])]
]);

const ANALYSIS_LAUNCH_ACTIONS = new Set<AnalysisLaunchAction>([
    'new',
    'update_preserve',
    'update_reset'
]);

const APP_ENTRY_ACTIONS = new Set<AppEntryAction>([
    'standard',
    'handoff',
    'url_import'
]);

const ANALYSIS_ACTIONS = new Set<AnalysisAction>([
    'node_subset',
    'link_subset',
    'node_and_link_subset',
    'link_filter_field',
    'link_threshold',
    'threshold_stability_applied',
    'minimum_cluster_size',
    'nearest_neighbor',
    'distance_metric',
    'timeline_mode'
]);

const CLASSIC_REDIRECT_ACTIONS = new Set<ClassicRedirectAction>([
    'help_menu',
    'welcome_screen',
    'auspice_dialog'
]);

const SOURCE_DATA_FORMATS = [
    'csv',
    'tsv',
    'xls',
    'xlsx',
    'json',
    'geojson',
    'fasta',
    'fas',
    'fa',
    'newick',
    'nwk',
    'graphml',
    'gexf',
    'xgmml',
    'cx',
    'cx2',
    'dot',
    'gv',
    'gml',
    'microbetrace',
    'hivtrace',
    'zip',
    'svg',
    'other'
];

const FILE_FORMATS = new Set<FileFormat>([
    'png',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'csv',
    'tsv',
    'txt',
    'xls',
    'xlsx',
    'json',
    'geojson',
    'fasta',
    'fas',
    'fa',
    'newick',
    'graphml',
    'gexf',
    'xgmml',
    'cx',
    'cx2',
    'dot',
    'gv',
    'gml',
    'microbetrace',
    'hivtrace',
    'zip',
    'style',
    'meg',
    'pdf',
    'mixed',
    'other'
]);

const EXPORT_FORMATS = new Map<string, ReadonlySet<string>>([
    ['dashboard|image', new Set(['png'])],
    ['workspace|image', new Set(['png', 'svg'])],
    ['workspace|network', new Set(['graphml'])],
    ['workspace|session', new Set(['microbetrace', 'zip'])],
    ['workspace|style', new Set(['style'])],
    ['workspace|data_table', new Set(['zip'])],
    ['files|source_data', new Set(SOURCE_DATA_FORMATS)],
    ['2d_network|image', new Set(['png', 'jpeg', 'webp', 'svg'])],
    ['map|image', new Set(['png', 'jpeg', 'webp'])],
    ['table|data_table', new Set(['csv', 'xlsx'])],
    ['network_statistics|data_table', new Set(['csv', 'xlsx'])],
    ['epi_curve|image', new Set(['png', 'svg'])],
    ['phylogenetic_tree|image', new Set(['png', 'jpeg', 'svg'])],
    ['phylogenetic_tree|tree', new Set(['newick'])],
    ['alignment|image', new Set(['png', 'svg'])],
    ['alignment|sequence', new Set(['fasta', 'meg'])],
    ['alignment|data_table', new Set(['csv'])],
    ['crosstab|data_table', new Set(['csv', 'xlsx', 'json', 'pdf'])],
    ['aggregate|data_table', new Set(['zip', 'xlsx', 'json', 'pdf'])],
    ['gantt|image', new Set(['png', 'jpeg', 'svg'])],
    ['heatmap|image', new Set(['png', 'jpeg', 'svg'])],
    ['heatmap|data_table', new Set(['csv'])],
    ['bubble|image', new Set(['png', 'svg'])],
    ['sankey|image', new Set(['png', 'svg'])]
]);

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
    private pendingAnalysisLaunch: { action: AnalysisLaunchAction; operationId?: number } | null = null;
    private trackedFeatureUse = new Set<string>();
    private appEntryTracked = false;

    trackAppEntry(action: AppEntryAction): void {
        if (this.appEntryTracked || !APP_ENTRY_ACTIONS.has(action)) {
            return;
        }

        if (this.emitEvent('app_entry', { action })) {
            this.appEntryTracked = true;
        }
    }

    trackView(viewName: string): void {
        const page = VIRTUAL_PAGES[`${viewName ?? ''}`.trim()];
        if (!page) {
            return;
        }

        const parameters: PageViewParameters = {
            page_title: page.title
        };

        this.emitEvent('page_view', parameters);
    }

    trackFileImport(event: FileImportAnalyticsEvent): void {
        if (!this.isTerminalResult(event.result, false)) {
            return;
        }

        const allowedTypes = FILE_IMPORT_TYPES_BY_VIEW.get(event.viewName);
        const fileFormat = this.normalizeFileFormat(event.fileFormat);
        if (!allowedTypes?.has(event.fileType) || !FILE_FORMATS.has(fileFormat)) {
            return;
        }

        this.emitEvent('file_import', {
            view_name: event.viewName,
            file_type: event.fileType,
            file_format: fileFormat,
            result: event.result
        });
    }

    beginAnalysisLaunch(action: AnalysisLaunchAction, operationId?: number): void {
        if (!ANALYSIS_LAUNCH_ACTIONS.has(action)) {
            return;
        }

        if (this.pendingAnalysisLaunch) {
            this.emitEvent('analysis_launch', {
                action: this.pendingAnalysisLaunch.action,
                result: 'canceled'
            });
        }

        this.pendingAnalysisLaunch = { action, operationId };
    }

    completeAnalysisLaunch(result: AnalyticsResult, operationId?: number): void {
        if (!this.pendingAnalysisLaunch || !this.isTerminalResult(result, true)) {
            return;
        }
        if (operationId !== undefined
            && this.pendingAnalysisLaunch.operationId !== undefined
            && operationId !== this.pendingAnalysisLaunch.operationId) {
            return;
        }

        this.emitEvent('analysis_launch', {
            action: this.pendingAnalysisLaunch.action,
            result
        });
        this.pendingAnalysisLaunch = null;
    }

    trackAnalysisAction(action: AnalysisAction): void {
        if (!ANALYSIS_ACTIONS.has(action)) {
            return;
        }

        if (this.trackedFeatureUse.has(action)) {
            return;
        }

        if (this.emitEvent('analysis_action', { action })) {
            this.trackedFeatureUse.add(action);
        }
    }

    trackExport(event: ExportAnalyticsEvent): void {
        if (!this.isTerminalResult(event.result, false)) {
            return;
        }

        const fileFormat = this.normalizeFileFormat(event.fileFormat);
        const allowedFormats = EXPORT_FORMATS.get(`${event.viewName}|${event.fileType}`);
        if (!allowedFormats?.has(fileFormat)) {
            return;
        }

        this.emitEvent('export_action', {
            view_name: event.viewName,
            file_type: event.fileType,
            file_format: fileFormat,
            result: event.result
        });
    }

    trackClassicRedirect(action: ClassicRedirectAction): void {
        if (!CLASSIC_REDIRECT_ACTIONS.has(action)) {
            return;
        }

        this.emitEvent('classic_redirect', { action });
    }

    normalizeSourceDataFormat(extension: string | null | undefined): FileFormat {
        const normalized = this.normalizeFileFormat(extension ?? '');
        return SOURCE_DATA_FORMATS.includes(normalized) ? normalized : 'other';
    }

    fileFormatFromName(fileName: string | null | undefined, mimeType?: string | null): FileFormat {
        const normalizedName = `${fileName ?? ''}`.trim();
        const extension = normalizedName.includes('.') ? normalizedName.split('.').pop() ?? '' : '';
        const normalizedExtension = this.normalizeFileFormat(extension);
        if (normalizedExtension !== 'other') {
            return normalizedExtension;
        }

        const normalizedMimeType = `${mimeType ?? ''}`.trim().toLowerCase();
        const mimeFormats: Readonly<Record<string, FileFormat>> = {
            'image/png': 'png',
            'image/jpeg': 'jpeg',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg',
            'text/csv': 'csv',
            'text/tab-separated-values': 'tsv',
            'application/json': 'json',
            'application/geo+json': 'geojson'
        };
        return mimeFormats[normalizedMimeType] ?? 'other';
    }

    private isTerminalResult(result: string, allowCanceled: boolean): result is AnalyticsResult {
        return result === 'success' || result === 'fail' || (allowCanceled && result === 'canceled');
    }

    private normalizeFileFormat(format: string): FileFormat {
        const normalized = `${format ?? ''}`.trim().toLowerCase().replace(/^\./, '');
        if (normalized === 'jpg') {
            return 'jpeg';
        }
        if (normalized === 'nwk') {
            return 'newick';
        }
        return FILE_FORMATS.has(normalized as FileFormat) ? normalized as FileFormat : 'other';
    }

    private emitEvent(eventName: string, parameters?: Record<string, string>): boolean {
        const analyticsWindow = window as AnalyticsWindow;
        if (analyticsWindow.microbeTraceAnalyticsDisabled || typeof analyticsWindow.gtag !== 'function') {
            return false;
        }

        if (parameters && Object.keys(parameters).length > 0) {
            analyticsWindow.gtag('event', eventName, parameters);
        } else {
            analyticsWindow.gtag('event', eventName);
        }
        return true;
    }

}
