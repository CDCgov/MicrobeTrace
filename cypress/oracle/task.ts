import type { PluginEvents } from 'cypress';
import * as fs from 'fs';
import * as path from 'path';

import { computeFilteringOracle } from './filtering-oracle';
import type { OracleManifest } from './types';

export function registerOracleTasks(on: PluginEvents): void {
  on('task', {
    async 'oracle:compute'(manifest: OracleManifest) {
      return computeFilteringOracle(manifest);
    },
    async 'benchmark:writeReport'(
      payload: { outputPath: string; report: unknown },
    ) {
      const resolvedPath = path.resolve(payload.outputPath);
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      fs.writeFileSync(resolvedPath, `${JSON.stringify(payload.report, null, 2)}\n`, 'utf8');
      return resolvedPath;
    },
  });
}
