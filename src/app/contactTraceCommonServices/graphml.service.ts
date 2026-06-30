import { Injectable } from '@angular/core';

export interface GraphMLExportOptions {
    graphId?: string;
    generatedAt?: Date | string;
}

export interface GraphMLExportResult {
    contents: string;
    nodeCount: number;
    linkCount: number;
    networkCount: number;
}

type GraphMLAttributeType = 'boolean' | 'int' | 'long' | 'double' | 'string';

interface GraphMLKey {
    id: string;
    name: string;
    type: GraphMLAttributeType;
    for: 'graph' | 'node' | 'edge';
}

interface GraphMLNodeEntry {
    graphmlId: string;
    originalId: string;
    record: Record<string, any>;
}

interface GraphMLEdgeEntry {
    graphmlId: string;
    sourceGraphmlId: string;
    targetGraphmlId: string;
    directed: boolean;
    record: Record<string, any>;
}

const GRAPHML_NAMESPACE = 'http://graphml.graphdrawing.org/xmlns';
const XML_SCHEMA_INSTANCE_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
const GRAPHML_SCHEMA_LOCATION = 'http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd';

@Injectable({
    providedIn: 'root'
})
export class GraphMLService {
    exportSession(session: any, options: GraphMLExportOptions = {}): GraphMLExportResult {
        const data = session?.data ?? {};
        const nodes = Array.isArray(data.nodes) ? data.nodes : [];
        const links = Array.isArray(data.links) ? data.links : [];
        const generatedAt = options.generatedAt ?? new Date();
        const exportedAt = generatedAt instanceof Date ? generatedAt.toISOString() : String(generatedAt);

        const { nodeEntries, nodeIdByOriginalId } = this.buildNodeEntries(nodes);
        const edgeEntries = this.buildEdgeEntries(links, nodeEntries, nodeIdByOriginalId);
        const networkNames = this.collectNetworkNames(nodeEntries, edgeEntries);
        const graphRecord = {
            mt_exporter: 'MicrobeTrace',
            mt_graphml_export_version: 1,
            mt_exported_at: exportedAt,
            mt_node_count: nodeEntries.length,
            mt_edge_count: edgeEntries.length,
            mt_network_count: networkNames.length,
            mt_networks: networkNames.join('; '),
            default_distance_metric: session?.style?.widgets?.['default-distance-metric'] ?? '',
            link_threshold: session?.style?.widgets?.['link-threshold'] ?? ''
        };

        const graphKeys = this.buildKeys([graphRecord], ['graph'], 'graph');
        const nodeKeys = this.buildKeys(nodeEntries.map(entry => entry.record), data.nodeFields, 'node');
        const edgeKeys = this.buildKeys(edgeEntries.map(entry => entry.record), data.linkFields, 'edge');
        const keys = graphKeys.concat(nodeKeys, edgeKeys);

        const lines: string[] = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            `<graphml xmlns="${GRAPHML_NAMESPACE}" xmlns:xsi="${XML_SCHEMA_INSTANCE_NAMESPACE}" xsi:schemaLocation="${GRAPHML_SCHEMA_LOCATION}">`
        ];

        keys.forEach(key => lines.push(this.renderKey(key)));
        lines.push(`  <graph id="${this.escapeAttribute(this.toGraphMLId(options.graphId || 'MicrobeTrace', 'G', 0, new Set()))}" edgedefault="undirected">`);
        this.renderDataElements(graphRecord, graphKeys, 4).forEach(line => lines.push(line));
        nodeEntries.forEach(entry => {
            lines.push(`    <node id="${this.escapeAttribute(entry.graphmlId)}">`);
            this.renderDataElements(entry.record, nodeKeys, 6).forEach(line => lines.push(line));
            lines.push('    </node>');
        });
        edgeEntries.forEach(entry => {
            lines.push(`    <edge id="${this.escapeAttribute(entry.graphmlId)}" source="${this.escapeAttribute(entry.sourceGraphmlId)}" target="${this.escapeAttribute(entry.targetGraphmlId)}" directed="${entry.directed ? 'true' : 'false'}">`);
            this.renderDataElements(entry.record, edgeKeys, 6).forEach(line => lines.push(line));
            lines.push('    </edge>');
        });
        lines.push('  </graph>');
        lines.push('</graphml>');

        return {
            contents: lines.join('\n') + '\n',
            nodeCount: nodeEntries.length,
            linkCount: edgeEntries.length,
            networkCount: networkNames.length
        };
    }

    private buildNodeEntries(nodes: any[]): { nodeEntries: GraphMLNodeEntry[]; nodeIdByOriginalId: Map<string, string> } {
        const usedGraphmlIds = new Set<string>();
        const nodeIdByOriginalId = new Map<string, string>();
        const nodeEntries: GraphMLNodeEntry[] = [];

        nodes.forEach((node, index) => {
            const originalId = this.getNodeId(node, index);
            const graphmlId = this.toGraphMLId(originalId, 'n', index, usedGraphmlIds);
            nodeIdByOriginalId.set(originalId, graphmlId);
            nodeEntries.push({
                graphmlId,
                originalId,
                record: this.prepareNodeRecord(node, originalId)
            });
        });

        return { nodeEntries, nodeIdByOriginalId };
    }

    private buildEdgeEntries(
        links: any[],
        nodeEntries: GraphMLNodeEntry[],
        nodeIdByOriginalId: Map<string, string>
    ): GraphMLEdgeEntry[] {
        const usedEdgeIds = new Set<string>();

        return links.map((link, index) => {
            const sourceId = this.getEndpointId(link?.source, `missing_source_${index}`);
            const targetId = this.getEndpointId(link?.target, `missing_target_${index}`);
            const sourceGraphmlId = this.ensureEndpointNode(sourceId, nodeEntries, nodeIdByOriginalId);
            const targetGraphmlId = this.ensureEndpointNode(targetId, nodeEntries, nodeIdByOriginalId);
            const edgeSourceId = link?.id ?? `${sourceId}-${targetId}`;

            return {
                graphmlId: this.toGraphMLId(edgeSourceId, 'e', index, usedEdgeIds),
                sourceGraphmlId,
                targetGraphmlId,
                directed: link?.directed === true,
                record: this.prepareEdgeRecord(link, sourceId, targetId)
            };
        });
    }

    private ensureEndpointNode(
        originalId: string,
        nodeEntries: GraphMLNodeEntry[],
        nodeIdByOriginalId: Map<string, string>
    ): string {
        const existingGraphmlId = nodeIdByOriginalId.get(originalId);
        if (existingGraphmlId) {
            return existingGraphmlId;
        }

        const usedGraphmlIds = new Set(nodeEntries.map(entry => entry.graphmlId));
        const graphmlId = this.toGraphMLId(originalId, 'n', nodeEntries.length, usedGraphmlIds);
        const record = this.prepareNodeRecord({
            _id: originalId,
            id: originalId,
            mt_generated_endpoint: true
        }, originalId);

        nodeEntries.push({ graphmlId, originalId, record });
        nodeIdByOriginalId.set(originalId, graphmlId);

        return graphmlId;
    }

    private prepareNodeRecord(node: any, originalId: string): Record<string, any> {
        const record = this.copyPlainRecord(node);
        record._id = originalId;
        record.id = originalId;
        this.addNetworkSummary(record);
        return record;
    }

    private prepareEdgeRecord(link: any, sourceId: string, targetId: string): Record<string, any> {
        const record = this.copyPlainRecord(link);
        record.source = sourceId;
        record.target = targetId;
        record.directed = link?.directed === true;
        this.addNetworkSummary(record);
        return record;
    }

    private copyPlainRecord(record: any): Record<string, any> {
        const output: Record<string, any> = {};

        if (!record || typeof record !== 'object') {
            return output;
        }

        Object.keys(record).forEach(key => {
            const value = record[key];
            if (typeof value !== 'function' && value !== undefined) {
                output[key] = value;
            }
        });

        return output;
    }

    private addNetworkSummary(record: Record<string, any>): void {
        if (Object.prototype.hasOwnProperty.call(record, 'mt_networks')) {
            return;
        }

        const origins = this.normalizeOrigins(record.origin ?? record._originAll);
        if (origins.length > 0) {
            record.mt_networks = origins.join('; ');
        }
    }

    private getNodeId(node: any, index: number): string {
        return this.normalizeIdValue(node?._id ?? node?.id ?? `node_${index}`);
    }

    private getEndpointId(endpoint: any, fallback: string): string {
        if (endpoint && typeof endpoint === 'object') {
            return this.normalizeIdValue(endpoint._id ?? endpoint.id ?? fallback);
        }

        return this.normalizeIdValue(endpoint ?? fallback);
    }

    private normalizeIdValue(value: any): string {
        const normalized = String(value ?? '').trim();
        return normalized.length > 0 ? normalized : 'unknown';
    }

    private toGraphMLId(value: any, prefix: string, index: number, usedIds: Set<string>): string {
        const rawId = String(value ?? '').trim();
        let graphmlId = rawId
            .replace(/[^A-Za-z0-9_.-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');

        if (!graphmlId) {
            graphmlId = `${prefix}${index}`;
        }

        if (!/^[A-Za-z_]/.test(graphmlId)) {
            graphmlId = `${prefix}_${graphmlId}`;
        }

        let uniqueId = graphmlId;
        let suffix = 2;
        while (usedIds.has(uniqueId)) {
            uniqueId = `${graphmlId}_${suffix}`;
            suffix++;
        }

        usedIds.add(uniqueId);
        return uniqueId;
    }

    private buildKeys(records: Array<Record<string, any>>, preferredFields: any, keyFor: 'graph' | 'node' | 'edge'): GraphMLKey[] {
        const fields = this.collectFields(records, preferredFields);

        return fields.map((field, index) => ({
            id: `${keyFor}_${index}`,
            name: field,
            type: this.inferType(records.map(record => record[field])),
            for: keyFor
        }));
    }

    private collectFields(records: Array<Record<string, any>>, preferredFields: any): string[] {
        const fields: string[] = [];
        const addField = (field: any) => {
            const normalizedField = String(field ?? '').trim();
            if (!normalizedField || fields.includes(normalizedField)) {
                return;
            }

            const hasValue = records.some(record => record[normalizedField] !== undefined && record[normalizedField] !== null);
            if (hasValue) {
                fields.push(normalizedField);
            }
        };

        (Array.isArray(preferredFields) ? preferredFields : []).forEach(addField);
        records.forEach(record => Object.keys(record).forEach(addField));

        return fields;
    }

    private inferType(values: any[]): GraphMLAttributeType {
        const presentValues = values.filter(value => value !== undefined && value !== null);
        if (presentValues.length === 0) {
            return 'string';
        }

        if (presentValues.every(value => typeof value === 'boolean')) {
            return 'boolean';
        }

        if (presentValues.every(value => typeof value === 'number' && Number.isFinite(value))) {
            if (presentValues.every(value => Number.isInteger(value))) {
                const isInt = presentValues.every(value => value >= -2147483648 && value <= 2147483647);
                return isInt ? 'int' : 'long';
            }

            return 'double';
        }

        return 'string';
    }

    private renderKey(key: GraphMLKey): string {
        return `  <key id="${this.escapeAttribute(key.id)}" for="${key.for}" attr.name="${this.escapeAttribute(key.name)}" attr.type="${key.type}"/>`;
    }

    private renderDataElements(record: Record<string, any>, keys: GraphMLKey[], indentSize: number): string[] {
        const indent = ' '.repeat(indentSize);
        return keys
            .filter(key => record[key.name] !== undefined && record[key.name] !== null)
            .map(key => `${indent}<data key="${this.escapeAttribute(key.id)}">${this.escapeText(this.stringifyValue(record[key.name]))}</data>`);
    }

    private stringifyValue(value: any): string {
        if (value === undefined || value === null) {
            return '';
        }

        if (typeof value === 'string') {
            return value;
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    private collectNetworkNames(nodeEntries: GraphMLNodeEntry[], edgeEntries: GraphMLEdgeEntry[]): string[] {
        const networks = new Set<string>();
        nodeEntries.forEach(entry => this.normalizeOrigins(entry.record.origin ?? entry.record._originAll).forEach(origin => networks.add(origin)));
        edgeEntries.forEach(entry => this.normalizeOrigins(entry.record.origin ?? entry.record._originAll).forEach(origin => networks.add(origin)));
        return Array.from(networks).sort((a, b) => a.localeCompare(b));
    }

    private normalizeOrigins(value: any): string[] {
        const values = Array.isArray(value)
            ? value
            : (value === undefined || value === null || value === '' ? [] : [value]);

        return values
            .map(origin => String(origin ?? '').trim())
            .filter(origin => origin.length > 0)
            .filter((origin, index, origins) => origins.indexOf(origin) === index);
    }

    private escapeText(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private escapeAttribute(value: string): string {
        return this.escapeText(value)
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
