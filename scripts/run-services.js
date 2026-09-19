import { spawn } from 'node:child_process';

const production = process.argv.includes('--production');
const node = process.execPath;
const commands = [
  [node, production ? ['server/src/server.js'] : ['--watch', 'server/src/server.js']],
  [node, [
    'node_modules/vite/bin/vite.js',
    ...(production ? ['preview'] : []),
    'client',
    '--config',
    'client/vite.config.js',
  ]],
];

const children = commands.map(([command, args], index) => spawn(command, args, {
  stdio: [index === 1 ? 'pipe' : 'ignore', 'inherit', 'inherit'],
  windowsHide: true,
}));

let stopping = false;
let exitCode = 0;
let remaining = children.length;
const interactive = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
const previousRawMode = interactive ? process.stdin.isRaw : false;

function restoreInput() {
  if (!interactive) return;
  process.stdin.removeListener('data', handleInput);
  process.stdin.setRawMode(previousRawMode);
  process.stdin.pause();
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  restoreInput();
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function handleInput(chunk) {
  if (chunk.includes(3)) {
    stop(0);
    return;
  }
  const frontend = children[1];
  if (frontend.stdin?.writable) frontend.stdin.write(chunk);
}

if (interactive) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', handleInput);
}

for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', code => {
    remaining -= 1;
    if (!stopping) stop(code ?? 1);
    if (remaining === 0) process.exit(exitCode);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
process.on('exit', restoreInput);
