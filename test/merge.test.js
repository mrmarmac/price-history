import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPackageMap } from '../js/repo.js';

let n = 0;
const fakeUuid = () => `new-${++n}`;

test('source package matching a target package by size+unit is reused', () => {
  n = 0;
  const target = [{ id: 't1', productId: 'T', size: 1, unit: 'l' }];
  const src = [{ id: 's1', productId: 'S', size: 1, unit: 'l' }];
  const { map, newPkgs } = planPackageMap('T', target, src, fakeUuid);
  assert.equal(map.get('s1'), 't1');   // reused, not recreated
  assert.deepEqual(newPkgs, []);
});

test('source package with a new size is recreated under the target', () => {
  n = 0;
  const target = [{ id: 't1', productId: 'T', size: 1, unit: 'l' }];
  const src = [{ id: 's1', productId: 'S', size: 2, unit: 'l' }];
  const { map, newPkgs } = planPackageMap('T', target, src, fakeUuid);
  assert.equal(map.get('s1'), 'new-1');
  assert.deepEqual(newPkgs, [{ id: 'new-1', productId: 'T', size: 2, unit: 'l' }]);
});

test('two source packages of the same new size collapse to one target package', () => {
  n = 0;
  const target = [];
  const src = [
    { id: 's1', productId: 'S', size: 500, unit: 'g' },
    { id: 's2', productId: 'S', size: 500, unit: 'g' },
  ];
  const { map, newPkgs } = planPackageMap('T', target, src, fakeUuid);
  assert.equal(map.get('s1'), 'new-1');
  assert.equal(map.get('s2'), 'new-1');  // second reuses the first-created package
  assert.equal(newPkgs.length, 1);
});
