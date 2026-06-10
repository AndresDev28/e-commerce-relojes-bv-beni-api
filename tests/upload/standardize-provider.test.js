import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock sharp and background removal
vi.mock('sharp', () => {
  return {
    default: vi.fn(() => ({
      metadata: vi.fn().mockResolvedValue({ width: 800, height: 800 }),
      resize: vi.fn().mockReturnThis(),
      extract: vi.fn().mockReturnThis(),
      trim: vi.fn().mockReturnThis(),
      ensureAlpha: vi.fn().mockReturnThis(),
      raw: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      webp: vi.fn().mockReturnThis(),
      composite: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image')),
    })),
  }
})

vi.mock('@imgly/background-removal-node', () => ({
  removeBackground: vi.fn(async (blob) => {
    return new Blob([Buffer.from('processed')], { type: 'image/png' })
  }),
}))

// Import the provider after mocks
const provider = require('../../providers/strapi-provider-upload-standardize')

describe('Standardize Upload Provider', () => {
  let mockProvider
  let mockRealProvider

  beforeEach(() => {
    vi.clearAllMocks()
    mockRealProvider = {
      upload: vi.fn(async (file) => ({ url: '/uploads/' + file.name })),
      delete: vi.fn(async () => {}),
      getSignedUrl: vi.fn(async () => ({ url: 'signed-url' })),
    }
  })

  it('should initialize with a mock provider', () => {
    const mockProviderFn = vi.fn(() => mockRealProvider)
    
    mockProvider = provider.init({
      provider: mockProviderFn,
      sizeLimit: 10000000,
    })

    expect(mockProvider).toHaveProperty('upload')
    expect(mockProvider).toHaveProperty('delete')
    expect(mockProvider).toHaveProperty('getSignedUrl')
    expect(mockProviderFn).toHaveBeenCalledWith({ sizeLimit: 10000000 })
  })

  it('should process product hero images', async () => {
    const mockProviderFn = vi.fn(() => mockRealProvider)
    
    mockProvider = provider.init({
      provider: mockProviderFn,
      sizeLimit: 10000000,
    })

    const file = {
      name: 'test.webp',
      buffer: Buffer.from('test-image'),
      size: 1000,
      mime: 'image/webp',
      ext: '.webp',
      related: [{ ref: 'api::product.product', refId: 1 }],
    }

    const result = await mockProvider.upload(file)
    expect(result).toBeDefined()
    expect(mockRealProvider.upload).toHaveBeenCalled()
  })

  it('should pass through non-product images', async () => {
    const mockProviderFn = vi.fn(() => mockRealProvider)
    
    mockProvider = provider.init({
      provider: mockProviderFn,
      sizeLimit: 10000000,
    })

    const file = {
      name: 'test.webp',
      buffer: Buffer.from('test-image'),
      size: 1000,
      mime: 'image/webp',
      ext: '.webp',
      related: [{ ref: 'api::category.category', refId: 1 }],
    }

    const result = await mockProvider.upload(file)
    expect(result).toBeDefined()
    expect(mockRealProvider.upload).toHaveBeenCalledWith(file)
  })

  it('should pass through when no related entity', async () => {
    const mockProviderFn = vi.fn(() => mockRealProvider)
    
    mockProvider = provider.init({
      provider: mockProviderFn,
      sizeLimit: 10000000,
    })

    const file = {
      name: 'test.webp',
      buffer: Buffer.from('test-image'),
      size: 1000,
      mime: 'image/webp',
      ext: '.webp',
    }

    const result = await mockProvider.upload(file)
    expect(result).toBeDefined()
    expect(mockRealProvider.upload).toHaveBeenCalledWith(file)
  })
})
