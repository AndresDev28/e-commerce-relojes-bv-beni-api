// test/ci-workflows/release-yaml.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(__dirname, '../..');
const RELEASE_YAML_PATH = path.resolve(ROOT, '.github/workflows/release.yml');

describe('Release Workflow (release.yml)', () => {
  let releaseConfig: Record<string, unknown>;
  let releaseRaw: string;

  beforeAll(() => {
    expect(fs.existsSync(RELEASE_YAML_PATH)).toBe(true);
    releaseRaw = fs.readFileSync(RELEASE_YAML_PATH, 'utf-8');
    releaseConfig = yaml.load(releaseRaw) as Record<string, unknown>;
  });

  describe('Spec REL-1: Trigger on tags matching v*', () => {
    it('should trigger on push events', () => {
      const on = releaseConfig.on || releaseConfig.true;
      expect(on).toBeDefined();
      const push = (on as Record<string, unknown>).push;
      expect(push).toBeDefined();
    });

    it('should have tags pattern matching v*', () => {
      const on = releaseConfig.on || releaseConfig.true;
      const push = (on as Record<string, unknown>).push;
      const tags = (push as Record<string, unknown>).tags;
      expect(Array.isArray(tags)).toBe(true);
      expect(tags).toContain('v*');
    });

    it('should NOT trigger on branch pushes (no branches key in push)', () => {
      const on = releaseConfig.on || releaseConfig.true;
      const push = (on as Record<string, unknown>).push;
      expect((push as Record<string, unknown>).branches).toBeUndefined();
    });

    it('should NOT trigger on pull_request', () => {
      const on = releaseConfig.on || releaseConfig.true;
      expect((on as Record<string, unknown>).pull_request).toBeUndefined();
    });
  });

  describe('Spec REL-2: Create GitHub release with auto-generated notes', () => {
    it('should have at least one job', () => {
      const jobs = releaseConfig.jobs as Record<string, unknown>;
      expect(jobs).toBeDefined();
      expect(Object.keys(jobs).length).toBeGreaterThanOrEqual(1);
    });

    it('should use softprops/action-gh-release action', () => {
      const jobs = releaseConfig.jobs as Record<string, Record<string, unknown>>;
      const releaseJob = Object.values(jobs)[0];
      const steps = releaseJob.steps as Array<Record<string, unknown>>;
      const releaseStep = steps.find(
        (s) => (s.uses as string)?.includes('softprops/action-gh-release'),
      );
      expect(releaseStep).toBeDefined();
    });

    it('should have generate_release_notes set to true', () => {
      const jobs = releaseConfig.jobs as Record<string, Record<string, unknown>>;
      const releaseJob = Object.values(jobs)[0];
      const steps = releaseJob.steps as Array<Record<string, unknown>>;
      const releaseStep = steps.find(
        (s) => (s.uses as string)?.includes('softprops/action-gh-release'),
      );
      expect(releaseStep).toBeDefined();
      const with_ = releaseStep?.with as Record<string, unknown>;
      expect(with_?.['generate_release_notes']).toBe(true);
    });
  });

  describe('Spec REL-3: Must NOT trigger on branch pushes or PRs', () => {
    it('should not have pull_request trigger', () => {
      const on = releaseConfig.on || releaseConfig.true;
      expect((on as Record<string, unknown>).pull_request).toBeUndefined();
    });

    it('should not have branches in push trigger', () => {
      const on = releaseConfig.on || releaseConfig.true;
      const push = (on as Record<string, unknown>).push;
      expect((push as Record<string, unknown>).branches).toBeUndefined();
    });
  });

  describe('Spec REL-4: Should include changelog categories (auto-generated notes)', () => {
    it('should use GitHub native auto-generated notes (covers categorization)', () => {
      const jobs = releaseConfig.jobs as Record<string, Record<string, unknown>>;
      const releaseJob = Object.values(jobs)[0];
      const steps = releaseJob.steps as Array<Record<string, unknown>>;
      const releaseStep = steps.find(
        (s) => (s.uses as string)?.includes('softprops/action-gh-release'),
      );
      const with_ = releaseStep?.with as Record<string, unknown>;
      // generate_release_notes: true enables GitHub's native categorization
      expect(with_?.['generate_release_notes']).toBe(true);
    });
  });

  describe('Permissions', () => {
    it('should have permissions with contents: write for release creation', () => {
      expect(releaseConfig.permissions).toBeDefined();
      const perms = releaseConfig.permissions as Record<string, string>;
      expect(perms['contents']).toBe('write');
    });
  });

  describe('YAML validity', () => {
    it('should be valid YAML that parses without errors', () => {
      expect(() => yaml.load(releaseRaw)).not.toThrow();
    });

    it('should use ubuntu-latest runner', () => {
      const jobs = releaseConfig.jobs as Record<string, Record<string, unknown>>;
      const releaseJob = Object.values(jobs)[0];
      expect(releaseJob['runs-on']).toBe('ubuntu-latest');
    });

    it('should have a workflow name', () => {
      expect(releaseConfig.name).toBeDefined();
      expect(typeof releaseConfig.name).toBe('string');
      expect((releaseConfig.name as string).length).toBeGreaterThan(0);
    });

    it('should have a checkout step', () => {
      const jobs = releaseConfig.jobs as Record<string, Record<string, unknown>>;
      const releaseJob = Object.values(jobs)[0];
      const steps = releaseJob.steps as Array<Record<string, unknown>>;
      const checkout = steps.find(
        (s) => (s.uses as string)?.includes('actions/checkout'),
      );
      expect(checkout).toBeDefined();
    });

    it('should use actions/checkout@v4', () => {
      const jobs = releaseConfig.jobs as Record<string, Record<string, unknown>>;
      const releaseJob = Object.values(jobs)[0];
      const steps = releaseJob.steps as Array<Record<string, unknown>>;
      const checkout = steps.find(
        (s) => (s.uses as string)?.includes('actions/checkout'),
      );
      expect(checkout?.uses).toBe('actions/checkout@v4');
    });

    it('should use softprops/action-gh-release@v2', () => {
      const jobs = releaseConfig.jobs as Record<string, Record<string, unknown>>;
      const releaseJob = Object.values(jobs)[0];
      const steps = releaseJob.steps as Array<Record<string, unknown>>;
      const releaseStep = steps.find(
        (s) => (s.uses as string)?.includes('softprops/action-gh-release'),
      );
      expect(releaseStep?.uses).toBe('softprops/action-gh-release@v2');
    });

    it('should have exactly 2 steps (checkout + release)', () => {
      const jobs = releaseConfig.jobs as Record<string, Record<string, unknown>>;
      const releaseJob = Object.values(jobs)[0];
      const steps = releaseJob.steps as Array<Record<string, unknown>>;
      expect(steps.length).toBe(2);
    });
  });
});
