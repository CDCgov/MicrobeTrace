import { CommonService } from '../contactTraceCommonServices/common.service';
import * as patristic from 'patristic';

export default class AuspiceHandler {

  private strainSymbol = Symbol('strain');
  private NODE_VISIBLE = 2;              // included on tree and map
  private invalidStrings = ['unknown', '?', 'nan', 'na', 'n/a', '', 'unassigned'];
  private nodeList = [];
  private linkList = [];

  constructor(public commonService: CommonService) {
    this.commonService = commonService;
  }

  public recurseChildren = (tree) => {
    if (!tree.children) {
      const node = this.makeNode(tree);
      this.nodeList.push(node);
      const branch = new patristic.Branch(node);
      return branch;
    } else {
      const rootNode = this.makeNode(tree);
      this.nodeList.push(rootNode);
      const newTree = new patristic.Branch(rootNode);
      for (const child of tree.children) {
        const node = this.recurseChildren(child);
        newTree.addChild(node);
      }
      return newTree;
    }
  }

  public makeNode = (tree) => {
    const node: any = {};
    node.id = tree.name;
    node._id = tree.name;
    if (tree.hasOwnProperty('branch_attrs') &&
        tree.branch_attrs.hasOwnProperty('mutations') &&
        tree.branch_attrs.mutations.hasOwnProperty('nuc'))  {
      node.mutations = tree.branch_attrs.mutations.nuc;
    }
    for (const attribute of Object.keys(tree.node_attrs)) {
      if (attribute !== 'div') {
        node[attribute] = tree.node_attrs[attribute].value;
      } else {
        node[attribute] = tree.node_attrs[attribute];
      }
    }
    return node;
  }

  public combineMutations = (tree) => {
    const leaves = tree.getLeaves();
    for (const leaf of leaves) {
      let mutHolder = [];
      for (const ancestor of leaf.getAncestors(true)) {
        const nodeIndex = this.nodeList.findIndex( x => x.id === ancestor.id);
        const nodeHolder = this.nodeList[nodeIndex];
        if (nodeHolder.hasOwnProperty('mutations')) {
          mutHolder = mutHolder.concat(nodeHolder.mutations);
        }
      }
      leaf.data.mutations = mutHolder;
    }
    return tree;
  }

  public parseAuspice = (auspiceTree) => {
    console.log(auspiceTree);
    return this.recurseChildren(auspiceTree.tree);
  }


  public treeToNewick = (tree, temporal, internalNodeNames = false, nodeAnnotation = (node) => '') => {
    const getXVal = temporal ? (n) => this.getTraitFromNode(n, 'num_date') : this.getDivFromNode;

    function recurse(node, parentX) {
      if (node.hasOwnProperty('children')) {
        const childSubtrees = node.children.map((child) => {
          const subtree = recurse(child, getXVal(node));
          return subtree;
        });
        return `(${childSubtrees.filter((t) => !!t).join(',')})` +
          `${internalNodeNames ? node.name : ''}${nodeAnnotation(node)}:${getXVal(node) - parentX}`;
      }
      /* terminal node */
      const leaf = `${node.name}${nodeAnnotation(node)}:${getXVal(node) - parentX}`;
      return leaf;
    }

    const rootNode = tree;
    const rootXVal = getXVal(rootNode);
    return recurse(rootNode, rootXVal) + ';';
  }


  public getTraitFromNode = (node, trait, {entropy = false, confidence = false}= {}) => {
    if (!node.node_attrs) return undefined;

    if (!entropy && !confidence) {
      if (!node.node_attrs[trait]) {
        if (trait === this.strainSymbol) return node.name;
        return undefined;
      }
      const value = node.node_attrs[trait].value;
      if (!this.isValueValid(value)) return undefined;
      return value;
    } else if (entropy) {
      if (node.node_attrs[trait]) return node.node_attrs[trait].entropy;
      return undefined;
    } else if (confidence) {
      if (node.node_attrs[trait]) return node.node_attrs[trait].confidence;
      return undefined;
    }
    return undefined;
  }

  public getDivFromNode = (node) => {
    /* see comment at top of this file */
    if (node.node_attrs && node.node_attrs.div !== undefined) {
      return node.node_attrs.div;
    }
    return undefined;
  }

  public isValueValid = (value) => {
    if (!['number', 'boolean', 'string'].includes(typeof value)) {
      return false;
    }
    if (typeof value === 'string' && this.invalidStrings.includes(value.toLowerCase())) {
      return false; // checks against list of invalid strings
    }
    // booleans, valid strings & numbers are valid.
    return true;
  }

  public makeLinksFromMatrix = (matrix) => {
    const linkList = [];
    for (let i = 0; i < matrix.ids.length - 1; i++) {
      for (let j = i + 1; j < matrix.ids.length; j++) {
        const link = {
          source: matrix.ids[i],
          target: matrix.ids[j],
          distance: matrix.matrix[i][j],
          hasDistance: true,
          distanceOrigin: 'Auspice',
        };
        linkList.push(link);
      }
    }
    this.linkList = linkList;
  }

  public addLatLong = (nodes, metadata) => {
    const newNodes = [];
    const geoResolutions = Array.isArray(metadata?.geo_resolutions)
      ? metadata.geo_resolutions
      : [];

    for (const node of nodes) {
      for (const resolution of geoResolutions) {
        const deme = node[resolution?.key];
        const coordinates = deme ? resolution?.demes?.[deme] : undefined;
        if (coordinates) {
          node.latitude = coordinates.latitude;
          node.longtude = coordinates.longitude;
        }
      }
      newNodes.push(node);
    }
    return newNodes;
  }


  public run = (jsonObj) => {
    const newickString =  this.treeToNewick(jsonObj.tree, false, true);
    const fullTree = this.parseAuspice(jsonObj);
    const updatedTree = this.combineMutations(fullTree);
    const bareNewickString =  this.treeToNewick(jsonObj.tree, false, false);
    this.nodeList = this.addLatLong(this.nodeList, jsonObj.meta);
    return {
      nodes: this.nodeList,
      links: [],
      tree: updatedTree,
      newick: bareNewickString,
      newickWithLabels: newickString,
    };
  }

}
