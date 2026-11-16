import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, records } from './csv.mjs';

test('quoted cells keep delimiters, quotes and line breaks; BOM and blank lines are dropped', () => {
  assert.deepEqual(parseCsv('﻿a;b\r\n"x;1";"say ""hi""\nthere"\n\n'), [
    ['a', 'b'],
    ['x;1', 'say "hi"\nthere'],
  ]);
});

test('a repeated header keeps its first column', () => {
  assert.deepEqual(records('k; m ;m\n1;first;second\n'), [{ k: '1', m: 'first' }]);
});
