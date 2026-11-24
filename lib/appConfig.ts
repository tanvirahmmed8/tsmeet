export const DEFAULT_APP_NAME = 'TSMeet';

/** Public build-time branding. Never put secrets in NEXT_PUBLIC_* variables. */
export const APP_NAME =
  (process.env.NEXT_PUBLIC_APP_NAME || DEFAULT_APP_NAME).trim() || DEFAULT_APP_NAME;

export const APP_TAGLINE = 'Secure Open-Source Video Meetings';
