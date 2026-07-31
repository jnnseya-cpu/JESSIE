/**
 * Where the API lives, resolved at runtime in the browser.
 *
 * Order: an explicit NEXT_PUBLIC_API_BASE_URL wins; otherwise any page
 * served from *.jessmove.com talks to https://api.jessmove.com/api; and
 * local development falls back to localhost. Runtime resolution means
 * the deployed site needs no build-time variable to find its own API —
 * the bug this file replaces was three components quietly defaulting to
 * localhost in production.
 */
export function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('jessmove.com')) {
    return 'https://api.jessmove.com/api';
  }
  return 'http://localhost:4000/api';
}
