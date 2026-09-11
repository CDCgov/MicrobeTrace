import { Injectable } from '@angular/core';

interface AnalyticsWindow extends Window {
    gtag?: (...args: any[]) => void;
    microbeTraceAnalyticsDisabled?: boolean;
}

interface VirtualPageDefinition {
    path: string;
    title: string;
}

interface PageViewParameters {
    page_location: string;
    page_title: string;
    page_referrer?: string;
}

const IGNORED_VIEWS = new Set([
    'Docked Key Tables'
]);

const VIRTUAL_PAGES: Record<string, VirtualPageDefinition> = {
    'Files': { path: 'files', title: 'Files View' },
    '2D Network': { path: '2d_network', title: '2D Network View' },
    'Map': { path: 'map', title: 'Map View' },
    'Table': { path: 'table', title: 'Table View' },
    'Network Statistics': { path: 'network-statistics', title: 'Network Statistics View' },
    'Epi Curve': { path: 'epicurve', title: 'EpiCurve View' },
    'Phylogenetic Tree': { path: 'phylogenetic', title: 'Phylogenetic Tree View' },
    'Alignment View': { path: 'alignment', title: 'Alignment View' },
    'Crosstab': { path: 'crosstab', title: 'Crosstab View' },
    'Aggregate': { path: 'aggregate', title: 'Aggregate View' },
    'Gantt Chart': { path: 'gantt', title: 'Gantt Chart View' },
    'Heatmap': { path: 'heatmap', title: 'Heatmap View' },
    'Bubble': { path: 'bubble', title: 'Bubble View' },
    'Sankey': { path: 'sankey', title: 'Sankey View' },
    'Waterfall': { path: 'waterfall', title: 'Waterfall View' }
};

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
    private previousPageLocation: string | null = null;

    trackView(viewName: string): void {
        const normalizedViewName = `${viewName ?? ''}`.trim();
        const analyticsWindow = window as AnalyticsWindow;

        if (!normalizedViewName
            || IGNORED_VIEWS.has(normalizedViewName)
            || analyticsWindow.microbeTraceAnalyticsDisabled
            || typeof analyticsWindow.gtag !== 'function') {
            return;
        }

        const page = VIRTUAL_PAGES[normalizedViewName] ?? {
            path: this.toPagePath(normalizedViewName),
            title: normalizedViewName
        };
        const pageLocation = this.getPageLocation(page.path);
        const parameters: PageViewParameters = {
            page_location: pageLocation,
            page_title: page.title
        };

        if (this.previousPageLocation) {
            parameters.page_referrer = this.previousPageLocation;
        } else if (document.referrer) {
            parameters.page_referrer = document.referrer;
        }

        analyticsWindow.gtag('event', 'page_view', parameters);
        this.previousPageLocation = pageLocation;
    }

    private getPageLocation(path: string): string {
        const baseUrl = document.querySelector('base')?.href ?? `${window.location.origin}/`;
        return new URL(path.replace(/^\//, ''), baseUrl).href;
    }

    private toPagePath(viewName: string): string {
        return viewName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
}
