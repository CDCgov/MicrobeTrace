export type TransmissionChainLineStyle = 'Stepped' | 'Straight' | 'Curved' | 'Fanout';

export interface TransmissionChainCamera {
    centerX: number;
    centerY: number;
    graphUnitsPerPixel: number;
}

export function normalizeTransmissionChainCamera(value: any): TransmissionChainCamera | null {
    const centerX = Number(value?.centerX);
    const centerY = Number(value?.centerY);
    const graphUnitsPerPixel = Number(value?.graphUnitsPerPixel);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)
        || !Number.isFinite(graphUnitsPerPixel) || graphUnitsPerPixel <= 0) return null;
    return { centerX, centerY, graphUnitsPerPixel };
}

/** Presentation settings owned by the Explorer, independent of the 2D network. */
export interface TransmissionChainSettings extends Record<string, any> {
    'transmission-chain-date-field': string;
    'transmission-chain-y-axis-field': string;
    'transmission-chain-axis-label-size': number;
    'transmission-chain-timeline-width'?: number;
    'transmission-chain-link-origins': string[] | null;
    'transmission-chain-line-style': TransmissionChainLineStyle;
    'transmission-chain-node-radius': number;
    'transmission-chain-link-width': number;
    pinned: boolean;
    camera?: TransmissionChainCamera;
    positions?: Record<string, { x: number; y: number }>;
}

export function createTransmissionChainSettings(): TransmissionChainSettings {
    return {
        'transmission-chain-date-field': 'None',
        'transmission-chain-y-axis-field': 'None',
        'transmission-chain-axis-label-size': 14,
        'transmission-chain-link-origins': null,
        'transmission-chain-line-style': 'Stepped',
        'transmission-chain-node-radius': 50,
        'transmission-chain-link-width': 12,
        'node-label-variable': 'None',
        'node-label-size': 16,
        'node-label-orientation': 'Right',
        'node-tooltip-variable': ['_id'],
        'node-radius-variable': 'None',
        'node-radius-min': 15,
        'node-radius-max': 85,
        'node-border-width': 2,
        'node-highlight': true,
        'link-label-variable': 'None',
        'link-label-size': 16,
        'link-label-decimal-length': 3,
        'link-tooltip-variable': [],
        'link-width-variable': 'None',
        'link-width-min': 0.3,
        'link-width-max': 15,
        'link-width-reciprocal': false,
        'link-directed': false,
        'link-bidirectional': false,
        'link-opacity': 1,
        'link-opacity-override-enabled': false,
        'network-export-filename': 'Transmission Chain Explorer',
        'network-export-filetype': 'png',
        'network-export-scale': 1,
        'network-export-quality': 0.92,
        pinned: false
    };
}

export function getTransmissionChainSettings(style: any): TransmissionChainSettings {
    if (!style.transmissionChain || typeof style.transmissionChain !== 'object' || Array.isArray(style.transmissionChain)) {
        style.transmissionChain = createTransmissionChainSettings();
    } else {
        for (const [key, value] of Object.entries(createTransmissionChainSettings())) {
            if (style.transmissionChain[key] === undefined) style.transmissionChain[key] = value;
        }
    }
    return style.transmissionChain;
}
