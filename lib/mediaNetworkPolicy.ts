export type NetworkTier = 'excellent' | 'good' | 'poor' | 'critical';

export type NetworkSample = {
  packetsReceivedDelta: number;
  packetsLostDelta: number;
  jitterMs?: number | null;
  rttMs?: number | null;
  availableIncomingBitrate?: number | null;
};

export type NetworkAdaptationState = {
  tier: NetworkTier;
  candidateTier: NetworkTier | null;
  candidateSamples: number;
  healthySamples: number;
};

export type NetworkAdaptationDecision = NetworkAdaptationState & {
  action: 'none' | 'degrade' | 'recover';
  lossRatio: number | null;
};

const rank: Record<NetworkTier, number> = { excellent: 0, good: 1, poor: 2, critical: 3 };

export function classifyNetworkSample(sample: NetworkSample): { tier: NetworkTier; lossRatio: number | null } {
  const received = Math.max(0, sample.packetsReceivedDelta);
  const lost = Math.max(0, sample.packetsLostDelta);
  const total = received + lost;
  const lossRatio = total >= 20 ? lost / total : null;
  const jitter = sample.jitterMs ?? 0;
  const rtt = sample.rttMs ?? 0;
  // Browser bandwidth estimates are noisy while a track is starting or idle.
  // Only trust them when this interval also contains enough RTP traffic.
  const bitrate =
    total >= 20
      ? sample.availableIncomingBitrate ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;

  if ((lossRatio !== null && lossRatio >= 0.15) || jitter >= 120 || rtt >= 800 || bitrate < 250_000) {
    return { tier: 'critical', lossRatio };
  }
  if ((lossRatio !== null && lossRatio >= 0.08) || jitter >= 70 || rtt >= 500 || bitrate < 600_000) {
    return { tier: 'poor', lossRatio };
  }
  if ((lossRatio !== null && lossRatio >= 0.03) || jitter >= 35 || rtt >= 300 || bitrate < 1_200_000) {
    return { tier: 'good', lossRatio };
  }
  return { tier: 'excellent', lossRatio };
}

export function evaluateNetworkSample(
  state: NetworkAdaptationState,
  sample: NetworkSample
): NetworkAdaptationDecision {
  const classified = classifyNetworkSample(sample);
  if (rank[classified.tier] > rank[state.tier]) {
    const sameCandidate = state.candidateTier === classified.tier;
    const candidateSamples = sameCandidate ? state.candidateSamples + 1 : 1;
    // Do not collapse video after one transient WebRTC statistics interval.
    const required = 2;
    if (candidateSamples >= required) {
      return { tier: classified.tier, candidateTier: null, candidateSamples: 0, healthySamples: 0, action: 'degrade', lossRatio: classified.lossRatio };
    }
    return { ...state, candidateTier: classified.tier, candidateSamples, healthySamples: 0, action: 'none', lossRatio: classified.lossRatio };
  }

  if (rank[classified.tier] < rank[state.tier]) {
    const healthySamples = state.healthySamples + 1;
    if (healthySamples >= 3) {
      const nextTier = rank[state.tier] - 1 <= rank[classified.tier]
        ? classified.tier
        : (Object.keys(rank) as NetworkTier[]).find((tier) => rank[tier] === rank[state.tier] - 1) || classified.tier;
      return { tier: nextTier, candidateTier: null, candidateSamples: 0, healthySamples: 0, action: 'recover', lossRatio: classified.lossRatio };
    }
    return { ...state, candidateTier: null, candidateSamples: 0, healthySamples, action: 'none', lossRatio: classified.lossRatio };
  }

  return { ...state, candidateTier: null, candidateSamples: 0, healthySamples: 0, action: 'none', lossRatio: classified.lossRatio };
}

// Backward-compatible packet-loss-only adapter for existing integrations.
export function evaluateInboundNetworkSample(
  state: { poorSamples: number; healthySamples: number; automaticLowData: boolean },
  packetsReceivedDelta: number,
  packetsLostDelta: number
) {
  const modern = evaluateNetworkSample(
    {
      tier: state.automaticLowData ? 'poor' : 'excellent',
      candidateTier: state.poorSamples > 0 ? 'poor' : null,
      candidateSamples: state.poorSamples,
      healthySamples: state.healthySamples,
    },
    { packetsReceivedDelta, packetsLostDelta }
  );
  return {
    poorSamples: modern.candidateSamples,
    healthySamples: modern.healthySamples,
    automaticLowData: modern.tier === 'poor' || modern.tier === 'critical',
    action: modern.action,
    lossRatio: modern.lossRatio,
  };
}
