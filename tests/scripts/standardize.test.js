import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

// Mock background removal for unit tests
vi.mock("@imgly/background-removal-node", () => ({
  removeBackground: vi.fn(async (inputBlob) => {
    // Simulate background removal: take the input image and return it
    // with a transparent background surrounding the content.
    // This mimics what the real library does.
    const inputBuffer = Buffer.from(
      inputBlob instanceof Blob ? await inputBlob.arrayBuffer() : inputBlob
    );
    const meta = await sharp(inputBuffer).metadata();

    // Get the input image and composite it onto a transparent background
    // centered, simulating what the real bg removal would produce
    const content = await sharp(inputBuffer)
      .resize(Math.round(meta.width * 0.6), Math.round(meta.height * 0.6), {
        fit: "inside",
      })
      .ensureAlpha()
      .png()
      .toBuffer();

    const contentMeta = await sharp(content).metadata();

    const canvas = await sharp({
      create: {
        width: meta.width,
        height: meta.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: content,
          left: Math.round((meta.width - contentMeta.width) / 2),
          top: Math.round((meta.height - contentMeta.height) / 2),
        },
      ])
      .png()
      .toBuffer();

    return new Blob([canvas], { type: "image/png" });
  }),
}));

import {
  parseArgs,
  findHeroImages,
  standardizeImage,
  isHeroImage,
  detectBoundingBox,
  DEFAULTS,
  HERO_PATTERN,
} from "../../scripts/lib/standardize.mjs";

describe("detectBoundingBox", () => {
  it("detects bounding box for centered content", async () => {
    // Create 200x200 image with 100x100 red square in center
    const img = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 100,
              height: 100,
              channels: 4,
              background: { r: 255, g: 0, b: 0, alpha: 255 },
            },
          },
          left: 50,
          top: 50,
        },
      ])
      .png()
      .toBuffer();

    const bbox = await detectBoundingBox(img);
    expect(bbox).toEqual({
      width: 100,
      height: 100,
      top: 50,
      left: 50,
    });
  });

  it("detects bounding box for top-left content", async () => {
    // Create 200x200 image with 50x50 blue square at top-left
    const img = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 50,
              height: 50,
              channels: 4,
              background: { r: 0, g: 0, b: 255, alpha: 255 },
            },
          },
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    const bbox = await detectBoundingBox(img);
    expect(bbox).toEqual({
      width: 50,
      height: 50,
      top: 0,
      left: 0,
    });
  });

  it("detects bounding box for bottom-right content", async () => {
    // Create 200x200 image with 60x80 green square at bottom-right
    const img = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 60,
              height: 80,
              channels: 4,
              background: { r: 0, g: 255, b: 0, alpha: 255 },
            },
          },
          left: 140,
          top: 120,
        },
      ])
      .png()
      .toBuffer();

    const bbox = await detectBoundingBox(img);
    expect(bbox).toEqual({
      width: 60,
      height: 80,
      top: 120,
      left: 140,
    });
  });

  it("returns null for fully transparent image", async () => {
    const img = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const bbox = await detectBoundingBox(img);
    expect(bbox).toBeNull();
  });

  it("detects full image for fully opaque content", async () => {
    const img = await sharp({
      create: {
        width: 150,
        height: 150,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 255 },
      },
    })
      .png()
      .toBuffer();

    const bbox = await detectBoundingBox(img);
    expect(bbox).toEqual({
      width: 150,
      height: 150,
      top: 0,
      left: 0,
    });
  });
});

describe("parseArgs", () => {
  it("returns defaults when no args provided", () => {
    const result = parseArgs([]);
    expect(result).toEqual({
      ...DEFAULTS,
      dryRun: false,
      backup: true,
    });
  });

  it("parses --dir flag", () => {
    const result = parseArgs(["--dir", "/custom/path"]);
    expect(result.dir).toBe("/custom/path");
  });

  it("parses --size flag", () => {
    const result = parseArgs(["--size", "1024"]);
    expect(result.size).toBe(1024);
  });

  it("parses --padding flag", () => {
    const result = parseArgs(["--padding", "20"]);
    expect(result.padding).toBe(20);
  });

  it("parses --format flag", () => {
    const result = parseArgs(["--format", "avif"]);
    expect(result.format).toBe("avif");
  });

  it("parses --dry-run flag", () => {
    const result = parseArgs(["--dry-run"]);
    expect(result.dryRun).toBe(true);
  });

  it("parses --no-backup flag", () => {
    const result = parseArgs(["--no-backup"]);
    expect(result.backup).toBe(false);
  });

  it("parses multiple flags together", () => {
    const result = parseArgs([
      "--dir",
      "/test",
      "--size",
      "600",
      "--format",
      "png",
      "--dry-run",
    ]);
    expect(result.dir).toBe("/test");
    expect(result.size).toBe(600);
    expect(result.format).toBe("png");
    expect(result.dryRun).toBe(true);
  });
});

describe("isHeroImage", () => {
  it("returns true for hero.webp", () => {
    expect(isHeroImage("hero.webp")).toBe(true);
  });

  it("returns true for hero.jpg", () => {
    expect(isHeroImage("hero.jpg")).toBe(true);
  });

  it("returns true for hero.jpeg", () => {
    expect(isHeroImage("hero.jpeg")).toBe(true);
  });

  it("returns true for hero.png", () => {
    expect(isHeroImage("hero.png")).toBe(true);
  });

  it("returns true for hero.avif", () => {
    expect(isHeroImage("hero.avif")).toBe(true);
  });

  it("returns true for HERO.webp (case insensitive)", () => {
    expect(isHeroImage("HERO.webp")).toBe(true);
  });

  it("returns false for non-hero files", () => {
    expect(isHeroImage("product.webp")).toBe(false);
    expect(isHeroImage("hero-backup.webp")).toBe(false);
    expect(isHeroImage("hero.txt")).toBe(false);
    expect(isHeroImage("my-hero.webp")).toBe(false);
  });
});

describe("findHeroImages", () => {
  const testDir = "/tmp/standardize-test";

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("finds hero images in nested directories", async () => {
    // Create structure: testDir/category/model/hero.webp
    const modelDir = path.join(testDir, "category", "model1");
    await fs.mkdir(modelDir, { recursive: true });
    await fs.writeFile(path.join(modelDir, "hero.webp"), "fake");

    const results = await findHeroImages(testDir);
    expect(results).toHaveLength(1);
    expect(results[0]).toContain("hero.webp");
  });

  it("finds multiple hero images across models", async () => {
    const model1 = path.join(testDir, "cat", "model1");
    const model2 = path.join(testDir, "cat", "model2");
    await fs.mkdir(model1, { recursive: true });
    await fs.mkdir(model2, { recursive: true });
    await fs.writeFile(path.join(model1, "hero.webp"), "fake");
    await fs.writeFile(path.join(model2, "hero.jpg"), "fake");

    const results = await findHeroImages(testDir);
    expect(results).toHaveLength(2);
  });

  it("ignores non-hero files", async () => {
    const modelDir = path.join(testDir, "cat", "model1");
    await fs.mkdir(modelDir, { recursive: true });
    await fs.writeFile(path.join(modelDir, "product.webp"), "fake");
    await fs.writeFile(path.join(modelDir, "hero-backup.webp"), "fake");

    const results = await findHeroImages(testDir);
    expect(results).toHaveLength(0);
  });

  it("returns sorted results", async () => {
    const modelB = path.join(testDir, "cat", "modelB");
    const modelA = path.join(testDir, "cat", "modelA");
    await fs.mkdir(modelA, { recursive: true });
    await fs.mkdir(modelB, { recursive: true });
    await fs.writeFile(path.join(modelB, "hero.webp"), "fake");
    await fs.writeFile(path.join(modelA, "hero.webp"), "fake");

    const results = await findHeroImages(testDir);
    expect(results[0]).toContain("modelA");
    expect(results[1]).toContain("modelB");
  });
});

describe("standardizeImage", () => {
  const testDir = "/tmp/standardize-image-test";
  const modelDir = path.join(testDir, "category", "LA700WEM-3AEF");

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(modelDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("returns dry-run status without modifying files", async () => {
    const heroPath = path.join(modelDir, "hero.webp");
    // Create a real 100x100 image
    await sharp({
      create: { width: 100, height: 100, channels: 3, background: "red" },
    })
      .webp()
      .toFile(heroPath);

    const config = { ...DEFAULTS, dryRun: true };
    const result = await standardizeImage(heroPath, config);

    expect(result.status).toBe("dry-run");
    expect(result.model).toBe("LA700WEM-3AEF");
    expect(existsSync(heroPath)).toBe(true); // original still exists
  });

  it("creates backup when backup is enabled", async () => {
    const heroPath = path.join(modelDir, "hero.png");
    // Create a real image
    await sharp({
      create: { width: 200, height: 200, channels: 3, background: "blue" },
    })
      .png()
      .toFile(heroPath);

    const config = { ...DEFAULTS, backup: true, size: 100, format: "webp" };
    await standardizeImage(heroPath, config);

    const backupPath = path.join(modelDir, "hero.original.png");
    expect(existsSync(backupPath)).toBe(true);
  });

  it("outputs image in specified format", async () => {
    const heroPath = path.join(modelDir, "hero.jpg");
    // Create a real image
    await sharp({
      create: { width: 200, height: 200, channels: 3, background: "green" },
    })
      .jpeg()
      .toFile(heroPath);

    const config = { ...DEFAULTS, size: 100, format: "webp" };
    const result = await standardizeImage(heroPath, config);

    if (result.status === "error") {
      console.log("Error details:", result.error);
    }
    expect(result.status).toBe("processed");
    expect(result.path).toContain("hero.webp");
    expect(existsSync(result.path)).toBe(true);
  });

  it("produces square output with correct dimensions", async () => {
    const heroPath = path.join(modelDir, "hero.png");
    await sharp({
      create: { width: 300, height: 300, channels: 3, background: "yellow" },
    })
      .png()
      .toFile(heroPath);

    const config = { ...DEFAULTS, size: 150, format: "webp" };
    const result = await standardizeImage(heroPath, config);

    const meta = await sharp(result.path).metadata();
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(150);
  });

  it("returns error status on invalid image", async () => {
    const heroPath = path.join(modelDir, "hero.webp");
    await fs.writeFile(heroPath, "not a real image");

    const config = { ...DEFAULTS, size: 100 };
    const result = await standardizeImage(heroPath, config);

    expect(result.status).toBe("error");
    expect(result.error).toBeDefined();
  });
});

describe("HERO_PATTERN", () => {
  it("matches valid hero filenames", () => {
    expect(HERO_PATTERN.test("hero.webp")).toBe(true);
    expect(HERO_PATTERN.test("hero.jpg")).toBe(true);
    expect(HERO_PATTERN.test("hero.png")).toBe(true);
    expect(HERO_PATTERN.test("hero.avif")).toBe(true);
  });

  it("rejects invalid hero filenames", () => {
    expect(HERO_PATTERN.test("product.webp")).toBe(false);
    expect(HERO_PATTERN.test("hero-backup.webp")).toBe(false);
    expect(HERO_PATTERN.test("hero.gif")).toBe(false);
  });
});
