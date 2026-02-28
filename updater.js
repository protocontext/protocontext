#!/usr/bin/env node
/**
 * ProtoContext Updater Service — runs on port 3999
 *
 * This replaces running `npm start` manually. It:
 *  1. Starts the Next.js production server on port 3000 automatically
 *  2. Exposes GET /status and POST /update so the dashboard can trigger
 *     git pull + npm run build + server restart with a single button click
 *
 * Usage:
 *   node updater.js
 */

const http   = require('http');
const { spawn, execSync } = require('child_process');
const path   = require('path');

const UPDATER_PORT = 3999;
const NEXT_PORT    = 3000;
const ROOT         = __dirname;
const WEB_DIR      = path.join(ROOT, 'web');
const NEXT_BIN     = path.join(WEB_DIR, '.next', 'standalone', 'server.js');

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  status : 'idle',   // idle | pulling | building | restarting | error
  commit : '',
  log    : [],
};
let nextProc = null;

// ── Helpers ────────────────────────────────────────────────────────────────
function addLog(raw) {
  const lines = raw.toString().split('\n').map(l => l.trim()).filter(Boolean);
  lines.forEach(line => {
    console.log('[updater]', line);
    state.log.push(line);
  });
  if (state.log.length > 300) state.log = state.log.slice(-300);
}

function getCommit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); }
  catch { return 'unknown'; }
}

function killPort(port) {
  try { execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null; true`, { shell: true }); }
  catch { /* ignore */ }
}

// ── Next.js lifecycle ──────────────────────────────────────────────────────
function startNext() {
  if (nextProc) { nextProc.kill(); nextProc = null; }
  killPort(NEXT_PORT);

  const fs = require('fs');
  if (!fs.existsSync(NEXT_BIN)) {
    addLog(`Next.js build not found at ${NEXT_BIN} — run an update first.`);
    return;
  }

  setTimeout(() => {
    addLog(`Starting Next.js on :${NEXT_PORT} ...`);
    nextProc = spawn('node', [NEXT_BIN], {
      cwd : WEB_DIR,
      env : { ...process.env, PORT: String(NEXT_PORT), HOSTNAME: '0.0.0.0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    nextProc.stdout.on('data', d => addLog(d));
    nextProc.stderr.on('data', d => addLog(d));
    nextProc.on('exit', code => {
      addLog(`Next.js exited (code ${code})`);
      nextProc = null;
    });
  }, 500);
}

// ── Update flow ────────────────────────────────────────────────────────────
function runUpdate() {
  addLog('=== Update started ===');
  state.status = 'pulling';

  const pull = spawn('git', ['pull'], { cwd: ROOT });
  pull.stdout.on('data', d => addLog(d));
  pull.stderr.on('data', d => addLog(d));
  pull.on('close', code => {
    if (code !== 0) { addLog(`git pull failed (exit ${code})`); state.status = 'error'; return; }

    addLog('git pull OK — building...');
    state.status = 'building';

    const build = spawn('npm', ['run', 'build'], { cwd: WEB_DIR });
    build.stdout.on('data', d => addLog(d));
    build.stderr.on('data', d => addLog(d));
    build.on('close', code => {
      if (code !== 0) { addLog(`Build failed (exit ${code})`); state.status = 'error'; return; }

      addLog('Build OK — restarting Next.js...');
      state.status = 'restarting';
      startNext();

      // Give Next.js ~4 s to boot, then mark idle
      setTimeout(() => {
        state.status = 'idle';
        state.commit = getCommit();
        addLog(`=== Update complete — commit ${state.commit} ===`);
      }, 4000);
    });
  });
}

// ── HTTP server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.url === '/status' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: state.status, commit: state.commit, log: state.log.slice(-40) }));
    return;
  }

  if (req.url === '/update' && req.method === 'POST') {
    if (state.status !== 'idle' && state.status !== 'error') {
      res.writeHead(409);
      res.end(JSON.stringify({ error: 'Update already in progress' }));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    runUpdate();
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ── Boot ───────────────────────────────────────────────────────────────────
state.commit = getCommit();
addLog(`ProtoContext Updater v1 — commit ${state.commit}`);
startNext();

server.listen(UPDATER_PORT, () => {
  addLog(`Updater service listening on :${UPDATER_PORT}`);
});

process.on('SIGTERM', () => { if (nextProc) nextProc.kill(); process.exit(0); });
process.on('SIGINT',  () => { if (nextProc) nextProc.kill(); process.exit(0); });
