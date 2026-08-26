// tsc emits .js into dist/cjs with CommonJS semantics, but package.json has
// "type": "module", so Node would read those .js files as ESM. Rename to .cjs
// and rewrite the internal require() paths to match.
import { readdirSync, renameSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) renameSync(p, p.slice(0, -3) + '.cjs');
  }
}
function rewrite(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) rewrite(p);
    else if (p.endsWith('.cjs')) {
      const src = readFileSync(p, 'utf8').replace(
        /require\((["'])(\.[^"']*?)(\.js)?\1\)/g,
        (_m, q, path) => `require(${q}${path}.cjs${q})`,
      );
      writeFileSync(p, src);
    }
  }
}
walk('dist/cjs');
rewrite('dist/cjs');
console.log('cjs fixup done');
