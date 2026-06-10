/**
 * Product Lifecycle Hooks
 *
 * Procesa automáticamente la primera imagen (hero) de cada producto.
 *
 * IMPORTANTE: El procesamiento de imágenes (background removal) corre en un
 * PROCESO HIJO SEPARADO para evitar el conflicto de memoria nativa entre
 * @imgly/background-removal-node (ONNX) y el sharp interno de Strapi
 * (causa: munmap_chunk(): invalid pointer).
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execFileAsync = promisify(execFile)

export default {
  async afterCreate(event: any) {
    const { result } = event
    await processHeroImage(result)
  },

  async afterUpdate(event: any) {
    const { result } = event
    await processHeroImage(result)
  },
}

async function processHeroImage(product: any) {
  try {
    if (!product.image || product.image.length === 0) {
      return
    }

    const heroImage = product.image[0]

    // Skip if already processed (webp + small size)
    if (heroImage.ext === '.webp' && heroImage.size < 100000) {
      return
    }

    console.log('[LIFECYCLE] Processing hero image for:', product.name)

    // Resolve input path
    let inputPath: string
    let isTemp = false

    if (heroImage.url.startsWith('http')) {
      // External URL (Cloudinary) - download first
      const response = await fetch(heroImage.url)
      const buffer = Buffer.from(await response.arrayBuffer())
      inputPath = path.join('/tmp', `hero-in-${Date.now()}.png`)
      await fs.writeFile(inputPath, buffer)
      isTemp = true
    } else {
      // Local provider
      inputPath = path.join(process.cwd(), 'public', heroImage.url)
    }

    const outputPath = path.join('/tmp', `hero-out-${Date.now()}.webp`)
    const workerScript = path.join(process.cwd(), 'scripts', 'process-single-image.mjs')

    // Run the worker in an ISOLATED child process
    const { stdout } = await execFileAsync('node', [workerScript, inputPath, outputPath], {
      timeout: 60000, // 60s max
    })

    const workerResult = JSON.parse(stdout)
    if (!workerResult.success) {
      throw new Error(workerResult.error || 'Worker failed')
    }

    console.log('[LIFECYCLE] Worker processed image, size:', workerResult.size)

    // Read the processed image
    const processedBuffer = await fs.readFile(outputPath)

    // Write back to the original location (for local provider)
    if (!heroImage.url.startsWith('http')) {
      const targetPath = path.join(process.cwd(), 'public', heroImage.url)
      await fs.writeFile(targetPath, processedBuffer)
    }

    // Update file metadata in database
    const strapi = (global as any).strapi
    if (strapi) {
      await strapi.db.query('plugin::upload.file').update({
        where: { id: heroImage.id },
        data: {
          size: processedBuffer.length / 1024, // Strapi stores size in KB
          mime: 'image/webp',
        },
      })
    }

    // Cleanup temp files
    await fs.unlink(outputPath).catch(() => {})
    if (isTemp) {
      await fs.unlink(inputPath).catch(() => {})
    }

    console.log('[LIFECYCLE] Hero image processed for:', product.name)
  } catch (error: any) {
    console.error('[LIFECYCLE] Error processing image:', error.message)
  }
}
