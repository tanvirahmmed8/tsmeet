interface FullscreenRoot {
  requestFullscreen?: () => Promise<void>;
}

interface FullscreenDocument {
  fullscreenElement: unknown;
  exitFullscreen: () => Promise<void>;
}

export async function toggleMeetingFullscreen(root: FullscreenRoot | null, document: FullscreenDocument) {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  if (!root?.requestFullscreen) throw new Error('Fullscreen is unavailable in this browser.');
  await root.requestFullscreen();
}
