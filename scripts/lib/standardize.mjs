import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";

// --- Config ---
export const DEFAULTS = {
  dir: path.join(
    process.env.HOME,
    "Pictures/e-commerce-relojes-bv-beni/Categorias"
  ),
  size: 800,
  padding: 15,
  format: "webp",
  dryRun: false,
  backup: true,
};

export const HERO_PATTERN = /^hero\.(webp|jpg|jpeg|png|avif)$/i;

// --- Pure functions ---
export function parseArgs(args) {
  const config = { ...DEFAULTS };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dir":
        config.dir = path.resolve(args[++i]);
        break;
      case "--size":
        config.size = parseInt(args[++i], 10);
        break;
      case "--padding":
        config.padding = parseInt(args[++i], 10);
        break;
      case "--format":
        config.format = args[++i];
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--no-backup":
        config.backup = false;
        break;
    }
  }

  return config;
}

export function isHeroImage(filename) {
  return HERO_PATTERN.test(filename);
}

export async function findHeroImages(baseDir) {
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && HERO_PATTERN.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(baseDir);
  return results.sort();
}

export async function detectBoundingBox(imageBuffer) {
  // Get raw pixel data with alpha channel
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  let top = height;
  let bottom = 0;
  let left = width;
  let right = 0;

  // Scan pixels to find non-transparent area
  // Use alpha > 30 to exclude anti-aliasing halos that cause asymmetry
  const ALPHA_THRESHOLD = 30;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alphaIndex = (y * width + x) * 4 + 3; // RGBA: alpha is at index 3
      if (data[alphaIndex] > ALPHA_THRESHOLD) {
        // Non-transparent pixel found
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  // If no non-transparent pixels found
  if (top === height && bottom === 0 && left === width && right === 0) {
    return null;
  }

  return {
    width: right - left + 1,
    height: bottom - top + 1,
    top,
    left,
  };
}

export async function standardizeImage(inputPath, config) {
  const dir = path.dirname(inputPath);
  const originalExt = path.extname(inputPath).slice(1).toLowerCase();
  const modelName = path.basename(dir);

  const backupPath = path.join(dir, `hero.original.${originalExt}`);
  const outputPath = path.join(dir, `hero.${config.format}`);

  if (config.dryRun) {
    return {
      path: inputPath,
      status: "dry-run",
      model: modelName,
      originalSize: (await fs.stat(inputPath)).size,
    };
  }

  try {
    if (config.backup && !existsSync(backupPath)) {
      await fs.copyFile(inputPath, backupPath);
    }

    const inputBuffer = await fs.readFile(inputPath);

    // Convert input to PNG first (removeBackground may not support all formats)
    const pngInput = await sharp(inputBuffer).png().toBuffer();

    // Convert Buffer to Blob with type (required by removeBackground)
    const inputBlob = new Blob([pngInput], { type: "image/png" });

    const blob = await removeBackground(inputBlob, {
      model: "medium",
      output: { format: "image/png", quality: 1.0 },
    });
    const transparentBuffer = Buffer.from(await blob.arrayBuffer());

    if (transparentBuffer.length === 0) {
      throw new Error("Background removal returned empty buffer");
    }

    // Detect bounding box of the watch (non-transparent area)
    const bbox = await detectBoundingBox(transparentBuffer);
    if (!bbox) {
      throw new Error("No content detected after background removal");
    }

    // Extract the bounding box area
    const cropped = await sharp(transparentBuffer)
      .extract({
        left: bbox.left,
        top: bbox.top,
        width: bbox.width,
        height: bbox.height,
      })
      .png()
      .toBuffer();

    const contentSize = Math.round(config.size * ((100 - config.padding) / 100));

    // Scale the cropped watch to fit within content area (preserving aspect ratio)
    const resized = await sharp(cropped)
      .resize(contentSize, contentSize, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const resizedMeta = await sharp(resized).metadata();
    const offsetX = Math.round((config.size - resizedMeta.width) / 2);
    const offsetY = Math.round((config.size - resizedMeta.height) / 2);

    const canvas = await sharp({
      create: {
        width: config.size,
        height: config.size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: resized, left: offsetX, top: offsetY }])
      .toFormat(config.format, {
        quality: config.format === "png" ? 100 : 85,
      })
      .toBuffer();

    await fs.writeFile(outputPath, canvas);

    if (inputPath !== outputPath) {
      await fs.unlink(inputPath);
    }

    const outputStat = await fs.stat(outputPath);
    const inputStat = existsSync(backupPath)
      ? await fs.stat(backupPath)
      : { size: 0 };

    return {
      path: outputPath,
      status: "processed",
      model: modelName,
      originalSize: inputStat.size,
      newSize: outputStat.size,
      savings: `${Math.round((1 - outputStat.size / inputStat.size) * 100)}%`,
    };
  } catch (error) {
    return {
      path: inputPath,
      status: "error",
      model: modelName,
      error: error.message,
    };
  }
}
