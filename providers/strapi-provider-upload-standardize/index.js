module.exports = {
  init(providerOptions) {
    const { provider, ...rest } = providerOptions

    // Load the real provider (cloudinary or local)
    // In production, provider is a string like '@strapi/provider-upload-local'
    // In tests, we allow passing a mock provider directly
    let realProvider
    
    if (typeof provider === 'function') {
      // Test mode: provider is a mock function
      realProvider = provider(rest)
    } else {
      // Production mode: provider is a string
      const realProviderModule = require(provider)
      if (typeof realProviderModule.init === 'function') {
        realProvider = realProviderModule.init(rest)
      } else if (typeof realProviderModule.default === 'function') {
        realProvider = realProviderModule.default(rest)
      } else {
        realProvider = realProviderModule(rest)
      }
    }

    return {
      ...realProvider,

      async upload(file) {
        console.log('[UPLOAD] Processing file:', file.name, 'related:', file.related)
        
        // Check if this is a product image
        if (file.related && file.related[0] && file.related[0].ref === 'api::product.product') {
          console.log('[UPLOAD] Product image detected, checking if hero...')
          
          // Check if this is the first image (hero) of the product
          const isHero = await checkIfHeroImage(file)
          console.log('[UPLOAD] Is hero image:', isHero)
          
          if (isHero) {
            console.log('[UPLOAD] Processing hero image...')
            try {
              const processedBuffer = await processImage(file.buffer)
              file.buffer = processedBuffer
              file.size = processedBuffer.length
              // Update mime type since we're converting to webp
              file.mime = 'image/webp'
              if (file.ext) {
                file.ext = '.webp'
              }
              console.log('[UPLOAD] Hero image processed successfully')
            } catch (error) {
              console.error('[UPLOAD] Error processing hero image:', error.message)
            }
          }
        } else {
          console.log('[UPLOAD] Not a product image, skipping processing')
        }

        // Upload to real provider
        return realProvider.upload(file)
      },

      async delete(file) {
        return realProvider.delete(file)
      },

      async getSignedUrl(file) {
        return realProvider.getSignedUrl(file)
      },
    }
  },
}

async function checkIfHeroImage(file) {
  // In Strapi, the first image uploaded is considered the hero
  // We can check if there are existing images for this product
  const productId = file.related[0].refId
  const strapi = global.strapi
  
  if (strapi) {
    try {
      const product = await strapi.documents('api::product.product').findOne({
        documentId: productId,
        populate: ['image'],
      })
      
      // If no images exist, this is the first one (hero)
      return !product || !product.image || product.image.length === 0
    } catch (error) {
      // If we can't check, assume it's not a hero to avoid processing errors
      return false
    }
  }
  
  return false
}

async function processImage(buffer) {
  const sharp = require('sharp')
  const { removeBackground } = require('@imgly/background-removal-node')
  
  // Convert to PNG
  const pngBuffer = await sharp(buffer).png().toBuffer()
  
  // Remove background
  const blob = new Blob([pngBuffer], { type: 'image/png' })
  const processedBlob = await removeBackground(blob, {
    model: 'medium',
    output: { format: 'image/png', quality: 1.0 },
  })
  
  const transparentBuffer = Buffer.from(await processedBlob.arrayBuffer())
  
  // Detect bounding box and extract content
  const { data, info } = await sharp(transparentBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const ALPHA_THRESHOLD = 30

  let top = height
  let bottom = 0
  let left = width
  let right = 0

  // Scan pixels to find non-transparent area
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alphaIndex = (y * width + x) * 4 + 3
      if (data[alphaIndex] > ALPHA_THRESHOLD) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }

  // Extract bounding box
  let contentBuffer = transparentBuffer
  if (top !== height && bottom !== 0 && left !== width && right !== 0) {
    const bboxWidth = right - left + 1
    const bboxHeight = bottom - top + 1
    
    if (bboxWidth > 0 && bboxHeight > 0 && bboxWidth <= width && bboxHeight <= height) {
      contentBuffer = await sharp(transparentBuffer)
        .extract({
          left,
          top,
          width: bboxWidth,
          height: bboxHeight,
        })
        .png()
        .toBuffer()
    }
  }

  // Create 800x800 canvas with 15% padding (680px content)
  const contentSize = 680
  const resized = await sharp(contentBuffer)
    .resize(contentSize, contentSize, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer()
  
  const meta = await sharp(resized).metadata()
  const offsetX = Math.round((800 - meta.width) / 2)
  const offsetY = Math.round((800 - meta.height) / 2)
  
  const canvas = await sharp({
    create: {
      width: 800,
      height: 800,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: offsetX, top: offsetY }])
    .webp({ quality: 85 })
    .toBuffer()
  
  return canvas
}
