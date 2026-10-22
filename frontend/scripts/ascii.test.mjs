import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/ascii.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { ART_OPTIONS, asciiFrame } = context.exports;
for (const { id } of ART_OPTIONS) {
  test(`${id}: deterministic bounded frames with mathematical accents`, () => {
    const frame = asciiFrame(id, 0);
    assert.deepEqual(frame, asciiFrame(id, 0));
    for (const layer of [frame.base, frame.accent]) {
      const rows = layer.split('\n');
      assert.equal(rows.length, 42);
      assert.ok(rows.every(row => row.length === 96));
    }
    assert.ok(frame.base.trim().length > 100);
    assert.match(frame.accent, /\\sum/);
    assert.notEqual(frame.base, asciiFrame(id, 2).base);
  });
}
