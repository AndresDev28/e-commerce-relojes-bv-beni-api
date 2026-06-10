/**
 * Image Standardizer Middleware
 * 
 * Intercepta requests de upload para procesar automáticamente
 * las imágenes hero de productos.
 */

export default (config: any, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: any) => {
    // Solo interceptar POST /upload
    if (ctx.method === 'POST' && ctx.path === '/upload') {
      console.log('[STANDARDIZER] Interceptando upload...')
      
      // Procesar la imagen antes de que llegue al upload
      await next()
      
      // Después del upload, procesar la imagen si es necesario
      if (ctx.body && ctx.body[0]) {
        const file = ctx.body[0]
        console.log('[STANDARDIZER] Archivo subido:', file.name, 'ID:', file.id)
        
        // Verificar si es imagen de producto
        if (file.related && file.related.length > 0) {
          const related = file.related[0]
          console.log('[STANDARDIZER] Related:', related.ref, related.refId)
          
          if (related.ref === 'api::product.product') {
            // Es producto, procesar como hero
            console.log('[STANDARDIZER] Procesando imagen de producto...')
            await processHeroImage(file, strapi)
          }
        }
      }
    } else {
      await next()
    }
  }
}

async function processHeroImage(file: any, strapi: any) {
  try {
    const sharp = require('sharp')
    const { removeBackground } = require('@imgly/background-removal-node')
    const fs = require('fs').promises
    const path = require('path')
    
    // Para local provider, la imagen está en public/uploads
    const localPath = path.join(strapi.dirs.static.public, file.url)
    console.log('[STANDARDIZER] Leyendo imagen desde:', localPath)
    
    const buffer = await fs.readFile(localPath)
    console.log('[STANDARDIZER] Imagen leída, tamaño:', buffer.length)
    
    // Convertir a PNG
    const pngBuffer = await sharp(buffer).png().toBuffer()
    console.log('[STANDARDIZER] Convertida a PNG')
    
    // Remover fondo
    const blob = new Blob([pngBuffer], { type: 'image/png' })
    const processedBlob = await removeBackground(blob, {
      model: 'medium',
      output: { format: 'image/png', quality: 1.0 },
    })
    
    const transparentBuffer = Buffer.from(await processedBlob.arrayBuffer())
    console.log('[STANDARDIZER] Fondo removido')
    
    // Crear canvas 800x800
    const contentSize = 680
    const resized = await sharp(transparentBuffer)
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
    
    console.log('[STANDARDIZER] Canvas creado')
    
    // Guardar la imagen procesada
    await fs.writeFile(localPath, canvas)
    console.log('[STANDARDIZER] Imagen procesada guardada')
    
    // Actualizar metadata en la base de datos
    const fileService = strapi.plugins.upload.services.file
    await fileService.update(file.id, {
      ...file,
      size: canvas.length,
      ext: '.webp',
      mime: 'image/webp',
    })
    
    console.log('[STANDARDIZER] Metadata actualizada')
    
  } catch (error: any) {
    console.error('[STANDARDIZER] Error:', error.message)
  }
}
