#!/usr/bin/env node

/**
 * Catalog Hero Image Standardizer
 *
 * Finds all hero.* images in the categories directory and normalizes them to:
 * - 800x800px square canvas
 * - Transparent background (AI-powered background removal)
 * - 15% padding (watch occupies ~85% of canvas)
 * - Centered geometrically
 * - Output as optimized WebP
 *
 * Usage:
 *   node scripts/standardize-images.js [options]
 *
 * Options:
 *   --dir <path>     Base directory to search (default: ~/Pictures/e-commerce-relojes-bv-beni/Categorias)
 *   --size <px>      Canvas size in pixels (default: 800)
 *   --padding <%>    Padding percentage (default: 15)
 *   --format <fmt>   Output format: webp | avif | png (default: webp)
 *   --dry-run        Show what would be processed without modifying files
 *   --no-backup      Skip creating .original backup files
 */

import { existsSync } from "fs";
import path from "path";
import {
  parseArgs,
  findHeroImages,
  standardizeImage,
  DEFAULTS,
} from "./lib/standardize.mjs";

function getHelp() {
  return `
Catalog Hero Image Standardizer

Usage: node scripts/standardize-images.js [options]

Options:
  --dir <path>     Base directory to search
  --size <px>      Canvas size in pixels (default: 800)
  --padding <%>    Padding percentage (default: 15)
  --format <fmt>   Output format: webp | avif | png (default: webp)
  --dry-run        Preview without modifying files
  --no-backup      Skip creating .original backup files
  --help           Show this help
`;
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    console.log(getHelp());
    process.exit(0);
  }

  const config = parseArgs(args);

  console.log("\n📐 Catalog Hero Image Standardizer\n");
  console.log(`   Directory: ${config.dir}`);
  console.log(`   Canvas:    ${config.size}x${config.size}px`);
  console.log(`   Padding:   ${config.padding}%`);
  console.log(`   Format:    ${config.format}`);
  console.log(`   Backup:    ${config.backup ? "yes" : "no"}`);
  if (config.dryRun) console.log("   ⚠️  DRY RUN — no files will be modified");
  console.log("");

  // Validate directory
  if (!existsSync(config.dir)) {
    console.error(`❌ Directory not found: ${config.dir}`);
    process.exit(1);
  }

  // Find hero images
  const heroImages = await findHeroImages(config.dir);

  if (heroImages.length === 0) {
    console.log(
      "ℹ️  No hero images found. Rename your main image to hero.webp (or hero.jpg, hero.png, hero.avif)."
    );
    console.log(`   Searched in: ${config.dir}\n`);
    return;
  }

  console.log(`Found ${heroImages.length} hero image(s):\n`);

  // Process one at a time (memory safety)
  const results = [];
  for (const imgPath of heroImages) {
    const relative = path.relative(config.dir, imgPath);
    process.stdout.write(`   Processing: ${relative} ... `);

    const result = await standardizeImage(imgPath, config);
    results.push(result);

    switch (result.status) {
      case "processed":
        console.log(`✅ ${result.savings} smaller`);
        break;
      case "skipped":
        console.log(`⏭️  ${result.reason}`);
        break;
      case "dry-run":
        console.log(
          `👁️  would process (${(result.originalSize / 1024).toFixed(0)}KB)`
        );
        break;
      case "error":
        console.log(`❌ ${result.error}`);
        break;
    }
  }

  // Summary
  const processed = results.filter((r) => r.status === "processed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log(
    `\n📊 Summary: ${processed} processed, ${skipped} skipped, ${errors} errors\n`
  );

  if (errors > 0) {
    console.log("Errors:");
    results
      .filter((r) => r.status === "error")
      .forEach((r) => console.log(`   - ${r.model}: ${r.error}`));
    console.log("");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
