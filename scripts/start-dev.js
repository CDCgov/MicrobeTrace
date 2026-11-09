const { spawn } = require('node:child_process');
const path = require('node:path');

// Pass Angular options (including --port) through unchanged. The color is a
// per-process build constant so concurrent worktrees never share a config file.
function getServeArgs(args) {
  let color = 'blue';
  const angularArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--color') {
      color = args[++index];
    } else if (arg.startsWith('--color=')) {
      color = arg.slice('--color='.length);
    } else {
      angularArgs.push(arg);
    }
  }

  if (typeof color !== 'string' || !['blue', 'orange', 'red', 'yellow', 'green', 'purple'].includes(color.toLowerCase())) {
    throw new Error('Choose a UI color with --color blue, orange, red, yellow, green, or purple.');
  }

  return [
    'serve', '-c', 'development',
    ...angularArgs,
    '--define', `MICROBETRACE_UI_COLOR=${JSON.stringify(color.toLowerCase())}`,
  ];
}

if (require.main === module) {
  try {
    const args = getServeArgs(process.argv.slice(2));
    const cli = path.join(path.dirname(require.resolve('@angular/cli/package.json')), 'bin', 'ng.js');
    const server = spawn(process.execPath, [cli, ...args], { stdio: 'inherit' });
    server.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.on('exit', (code) => { process.exitCode = code ?? 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => server.kill(signal));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { getServeArgs };
