import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyNetworkSample, evaluateNetworkSample, type NetworkAdaptationState } from '../lib/mediaNetworkPolicy';

const excellent: NetworkAdaptationState = { tier: 'excellent', candidateTier: null, candidateSamples: 0, healthySamples: 0 };

test('classifies loss, RTT, jitter, and bandwidth into network tiers', () => {
  assert.equal(classifyNetworkSample({ packetsReceivedDelta: 100, packetsLostDelta: 0, rttMs: 80, jitterMs: 5, availableIncomingBitrate: 4_000_000 }).tier, 'excellent');
  assert.equal(classifyNetworkSample({ packetsReceivedDelta: 97, packetsLostDelta: 3 }).tier, 'good');
  assert.equal(classifyNetworkSample({ packetsReceivedDelta: 100, packetsLostDelta: 0, rttMs: 550 }).tier, 'poor');
  assert.equal(classifyNetworkSample({ packetsReceivedDelta: 100, packetsLostDelta: 0, availableIncomingBitrate: 200_000 }).tier, 'critical');
});

test('requires sustained poor samples before degrading', () => {
  const sample = { packetsReceivedDelta: 90, packetsLostDelta: 10 };
  const first = evaluateNetworkSample(excellent, sample);
  assert.equal(first.action, 'none');
  const second = evaluateNetworkSample(first, sample);
  assert.equal(second.action, 'degrade');
  assert.equal(second.tier, 'poor');
});

test('critical conditions require two sustained samples before degrading', () => {
  const first = evaluateNetworkSample(excellent, { packetsReceivedDelta: 80, packetsLostDelta: 20 });
  assert.equal(first.action, 'none');
  assert.equal(first.tier, 'excellent');
  const second = evaluateNetworkSample(first, { packetsReceivedDelta: 80, packetsLostDelta: 20 });
  assert.equal(second.action, 'degrade');
  assert.equal(second.tier, 'critical');
});

test('ignores bandwidth estimates when an interval contains no RTP traffic', () => {
  assert.equal(
    classifyNetworkSample({
      packetsReceivedDelta: 0,
      packetsLostDelta: 0,
      availableIncomingBitrate: 100_000,
    }).tier,
    'excellent'
  );
});

test('recovery requires three healthy samples and moves conservatively', () => {
  let state: NetworkAdaptationState = { tier: 'critical', candidateTier: null, candidateSamples: 0, healthySamples: 0 };
  const healthy = { packetsReceivedDelta: 100, packetsLostDelta: 0, rttMs: 50, jitterMs: 2, availableIncomingBitrate: 5_000_000 };
  state = evaluateNetworkSample(state, healthy);
  state = evaluateNetworkSample(state, healthy);
  const recovered = evaluateNetworkSample(state, healthy);
  assert.equal(recovered.action, 'recover');
  assert.equal(recovered.tier, 'poor');
});
