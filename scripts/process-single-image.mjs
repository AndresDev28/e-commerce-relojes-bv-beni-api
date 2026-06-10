#!/usr/bin/env node

/**
 * Image Processing Worker
 *
 * Processes a single image in an ISOLATED process to avoid native memory
 * conflicts between @imgly/background-removal-node (ONNX) and Strapi's sharp.
 *
 * Usage: node process-single-image.mjs <inputPath> <outputPath>
 *
 * Exits 0 on success, 1 on error. Logs JSON result to stdout.
 */

import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";
import fs from "fs/promises";

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    console.error(JSON.stringify({ error: "Missing inputPath or outputPath" }));
    process.exit(1);
  }

  try {
    const buffer = await fs.readFile(inputPath);

    // Convert to PNG
    const pngBuffer = await sharp(buffer).png().toBuffer();

    // Remove background
    const blob = new Blob([pngBuffer], { type: "image/png" });
    const processedBlob = await removeBackground(blob, {
      model: "medium",
      output: { format: "image/png", quality: 1.0 },
    });
    const transparentBuffer = Buffer.from(await processedBlob.arrayBuffer());

    // Detect bounding box
    const { data, info } = await sharp(transparentBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    const ALPHA_THRESHOLD = 30;
    let top = height,
      bottom = 0,
      left = width,
      right = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alphaIndex = (y * width + x) * 4 + 3;
        if (data[alphaIndex] > ALPHA_THRESHOLD) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    // Extract bounding box
    let contentBuffer = transparentBuffer;
    if (top !== height && bottom !== 0 && left !== width && right !== 0) {
      const bboxWidth = right - left + 1;
      const bboxHeight = bottom - top + 1;
      if (bboxWidth > 0 && bboxHeight > 0) {
        contentBuffer = await sharp(transparentBuffer)
          .extract({ left, top, width: bboxWidth, height: bboxHeight })
          .png()
          .toBuffer();
      }
    }

    // Create 800x800 canvas with 15% padding
    const contentSize = 680;
    const resized = await sharp(contentBuffer)
      .resize(contentSize, contentSize, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const meta = await sharp(resized).metadata();
    const offsetX = Math.round((800 - meta.width) / 2);
    const offsetY = Math.round((800 - meta.height) / 2);

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
      .toBuffer();

    await fs.writeFile(outputPath, canvas);

    console.log(JSON.stringify({ success: true, size: canvas.length }));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

main();
