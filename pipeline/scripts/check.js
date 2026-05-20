// Syntax-checks every .js file under pipeline/src via `node --check`.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

let failed = 0;
for (const file of walk(SRC)) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`✓ ${file.replace(SRC, 'src')}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${file.replace(SRC, 'src')}\n${err.stderr?.toString() || err.message}`);
  }
}
console.log(failed ? `\n${failed} file(s) failed syntax check.` : '\nAll files passed syntax check.');
process.exit(failed ? 1 : 0);
