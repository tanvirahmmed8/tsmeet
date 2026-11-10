interface MicrophoneParticipant {
  setMicrophoneEnabled(enabled: boolean): Promise<unknown>;
}

// Permission prompts and SDK publication can finish after host mute or leave.
// Re-check authority after the await, and undo a now-disallowed unmute.
export async function setMicrophoneEnabledSafely(
  participant: MicrophoneParticipant, enabled: boolean, isCurrentAndAllowed: () => boolean,
) {
  await participant.setMicrophoneEnabled(enabled);
  if (!isCurrentAndAllowed()) {
    if (enabled) await participant.setMicrophoneEnabled(false);
    return false;
  }
  return true;
}
