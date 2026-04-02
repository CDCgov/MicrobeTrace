#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT_DIR = path.join('tmp', 'network-budget-fixtures');
const DEFAULT_BASENAME = 'network-budget';
const DEFAULT_PREFIX = 'N';
const DEFAULT_SHAPE = 'band';
const DEFAULT_DISTANCE_MODE = 'linear';
const DEFAULT_SEED = 1337;

function printHelp() {
  console.log(`
Generate synthetic node/link CSV fixtures for network budget testing.

Examples:
  node scripts/generate-network-budget-fixtures.js --nodes 5000 --avg-degree 8
  node scripts/generate-network-budget-fixtures.js --sweep-nodes 1000,2500,5000 --avg-degree 12
  node scripts/generate-network-budget-fixtures.js --nodes 2000 --edges 100000 --shape complete

Options:
  --nodes <int>                Single dataset node count.
  --sweep-nodes <list>         Comma-separated node counts to generate as a ladder.
  --edges <int>                Target undirected edge count per dataset.
  --avg-degree <number>        Target average degree per node. Edges = round(nodes * degree / 2).
  --shape <band|star|complete> Link topology. Default: band.
  --output-dir <path>          Destination directory. Default: tmp/network-budget-fixtures.
  --basename <name>            Base name for generated files. Default: network-budget.
  --prefix <text>              Node id prefix. Default: N.
  --groups <int>               Number of synthetic node groups. Default: 10.
  --distance-mode <mode>       constant, linear, or random. Default: linear.
  --distance <number>          Constant distance when distance-mode=constant. Default: 1.
  --distance-min <number>      Minimum distance for linear/random. Default: 1.
  --distance-max <number>      Maximum distance for linear/random. Default: 10.
  --seed <int>                 Seed for deterministic random distances. Default: 1337.
  --help                       Show this message.

Notes:
  - Nodes are written to <name>-nodes.csv with columns: ID,label,group
  - Links are written to <name>-links.csv with columns: source,target,distance
  - A manifest CSV is written with counts and byte sizes for each generated dataset.
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (key === 'help') {
      args.help = true;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parseInteger(value, flagName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${flagName} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function parseNumber(value, flagName) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${flagName} must be a positive number. Received: ${value}`);
  }
  return parsed;
}

function parseNodeCounts(args) {
  if (args['sweep-nodes']) {
    const counts = String(args['sweep-nodes'])
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => parseInteger(item, 'sweep-nodes'));
    if (counts.length === 0) {
      throw new Error('--sweep-nodes must include at least one positive integer.');
    }
    return counts;
  }

  if (!args.nodes) {
    throw new Error('Provide either --nodes or --sweep-nodes.');
  }

  return [parseInteger(args.nodes, 'nodes')];
}

function createMulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function maxUndirectedEdges(nodeCount) {
  return (nodeCount * (nodeCount - 1)) / 2;
}

function resolveTargetEdges(nodeCount, args) {
  if (args.edges) {
    return Math.min(parseInteger(args.edges, 'edges'), maxUndirectedEdges(nodeCount));
  }

  if (args['avg-degree']) {
    const avgDegree = parseNumber(args['avg-degree'], 'avg-degree');
    const requestedEdges = Math.round((nodeCount * avgDegree) / 2);
    return Math.min(requestedEdges, maxUndirectedEdges(nodeCount));
  }

  throw new Error('Provide either --edges or --avg-degree.');
}

function padNodeId(prefix, index, totalCount) {
  const width = String(totalCount).length;
  return `${prefix}${String(index + 1).padStart(width, '0')}`;
}

function getDistanceFactory(args) {
  const mode = (args['distance-mode'] || DEFAULT_DISTANCE_MODE).toLowerCase();
  const distanceValue = Number.parseFloat(args.distance || '1');
  const distanceMin = Number.parseFloat(args['distance-min'] || '1');
  const distanceMax = Number.parseFloat(args['distance-max'] || '10');
  const random = createMulberry32(parseInteger(args.seed || DEFAULT_SEED, 'seed'));

  if (mode === 'constant') {
    return {
      mode,
      min: distanceValue,
      max: distanceValue,
      next: () => distanceValue,
    };
  }

  if (mode === 'linear') {
    return {
      mode,
      min: distanceMin,
      max: distanceMax,
      next: (edgeIndex, totalEdges) => {
        if (totalEdges <= 1) return distanceMin;
        const ratio = edgeIndex / (totalEdges - 1);
        return distanceMin + (distanceMax - distanceMin) * ratio;
      },
    };
  }

  if (mode === 'random') {
    return {
      mode,
      min: distanceMin,
      max: distanceMax,
      next: () => distanceMin + (distanceMax - distanceMin) * random(),
    };
  }

  throw new Error(`Unsupported --distance-mode: ${mode}`);
}

function formatDistance(value) {
  const rounded = Math.round(value * 1000000) / 1000000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function writeNodesCsv(filePath, nodeCount, prefix, groups) {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  stream.write('ID,label,group\n');

  for (let index = 0; index < nodeCount; index += 1) {
    const id = padNodeId(prefix, index, nodeCount);
    const group = `G${(index % groups) + 1}`;
    stream.write(`${id},${id},${group}\n`);
  }

  stream.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function writeLinksCsv(filePath, nodeCount, edgeCount, prefix, shape, distanceFactory) {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  stream.write('source,target,distance\n');

  const writeEdge = (sourceIndex, targetIndex, edgeIndex) => {
    const source = padNodeId(prefix, sourceIndex, nodeCount);
    const target = padNodeId(prefix, targetIndex, nodeCount);
    const distance = formatDistance(distanceFactory.next(edgeIndex, edgeCount));
    stream.write(`${source},${target},${distance}\n`);
  };

  let written = 0;

  if (shape === 'star') {
    for (let targetIndex = 1; targetIndex < nodeCount && written < edgeCount; targetIndex += 1) {
      writeEdge(0, targetIndex, written);
      written += 1;
    }
  } else if (shape === 'complete') {
    for (let sourceIndex = 0; sourceIndex < nodeCount && written < edgeCount; sourceIndex += 1) {
      for (let targetIndex = sourceIndex + 1; targetIndex < nodeCount && written < edgeCount; targetIndex += 1) {
        writeEdge(sourceIndex, targetIndex, written);
        written += 1;
      }
    }
  } else if (shape === 'band') {
    const maxStep = Math.floor(nodeCount / 2);
    for (let step = 1; step <= maxStep && written < edgeCount; step += 1) {
      const isHalfTurn = nodeCount % 2 === 0 && step === nodeCount / 2;
      const edgesThisStep = isHalfTurn ? nodeCount / 2 : nodeCount;
      const limit = Math.min(edgesThisStep, edgeCount - written);
      for (let sourceIndex = 0; sourceIndex < limit; sourceIndex += 1) {
        const targetIndex = (sourceIndex + step) % nodeCount;
        writeEdge(sourceIndex, targetIndex, written);
        written += 1;
      }
    }
  } else {
    throw new Error(`Unsupported --shape: ${shape}`);
  }

  stream.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(written));
    stream.on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const nodeCounts = parseNodeCounts(args);
  const prefix = args.prefix || DEFAULT_PREFIX;
  const basename = args.basename || DEFAULT_BASENAME;
  const shape = (args.shape || DEFAULT_SHAPE).toLowerCase();
  const groups = parseInteger(args.groups || '10', 'groups');
  const outputDir = path.resolve(args['output-dir'] || DEFAULT_OUTPUT_DIR);
  const manifestRows = [
    'dataset,node_file,link_file,node_count,edge_count,shape,distance_mode,distance_min,distance_max,node_csv_bytes,link_csv_bytes,approx_csv_bytes',
  ];

  fs.mkdirSync(outputDir, { recursive: true });

  for (const nodeCount of nodeCounts) {
    const targetEdges = resolveTargetEdges(nodeCount, args);
    const datasetName = `${basename}-${nodeCount}n-${targetEdges}e`;
    const nodeFile = `${datasetName}-nodes.csv`;
    const linkFile = `${datasetName}-links.csv`;
    const nodePath = path.join(outputDir, nodeFile);
    const linkPath = path.join(outputDir, linkFile);
    const distanceFactory = getDistanceFactory(args);

    await writeNodesCsv(nodePath, nodeCount, prefix, groups);
    const writtenEdges = await writeLinksCsv(linkPath, nodeCount, targetEdges, prefix, shape, distanceFactory);

    const nodeBytes = fs.statSync(nodePath).size;
    const linkBytes = fs.statSync(linkPath).size;
    manifestRows.push([
      datasetName,
      nodeFile,
      linkFile,
      nodeCount,
      writtenEdges,
      shape,
      distanceFactory.mode,
      formatDistance(distanceFactory.min),
      formatDistance(distanceFactory.max),
      nodeBytes,
      linkBytes,
      nodeBytes + linkBytes,
    ].join(','));

    console.log([
      `Generated ${datasetName}`,
      `  nodes: ${nodeCount.toLocaleString()}`,
      `  edges: ${writtenEdges.toLocaleString()}`,
      `  node file: ${nodePath}`,
      `  link file: ${linkPath}`,
      `  csv bytes: ${(nodeBytes + linkBytes).toLocaleString()}`,
    ].join('\n'));
  }

  const manifestPath = path.join(outputDir, `${basename}-manifest.csv`);
  fs.writeFileSync(manifestPath, `${manifestRows.join('\n')}\n`, 'utf8');

  console.log([
    '',
    `Manifest: ${manifestPath}`,
    'Load the generated node CSV as `Node` with `ID`, and the link CSV as `Link` with `source`, `target`, `distance`.',
    'Use a node-count sweep to find the practical memory ceiling on your machine.',
  ].join('\n'));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
