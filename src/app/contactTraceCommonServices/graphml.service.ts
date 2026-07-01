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

export type NetworkXmlFormat = 'graphml' | 'gexf' | 'cx2';

export interface GraphMLImportResult {
    nodes: Record<string, any>[];
    links: Record<string, any>[];
    nodeFields: string[];
    linkFields: string[];
    graphIds: string[];
    warnings: string[];
}

export interface NetworkXmlImportResult extends GraphMLImportResult {
    format: NetworkXmlFormat;
    formatLabel: string;
}

type GraphMLAttributeType = 'boolean' | 'int' | 'long' | 'double' | 'string';
type GraphMLKeyDomain = 'all' | 'graph' | 'node' | 'edge';
type GEXFAttributeClass = 'all' | 'graph' | 'node' | 'edge';
type CX2AttributeType = GraphMLAttributeType
    | 'integer'
    | 'list_of_string'
    | 'list_of_long'
    | 'list_of_integer'
    | 'list_of_double'
    | 'list_of_boolean';

type CX2AspectDomain = 'networkAttributes' | 'nodes' | 'edges';

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

interface GEXFParsedAttribute {
    id: string;
    name: string;
    type: GraphMLAttributeType;
    className: GEXFAttributeClass;
    mode: string;
    defaultValue?: any;
}

interface CX2ParsedAttribute {
    name: string;
    type: CX2AttributeType;
    alias?: string;
    defaultValue?: any;
}

interface CX2ParsedDeclarations {
    attributesByName: Map<string, CX2ParsedAttribute>;
    nameByAlias: Map<string, string>;
}

interface CX2ParsedNode {
    cxNodeId: string;
    dataRecord: Record<string, any>;
    originalId: string;
    rawNode: Record<string, any>;
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

    looksLikeGEXF(contents: any): boolean {
        return typeof contents === 'string' && /<\s*(?:[A-Za-z0-9_.-]+:)?gexf(?:\s|>)/i.test(contents);
    }

    looksLikeCX2(contents: any): boolean {
        const data = this.parseJSONIfPossible(contents);
        const descriptor = Array.isArray(data) ? data[0] : null;
        const version = descriptor && typeof descriptor === 'object'
            ? String(descriptor.CXVersion ?? '')
            : '';

        return /^2(?:\.|$)/.test(version.trim());
    }

    looksLikeNetworkDocument(contents: any): boolean {
        return this.looksLikeGraphML(contents) || this.looksLikeGEXF(contents) || this.looksLikeCX2(contents);
    }

    looksLikeNetworkXml(contents: any): boolean {
        return this.looksLikeGraphML(contents) || this.looksLikeGEXF(contents);
    }

    importNetworkDocument(contents: any, options: GraphMLImportOptions = {}): NetworkXmlImportResult {
        if (this.looksLikeGraphML(contents)) {
            return this.importGraphML(contents, options);
        }

        if (this.looksLikeGEXF(contents)) {
            return this.importGEXF(contents, options);
        }

        if (this.looksLikeCX2(contents)) {
            return this.importCX2(contents, options);
        }

        throw new Error('The selected file is not a supported network document.');
    }

    importNetworkXml(contents: any, options: GraphMLImportOptions = {}): NetworkXmlImportResult {
        return this.importNetworkDocument(contents, options);
    }

    importGraphML(contents: string, options: GraphMLImportOptions = {}): NetworkXmlImportResult {
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
                const nodeRecord: Record<string, any> = {
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
                const linkRecord: Record<string, any> = {
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
            format: 'graphml',
            formatLabel: 'GraphML',
            nodes,
            links,
            nodeFields: this.collectFields(nodes, ['index', '_id', 'id', 'origin', 'mt_networks', 'graphml_graph_id', 'graphml_file', 'graphml_node_id']),
            linkFields: this.collectFields(links, ['index', 'source', 'target', 'distance', 'visible', 'cluster', 'origin', 'nn', 'directed', 'hasDistance', 'distanceOrigin', 'mt_networks', 'graphml_graph_id', 'graphml_file', 'graphml_edge_id']),
            graphIds,
            warnings
        };
    }

    importGEXF(contents: string, options: GraphMLImportOptions = {}): NetworkXmlImportResult {
        const sourceName = options.sourceName || 'GEXF Import';
        const doc = new DOMParser().parseFromString(contents, 'application/xml');
        const parseError = this.getFirstElementByLocalName(doc, 'parsererror');

        if (parseError) {
            const message = (parseError.textContent || 'Unable to parse GEXF XML.').trim();
            throw new Error(message);
        }

        const gexfElement = doc.documentElement;
        if (!gexfElement || this.getLocalName(gexfElement) !== 'gexf') {
            throw new Error('The selected file is not a GEXF document.');
        }

        const topLevelGraphs = this.getChildElements(gexfElement, 'graph');
        const warnings: string[] = [];

        if (topLevelGraphs.length === 0) {
            throw new Error('GEXF file does not contain a graph element.');
        }

        if (topLevelGraphs.length > 1) {
            warnings.push('GEXF file contains multiple top-level graph elements; all were imported as separate networks.');
        }

        const nodes: Record<string, any>[] = [];
        const links: Record<string, any>[] = [];
        const graphIds: string[] = [];
        const featureWarnings = new Set<string>();
        const warnFeature = (key: string, message: string) => {
            if (!featureWarnings.has(key)) {
                featureWarnings.add(key);
                warnings.push(message);
            }
        };

        topLevelGraphs.forEach((graphElement, graphIndex) => {
            const graphId = this.normalizeIdValue(graphElement.getAttribute('id') || `graph_${graphIndex + 1}`);
            const graphOrigin = topLevelGraphs.length > 1 ? graphId : sourceName;
            const edgeDefault = String(graphElement.getAttribute('defaultedgetype') || 'undirected').toLowerCase();
            const attributes = this.parseGEXFAttributes(graphElement);
            const graphRecord = {
                ...this.parseGEXFMetaRecord(gexfElement),
                mode: graphElement.getAttribute('mode') || 'static',
                defaultedgetype: edgeDefault,
                timeformat: graphElement.getAttribute('timeformat') || '',
                timerepresentation: graphElement.getAttribute('timerepresentation') || '',
                ...this.parseGEXFDataRecord(graphElement, attributes, 'graph')
            };
            const graphData = this.prefixGEXFGraphData(graphRecord);
            const graphNodeIdToMicrobeTraceId = new Map<string, string>();

            graphIds.push(graphId);

            if (!graphElement.hasAttribute('defaultedgetype')) {
                warnings.push(`GEXF graph "${graphId}" has no defaultedgetype; imported as undirected.`);
            }

            if (
                String(graphElement.getAttribute('mode') || '').toLowerCase() === 'dynamic'
                || graphElement.hasAttribute('timeformat')
                || graphElement.hasAttribute('timerepresentation')
            ) {
                warnFeature('dynamic', 'GEXF dynamic timing metadata was imported as data fields; MicrobeTrace timeline behavior was not applied.');
            }

            const gexfNodes = this.collectGEXFNodeElements(graphElement);
            gexfNodes.forEach(({ element: nodeElement, parentId }) => {
                const gexfNodeId = this.normalizeIdValue(nodeElement.getAttribute('id'));
                const dataRecord = this.parseGEXFDataRecord(nodeElement, attributes, 'node');
                const label = this.normalizeOptionalValue(nodeElement.getAttribute('label'));
                const originalId = this.normalizeIdValue(dataRecord._id || gexfNodeId);
                const hierarchyParentId = this.normalizeOptionalValue(nodeElement.getAttribute('pid') || parentId);
                const nodeRecord: Record<string, any> = {
                    ...graphData,
                    ...dataRecord,
                    _id: originalId,
                    id: originalId,
                    gexf_node_id: gexfNodeId,
                    gexf_graph_id: graphId,
                    gexf_file: sourceName
                };

                if (label && nodeRecord.label === undefined) {
                    nodeRecord.label = label;
                }
                if (label) {
                    nodeRecord.gexf_node_label = label;
                }
                if (hierarchyParentId) {
                    nodeRecord.gexf_parent_id = hierarchyParentId;
                    warnFeature('hierarchy', 'GEXF hierarchy metadata was imported as data fields; MicrobeTrace hierarchy layout behavior was not applied.');
                }
                if (this.addGEXFTemporalMetadata(nodeRecord, nodeElement) || nodeRecord.gexf_dynamic_attvalues) {
                    warnFeature('dynamic', 'GEXF dynamic timing metadata was imported as data fields; MicrobeTrace timeline behavior was not applied.');
                }
                if (this.addGEXFVizMetadata(nodeRecord, nodeElement)) {
                    warnFeature('viz', 'GEXF visualization metadata was imported as data fields; MicrobeTrace styling behavior was not applied.');
                }
                if (this.getChildElements(nodeElement, 'nodes').length > 0) {
                    warnFeature('hierarchy', 'GEXF hierarchy metadata was imported as data fields; MicrobeTrace hierarchy layout behavior was not applied.');
                }

                this.applyGraphOrigin(nodeRecord, graphOrigin, topLevelGraphs.length > 1);
                this.addNetworkSummary(nodeRecord, true);
                nodes.push(nodeRecord);
                graphNodeIdToMicrobeTraceId.set(gexfNodeId, originalId);
            });

            const gexfEdges = this.collectGEXFEdgeElements(graphElement);
            gexfEdges.forEach((edgeElement, edgeIndex) => {
                const sourceGexfId = this.normalizeIdValue(edgeElement.getAttribute('source'));
                const targetGexfId = this.normalizeIdValue(edgeElement.getAttribute('target'));
                const source = graphNodeIdToMicrobeTraceId.get(sourceGexfId) || sourceGexfId;
                const target = graphNodeIdToMicrobeTraceId.get(targetGexfId) || targetGexfId;
                const dataRecord = this.parseGEXFDataRecord(edgeElement, attributes, 'edge');
                const label = this.normalizeOptionalValue(edgeElement.getAttribute('label'));
                const weight = this.toFiniteNumber(edgeElement.getAttribute('weight'));
                const linkRecord: Record<string, any> = {
                    ...graphData,
                    ...dataRecord,
                    source,
                    target,
                    directed: this.isGEXFEdgeDirected(edgeElement, edgeDefault),
                    gexf_edge_id: edgeElement.getAttribute('id') || `edge_${graphIndex + 1}_${edgeIndex + 1}`,
                    gexf_source_id: sourceGexfId,
                    gexf_target_id: targetGexfId,
                    gexf_graph_id: graphId,
                    gexf_file: sourceName
                };

                if (label && linkRecord.label === undefined) {
                    linkRecord.label = label;
                }
                if (weight !== null && linkRecord.weight === undefined) {
                    linkRecord.weight = weight;
                }
                if (this.addGEXFTemporalMetadata(linkRecord, edgeElement) || linkRecord.gexf_dynamic_attvalues) {
                    warnFeature('dynamic', 'GEXF dynamic timing metadata was imported as data fields; MicrobeTrace timeline behavior was not applied.');
                }
                if (this.addGEXFVizMetadata(linkRecord, edgeElement)) {
                    warnFeature('viz', 'GEXF visualization metadata was imported as data fields; MicrobeTrace styling behavior was not applied.');
                }

                this.applyGEXFEdgeOrigins(linkRecord, sourceName, graphOrigin, topLevelGraphs.length > 1);
                this.normalizeImportedDistance(linkRecord, this.getDistanceOriginFallback(linkRecord, sourceName));
                this.addNetworkSummary(linkRecord, true);
                links.push(linkRecord);

                if (!graphNodeIdToMicrobeTraceId.has(sourceGexfId)) {
                    nodes.push(this.buildGeneratedGEXFEndpointNode(source, sourceGexfId, graphId, sourceName, graphOrigin, topLevelGraphs.length > 1, graphData));
                    graphNodeIdToMicrobeTraceId.set(sourceGexfId, source);
                    warnings.push(`GEXF edge source "${sourceGexfId}" had no node declaration; a node was generated.`);
                }

                if (!graphNodeIdToMicrobeTraceId.has(targetGexfId)) {
                    nodes.push(this.buildGeneratedGEXFEndpointNode(target, targetGexfId, graphId, sourceName, graphOrigin, topLevelGraphs.length > 1, graphData));
                    graphNodeIdToMicrobeTraceId.set(targetGexfId, target);
                    warnings.push(`GEXF edge target "${targetGexfId}" had no node declaration; a node was generated.`);
                }
            });
        });

        return {
            format: 'gexf',
            formatLabel: 'GEXF',
            nodes,
            links,
            nodeFields: this.collectFields(nodes, ['index', '_id', 'id', 'label', 'origin', 'mt_networks', 'gexf_graph_id', 'gexf_file', 'gexf_node_id', 'gexf_node_label', 'gexf_parent_id']),
            linkFields: this.collectFields(links, ['index', 'source', 'target', 'distance', 'weight', 'visible', 'cluster', 'origin', 'nn', 'directed', 'hasDistance', 'distanceOrigin', 'mt_networks', 'gexf_graph_id', 'gexf_file', 'gexf_edge_id']),
            graphIds,
            warnings
        };
    }

    importCX2(contents: any, options: GraphMLImportOptions = {}): NetworkXmlImportResult {
        const sourceName = options.sourceName || 'CX2 Import';
        const data = typeof contents === 'string'
            ? this.parseRequiredJSON(contents, 'Unable to parse CX2 JSON.')
            : contents;

        if (!Array.isArray(data)) {
            throw new Error('The selected file is not a CX2 document.');
        }

        const descriptor = data[0];
        const cxVersion = descriptor && typeof descriptor === 'object'
            ? String(descriptor.CXVersion ?? '')
            : '';

        if (!/^2(?:\.|$)/.test(cxVersion.trim())) {
            throw new Error('The selected Cytoscape Exchange document is not CX2.');
        }

        const warnings: string[] = [];
        const warnOnce = this.createWarningCollector(warnings);
        const aspects = this.collectCX2Aspects(data, warnings);
        const statusEntries = aspects.status || [];

        if (statusEntries.length === 0) {
            warnings.push('CX2 status aspect is missing.');
        } else {
            if (statusEntries.length > 1) {
                warnings.push('CX2 file contains multiple status entries; the last entry was used.');
            }

            const status = statusEntries[statusEntries.length - 1];
            if (status && status.success === false) {
                throw new Error(status.error || 'CX2 status reported an unsuccessful network generation.');
            }
            if (status && status.success === true && status.error) {
                warnings.push(`CX2 status warning: ${status.error}`);
            }
        }

        if (descriptor?.hasFragments === true) {
            warnings.push('CX2 fragmented aspects were concatenated in file order.');
        }

        const declarations = this.parseCX2AttributeDeclarations(aspects.attributeDeclarations || []);
        const networkRecord = this.parseCX2NetworkAttributes(aspects.networkAttributes || [], declarations.networkAttributes);
        const graphId = this.normalizeIdValue(networkRecord.name || sourceName);
        const graphData = this.prefixCX2NetworkData({
            CXVersion: cxVersion,
            hasFragments: descriptor?.hasFragments === true,
            ...networkRecord
        });
        const cxNodes = (aspects.nodes || []).filter((node): node is Record<string, any> => !!node && typeof node === 'object');
        const cxEdges = (aspects.edges || []).filter((edge): edge is Record<string, any> => !!edge && typeof edge === 'object');
        const nodeBypasses = this.parseCX2Bypasses(aspects.nodeBypasses || []);
        const edgeBypasses = this.parseCX2Bypasses(aspects.edgeBypasses || []);

        if ((aspects.visualProperties || []).length > 0) {
            warnOnce('visualProperties', 'CX2 visualProperties were not applied to MicrobeTrace styling.');
        }
        if ((aspects.visualEditorProperties || []).length > 0) {
            warnOnce('visualEditorProperties', 'CX2 visualEditorProperties were not applied to MicrobeTrace styling.');
        }

        const parsedNodes = this.parseCX2Nodes(cxNodes, declarations.nodes, nodeBypasses);
        const nodes: Record<string, any>[] = [];
        const links: Record<string, any>[] = [];
        const cxNodeIdToMicrobeTraceId = new Map<string, string>();

        parsedNodes.forEach(parsedNode => {
            const nodeRecord: Record<string, any> = {
                ...graphData,
                ...parsedNode.dataRecord,
                _id: parsedNode.originalId,
                id: parsedNode.originalId,
                cx2_node_id: parsedNode.cxNodeId,
                cx2_graph_id: graphId,
                cx2_file: sourceName
            };

            this.applyCX2NodeCoordinates(nodeRecord, parsedNode.rawNode);

            if (nodeRecord.name !== undefined && nodeRecord.label === undefined) {
                nodeRecord.label = nodeRecord.name;
            }
            if (nodeRecord.name !== undefined) {
                nodeRecord.cx2_node_name = nodeRecord.name;
            }

            this.applyGraphOrigin(nodeRecord, sourceName, false);
            this.addNetworkSummary(nodeRecord, true);
            nodes.push(nodeRecord);
            cxNodeIdToMicrobeTraceId.set(parsedNode.cxNodeId, parsedNode.originalId);
        });

        cxEdges.forEach((edge, edgeIndex) => {
            const cxEdgeId = this.normalizeIdValue(edge.id ?? `edge_${edgeIndex + 1}`);
            const cxSourceId = this.normalizeIdValue(edge.s);
            const cxTargetId = this.normalizeIdValue(edge.t);
            const source = cxNodeIdToMicrobeTraceId.get(cxSourceId) || cxSourceId;
            const target = cxNodeIdToMicrobeTraceId.get(cxTargetId) || cxTargetId;
            const dataRecord = this.parseCX2DataRecord(edge.v, declarations.edges);
            this.preserveReservedFields(dataRecord, ['id', 'source', 'target'], 'cx2_attribute');
            this.applyCX2BypassRecord(dataRecord, edgeBypasses.get(cxEdgeId), 'cx2_bypass');

            const linkRecord: Record<string, any> = {
                ...graphData,
                ...dataRecord,
                source,
                target,
                directed: typeof dataRecord.directed === 'boolean' ? dataRecord.directed : false,
                cx2_edge_id: cxEdgeId,
                cx2_source_id: cxSourceId,
                cx2_target_id: cxTargetId,
                cx2_graph_id: graphId,
                cx2_file: sourceName
            };

            this.applyCX2EdgeOrigins(linkRecord, sourceName, graphId, false);
            this.normalizeImportedDistance(linkRecord, this.getDistanceOriginFallback(linkRecord, sourceName));
            this.addNetworkSummary(linkRecord, true);
            links.push(linkRecord);

            if (!cxNodeIdToMicrobeTraceId.has(cxSourceId)) {
                nodes.push(this.buildGeneratedCX2EndpointNode(source, cxSourceId, graphId, sourceName, graphData));
                cxNodeIdToMicrobeTraceId.set(cxSourceId, source);
                warnings.push(`CX2 edge source "${cxSourceId}" had no node declaration; a node was generated.`);
            }

            if (!cxNodeIdToMicrobeTraceId.has(cxTargetId)) {
                nodes.push(this.buildGeneratedCX2EndpointNode(target, cxTargetId, graphId, sourceName, graphData));
                cxNodeIdToMicrobeTraceId.set(cxTargetId, target);
                warnings.push(`CX2 edge target "${cxTargetId}" had no node declaration; a node was generated.`);
            }
        });

        const unsupportedAspectNames = Object.keys(aspects)
            .filter(name => ![
                'metaData',
                'attributeDeclarations',
                'networkAttributes',
                'nodes',
                'edges',
                'visualProperties',
                'nodeBypasses',
                'edgeBypasses',
                'visualEditorProperties',
                'status'
            ].includes(name));
        if (unsupportedAspectNames.length > 0) {
            warnings.push(`CX2 opaque aspect(s) were ignored: ${unsupportedAspectNames.join(', ')}.`);
        }

        return {
            format: 'cx2',
            formatLabel: 'CX2',
            nodes,
            links,
            nodeFields: this.collectFields(nodes, ['index', '_id', 'id', 'label', 'name', 'origin', 'mt_networks', 'x', 'y', 'cx2_graph_id', 'cx2_file', 'cx2_node_id', 'cx2_node_name']),
            linkFields: this.collectFields(links, ['index', 'source', 'target', 'distance', 'weight', 'visible', 'cluster', 'origin', 'nn', 'directed', 'hasDistance', 'distanceOrigin', 'mt_networks', 'cx2_graph_id', 'cx2_file', 'cx2_edge_id']),
            graphIds: [graphId],
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

    private parseJSONIfPossible(contents: any): any {
        if (typeof contents !== 'string') {
            return contents;
        }

        const trimmed = contents.trim();
        if (!trimmed || !/^[\[{]/.test(trimmed)) {
            return null;
        }

        try {
            return JSON.parse(trimmed);
        } catch {
            return null;
        }
    }

    private parseRequiredJSON(contents: any, errorMessage: string): any {
        if (typeof contents !== 'string') {
            return contents;
        }

        try {
            return JSON.parse(contents);
        } catch (error: any) {
            throw new Error(`${errorMessage} ${error?.message || error}`);
        }
    }

    private createWarningCollector(warnings: string[]): (key: string, message: string) => void {
        const emitted = new Set<string>();
        return (key: string, message: string) => {
            if (!emitted.has(key)) {
                emitted.add(key);
                warnings.push(message);
            }
        };
    }

    private collectCX2Aspects(data: any[], warnings: string[]): Record<string, any[]> {
        const aspects: Record<string, any[]> = {};

        data.slice(1).forEach((block, blockIndex) => {
            if (!block || typeof block !== 'object' || Array.isArray(block)) {
                warnings.push(`CX2 block ${blockIndex + 2} was ignored because it is not an object.`);
                return;
            }

            Object.keys(block).forEach(aspectName => {
                const aspectValue = block[aspectName];
                if (!Array.isArray(aspectValue)) {
                    warnings.push(`CX2 aspect "${aspectName}" was ignored because its value is not an array.`);
                    return;
                }

                aspects[aspectName] = aspects[aspectName] || [];
                aspects[aspectName].push(...aspectValue);
            });
        });

        return aspects;
    }

    private parseCX2AttributeDeclarations(entries: any[]): Record<CX2AspectDomain, CX2ParsedDeclarations> {
        const declarations = {
            networkAttributes: this.createEmptyCX2Declarations(),
            nodes: this.createEmptyCX2Declarations(),
            edges: this.createEmptyCX2Declarations()
        };

        entries
            .filter(entry => !!entry && typeof entry === 'object')
            .forEach(entry => {
                (['networkAttributes', 'nodes', 'edges'] as CX2AspectDomain[]).forEach(domain => {
                    const domainDeclarations = entry[domain];
                    if (!domainDeclarations || typeof domainDeclarations !== 'object') {
                        return;
                    }

                    Object.keys(domainDeclarations).forEach(name => {
                        const rawDeclaration = domainDeclarations[name] || {};
                        const type = this.normalizeCX2AttributeType(rawDeclaration.d);
                        const parsedDeclaration: CX2ParsedAttribute = {
                            name,
                            type,
                            alias: typeof rawDeclaration.a === 'string' ? rawDeclaration.a : undefined,
                            defaultValue: Object.prototype.hasOwnProperty.call(rawDeclaration, 'v')
                                ? this.parseCX2Value(rawDeclaration.v, type, name)
                                : undefined
                        };

                        declarations[domain].attributesByName.set(name, parsedDeclaration);
                        if (parsedDeclaration.alias) {
                            declarations[domain].nameByAlias.set(parsedDeclaration.alias, name);
                        }
                    });
                });
            });

        return declarations;
    }

    private createEmptyCX2Declarations(): CX2ParsedDeclarations {
        return {
            attributesByName: new Map<string, CX2ParsedAttribute>(),
            nameByAlias: new Map<string, string>()
        };
    }

    private normalizeCX2AttributeType(rawType: any): CX2AttributeType {
        const type = String(rawType || 'string').toLowerCase();
        if (type === 'boolean') return 'boolean';
        if (type === 'integer' || type === 'int') return 'integer';
        if (type === 'long') return 'long';
        if (type === 'float' || type === 'double') return 'double';
        if (type === 'list_of_boolean') return 'list_of_boolean';
        if (type === 'list_of_integer' || type === 'list_of_int') return 'list_of_integer';
        if (type === 'list_of_long') return 'list_of_long';
        if (type === 'list_of_float' || type === 'list_of_double') return 'list_of_double';
        if (type === 'list_of_string') return 'list_of_string';
        return 'string';
    }

    private parseCX2NetworkAttributes(entries: any[], declarations: CX2ParsedDeclarations): Record<string, any> {
        if (entries.length === 0) {
            return {};
        }

        return this.parseCX2DataRecord(entries[entries.length - 1], declarations);
    }

    private parseCX2DataRecord(rawRecord: any, declarations: CX2ParsedDeclarations): Record<string, any> {
        const record: Record<string, any> = {};

        declarations.attributesByName.forEach(attribute => {
            if (attribute.defaultValue !== undefined) {
                record[attribute.name] = attribute.defaultValue;
            }
        });

        if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
            return record;
        }

        Object.keys(rawRecord).forEach(rawName => {
            const name = declarations.nameByAlias.get(rawName) || rawName;
            const declaration = declarations.attributesByName.get(name) || declarations.attributesByName.get(rawName);
            record[name] = this.parseCX2Value(rawRecord[rawName], declaration?.type || 'string', name);
        });

        return record;
    }

    private parseCX2Value(rawValue: any, type: CX2AttributeType, fieldName: string): any {
        if (rawValue === null || rawValue === undefined) {
            return rawValue;
        }

        if (type.startsWith('list_of_')) {
            const itemType = type.replace('list_of_', '') as CX2AttributeType;
            let values = rawValue;

            if (typeof rawValue === 'string') {
                const trimmed = rawValue.trim();
                try {
                    const parsed = JSON.parse(trimmed);
                    values = Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    values = trimmed.length > 0 ? trimmed.split(',').map(part => part.trim()) : [];
                }
            }

            return (Array.isArray(values) ? values : [values])
                .map(value => this.parseCX2Value(value, itemType, fieldName));
        }

        if (type === 'boolean') {
            if (typeof rawValue === 'boolean') {
                return rawValue;
            }
            const value = String(rawValue).trim().toLowerCase();
            return value === 'true' || value === '1';
        }

        if (type === 'integer' || type === 'int' || type === 'long') {
            const parsed = typeof rawValue === 'number' ? rawValue : parseInt(String(rawValue).trim(), 10);
            return Number.isFinite(parsed) ? parsed : rawValue;
        }

        if (type === 'double') {
            const parsed = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue).trim());
            return Number.isFinite(parsed) ? parsed : rawValue;
        }

        if (typeof rawValue === 'string') {
            return this.parseGraphMLValue(rawValue, 'string', fieldName);
        }

        return rawValue;
    }

    private prefixCX2NetworkData(networkRecord: Record<string, any>): Record<string, any> {
        const prefixed: Record<string, any> = {};
        Object.keys(networkRecord).forEach(key => {
            if (networkRecord[key] !== undefined && networkRecord[key] !== '') {
                prefixed[`cx2_network_${key}`] = networkRecord[key];
            }
        });
        return prefixed;
    }

    private parseCX2Nodes(
        cxNodes: Record<string, any>[],
        declarations: CX2ParsedDeclarations,
        nodeBypasses: Map<string, Record<string, any>>
    ): CX2ParsedNode[] {
        const parsedNodes = cxNodes.map((rawNode, index) => {
            const cxNodeId = this.normalizeIdValue(rawNode.id ?? `node_${index + 1}`);
            const dataRecord = this.parseCX2DataRecord(rawNode.v, declarations);
            this.preserveReservedFields(dataRecord, ['id'], 'cx2_attribute');
            this.applyCX2BypassRecord(dataRecord, nodeBypasses.get(cxNodeId), 'cx2_bypass');

            return {
                cxNodeId,
                dataRecord,
                originalId: '',
                rawNode
            };
        });

        const nameCounts = new Map<string, number>();
        parsedNodes.forEach(parsedNode => {
            const name = this.normalizeOptionalValue(parsedNode.dataRecord.name);
            if (name) {
                nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
            }
        });

        parsedNodes.forEach(parsedNode => {
            const explicitId = this.normalizeOptionalValue(parsedNode.dataRecord._id);
            const name = this.normalizeOptionalValue(parsedNode.dataRecord.name);
            parsedNode.originalId = this.normalizeIdValue(
                explicitId || (name && nameCounts.get(name) === 1 ? name : parsedNode.cxNodeId)
            );
        });

        return parsedNodes;
    }

    private parseCX2Bypasses(entries: any[]): Map<string, Record<string, any>> {
        const byId = new Map<string, Record<string, any>>();

        entries
            .filter(entry => !!entry && typeof entry === 'object')
            .forEach(entry => {
                const id = this.normalizeIdValue(entry.id);
                const values = entry.v && typeof entry.v === 'object' && !Array.isArray(entry.v)
                    ? entry.v
                    : {};
                byId.set(id, values);
            });

        return byId;
    }

    private applyCX2BypassRecord(record: Record<string, any>, bypass: Record<string, any> | undefined, prefix: string): void {
        if (!bypass) {
            return;
        }

        Object.keys(bypass).forEach(key => {
            record[`${prefix}_${key}`] = bypass[key];
        });
    }

    private applyCX2NodeCoordinates(record: Record<string, any>, rawNode: Record<string, any>): void {
        (['x', 'y', 'z'] as const).forEach(axis => {
            const coordinate = this.toFiniteNumber(rawNode[axis]);
            if (coordinate === null) {
                return;
            }

            if (record[axis] !== undefined) {
                record[`cx2_attribute_${axis}`] = record[axis];
            }

            record[axis] = coordinate;
            record[`cx2_${axis}`] = coordinate;
        });
    }

    private preserveReservedFields(record: Record<string, any>, reservedFields: string[], prefix: string): void {
        reservedFields.forEach(field => {
            if (record[field] !== undefined) {
                record[`${prefix}_${field}`] = record[field];
                delete record[field];
            }
        });
    }

    private applyCX2EdgeOrigins(
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
            record.cx2_edge_origin = edgeOrigins.join('; ');
        }

        if (allEdgeOrigins.length > 0) {
            record.cx2_edge_origin_all = allEdgeOrigins.join('; ');
        }

        record.origin = this.prefixGraphMLImportedOrigins(visibleOrigins, sourceName);
        record._originAll = this.prefixGraphMLImportedOrigins(canonicalOrigins, sourceName);

        const distanceOrigins = this.normalizeOrigins(record.distanceOrigins);
        if (distanceOrigins.length > 0) {
            record.cx2_edge_distance_origins = distanceOrigins.join('; ');
            record.distanceOrigins = this.prefixGraphMLImportedOrigins(distanceOrigins, sourceName);
        }

        const distanceOrigin = String(record.distanceOrigin ?? '').trim();
        if (distanceOrigin.length > 0) {
            record.cx2_edge_distance_origin = distanceOrigin;
            record.distanceOrigin = this.prefixGraphMLImportedOrigin(distanceOrigin, sourceName);
        }
    }

    private buildGeneratedCX2EndpointNode(
        id: string,
        cxNodeId: string,
        graphId: string,
        sourceName: string,
        graphData: Record<string, any>
    ): Record<string, any> {
        const node = {
            ...graphData,
            _id: id,
            id,
            cx2_node_id: cxNodeId,
            cx2_graph_id: graphId,
            cx2_file: sourceName,
            mt_generated_endpoint: true
        };

        this.applyGraphOrigin(node, sourceName, false);
        this.addNetworkSummary(node, true);
        return node;
    }

    private parseGEXFAttributes(graphElement: Element): Map<string, GEXFParsedAttribute> {
        const attributes = new Map<string, GEXFParsedAttribute>();

        this.getChildElements(graphElement, 'attributes').forEach((attributesElement) => {
            const rawClass = String(attributesElement.getAttribute('class') || 'all').toLowerCase();
            const className: GEXFAttributeClass = rawClass === 'graph'
                || rawClass === 'node'
                || rawClass === 'edge'
                    ? rawClass
                    : 'all';
            const mode = String(attributesElement.getAttribute('mode') || 'static').toLowerCase();

            this.getChildElements(attributesElement, 'attribute').forEach((attributeElement, index) => {
                const id = attributeElement.getAttribute('id') || `${className}_${index + 1}`;
                const name = attributeElement.getAttribute('title') || id;
                const type = this.normalizeGEXFAttributeType(attributeElement.getAttribute('type'));
                const defaultElement = this.getChildElements(attributeElement, 'default')[0];

                attributes.set(id, {
                    id,
                    name,
                    type,
                    className,
                    mode,
                    defaultValue: defaultElement ? this.parseGraphMLValue(defaultElement.textContent || '', type, name) : undefined
                });
            });
        });

        return attributes;
    }

    private normalizeGEXFAttributeType(rawType: any): GraphMLAttributeType {
        const type = String(rawType || 'string').toLowerCase();
        if (type === 'boolean') {
            return 'boolean';
        }
        if (type === 'integer' || type === 'int') {
            return 'int';
        }
        if (type === 'long') {
            return 'long';
        }
        if (type === 'float' || type === 'double') {
            return 'double';
        }
        return 'string';
    }

    private parseGEXFDataRecord(
        element: Element,
        attributes: Map<string, GEXFParsedAttribute>,
        domain: GEXFAttributeClass
    ): Record<string, any> {
        const record: Record<string, any> = {};

        attributes.forEach(attribute => {
            if ((attribute.className === domain || attribute.className === 'all') && attribute.defaultValue !== undefined) {
                record[attribute.name] = attribute.defaultValue;
            }
        });

        this.getChildElements(element, 'attvalues').forEach(attvaluesElement => {
            this.getChildElements(attvaluesElement, 'attvalue').forEach(attvalueElement => {
                const attributeId = attvalueElement.getAttribute('for') || '';
                const attribute = attributes.get(attributeId);
                const name = attribute?.name || attributeId;

                if (!name) {
                    return;
                }

                const rawValue = attvalueElement.getAttribute('value') ?? (attvalueElement.textContent || '');
                const value = this.parseGraphMLValue(rawValue, attribute?.type || 'string', name);
                record[name] = value;

                const temporalRecord = this.extractGEXFTemporalRecord(attvalueElement);
                if (temporalRecord) {
                    record.gexf_dynamic_attvalues = Array.isArray(record.gexf_dynamic_attvalues)
                        ? record.gexf_dynamic_attvalues
                        : [];
                    record.gexf_dynamic_attvalues.push({
                        field: name,
                        value,
                        ...temporalRecord
                    });
                }
            });
        });

        return record;
    }

    private parseGEXFMetaRecord(gexfElement: Element): Record<string, any> {
        const metaElement = this.getChildElements(gexfElement, 'meta')[0];
        const record: Record<string, any> = {};

        if (!metaElement) {
            return record;
        }

        Array.from(metaElement.attributes || []).forEach(attribute => {
            record[`meta_${attribute.name}`] = attribute.value;
        });

        this.getChildElements(metaElement).forEach(child => {
            const name = this.getLocalName(child);
            const value = (child.textContent || '').trim();
            if (name && value) {
                record[`meta_${name}`] = value;
            }
        });

        return record;
    }

    private prefixGEXFGraphData(graphRecord: Record<string, any>): Record<string, any> {
        const prefixed: Record<string, any> = {};
        Object.keys(graphRecord).forEach(key => {
            if (graphRecord[key] !== undefined && graphRecord[key] !== '') {
                prefixed[`gexf_graph_${key}`] = graphRecord[key];
            }
        });
        return prefixed;
    }

    private collectGEXFNodeElements(graphElement: Element): Array<{ element: Element; parentId?: string }> {
        const nodes: Array<{ element: Element; parentId?: string }> = [];
        const visitNodesContainer = (nodesElement: Element, parentId?: string) => {
            this.getChildElements(nodesElement, 'node').forEach(nodeElement => {
                nodes.push({ element: nodeElement, parentId });
                const nodeId = this.normalizeIdValue(nodeElement.getAttribute('id'));
                this.getChildElements(nodeElement, 'nodes').forEach(childNodesElement => {
                    visitNodesContainer(childNodesElement, nodeId);
                });
            });
        };

        this.getChildElements(graphElement, 'nodes').forEach(nodesElement => visitNodesContainer(nodesElement));
        return nodes;
    }

    private collectGEXFEdgeElements(graphElement: Element): Element[] {
        return this.getChildElements(graphElement, 'edges')
            .reduce((edges, edgesElement) => edges.concat(this.getChildElements(edgesElement, 'edge')), [] as Element[]);
    }

    private addGEXFTemporalMetadata(record: Record<string, any>, element: Element): boolean {
        let hasTemporalMetadata = false;
        const temporalRecord = this.extractGEXFTemporalRecord(element);
        if (temporalRecord) {
            Object.keys(temporalRecord).forEach(key => {
                record[`gexf_${key}`] = temporalRecord[key];
            });
            hasTemporalMetadata = true;
        }

        const spells = this.getChildElements(element, 'spells')
            .reduce((items, spellsElement) => items.concat(
                this.getChildElements(spellsElement, 'spell')
                    .map(spellElement => this.extractGEXFTemporalRecord(spellElement))
                    .filter((spell): spell is Record<string, string> => !!spell)
            ), [] as Record<string, string>[]);

        if (spells.length > 0) {
            record.gexf_spells = spells;
            hasTemporalMetadata = true;
        }

        return hasTemporalMetadata;
    }

    private extractGEXFTemporalRecord(element: Element): Record<string, string> | null {
        const record: Record<string, string> = {};
        ['start', 'end', 'startopen', 'endopen', 'timestamp'].forEach(attributeName => {
            const value = this.normalizeOptionalValue(element.getAttribute(attributeName));
            if (value) {
                record[attributeName] = value;
            }
        });
        return Object.keys(record).length > 0 ? record : null;
    }

    private addGEXFVizMetadata(record: Record<string, any>, element: Element): boolean {
        let hasVizMetadata = false;
        const colorElement = this.getChildElements(element, 'color')[0];
        const positionElement = this.getChildElements(element, 'position')[0];
        const sizeElement = this.getChildElements(element, 'size')[0];
        const shapeElement = this.getChildElements(element, 'shape')[0];

        if (colorElement) {
            const hex = this.normalizeOptionalValue(colorElement.getAttribute('hex'));
            const r = this.toFiniteNumber(colorElement.getAttribute('r'));
            const g = this.toFiniteNumber(colorElement.getAttribute('g'));
            const b = this.toFiniteNumber(colorElement.getAttribute('b'));
            const a = this.toFiniteNumber(colorElement.getAttribute('a'));

            if (hex) {
                record.gexf_viz_color = hex;
            }
            if (r !== null) record.gexf_viz_color_r = r;
            if (g !== null) record.gexf_viz_color_g = g;
            if (b !== null) record.gexf_viz_color_b = b;
            if (a !== null) record.gexf_viz_color_a = a;
            hasVizMetadata = true;
        }

        if (positionElement) {
            const x = this.toFiniteNumber(positionElement.getAttribute('x'));
            const y = this.toFiniteNumber(positionElement.getAttribute('y'));
            const z = this.toFiniteNumber(positionElement.getAttribute('z'));
            if (x !== null) record.gexf_viz_x = x;
            if (y !== null) record.gexf_viz_y = y;
            if (z !== null) record.gexf_viz_z = z;
            hasVizMetadata = true;
        }

        if (sizeElement) {
            const size = this.toFiniteNumber(sizeElement.getAttribute('value'));
            if (size !== null) {
                record.gexf_viz_size = size;
            }
            hasVizMetadata = true;
        }

        if (shapeElement) {
            const shape = this.normalizeOptionalValue(shapeElement.getAttribute('value'));
            if (shape) {
                record.gexf_viz_shape = shape;
            }
            hasVizMetadata = true;
        }

        return hasVizMetadata;
    }

    private isGEXFEdgeDirected(edgeElement: Element, edgeDefault: string): boolean {
        const explicitType = String(edgeElement.getAttribute('type') ?? edgeElement.getAttribute('directed') ?? '').toLowerCase();
        if (explicitType === 'directed' || explicitType === 'mutual' || explicitType === 'true') {
            return true;
        }
        if (explicitType === 'undirected' || explicitType === 'false') {
            return false;
        }
        return edgeDefault === 'directed' || edgeDefault === 'mutual';
    }

    private applyGEXFEdgeOrigins(
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
            record.gexf_edge_origin = edgeOrigins.join('; ');
        }

        if (allEdgeOrigins.length > 0) {
            record.gexf_edge_origin_all = allEdgeOrigins.join('; ');
        }

        record.origin = this.prefixGraphMLImportedOrigins(visibleOrigins, sourceName);
        record._originAll = this.prefixGraphMLImportedOrigins(canonicalOrigins, sourceName);

        const distanceOrigins = this.normalizeOrigins(record.distanceOrigins);
        if (distanceOrigins.length > 0) {
            record.gexf_edge_distance_origins = distanceOrigins.join('; ');
            record.distanceOrigins = this.prefixGraphMLImportedOrigins(distanceOrigins, sourceName);
        }

        const distanceOrigin = String(record.distanceOrigin ?? '').trim();
        if (distanceOrigin.length > 0) {
            record.gexf_edge_distance_origin = distanceOrigin;
            record.distanceOrigin = this.prefixGraphMLImportedOrigin(distanceOrigin, sourceName);
        }
    }

    private buildGeneratedGEXFEndpointNode(
        id: string,
        gexfNodeId: string,
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
            gexf_node_id: gexfNodeId,
            gexf_graph_id: graphId,
            gexf_file: sourceName,
            mt_generated_endpoint: true
        };

        this.applyGraphOrigin(node, graphOrigin, forceGraphOrigin);
        this.addNetworkSummary(node, true);
        return node;
    }

    private normalizeOptionalValue(value: any): string {
        return String(value ?? '').trim();
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
            'weight',
            'Weight',
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
