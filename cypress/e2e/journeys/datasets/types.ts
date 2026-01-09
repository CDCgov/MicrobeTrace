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

export type JourneyExpectations = {
  afterLaunch?: ExpectedCounts;

  nn?: {
    before: { visibleLinks: number };
    after: { visibleLinks: number };
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

    thresholdChange?: {
      from: number;
      to: number;
      expectedVisibleLinksAfter: number;
      expectPolygonsUnchanged: boolean;
    };

    changeGroupColors?: {
      groups: string[];
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
