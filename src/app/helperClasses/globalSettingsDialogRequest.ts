export type DialogRectSnapshot = {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

export type GlobalSettingsStylingTarget = 'node-color-ramp' | 'link-color-ramp';

export type GlobalSettingsDialogRequest = string | {
    activeTab?: string;
    sourceDialogRect?: DialogRectSnapshot;
    stylingTarget?: GlobalSettingsStylingTarget;
};

export type NormalizedGlobalSettingsDialogRequest = {
    activeTab: string;
    sourceDialogRect?: DialogRectSnapshot;
    stylingTarget?: GlobalSettingsStylingTarget;
};

export function createGlobalSettingsDialogRequest(
    activeTab: string = 'Styling',
    event?: MouseEvent,
    stylingTarget?: GlobalSettingsStylingTarget
): Exclude<GlobalSettingsDialogRequest, string> {
    return {
        activeTab,
        sourceDialogRect: getSourceDialogRect(event),
        stylingTarget
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
