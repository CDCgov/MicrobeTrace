export type DialogRectSnapshot = {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

export type GlobalSettingsDialogRequest = string | {
    activeTab?: string;
    sourceDialogRect?: DialogRectSnapshot;
};

export type NormalizedGlobalSettingsDialogRequest = {
    activeTab: string;
    sourceDialogRect?: DialogRectSnapshot;
};

export function createGlobalSettingsDialogRequest(
    activeTab: string = 'Styling',
    event?: MouseEvent
): Exclude<GlobalSettingsDialogRequest, string> {
    return {
        activeTab,
        sourceDialogRect: getSourceDialogRect(event)
    };
}

function getSourceDialogRect(event?: MouseEvent): DialogRectSnapshot | undefined {
    const eventTarget = event?.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : event?.target instanceof HTMLElement
            ? event.target
            : undefined;

    const sourceDialog = eventTarget?.closest('.p-dialog');
    if (!sourceDialog) {
        return undefined;
    }

    const rect = sourceDialog.getBoundingClientRect();
    return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
    };
}
