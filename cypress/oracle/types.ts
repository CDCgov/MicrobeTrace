import type {
  DistanceMetric,
  FileLoadSpec,
  PreLaunchSettings,
} from '../e2e/journeys/datasets/types';

export type OracleLinkDebugState = {
  id: string;
  source: string;
  target: string;
  origins: string[];
  distanceOrigins: string[];
  nonDistanceOrigins: string[];
  distance: number | null;
  distanceBacked: boolean;
  nnIncluded: boolean;
  visible: boolean;
  prunedByThreshold: boolean;
  prunedByNN: boolean;
  preservedByNonDistanceOrigin: boolean;
  hiddenByTimeline: boolean;
  hiddenTimelineNodeIds: string[];
};

export type OracleNodeDebugState = {
  id: string;
  visible: boolean;
  timelineField: string | null;
  rawTimelineValue: string | null;
  effectiveTimelineValue: string | null;
  parsedTimelineValue: string | null;
  backfilledMissingDate: boolean;
  hiddenByTimeline: boolean;
};

export type OracleSnapshot = {
  snapshotId: string;
  metric: DistanceMetric;
  threshold: number;
  nearestNeighborEnabled: boolean;
  epsilonExponent: number;
  timelineField: string | null;
  timelineStart: string | null;
  timelineEnd: string | null;
  visibleLinkIds: string[];
  visibleNodeIds: string[];
  visibleLinks: number;
  visibleNodes: number;
  components: number;
  singletons: number;
  nodeDebug: Record<string, OracleNodeDebugState>;
  linkDebug: Record<string, OracleLinkDebugState>;
};

export type OracleStep =
  | {
      id: string;
      kind: 'set-threshold';
      threshold: number;
    }
  | {
      id: string;
      kind: 'set-nearest-neighbor';
      enabled: boolean;
    }
  | {
      id: string;
      kind: 'set-epsilon';
      exponent: number;
    }
  | {
      id: string;
      kind: 'set-distance-metric';
      metric: DistanceMetric;
    }
  | {
      id: string;
      kind: 'set-timeline-field';
      field: string | 'None';
    }
  | {
      id: string;
      kind: 'set-timeline-date';
      date: string;
    }
  | {
      id: string;
      kind: 'set-timeline-range';
      start: string;
      end: string;
    }
  | {
      id: string;
      kind: 'reveal-everything';
    };

export type OracleManifest = {
  files: FileLoadSpec[];
  preLaunch: PreLaunchSettings;
  steps: OracleStep[];
};

export type OracleComputationResult = {
  order: string[];
  snapshots: Record<string, OracleSnapshot>;
};
