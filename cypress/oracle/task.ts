import type { PluginEvents } from 'cypress';

import { computeFilteringOracle } from './filtering-oracle';
import type { OracleManifest } from './types';

export function registerOracleTasks(on: PluginEvents): void {
  on('task', {
    async 'oracle:compute'(manifest: OracleManifest) {
      return computeFilteringOracle(manifest);
    },
  });
}
