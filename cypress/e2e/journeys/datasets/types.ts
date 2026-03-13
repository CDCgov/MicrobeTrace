// cypress/e2e/journeys/datasets/types.ts

export type DistanceMetric = 'tn93' | 'snps';

export type DefaultView =
  | '2D Network'
  | 'Table'
  | 'Map'
  | 'Phylogenetic Tree'
  | 'Alignment View';

export type FileDatatype =
  | 'link'
  | 'node'
  | 'matrix'
  | 'fasta'
  | 'newick'
  | 'MT/other';

export type PruneWith = 'None' | 'Nearest Neighbor';

export type LinkLabelVariable = 'None' | 'distance';
export type GroupByVariable = 'None' | 'Cluster' | 'Subtype';

export type FileLoadSpec = {
  name: string;
  datatype: FileDatatype;
  field1?: string;
  field2?: string;
  field3?: string;
};

export type PreLaunchSettings = {
  metric: DistanceMetric;
  threshold: number;
  defaultView?: DefaultView;
};

export type ExpectedCounts = {
  nodes?: number;
  visibleLinks?: number;
  clusters?: number;
  singletons?: number;
};

export type ExpectationMode = 'observed' | 'intended';

export type SplitExpectation<T> = {
  observed: T;
  intended?: T;
  note?: string;
};

export type ExpectedValue<T> = T | SplitExpectation<T>;

const isSplitExpectation = <T>(value: ExpectedValue<T>): value is SplitExpectation<T> => {
  return typeof value === 'object' && value !== null && 'observed' in value;
};

export const resolveExpected = <T>(
  value: ExpectedValue<T> | undefined,
  mode: ExpectationMode = 'observed',
): T | undefined => {
  if (value === undefined) return undefined;
  if (!isSplitExpectation(value)) return value;

  if (mode === 'intended') {
    return value.intended ?? value.observed;
  }

  return value.observed;
};

export const hasExpectedDeviation = <T>(value: ExpectedValue<T> | undefined): boolean => {
  if (!value || !isSplitExpectation(value)) return false;
  return value.intended !== undefined && value.intended !== value.observed;
};

export type JourneyExpectations = {
  afterLaunch?: ExpectedValue<ExpectedCounts>;

  filtering?: {
    minimumClusterSize?: {
      from: number;
      to: number;
      after: ExpectedValue<ExpectedCounts>;
      hiddenNodeIds?: string[];
      reveal?: {
        expectedCounts: ExpectedValue<ExpectedCounts>;
        restoredNodeIds?: string[];
      };
    };

    epsilonAfterNearestNeighbor?: {
      fromExponent: number;
      steps: Array<{
        toExponent: number;
        after: ExpectedValue<{ visibleLinks: number }>;
        note?: string;
      }>;
    };

    mixedOriginNearestNeighbor?: {
      multiOriginLinks: number;
      cancel: ExpectedValue<{ visibleLinks: number }>;
      confirm: ExpectedValue<{ visibleLinks: number }>;
      preservedLinkIds?: string[];
    };

    metricSwitch?: {
      steps: Array<{
        toMetric: DistanceMetric;
        expectedThreshold: number;
        after: ExpectedValue<{ visibleLinks: number }>;
      }>;
    };
  };

  nn?: {
    labelLinksWith?: LinkLabelVariable;
    before: ExpectedValue<{ visibleLinks: number }>;
    after: ExpectedValue<{ visibleLinks: number }>;
  };

  applyStyle?: {
    styleFile: string;
    expectWidgets: {
      nodeColorVariable?: string;
      nodeSymbolVariable?: string;
      nodeRadiusVariable?: string;
      linkColorVariable?: string;
    };
    expectTables: {
      nodeColorTable: boolean;
      nodeSymbolTable: boolean;
      linkColorTable: boolean;
      nodeSizeTable: boolean;
    };
  };

  grouping?: {
    groupBy: GroupByVariable;
    showGroups: boolean;
    showGroupColors: boolean;
    showGroupLabels: boolean;

    /**
     * Explicit membership expectations:
     * key is the group label (cluster id or subtype, etc).
     * The parent cytoscape id might be either '<key>' or `group-<key>` depending on the code path.
     */
    expectedGroups?: Record<string, string[]>;

    thresholdChange?: {
      from: number;
      to: number;
      expectedVisibleLinksAfter: ExpectedValue<number>;
      expectPolygonsUnchanged: boolean;
      note?: string;
    };

    changeGroupColors?: {
      groups: string[];
      colorsByGroup?: Record<string, string>;
    };
  };


};

export type DatasetProfile = {
  id: string;
  title: string;
  tags: string[];
  files: FileLoadSpec[];
  preLaunch: PreLaunchSettings;
  expectations: JourneyExpectations;
};

export const P = (profile: DatasetProfile): DatasetProfile => profile;
