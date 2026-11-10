export interface SignalingMember {
  socketId: string;
  userId: string;
  userData?: { name?: string };
}

export interface MediaMember {
  identity: string;
  name?: string;
}

// Admission/presence must remain visible even when media permissions fail or
// the SFU has not connected yet. Media-only arrivals fill the signaling gap.
export function mergeMeetingParticipants<T extends MediaMember>(
  signaling: SignalingMember[], media: T[], selfUserId: string, hasSignalingSnapshot = false
) {
  const roster = new Map<string, { peerId: string; userId: string; name: string; media?: T }>();
  for (const member of signaling) {
    const userId = String(member.userId);
    if (userId === selfUserId) continue;
    roster.set(userId, { peerId: member.socketId, userId, name: member.userData?.name || 'Guest' });
  }
  for (const participant of media) {
    // Hidden Egress/recorder identities are not meeting attendees.
    if (!participant.identity.startsWith('user:')) continue;
    const userId = participant.identity.slice(5);
    if (userId === selfUserId) continue;
    const member = roster.get(userId);
    // After admission/presence is known, stale SFU tracks must not resurrect
    // someone who has left or been removed from the server's attendee list.
    if (hasSignalingSnapshot && !member) continue;
    roster.set(userId, {
      peerId: member?.peerId || participant.identity, userId,
      name: member?.name && member.name !== 'Guest' ? member.name : participant.name || member?.name || 'Guest',
      media: participant,
    });
  }
  return Array.from(roster.values());
}
