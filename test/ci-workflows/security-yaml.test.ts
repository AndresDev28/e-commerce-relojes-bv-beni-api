// test/ci-workflows/security-yaml.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(__dirname, '../..');
const SECURITY_YAML_PATH = path.resolve(ROOT, '.github/workflows/security.yml');

describe('Security Workflow (security.yml)', () => {
  let securityConfig: Record<string, unknown>;
  let securityRaw: string;

  beforeAll(() => {
    expect(fs.existsSync(SECURITY_YAML_PATH)).toBe(true);
    securityRaw = fs.readFileSync(SECURITY_YAML_PATH, 'utf-8');
    securityConfig = yaml.load(securityRaw) as Record<string, unknown>;
  });

  describe('Spec SEC-1: Weekly cron on Mondays at 06:00 UTC', () => {
    it('should have schedule trigger', () => {
      const on = securityConfig.on || securityConfig.true;
      expect(on).toBeDefined();
      const schedule = (on as Record<string, unknown>).schedule;
      expect(Array.isArray(schedule)).toBe(true);
      expect((schedule as unknown[]).length).toBeGreaterThan(0);
    });

    it('should have cron expression for Monday 06:00 UTC', () => {
      const on = securityConfig.on || securityConfig.true;
      const schedule = (on as Record<string, unknown>).schedule as Array<{ cron: string }>;
      const cronEntry = schedule.find((s) => s.cron);
      expect(cronEntry).toBeDefined();
      expect(cronEntry?.cron).toBe('0 6 * * 1');
    });

    it('should allow manual dispatch (workflow_dispatch)', () => {
      const on = securityConfig.on || securityConfig.true;
      expect((on as Record<string, unknown>).workflow_dispatch).toBeDefined();
    });
  });

  describe('Spec SEC-2: npm audit --audit-level=high', () => {
    it('should have npm audit step', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      expect(jobs).toBeDefined();
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const auditStep = steps.find(
        (s) => (s.run as string)?.includes('npm audit'),
      );
      expect(auditStep).toBeDefined();
    });

    it('should use --audit-level=high flag', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const auditStep = steps.find(
        (s) => (s.run as string)?.includes('npm audit'),
      );
      expect(auditStep?.run).toContain('--audit-level=high');
    });
  });

  describe('Spec SEC-3: CodeQL analysis for TypeScript', () => {
    it('should have CodeQL init step', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const codeqlInit = steps.find(
        (s) => (s.uses as string)?.includes('github/codeql-action/init'),
      );
      expect(codeqlInit).toBeDefined();
    });

    it('should configure CodeQL for TypeScript', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const codeqlInit = steps.find(
        (s) => (s.uses as string)?.includes('github/codeql-action/init'),
      );
      const with_ = codeqlInit?.with as Record<string, string>;
      expect(with_?.['languages']).toContain('typescript');
    });

    it('should have CodeQL analyze step', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const codeqlAnalyze = steps.find(
        (s) => (s.uses as string)?.includes('github/codeql-action/analyze'),
      );
      expect(codeqlAnalyze).toBeDefined();
    });
  });

  describe('Spec SEC-4: Trivy filesystem scan', () => {
    it('should have Trivy scan step', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const trivyStep = steps.find(
        (s) => (s.uses as string)?.includes('aquasecurity/trivy-action'),
      );
      expect(trivyStep).toBeDefined();
    });

    it('should configure Trivy for filesystem scan', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const trivyStep = steps.find(
        (s) => (s.uses as string)?.includes('aquasecurity/trivy-action'),
      );
      const with_ = trivyStep?.with as Record<string, string>;
      expect(with_?.['scan-type']).toBe('fs');
    });

    it('should scan for HIGH and CRITICAL severities', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const trivyStep = steps.find(
        (s) => (s.uses as string)?.includes('aquasecurity/trivy-action'),
      );
      const with_ = trivyStep?.with as Record<string, string>;
      expect(with_?.['severity']).toContain('HIGH');
      expect(with_?.['severity']).toContain('CRITICAL');
    });
  });

  describe('Spec SEC-5: Fail on high/critical vulnerabilities', () => {
    it('should have no continue-on-error on audit step', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const auditStep = steps.find(
        (s) => (s.run as string)?.includes('npm audit'),
      );
      expect(auditStep?.['continue-on-error']).not.toBe(true);
    });

    it('should have no continue-on-error on Trivy step', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const trivyStep = steps.find(
        (s) => (s.uses as string)?.includes('aquasecurity/trivy-action'),
      );
      expect(trivyStep?.['continue-on-error']).not.toBe(true);
    });
  });

  describe('Permissions', () => {
    it('should have security-events: write for CodeQL', () => {
      expect(securityConfig.permissions).toBeDefined();
      const perms = securityConfig.permissions as Record<string, string>;
      expect(perms['security-events']).toBe('write');
    });

    it('should have contents: read', () => {
      const perms = securityConfig.permissions as Record<string, string>;
      expect(perms['contents']).toBe('read');
    });
  });

  describe('YAML validity', () => {
    it('should be valid YAML that parses without errors', () => {
      expect(() => yaml.load(securityRaw)).not.toThrow();
    });

    it('should use ubuntu-latest runner', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      expect(securityJob['runs-on']).toBe('ubuntu-latest');
    });

    it('should have a workflow name', () => {
      expect(securityConfig.name).toBeDefined();
      expect(typeof securityConfig.name).toBe('string');
      expect((securityConfig.name as string).length).toBeGreaterThan(0);
    });

    it('should have a checkout step', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const checkout = steps.find(
        (s) => (s.uses as string)?.includes('actions/checkout'),
      );
      expect(checkout).toBeDefined();
    });

    it('should have npm ci or npm install step before audit', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const installStep = steps.find(
        (s) => (s.run as string)?.includes('npm ci') || (s.run as string)?.includes('npm install'),
      );
      expect(installStep).toBeDefined();
    });
  });

  describe('Step ordering', () => {
    it('should have install before audit', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const runSteps = steps.filter((s) => s.run);
      const installIdx = runSteps.findIndex(
        (s) => (s.run as string).includes('npm ci') || (s.run as string).includes('npm install'),
      );
      const auditIdx = runSteps.findIndex(
        (s) => (s.run as string).includes('npm audit'),
      );
      expect(installIdx).toBeLessThan(auditIdx);
    });

    it('should have CodeQL init before autobuild', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const useSteps = steps.filter((s) => s.uses);
      const initIdx = useSteps.findIndex(
        (s) => (s.uses as string)?.includes('github/codeql-action/init'),
      );
      const autoBuildIdx = useSteps.findIndex(
        (s) => (s.uses as string)?.includes('github/codeql-action/autobuild'),
      );
      expect(initIdx).toBeLessThan(autoBuildIdx);
    });

    it('should have CodeQL autobuild before analyze', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const useSteps = steps.filter((s) => s.uses);
      const autoBuildIdx = useSteps.findIndex(
        (s) => (s.uses as string)?.includes('github/codeql-action/autobuild'),
      );
      const analyzeIdx = useSteps.findIndex(
        (s) => (s.uses as string)?.includes('github/codeql-action/analyze'),
      );
      expect(autoBuildIdx).toBeLessThan(analyzeIdx);
    });
  });

  describe('Action versions', () => {
    it('should use actions/checkout@v4', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const checkout = steps.find(
        (s) => (s.uses as string)?.includes('actions/checkout'),
      );
      expect(checkout?.uses).toBe('actions/checkout@v4');
    });

    it('should use actions/setup-node@v4', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const setupNode = steps.find(
        (s) => (s.uses as string)?.includes('actions/setup-node'),
      );
      expect(setupNode?.uses).toBe('actions/setup-node@v4');
    });

    it('should use CodeQL action v3', () => {
      const jobs = securityConfig.jobs as Record<string, Record<string, unknown>>;
      const securityJob = Object.values(jobs)[0];
      const steps = securityJob.steps as Array<Record<string, unknown>>;
      const codeqlSteps = steps.filter(
        (s) => (s.uses as string)?.includes('github/codeql-action'),
      );
      for (const step of codeqlSteps) {
        expect(step.uses).toMatch(/github\/codeql-action\/\w+@v3/);
      }
    });
  });
});
