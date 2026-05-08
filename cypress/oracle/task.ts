import type { PluginEvents } from 'cypress';
import fs from 'fs';

import { computeFilteringOracle } from './filtering-oracle';
import type { OracleManifest } from './types';

type TextFileSummaryRequest = {
  filePath: string;
  contains?: string[];
  minLength?: number;
};

export function registerOracleTasks(on: PluginEvents): void {
  on('task', {
    async 'oracle:compute'(manifest: OracleManifest) {
      return computeFilteringOracle(manifest);
    },
    'file:textSummary'(request: TextFileSummaryRequest) {
      const text = fs.readFileSync(request.filePath, 'utf8');
      const requiredStrings = request.contains || [];

      return {
        length: text.length,
        missing: requiredStrings.filter((required) => !text.includes(required)),
        meetsMinLength: request.minLength === undefined || text.length > request.minLength,
      };
    },
  });
}
