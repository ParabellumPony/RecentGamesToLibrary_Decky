import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

// Compile to a project-local temporary directory; no global TS loader/cache.
const target = resolve('.cache/test');
mkdirSync(target, { recursive: true });
for (const file of readdirSync('src').filter((name) => /\.tsx?$/.test(name))) {
  const { outputText } = ts.transpileModule(readFileSync(`src/${file}`, 'utf8'), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  writeFileSync(resolve(target, file.replace(/\.tsx?$/, '.js')), outputText);
}
const tests = readdirSync('tests').filter((name) => name.endsWith('.test.mjs'));
const result = spawnSync(process.execPath, ['--test', ...tests.map((name) => `tests/${name}`)], {
  stdio: 'inherit', env: process.env,
});
process.exit(result.status ?? 1);
