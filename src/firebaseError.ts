/**
 * Secure Firebase error handling utility.
 *
 * Rules:
 *  - Raw Firebase error objects/codes are ONLY ever sent to console.error (internal debugging).
 *  - The UI only ever receives a clean, generic, user-friendly string.
 *  - No Firebase internals (codes, paths, project info) are ever rendered.
 */

/** Log the raw technical error internally. Never call this to produce UI text. */
export const logError = (context: string, err: unknown): void => {
  // In production you could forward this to a monitoring service (Sentry, etc.)
  console.error(`[${context}]`, err);
};

/**
 * Map a raw Firebase error to a safe, user-friendly message.
 * Falls back to a fully generic message for anything unrecognized.
 */
export const friendlyMessage = (err: unknown): string => {
  const code = (err as { code?: string })?.code ?? '';

  // --- Firebase Auth errors (normalized to friendly text, never shown raw) ---
  const authMessages: Record<string, string> = {
    'auth/invalid-credential': 'Incorrect email or password. Please try again.',
    'auth/wrong-password': 'Incorrect email or password. Please try again.',
    'auth/user-not-found': 'Incorrect email or password. Please try again.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
    'auth/weak-password': 'Please choose a stronger password (at least 6 characters).',
    'auth/network-request-failed': 'Network problem. Check your connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
  };

  if (authMessages[code]) return authMessages[code];

  // --- Realtime Database errors ---
  if (code === 'PERMISSION_DENIED') {
    return 'You do not have permission to perform this action. Please sign in again.';
  }
  if (code === 'NETWORK_ERROR' || code === 'network-request-failed') {
    return 'Network problem. Check your connection and try again.';
  }
  if (code === 'DISCONNECTED') {
    return 'Connection lost. Please try again.';
  }

  // --- Generic fallback: never leak internals ---
  return 'An unexpected error occurred. Please try again.';
};