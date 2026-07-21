import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRecordingStorageCapacity,
  StorageQuotaExceededError,
} from '../services/objectStorage';

test('recording is allowed while storage usage is below quota', () => {
  assert.deepEqual(assertRecordingStorageCapacity(999, 1000), {
    usedBytes: 999,
    limitBytes: 1000,
  });
});

test('a completely full recording quota is rejected', () => {
  assert.throws(
    () => assertRecordingStorageCapacity(1000, 1000),
    StorageQuotaExceededError
  );
});

test('usage above quota is rejected and invalid quota configuration fails closed', () => {
  assert.throws(
    () => assertRecordingStorageCapacity(1001, 1000),
    StorageQuotaExceededError
  );
  assert.throws(
    () => assertRecordingStorageCapacity(0, Number.NaN),
    /must be a non-negative number/
  );
});
