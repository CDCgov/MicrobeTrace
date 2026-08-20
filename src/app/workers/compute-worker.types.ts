export type ComputeWorkerTask =
  | 'align'
  | 'consensus'
  | 'ambiguityCounts'
  | 'links'
  | 'tree'
  | 'directionality'
  | 'mst'
  | 'nn'
  | 'triangulation'
  | 'parseFasta'
  | 'networkStatistics';

export interface ComputeWorkerRequest<T = any> {
  jobId: number;
  task: ComputeWorkerTask;
  payload: T;
}
