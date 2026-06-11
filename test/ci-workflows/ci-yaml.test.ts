// test/ci-workflows/ci-yaml.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(__dirname, '../..');
const CI_YAML_PATH = path.resolve(ROOT, '.github/workflows/ci.yml');

describe('CI Workflow (ci.yml)', () => {
  let ciConfig: Record<string, unknown>;
  let ciRaw: string;

  beforeAll(() => {
    expect(fs.existsSync(CI_YAML_PATH)).toBe(true);
    ciRaw = fs.readFileSync(CI_YAML_PATH, 'utf-8');
    ciConfig = yaml.load(ciRaw) as Record<string, unknown>;
  });

  describe('Spec CI-1: Triggers', () => {
    it('should trigger on pull_request to main', () => {
      const on = ciConfig.on || ciConfig.true;
      expect(on).toBeDefined();
      const pr = (on as Record<string, unknown>).pull_request;
      expect(pr).toBeDefined();
      const branches = (pr as Record<string, unknown>).branches;
      expect(Array.isArray(branches)).toBe(true);
      expect(branches).toContain('main');
    });

    it('should trigger on push to main', () => {
      const on = ciConfig.on || ciConfig.true;
      const push = (on as Record<string, unknown>).push;
      expect(push).toBeDefined();
      const branches = (push as Record<string, unknown>).branches;
      expect(Array.isArray(branches)).toBe(true);
      expect(branches).toContain('main');
    });
  });

  describe('Spec CI-2: Node.js 22', () => {
    it('should use Node.js 22.x', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      expect(jobs).toBeDefined();
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const setupNode = steps.find(
        (s) => (s.uses as string)?.includes('actions/setup-node'),
      );
      expect(setupNode).toBeDefined();
      const with_ = setupNode?.with as Record<string, string>;
      const nodeVersion = with_?.['node-version'];
      const nodeVersionFile = with_?.['node-version-file'];
      // Should reference .node-version file or explicitly use 22
      const hasNode22 = nodeVersion === '22' || nodeVersion === '22.x' || nodeVersion === '22.x.x';
      const hasNodeVersionFile = nodeVersionFile === '.node-version';
      expect(hasNode22 || hasNodeVersionFile).toBe(true);
    });
  });

  describe('Spec CI-3: Sequential steps (npm ci → lint → build → test)', () => {
    it('should have npm ci step', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const npmCi = steps.find(
        (s) => (s.run as string)?.includes('npm ci'),
      );
      expect(npmCi).toBeDefined();
    });

    it('should have lint step (npm run lint)', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const lint = steps.find(
        (s) => (s.run as string)?.includes('npm run lint'),
      );
      expect(lint).toBeDefined();
    });

    it('should have build step (npm run build)', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const build = steps.find(
        (s) => (s.run as string)?.includes('npm run build'),
      );
      expect(build).toBeDefined();
    });

    it('should have test step (npm run test:only)', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const test = steps.find(
        (s) => (s.run as string)?.includes('npm run test:only'),
      );
      expect(test).toBeDefined();
    });

    it('should have steps in correct order: ci → lint → build → test', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const runSteps = steps.filter((s) => s.run);

      const ciIdx = runSteps.findIndex((s) => (s.run as string).includes('npm ci'));
      const lintIdx = runSteps.findIndex((s) => (s.run as string).includes('npm run lint'));
      const buildIdx = runSteps.findIndex((s) => (s.run as string).includes('npm run build'));
      const testIdx = runSteps.findIndex((s) => (s.run as string).includes('npm run test:only'));

      expect(ciIdx).toBeLessThan(lintIdx);
      expect(lintIdx).toBeLessThan(buildIdx);
      expect(buildIdx).toBeLessThan(testIdx);
    });
  });

  describe('Spec CI-4: Dependency caching', () => {
    it('should use actions/setup-node with npm cache', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const setupNode = steps.find(
        (s) => (s.uses as string)?.includes('actions/setup-node'),
      );
      expect(setupNode).toBeDefined();
      const with_ = setupNode?.with as Record<string, string>;
      expect(with_?.['cache']).toBe('npm');
    });
  });

  describe('Spec CI-5: Failure conditions', () => {
    it('should fail if any step exits non-zero (default GitHub Actions behavior)', () => {
      // GitHub Actions fails on non-zero by default; verify no `continue-on-error: true` on run steps
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const runSteps = steps.filter((s) => s.run);
      for (const step of runSteps) {
        expect(step['continue-on-error']).not.toBe(true);
      }
    });
  });

  describe('Spec CI-6: Timeout', () => {
    it('should have a timeout of 10-15 minutes', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const timeout = ciJob['timeout-minutes'] as number;
      expect(timeout).toBeDefined();
      expect(timeout).toBeGreaterThanOrEqual(10);
      expect(timeout).toBeLessThanOrEqual(15);
    });
  });

  describe('Permissions', () => {
    it('should have permissions defined', () => {
      expect(ciConfig.permissions).toBeDefined();
    });
  });

  describe('YAML validity', () => {
    it('should be valid YAML that parses without errors', () => {
      expect(() => yaml.load(ciRaw)).not.toThrow();
    });

    it('should use ubuntu-latest runner', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      expect(ciJob['runs-on']).toBe('ubuntu-latest');
    });
  });

  describe('Smoke test: PR with lint violation fails CI (spec CQ-6 + CI-5)', () => {
    it('should have lint step configured BEFORE build step (fail fast)', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const runSteps = steps.filter((s) => s.run);

      const lintIdx = runSteps.findIndex((s) => (s.run as string).includes('npm run lint'));
      const buildIdx = runSteps.findIndex((s) => (s.run as string).includes('npm run build'));

      // Lint must run before build so CI fails fast on violations
      expect(lintIdx).toBeGreaterThanOrEqual(0);
      expect(lintIdx).toBeLessThan(buildIdx);
    });

    it('should not have continue-on-error on the lint step', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const lintStep = steps.find(
        (s) => (s.run as string)?.includes('npm run lint'),
      );
      expect(lintStep).toBeDefined();
      expect(lintStep!['continue-on-error']).not.toBe(true);
      expect(lintStep!['continue-on-error']).not.toBe(true);
    });
  });

  describe('Structure integrity', () => {
    it('should have a workflow name', () => {
      expect(ciConfig.name).toBeDefined();
      expect(typeof ciConfig.name).toBe('string');
      expect((ciConfig.name as string).length).toBeGreaterThan(0);
    });

    it('should have at least one job defined', () => {
      const jobs = ciConfig.jobs as Record<string, unknown>;
      expect(jobs).toBeDefined();
      expect(Object.keys(jobs).length).toBeGreaterThanOrEqual(1);
    });

    it('should have a checkout step', () => {
      const jobs = ciConfig.jobs as Record<string, Record<string, unknown>>;
      const ciJob = jobs.ci || jobs.build || jobs.test || Object.values(jobs)[0];
      const steps = ciJob.steps as Array<Record<string, unknown>>;
      const checkout = steps.find(
        (s) => (s.uses as string)?.includes('actions/checkout'),
      );
      expect(checkout).toBeDefined();
    });

    it('should not trigger on other branches besides main', () => {
      const on = ciConfig.on || ciConfig.true;
      const pr = (on as Record<string, unknown>).pull_request;
      const push = (on as Record<string, unknown>).push;
      const prBranches = (pr as Record<string, unknown>).branches as string[];
      const pushBranches = (push as Record<string, unknown>).branches as string[];
      // Only main should be listed
      expect(prBranches).toEqual(['main']);
      expect(pushBranches).toEqual(['main']);
    });
  });
});
