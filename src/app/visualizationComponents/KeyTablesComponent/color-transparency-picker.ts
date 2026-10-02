const PICKER_WIDTH = 60;
const PICKER_HEIGHT = 170;
const VIEWPORT_MARGIN = 8;

export function showColorTransparencyPicker(
    event: MouseEvent,
    currentOpacity: number,
    zIndex = 1300
): HTMLInputElement | null {
    const wrapper = document.getElementById('color-transparency-wrapper');
    const input = document.getElementById('color-transparency') as HTMLInputElement | null;
    if (!wrapper || !input) {
        return null;
    }

    const anchor = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const rect = anchor?.getBoundingClientRect();
    const anchorLeft = rect?.left ?? event.clientX;
    const anchorRight = rect?.right ?? event.clientX;
    const anchorTop = rect?.top ?? event.clientY;
    const preferredLeft = anchorRight + VIEWPORT_MARGIN;
    const left = preferredLeft + PICKER_WIDTH <= window.innerWidth - VIEWPORT_MARGIN
        ? preferredLeft
        : Math.max(VIEWPORT_MARGIN, anchorLeft - PICKER_WIDTH - VIEWPORT_MARGIN);
    const top = Math.max(
        VIEWPORT_MARGIN,
        Math.min(anchorTop - 72, window.innerHeight - PICKER_HEIGHT - VIEWPORT_MARGIN)
    );

    Object.assign(wrapper.style, {
        display: 'flex',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: String(zIndex)
    });

    const numericOpacity = Number(currentOpacity);
    input.value = String(Number.isFinite(numericOpacity)
        ? Math.min(1, Math.max(0, numericOpacity))
        : 1);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input;
}

export function hideColorTransparencyPicker(): void {
    const wrapper = document.getElementById('color-transparency-wrapper');
    if (wrapper) {
        wrapper.style.display = 'none';
    }
}
