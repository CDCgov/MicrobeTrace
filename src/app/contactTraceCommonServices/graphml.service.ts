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

export interface GraphMLImportOptions {
    sourceName?: string;
}

export interface GraphMLImportResult {
    nodes: Record<string, any>[];
    links: Record<string, any>[];
    nodeFields: string[];
    linkFields: string[];
    graphIds: string[];
    warnings: string[];
}

type GraphMLAttributeType = 'boolean' | 'int' | 'long' | 'double' | 'string';
type GraphMLKeyDomain = 'all' | 'graph' | 'node' | 'edge';

interface GraphMLKey {
    id: string;
    name: string;
    type: GraphMLAttributeType;
    for: 'graph' | 'node' | 'edge';
}

interface GraphMLParsedKey {
    id: string;
    name: string;
    type: GraphMLAttributeType;
    for: GraphMLKeyDomain;
    defaultValue?: any;
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
    looksLikeGraphML(contents: any): boolean {
        return typeof contents === 'string' && /<\s*(?:[A-Za-z0-9_.-]+:)?graphml(?:\s|>)/i.test(contents);
    }

    importGraphML(contents: string, options: GraphMLImportOptions = {}): GraphMLImportResult {
        const sourceName = options.sourceName || 'GraphML Import';
        const doc = new DOMParser().parseFromString(contents, 'application/xml');
        const parseError = this.getFirstElementByLocalName(doc, 'parsererror');

        if (parseError) {
            const message = (parseError.textContent || 'Unable to parse GraphML XML.').trim();
            throw new Error(message);
        }

        const graphmlElement = doc.documentElement;
        if (!graphmlElement || this.getLocalName(graphmlElement) !== 'graphml') {
            throw new Error('The selected file is not a GraphML document.');
        }

        const keys = this.parseGraphMLKeys(graphmlElement);
        const topLevelGraphs = this.getChildElements(graphmlElement, 'graph');
        const allGraphElements = this.getElementsByLocalName(graphmlElement, 'graph');
        const warnings: string[] = [];

        if (topLevelGraphs.length === 0) {
            throw new Error('GraphML file does not contain a top-level graph element.');
        }

        if (allGraphElements.length > topLevelGraphs.length) {
            warnings.push('Nested GraphML graph elements were ignored.');
        }

        const nodes: Record<string, any>[] = [];
        const links: Record<string, any>[] = [];
        const graphIds: string[] = [];
        let skippedHyperedges = 0;
        let skippedPorts = 0;

        topLevelGraphs.forEach((graphElement, graphIndex) => {
            const graphId = this.normalizeIdValue(graphElement.getAttribute('id') || `graph_${graphIndex + 1}`);
            const graphOrigin = topLevelGraphs.length > 1 ? graphId : sourceName;
            const edgeDefault = String(graphElement.getAttribute('edgedefault') || 'undirected').toLowerCase();
            const graphRecord = this.parseDataRecord(graphElement, keys, 'graph');
            const graphData = this.prefixGraphData(graphRecord);

            graphIds.push(graphId);

            if (!graphElement.hasAttribute('edgedefault')) {
                warnings.push(`Graph "${graphId}" has no edgedefault; imported as undirected.`);
            }

            const graphNodes = this.getChildElements(graphElement, 'node');
            const graphEdges = this.getChildElements(graphElement, 'edge');
            const graphmlNodeIdToMicrobeTraceId = new Map<string, string>();
            skippedHyperedges += this.getChildElements(graphElement, 'hyperedge').length;

            graphNodes.forEach(nodeElement => {
                skippedPorts += this.getChildElements(nodeElement, 'port').length;

                const graphmlNodeId = this.normalizeIdValue(nodeElement.getAttribute('id'));
                const dataRecord = this.parseDataRecord(nodeElement, keys, 'node');
                const originalId = this.normalizeIdValue(dataRecord._id || graphmlNodeId);
                const nodeRecord = {
                    ...graphData,
                    ...dataRecord,
                    _id: originalId,
                    id: originalId,
                    graphml_node_id: graphmlNodeId,
                    graphml_graph_id: graphId,
                    graphml_file: sourceName
                };

                this.applyGraphOrigin(nodeRecord, graphOrigin, topLevelGraphs.length > 1);
                this.addNetworkSummary(nodeRecord, true);
                nodes.push(nodeRecord);
                graphmlNodeIdToMicrobeTraceId.set(graphmlNodeId, originalId);

                if (this.getChildElements(nodeElement, 'graph').length > 0) {
                    warnings.push(`Nested graph under node "${graphmlNodeId}" was ignored.`);
                }
            });

            graphEdges.forEach((edgeElement, edgeIndex) => {
                const sourceGraphmlId = this.normalizeIdValue(edgeElement.getAttribute('source'));
                const targetGraphmlId = this.normalizeIdValue(edgeElement.getAttribute('target'));
                const source = graphmlNodeIdToMicrobeTraceId.get(sourceGraphmlId) || sourceGraphmlId;
                const target = graphmlNodeIdToMicrobeTraceId.get(targetGraphmlId) || targetGraphmlId;
                const dataRecord = this.parseDataRecord(edgeElement, keys, 'edge');
                const directedAttribute = edgeElement.getAttribute('directed');
                const directed = directedAttribute === null
                    ? edgeDefault === 'directed'
                    : String(directedAttribute).toLowerCase() === 'true';
                const linkRecord = {
                    ...graphData,
                    ...dataRecord,
                    source,
                    target,
                    directed,
                    graphml_edge_id: edgeElement.getAttribute('id') || `edge_${graphIndex + 1}_${edgeIndex + 1}`,
                    graphml_source_id: sourceGraphmlId,
                    graphml_target_id: targetGraphmlId,
                    graphml_graph_id: graphId,
                    graphml_file: sourceName
                };

                this.applyGraphMLEdgeOrigins(linkRecord, sourceName, graphOrigin, topLevelGraphs.length > 1);
                this.normalizeImportedDistance(linkRecord, this.getDistanceOriginFallback(linkRecord, sourceName));
                this.addNetworkSummary(linkRecord, true);
                links.push(linkRecord);

                if (!graphmlNodeIdToMicrobeTraceId.has(sourceGraphmlId)) {
                    nodes.push(this.buildGeneratedEndpointNode(source, sourceGraphmlId, graphId, sourceName, graphOrigin, topLevelGraphs.length > 1, graphData));
                    graphmlNodeIdToMicrobeTraceId.set(sourceGraphmlId, source);
                    warnings.push(`Edge source "${sourceGraphmlId}" had no node declaration; a node was generated.`);
                }

                if (!graphmlNodeIdToMicrobeTraceId.has(targetGraphmlId)) {
                    nodes.push(this.buildGeneratedEndpointNode(target, targetGraphmlId, graphId, sourceName, graphOrigin, topLevelGraphs.length > 1, graphData));
                    graphmlNodeIdToMicrobeTraceId.set(targetGraphmlId, target);
                    warnings.push(`Edge target "${targetGraphmlId}" had no node declaration; a node was generated.`);
                }
            });
        });

        if (skippedHyperedges > 0) {
            warnings.push(`${skippedHyperedges} GraphML hyperedge element(s) were ignored.`);
        }

        if (skippedPorts > 0) {
            warnings.push(`${skippedPorts} GraphML port element(s) were ignored.`);
        }

        return {
            nodes,
            links,
            nodeFields: this.collectFields(nodes, ['index', '_id', 'id', 'origin', 'mt_networks', 'graphml_graph_id', 'graphml_file', 'graphml_node_id']),
            linkFields: this.collectFields(links, ['index', 'source', 'target', 'distance', 'visible', 'cluster', 'origin', 'nn', 'directed', 'hasDistance', 'distanceOrigin', 'mt_networks', 'graphml_graph_id', 'graphml_file', 'graphml_edge_id']),
            graphIds,
            warnings
        };
    }

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

    private parseGraphMLKeys(graphmlElement: Element): Map<string, GraphMLParsedKey> {
        const keys = new Map<string, GraphMLParsedKey>();
        this.getChildElements(graphmlElement, 'key').forEach((keyElement, index) => {
            const id = keyElement.getAttribute('id') || `key_${index + 1}`;
            const rawDomain = String(keyElement.getAttribute('for') || 'all').toLowerCase();
            const domain = rawDomain === 'graph' || rawDomain === 'node' || rawDomain === 'edge' ? rawDomain : 'all';
            const rawType = String(keyElement.getAttribute('attr.type') || 'string').toLowerCase();
            const type: GraphMLAttributeType = rawType === 'boolean'
                || rawType === 'int'
                || rawType === 'long'
                || rawType === 'float'
                || rawType === 'double'
                || rawType === 'string'
                    ? (rawType === 'float' ? 'double' : rawType)
                    : 'string';
            const name = keyElement.getAttribute('attr.name') || id;
            const defaultElement = this.getChildElements(keyElement, 'default')[0];

            keys.set(id, {
                id,
                name,
                type,
                for: domain,
                defaultValue: defaultElement ? this.parseGraphMLValue(defaultElement.textContent || '', type, name) : undefined
            });
        });

        return keys;
    }

    private parseDataRecord(element: Element, keys: Map<string, GraphMLParsedKey>, domain: GraphMLKeyDomain): Record<string, any> {
        const record: Record<string, any> = {};

        keys.forEach(key => {
            if ((key.for === domain || key.for === 'all') && key.defaultValue !== undefined) {
                record[key.name] = key.defaultValue;
            }
        });

        this.getChildElements(element, 'data').forEach(dataElement => {
            const keyId = dataElement.getAttribute('key') || '';
            const key = keys.get(keyId);
            const name = key?.name || keyId;

            if (!name) {
                return;
            }

            record[name] = this.parseGraphMLValue(dataElement.textContent || '', key?.type || 'string', name);
        });

        return record;
    }

    private parseGraphMLValue(rawValue: string, type: GraphMLAttributeType, fieldName: string): any {
        const value = rawValue.trim();

        if (type === 'boolean') {
            return value.toLowerCase() === 'true' || value === '1';
        }

        if (type === 'int' || type === 'long') {
            const parsed = parseInt(value, 10);
            return Number.isFinite(parsed) ? parsed : value;
        }

        if (type === 'double') {
            const parsed = parseFloat(value);
            return Number.isFinite(parsed) ? parsed : value;
        }

        if (/^\s*[\[{]/.test(value)) {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }

        if ((fieldName === 'origin' || fieldName === '_originAll' || fieldName === 'distanceOrigins') && value.includes(';')) {
            return value.split(';').map(part => part.trim()).filter(part => part.length > 0);
        }

        return value;
    }

    private prefixGraphData(graphRecord: Record<string, any>): Record<string, any> {
        const prefixed: Record<string, any> = {};
        Object.keys(graphRecord).forEach(key => {
            prefixed[`graphml_graph_${key}`] = graphRecord[key];
        });
        return prefixed;
    }

    private applyGraphOrigin(record: Record<string, any>, graphOrigin: string, forceGraphOrigin: boolean): void {
        const existingOrigins = this.normalizeOrigins(record.origin ?? record._originAll);
        record.origin = forceGraphOrigin
            ? this.uniqStrings(existingOrigins.concat([graphOrigin]))
            : (existingOrigins.length > 0 ? existingOrigins : [graphOrigin]);
    }

    private applyGraphMLEdgeOrigins(
        record: Record<string, any>,
        sourceName: string,
        graphOrigin: string,
        forceGraphOrigin: boolean
    ): void {
        const edgeOrigins = this.normalizeOrigins(record.origin);
        const allEdgeOrigins = this.normalizeOrigins(record._originAll);
        const fallbackOrigins = [forceGraphOrigin ? graphOrigin : sourceName];
        const visibleOrigins = edgeOrigins.length > 0
            ? edgeOrigins
            : (allEdgeOrigins.length > 0 ? allEdgeOrigins : fallbackOrigins);
        const canonicalOrigins = allEdgeOrigins.length > 0 ? allEdgeOrigins : visibleOrigins;

        if (edgeOrigins.length > 0) {
            record.graphml_edge_origin = edgeOrigins.join('; ');
        }

        if (allEdgeOrigins.length > 0) {
            record.graphml_edge_origin_all = allEdgeOrigins.join('; ');
        }

        record.origin = this.prefixGraphMLImportedOrigins(visibleOrigins, sourceName);
        record._originAll = this.prefixGraphMLImportedOrigins(canonicalOrigins, sourceName);

        const distanceOrigins = this.normalizeOrigins(record.distanceOrigins);
        if (distanceOrigins.length > 0) {
            record.graphml_edge_distance_origins = distanceOrigins.join('; ');
            record.distanceOrigins = this.prefixGraphMLImportedOrigins(distanceOrigins, sourceName);
        }

        const distanceOrigin = String(record.distanceOrigin ?? '').trim();
        if (distanceOrigin.length > 0) {
            record.graphml_edge_distance_origin = distanceOrigin;
            record.distanceOrigin = this.prefixGraphMLImportedOrigin(distanceOrigin, sourceName);
        }
    }

    private prefixGraphMLImportedOrigins(origins: string[], sourceName: string): string[] {
        return this.uniqStrings(origins.map(origin => this.prefixGraphMLImportedOrigin(origin, sourceName)));
    }

    private prefixGraphMLImportedOrigin(origin: string, sourceName: string): string {
        const normalizedSourceName = this.normalizeIdValue(sourceName);
        const normalizedOrigin = this.normalizeIdValue(origin);

        if (normalizedOrigin === normalizedSourceName || normalizedOrigin.startsWith(`${normalizedSourceName}-`)) {
            return normalizedOrigin;
        }

        return `${normalizedSourceName}-${normalizedOrigin}`;
    }

    private getDistanceOriginFallback(linkRecord: Record<string, any>, sourceName: string): string {
        return this.normalizeOrigins(linkRecord.origin)[0] || this.normalizeIdValue(sourceName);
    }

    private buildGeneratedEndpointNode(
        id: string,
        graphmlNodeId: string,
        graphId: string,
        sourceName: string,
        graphOrigin: string,
        forceGraphOrigin: boolean,
        graphData: Record<string, any>
    ): Record<string, any> {
        const node = {
            ...graphData,
            _id: id,
            id,
            graphml_node_id: graphmlNodeId,
            graphml_graph_id: graphId,
            graphml_file: sourceName,
            mt_generated_endpoint: true
        };

        this.applyGraphOrigin(node, graphOrigin, forceGraphOrigin);
        this.addNetworkSummary(node, true);
        return node;
    }

    private normalizeImportedDistance(linkRecord: Record<string, any>, distanceOrigin: string): void {
        const distanceFields = [
            'distance',
            'Distance',
            'length',
            'Length',
            'snps',
            'SNPs',
            'tn93',
            'TN93',
            'genetic_distance',
            'mean_genetic_distance'
        ];

        const distanceField = distanceFields.find(field => this.toFiniteNumber(linkRecord[field]) !== null);
        const distance = distanceField ? this.toFiniteNumber(linkRecord[distanceField]) : null;
        const explicitHasDistance = typeof linkRecord.hasDistance === 'boolean' ? linkRecord.hasDistance : null;

        if (explicitHasDistance === false) {
            linkRecord.distance = distance ?? this.toFiniteNumber(linkRecord.distance) ?? 0;
            linkRecord.hasDistance = false;
            delete linkRecord.distanceOrigins;
            delete linkRecord.distanceOrigin;
            return;
        }

        if (explicitHasDistance === true) {
            linkRecord.distance = distance ?? this.toFiniteNumber(linkRecord.distance) ?? 0;
            linkRecord.hasDistance = true;
            this.ensureDistanceOrigin(linkRecord, distanceOrigin);
            return;
        }

        if (distance !== null) {
            linkRecord.distance = distance;
            linkRecord.hasDistance = true;
            this.ensureDistanceOrigin(linkRecord, distanceOrigin);
            return;
        }

        linkRecord.distance = this.toFiniteNumber(linkRecord.distance) ?? 0;
        linkRecord.hasDistance = false;
    }

    private ensureDistanceOrigin(linkRecord: Record<string, any>, fallbackOrigin: string): void {
        const distanceOrigins = this.normalizeOrigins(linkRecord.distanceOrigins);
        if (distanceOrigins.length > 0) {
            linkRecord.distanceOrigins = distanceOrigins;
            if (!distanceOrigins.includes(linkRecord.distanceOrigin)) {
                linkRecord.distanceOrigin = distanceOrigins[0];
            }
            return;
        }

        if (typeof linkRecord.distanceOrigin === 'string' && linkRecord.distanceOrigin.trim().length > 0) {
            linkRecord.distanceOrigin = linkRecord.distanceOrigin.trim();
            linkRecord.distanceOrigins = [linkRecord.distanceOrigin];
            return;
        }

        linkRecord.distanceOrigin = fallbackOrigin;
        linkRecord.distanceOrigins = [fallbackOrigin];
    }

    private toFiniteNumber(value: any): number | null {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : null;
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

    private addNetworkSummary(record: Record<string, any>, force = false): void {
        if (!force && Object.prototype.hasOwnProperty.call(record, 'mt_networks')) {
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

    private getLocalName(element: Element): string {
        return element.localName || element.nodeName.replace(/^.*:/, '');
    }

    private getChildElements(element: Element | Document, localName?: string): Element[] {
        return Array.from(element.childNodes)
            .filter((node): node is Element => node.nodeType === Node.ELEMENT_NODE)
            .filter(child => !localName || this.getLocalName(child) === localName);
    }

    private getElementsByLocalName(element: Element | Document, localName: string): Element[] {
        const out: Element[] = [];
        const visit = (parent: Element | Document) => {
            this.getChildElements(parent).forEach(child => {
                if (this.getLocalName(child) === localName) {
                    out.push(child);
                }
                visit(child);
            });
        };

        visit(element);
        return out;
    }

    private getFirstElementByLocalName(element: Element | Document, localName: string): Element | null {
        return this.getElementsByLocalName(element, localName)[0] || null;
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

        return this.uniqStrings(values
            .map(origin => String(origin ?? '').trim())
            .filter(origin => origin.length > 0));
    }

    private uniqStrings(values: string[]): string[] {
        return values.filter((value, index, list) => list.indexOf(value) === index);
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
