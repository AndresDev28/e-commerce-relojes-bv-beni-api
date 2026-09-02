/**
 * [bug-images-400-backend] Pure URL normalization helper for plugin::upload.file.
 *
 * Decisions encoded (locked):
 *   A. Single helper used by afterCreate + afterUpdate + afterFind hooks.
 *   D. trim trailing '/' from base; ensure path starts with '/'; single '/' between;
 *      protocol-relative '//cdn' rewritten defensively to 'https://cdn'.
 *   E. Cloudinary absolute URLs pass through untouched (startsWith('http') guard).
 *   B. STRAPI_PUBLIC_URL unset degrades to fallbackBaseUrl; onWarn fires once;
 *      never throws, never fails-fast.
 *
 * Pure: no Strapi import, no I/O, no global state. Idempotent by construction.
 */

/**
 * Normalize a `plugin::upload.file.url` value to an absolute URL.
 *
 * @param url   The raw URL stored on the upload.file row (may be null/undefined/empty).
 * @param ctx   Resolution context — see fields below.
 * @returns     The rewritten absolute URL, or the original passthrough value.
 */
export function normalizeAssetUrl(
  url: string | null | undefined,
  ctx: {
    publicUrl: string | null | undefined
    fallbackBaseUrl: string | null | undefined
    onWarn?: () => void
  },
): string | null | undefined {
  // R6 failure-mode rows: null / undefined / empty pass through untouched.
  if (url === null || url === undefined || url === '') {
    return url
  }

  // R4 + decision E: Cloudinary and any other absolute http(s) URL pass through.
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // Decision D refinement: protocol-relative URLs get an https: prefix.
  if (url.startsWith('//')) {
    return `https:${url}`
  }

  // Decision B: pick STRAPI_PUBLIC_URL, falling back to server.url.
  // WARN-once fires whenever we have to degrade (STRAPI_PUBLIC_URL unset) —
  // even if fallbackBaseUrl is usable, the operator should know.
  const hasPublicUrl =
    typeof ctx.publicUrl === 'string' && ctx.publicUrl.trim() !== ''
  const rawBase = hasPublicUrl ? ctx.publicUrl : ctx.fallbackBaseUrl
  const base = typeof rawBase === 'string' ? rawBase.trim() : ''

  if (!hasPublicUrl) {
    ctx.onWarn?.()
  }

  // Both bases empty/missing → degrade gracefully (never fail-fast).
  if (base === '') {
    return url
  }

  // Decision D: trim trailing '/' from base, ensure leading '/' on path,
  // single '/' between — no '//' artifacts, no missing separators.
  const trimmedBase = base.replace(/\/+$/, '')
  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  return `${trimmedBase}${normalizedPath}`
}