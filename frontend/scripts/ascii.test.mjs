import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/ascii.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { ART_OPTIONS, FORMULAS, asciiFrame } = context.exports;
for (const { id } of ART_OPTIONS) {
  test(`${id}: deterministic bounded frames with mathematical accents`, () => {
    const frame = asciiFrame(id, 0);
    assert.deepEqual(frame, asciiFrame(id, 0));
    for (const layer of [frame.base]) {
      const rows = layer.split('\n');
      assert.equal(rows.length, 68);
      assert.ok(rows.every(row => row.length === 144));
    }
    assert.ok(frame.base.trim().length > 100);
    assert.equal(frame.notation.length, 4);
    assert.deepEqual(frame.notation.map(note => note.text), FORMULAS);
    frame.notation.forEach((note, index) => {
      assert.ok(note.x >= 24 && note.x <= 62);
      assert.ok(note.y >= 13 && note.y <= 80);
      if (index) assert.ok(note.y - frame.notation[index - 1].y >= 9, 'complete expressions never overlap');
    });
    assert.notEqual(frame.base, asciiFrame(id, 2).base);
    assert.notDeepEqual(frame.notation, asciiFrame(id, 2).notation, 'complete notation moves with the surface');
    assert.notEqual(frame.base, asciiFrame(id, 0, 144, 68, { x: 1, y: 0 }).base, 'pointer steers the form');
  });
}
