const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const angularCli = path.join(
  projectRoot,
  'node_modules',
  '@angular',
  'cli',
  'bin',
  'ng.js'
);
const demoUrl =
  'http://localhost:4200/?skipEula=1&skipDemoSession=1&largeDemo=1&renderer=sigma';

const angular = spawn(
  process.execPath,
  [angularCli, 'serve', '-c', 'development'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  }
);

let angularExited = false;
let browserOpened = false;

angular.on('exit', (code, signal) => {
  angularExited = true;
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 0;
});

angular.on('error', (error) => {
  angularExited = true;
  console.error(`Unable to start Angular: ${error.message}`);
  process.exitCode = 1;
});

function openBrowser(url) {
  let command;
  let args;

  if (process.platform === 'win32') {
    command = 'powershell.exe';
    args = [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process '${url.replace(/'/g, "''")}'`,
    ];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const opener = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  opener.on('error', () => {
    console.log(`Open the Sigma POC at ${url}`);
  });
  opener.unref();
}

function waitForAngular() {
  if (angularExited || browserOpened) {
    return;
  }

  const request = http.get('http://127.0.0.1:4200/', (response) => {
    response.resume();
    browserOpened = true;
    console.log(`Opening Sigma POC: ${demoUrl}`);
    openBrowser(demoUrl);
  });

  request.setTimeout(1000, () => request.destroy());
  request.on('error', () => {
    setTimeout(waitForAngular, 500);
  });
}

waitForAngular();
