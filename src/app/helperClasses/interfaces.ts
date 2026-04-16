export interface MicobeTraceNextPluginEvents{
    updateNodeColors();
    updateVisualization();
    /**
     * This function is called when a style file is loaded; Implement for each view according to which settings need to be updated and functions called
     */
    applyStyleFileSettings();
    updateLinkColor();
    openRefreshScreen();
    onRecallSession();
    onLoadNewData();
    onFilterDataChange();
    openExport();
}

export interface StashObjects  {
    session: any
    tabs: HomePageTabItem[]
    dashboardLayout?: any
}

export interface DashboardRestoreState {
    dashboardLayout: any
    tabs: HomePageTabItem[]
}

export interface StashObject  {
    data: any
    files: any
    layout: any
    messages: any
    meta: any
    network: any
    state: any
    style: any
    timeline: any
    warnings: any
}

export interface HomePageTabItem {
    label: string,
    templateRef: any,
    tabTitle: string,
    isActive: boolean,
    componentRef: any
}

export interface Iterator<T> {
    // Return the current element.
    current(): T;

    // Return the current element and move forward to next element.
    next(): T;

    // Return the key of the current element.
    key(): number;

    // Checks if current position is valid.
    valid(): boolean;
}
