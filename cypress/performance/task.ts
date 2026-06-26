import fs from 'fs';
import path from 'path';
import type { PluginEvents } from 'cypress';

type PerformanceResult = {
  runId?: string;
  scenarioId?: string;
  scenario?: {
    id?: string;
    title?: string;
  };
  timestamp?: string;
  [key: string]: unknown;
};

type WriteResultResponse = {
  filePath: string;
  summaryPath: string;
  runId: string;
};

type RealSampleManifestResult = {
  configured: boolean;
  manifestPath: string;
  scenarioCount: number;
  scenarios: unknown[];
  missingFiles: Array<{ scenarioId: string; fileName: string; resolvedPath: string }>;
  invalidScenarios: Array<{ index: number; scenarioId?: string; reason: string }>;
};

type NewickValidationArtifact = {
  runId?: string;
  ref?: string;
  kind?: string;
  scenarioId?: string;
  extension?: string;
  data?: unknown;
};

const runResults = new Map<string, PerformanceResult[]>();
const defaultPerfRunId = defaultRunId();
const realSampleManifestPath = path.join(
  process.cwd(),
  'cypress',
  'fixtures',
  'performance',
  'real-samples.json'
);

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function defaultRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalizeFixturePath(...segments: string[]): string {
  return segments
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}

function writeNewickValidationArtifact(artifact: NewickValidationArtifact): { filePath: string; runId: string } {
  const runId = safeSegment(
    artifact.runId ||
    process.env.MT_NEWICK_VALIDATION_RUN_ID ||
    defaultPerfRunId
  );
  const ref = safeSegment(artifact.ref || 'current');
  const kind = safeSegment(artifact.kind || 'artifact');
  const scenarioId = safeSegment(artifact.scenarioId || 'scenario');
  const extension = safeSegment(artifact.extension || 'json').replace(/^\.+/, '') || 'json';
  const outputDir = path.join(
    process.cwd(),
    'cypress',
    'downloads',
    'newick-validation',
    runId,
    ref,
    kind
  );
  const filePath = path.join(outputDir, `${scenarioId}.${extension}`);

  fs.mkdirSync(outputDir, { recursive: true });

  if (extension === 'json') {
    fs.writeFileSync(filePath, `${JSON.stringify(artifact.data ?? {}, null, 2)}\n`, 'utf8');
  } else {
    fs.writeFileSync(filePath, String(artifact.data ?? ''), 'utf8');
  }

  return {
    filePath: path.relative(process.cwd(), filePath),
    runId,
  };
}

function normalizeRealSampleFileName(file: any, baseDir: string): string {
  const name = normalizeFixturePath(String(file?.name || ''));
  if (!baseDir || name.includes('/')) return name;
  return normalizeFixturePath(baseDir, name);
}

function validateRealSampleScenario(scenario: any, index: number): string | null {
  if (!scenario || typeof scenario !== 'object') return 'scenario must be an object';
  if (!scenario.id || typeof scenario.id !== 'string') return 'scenario.id is required';
  if (!scenario.title || typeof scenario.title !== 'string') return 'scenario.title is required';
  if (!Array.isArray(scenario.files) || scenario.files.length === 0) return 'scenario.files must be a non-empty array';
  if (!scenario.preLaunch || typeof scenario.preLaunch !== 'object') return 'scenario.preLaunch is required';
  if (!scenario.expected || typeof scenario.expected !== 'object') return 'scenario.expected is required';
  if (typeof scenario.expected.nodes !== 'number') return 'scenario.expected.nodes is required';

  const invalidFile = scenario.files.find((file: any) => (
    !file ||
    typeof file !== 'object' ||
    !file.name ||
    !file.datatype
  ));
  if (invalidFile) return 'each scenario file requires name and datatype';

  const unsafeFile = scenario.files.find((file: any) => {
    const name = normalizeFixturePath(String(file.name || ''));
    return path.isAbsolute(String(file.name || '')) || name.split('/').includes('..');
  });
  if (unsafeFile) return 'file names must be fixture-relative paths without .. segments';

  if (scenario.viewChecks !== undefined && !Array.isArray(scenario.viewChecks)) {
    return 'scenario.viewChecks must be an array';
  }

  const invalidView = (scenario.viewChecks || []).find((view: string) => (
    view !== 'alignment' && view !== 'phylogeneticTree'
  ));
  if (invalidView) return `unsupported viewChecks entry: ${invalidView}`;

  return null;
}

function readRealSampleManifest(): RealSampleManifestResult {
  const manifestPath = path.relative(process.cwd(), realSampleManifestPath);
  if (!fs.existsSync(realSampleManifestPath)) {
    return {
      configured: false,
      manifestPath,
      scenarioCount: 0,
      scenarios: [],
      missingFiles: [],
      invalidScenarios: [],
    };
  }

  const manifest = JSON.parse(fs.readFileSync(realSampleManifestPath, 'utf8'));
  const rawScenarios = Array.isArray(manifest?.scenarios) ? manifest.scenarios : [];
  const manifestBaseDir = normalizeFixturePath(String(manifest?.baseDir || ''));
  const missingFiles: RealSampleManifestResult['missingFiles'] = [];
  const invalidScenarios: RealSampleManifestResult['invalidScenarios'] = [];
  const scenarios: unknown[] = [];

  rawScenarios.forEach((rawScenario: any, index: number) => {
    if (rawScenario?.enabled === false) return;

    const reason = validateRealSampleScenario(rawScenario, index);
    if (reason) {
      invalidScenarios.push({
        index,
        scenarioId: rawScenario?.id,
        reason,
      });
      return;
    }

    const baseDir = normalizeFixturePath(String(rawScenario.baseDir || manifestBaseDir || ''));
    const files = rawScenario.files.map((file: any) => ({
      ...file,
      name: normalizeRealSampleFileName(file, baseDir),
    }));

    files.forEach((file: any) => {
      const resolvedPath = path.join(process.cwd(), 'cypress', 'fixtures', file.name);
      if (!fs.existsSync(resolvedPath)) {
        missingFiles.push({
          scenarioId: rawScenario.id,
          fileName: file.name,
          resolvedPath: path.relative(process.cwd(), resolvedPath),
        });
      }
    });

    scenarios.push({
      ...rawScenario,
      files,
      metadata: {
        fixtureKind: 'real-sample',
        manifest: manifestPath,
        ...(rawScenario.metadata || {}),
      },
    });
  });

  return {
    configured: true,
    manifestPath,
    scenarioCount: scenarios.length,
    scenarios,
    missingFiles,
    invalidScenarios,
  };
}

export function registerPerformanceTasks(on: PluginEvents): void {
  on('task', {
    'perf:readRealSampleManifest'(): RealSampleManifestResult {
      return readRealSampleManifest();
    },

    'perf:writeResult'(result: PerformanceResult): WriteResultResponse {
      const runId = safeSegment(
        result.runId ||
        process.env.MT_PERF_RUN_ID ||
        defaultPerfRunId
      );
      const scenarioId = safeSegment(
        result.scenarioId ||
        result.scenario?.id ||
        'scenario'
      );
      const outputDir = path.join(process.cwd(), 'cypress', 'downloads', 'performance');
      const timestamp = result.timestamp || new Date().toISOString();
      const stampedResult = {
        ...result,
        runId,
        scenarioId,
        timestamp,
      };

      fs.mkdirSync(outputDir, { recursive: true });

      const filePath = path.join(outputDir, `${runId}-${scenarioId}.json`);
      fs.writeFileSync(filePath, `${JSON.stringify(stampedResult, null, 2)}\n`, 'utf8');

      const existingResults = runResults.get(runId) || [];
      existingResults.push(stampedResult);
      runResults.set(runId, existingResults);

      const summary = {
        runId,
        generatedAt: new Date().toISOString(),
        resultCount: existingResults.length,
        results: existingResults.map((entry) => {
          const result = entry as any;

          return {
            scenarioId: entry.scenarioId || entry.scenario?.id,
            title: entry.scenario?.title,
            timestamp: entry.timestamp,
            metrics: result.metrics,
            counts: result.counts,
            heap: result.heap,
            longTasks: result.longTasks,
            app: result.app,
          };
        }),
      };
      const summaryPath = path.join(outputDir, `${runId}-summary.json`);
      fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
      fs.writeFileSync(
        path.join(outputDir, 'latest-summary.json'),
        `${JSON.stringify(summary, null, 2)}\n`,
        'utf8'
      );

      return { filePath, summaryPath, runId };
    },

    'newickValidation:writeArtifact'(artifact: NewickValidationArtifact): { filePath: string; runId: string } {
      return writeNewickValidationArtifact(artifact);
    },
  });
}
