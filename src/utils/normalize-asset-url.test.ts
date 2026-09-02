/**
 * [bug-images-400-backend] Unit tests for normalizeAssetUrl.
 *
 * RED-phase strict TDD. Tests must FAIL at runtime because the helper
 * does not exist yet. All 8 cases trace to a user-locked decision:
 *   - A: events afterCreate + afterUpdate + afterFind (helper is the single source of truth)
 *   - D: trim trailing '/', ensure path starts with '/', single '/' between; //cdn -> https:
 *   - E: Cloudinary absolute URLs (https://...) pass through untouched
 *   - B: STRAPI_PUBLIC_URL unset degrades to fallback + WARN-once
 *   - R7: join semantics (single '/' between base and path)
 */
import { describe, it, expect, vi } from 'vitest'
import { normalizeAssetUrl } from './normalize-asset-url'

describe('[bug-images-400] normalizeAssetUrl — pure helper', () => {
  it('passes through http:// urls unchanged (R4 / decision E)', () => {
    expect(
      normalizeAssetUrl('http://res.cloudinary.com/demo/image.jpg', {
        publicUrl: 'https://api.example.com',
        fallbackBaseUrl: null,
      }),
    ).toBe('http://res.cloudinary.com/demo/image.jpg')
  })

  it('passes through https:// urls unchanged (R4 / decision E)', () => {
    expect(
      normalizeAssetUrl('https://res.cloudinary.com/demo/image.jpg', {
        publicUrl: 'https://api.example.com',
        fallbackBaseUrl: null,
      }),
    ).toBe('https://res.cloudinary.com/demo/image.jpg')
  })

  it('rewrites absolute-path url "/uploads/foo.png" using publicUrl base (R5)', () => {
    expect(
      normalizeAssetUrl('/uploads/foo.png', {
        publicUrl: 'https://api.example.com',
        fallbackBaseUrl: null,
      }),
    ).toBe('https://api.example.com/uploads/foo.png')
  })

  it('rewrites path without leading slash by prepending one (decision D)', () => {
    expect(
      normalizeAssetUrl('uploads/foo.png', {
        publicUrl: 'https://api.example.com',
        fallbackBaseUrl: null,
      }),
    ).toBe('https://api.example.com/uploads/foo.png')
  })

  it('collapses trailing-"/" base and missing-leading-"/" path into a single "/" (R7)', () => {
    expect(
      normalizeAssetUrl('/uploads/foo.png', {
        publicUrl: 'https://api.example.com/',
        fallbackBaseUrl: null,
      }),
    ).toBe('https://api.example.com/uploads/foo.png')
  })

  it('passes through null / undefined / empty url without crashing (R6 failure modes)', () => {
    expect(
      normalizeAssetUrl(null, { publicUrl: 'https://api.example.com', fallbackBaseUrl: null }),
    ).toBeNull()
    expect(
      normalizeAssetUrl(undefined, { publicUrl: 'https://api.example.com', fallbackBaseUrl: null }),
    ).toBeUndefined()
    expect(
      normalizeAssetUrl('', { publicUrl: 'https://api.example.com', fallbackBaseUrl: null }),
    ).toBe('')
  })

  it('defensively rewrites protocol-relative "//cdn" by prefixing "https:" (decision D refinement)', () => {
    expect(
      normalizeAssetUrl('//cdn.example.com/x.jpg', {
        publicUrl: 'https://api.example.com',
        fallbackBaseUrl: null,
      }),
    ).toBe('https://cdn.example.com/x.jpg')
  })

  it('falls back to fallbackBaseUrl when publicUrl is unset and warns once (decision B / R6)', () => {
    const onWarn = vi.fn()
    const result = normalizeAssetUrl('/uploads/foo.png', {
      publicUrl: null,
      fallbackBaseUrl: 'https://fallback.example.com',
      onWarn,
    })
    expect(result).toBe('https://fallback.example.com/uploads/foo.png')
    expect(onWarn).toHaveBeenCalledTimes(1)
  })
})