// Tiny structured logger with ANSI colors and stage tagging.
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', gold: '\x1b[38;5;178m', cyan: '\x1b[36m',
};

const ts = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg, ...a) => console.log(`${C.dim}${ts()}${C.reset} ${msg}`, ...a),
  ok: (msg, ...a) => console.log(`${C.dim}${ts()}${C.reset} ${C.green}✓${C.reset} ${msg}`, ...a),
  warn: (msg, ...a) => console.warn(`${C.dim}${ts()}${C.reset} ${C.yellow}⚠${C.reset} ${msg}`, ...a),
  error: (msg, ...a) => console.error(`${C.dim}${ts()}${C.reset} ${C.red}✗${C.reset} ${msg}`, ...a),
  stage: (name, msg = '') =>
    console.log(`${C.dim}${ts()}${C.reset} ${C.gold}▸ ${name}${C.reset} ${C.dim}${msg}${C.reset}`),
  /** Logged when an integration falls back to mock output. */
  mock: (what) => console.log(`${C.dim}${ts()}${C.reset} ${C.cyan}◌ demo${C.reset} ${what} ${C.dim}(no key — using mock)${C.reset}`),
};
