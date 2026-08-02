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

/**
 * Where a picture the API stored actually lives.
 *
 * Object storage hands back an absolute URL and it is used as-is. When the
 * API serves the bytes itself the URL is a path — and a path in an <img>
 * resolves against the *site*, not the API. On jessmove.com that meant the
 * browser asking www for /api/accounts/media/..., getting a 404, and the
 * member seeing a profile picture that uploaded successfully and never
 * appeared. Resolve it against the API, always.
 */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url;
  const base = apiBase().replace(/\/api$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
