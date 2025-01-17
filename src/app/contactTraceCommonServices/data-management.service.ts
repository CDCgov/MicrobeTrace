import { Injectable } from '@angular/core';
import * as _ from 'lodash';
import moment from 'moment';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from './session.service';

// Example interface for node or link
export interface NodeData {
  index: number;
  _id: string;
  selected: boolean;
  cluster: number;
  visible: boolean;
  degree: number;
  data?: any;
  origin: string[];
  hasDistance: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class DataManagementService {

  // Observables to watch threshold changes or network updates
  private _linkThreshold$ = new BehaviorSubject<number>(0.015);
  linkThreshold$ = this._linkThreshold$.asObservable();

  private _networkUpdated$ = new BehaviorSubject<boolean>(false);
  networkUpdated$ = this._networkUpdated$.asObservable();

  constructor(
    public sessionSvc: SessionService
  ) {}

  /**
   * Simple accessor/mutators for threshold
   */
  setLinkThreshold(newThreshold: number): void {
    if (this._linkThreshold$.value !== newThreshold) {
      // update the session's widget also
      // (assuming default-distance-metric is "tn93" by default, but adjust as needed)
      this.sessionSvc.sessionSkeleton().style.widgets['link-threshold'] = newThreshold;
      this._linkThreshold$.next(newThreshold);
    }
  }

  get linkThreshold(): number {
    return this._linkThreshold$.value;
  }

  setNetworkUpdated(newVal: boolean): void {
    this._networkUpdated$.next(newVal);
  }

  get networkUpdated(): boolean {
    return this._networkUpdated$.value;
  }

  /** Add a Node */
  addNode(newNode: any, checkForDuplicates = false): number {
    const session = this.getSession();
    const nodes = session.data.nodes;

    // Convert numeric _id to string
    if (typeof newNode._id === 'number') {
      newNode._id = '' + newNode._id;
    }

    // If not provided, set it from `id`
    if (!newNode._id && newNode.id) {
      newNode._id = String(newNode.id);
    }

    newNode._id = (newNode._id || '').trim();

    // If node is in nodeExclusions, skip
    if (session.data.nodeExclusions.indexOf(newNode._id) > -1) {
      return 0;
    }

    // Possibly check duplicates
    if (checkForDuplicates) {
      const existingNode = nodes.find(n => n._id === newNode._id);
      if (existingNode) {
        // Merge origins, etc.
        existingNode.origin = this.uniq(existingNode.origin.concat(newNode.origin));
        // If needed, merge more properties
        Object.assign(existingNode, newNode);
        return 0;
      }
    }

    // Otherwise create a default node object
    const defaultNode = {
      index: nodes.length,
      _id: '',
      selected: false,
      cluster: 1,
      visible: true,
      degree: 0,
      data: {},
      origin: [],
      hasDistance: false
    };
    const mergedNode = Object.assign(defaultNode, newNode);
    session.data.nodes.push(mergedNode);

    return 1; // new node was added
  }

  /** Add a Link */
  addLink(newLink: any, checkDuplicates = true): number {
    const session = this.getSession();
    const matrix = session.temp.matrix;
    const sdlinks = session.data.links;

    // Force source, target to string and trim
    newLink.source = String(newLink.source).trim();
    newLink.target = String(newLink.target).trim();

    // no self-loops
    if (newLink.source === newLink.target) return 0;

    if (!matrix[newLink.source]) matrix[newLink.source] = {};
    if (!matrix[newLink.target]) matrix[newLink.target] = {};

    if (matrix[newLink.source][newLink.target]) {
      // Link exists, merge
      const oldLink = matrix[newLink.source][newLink.target];
      oldLink.origin = this.uniq(oldLink.origin.concat(newLink.origin));

      _.merge(oldLink, newLink);
      return 0;
    } else if (matrix[newLink.target][newLink.source]) {
      // Rarely reached
      const oldLink = matrix[newLink.target][newLink.source];
      oldLink.origin = this.uniq(oldLink.origin.concat(newLink.origin));
      _.merge(oldLink, newLink);
      return 0;
    }

    // else new link
    const defaultLink = {
      index: sdlinks.length,
      source: '',
      target: '',
      visible: false,
      cluster: 1,
      origin: [],
      hasDistance: false
    };

    const linkToAdd = Object.assign(defaultLink, newLink);
    sdlinks.push(linkToAdd);

    matrix[linkToAdd.source][linkToAdd.target] = linkToAdd;
    matrix[linkToAdd.target][linkToAdd.source] = linkToAdd;

    return 1;
  }

  /** Mark that the network changed */
  onMetricChanged(metric: string) {
    // do something, or emit an event
  }

  /** 
   * Quick unique array 
   */
  uniq(arr: any[]): any[] {
    const seen = new Set();
    return arr.filter(item => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }

  /** 
   * Helper to get entire session 
   */
  getSession() {
    // In a real scenario, you might store session as a BehaviorSubject in SessionService
    // and then retrieve a reference, or provide an entire "session" object from there.
    // For simplicity, let's pretend we keep a single "masterSession" in memory.
    if (!((window as any).masterSession)) {
      (window as any).masterSession = {
        data: this.sessionSvc.sessionSkeleton().data,
        style: this.sessionSvc.sessionSkeleton().style,
        temp: this.sessionSvc.tempSkeleton()
      };
    }
    return (window as any).masterSession;
  }

  /** 
   * Example: set node or link visibility
   */
  setNodeVisibility() {
    const session = this.getSession();
    const dateField = session.style.widgets['timeline-date-field'];
    session.data.nodes.forEach((node) => {
      let visible = true;
      // cluster-based?
      if (session.data.clusters[node.cluster]) {
        visible = visible && session.data.clusters[node.cluster].visible;
      }
      // timeline-based?
      if (dateField !== 'None') {
        visible = visible && moment(session.state.timeEnd).isAfter(moment(node[dateField]));
      }
      node.visible = visible;
    });
  }

  setLinkVisibility() {
    const session = this.getSession();
    const metric = session.style.widgets['link-sort-variable'];
    const threshold = session.style.widgets['link-threshold'];
    const showNN = session.style.widgets['link-show-nn'];

    session.data.links.forEach(link => {
      let visible = true;
      if (link[metric] != null) {
        visible = link[metric] < threshold;
      }
      if (showNN) {
        visible = visible && !!link.nn;
      }
      // cluster-based?
      if (session.data.clusters[link.cluster]) {
        visible = visible && session.data.clusters[link.cluster].visible;
      }
      link.visible = visible;
    });
  }

  /**
   * Etc. ...
   * Add all your “setClusterVisibility, getVisibleNodes, tagClusters” 
   * or “resetData” logic here as well.
   */
}
