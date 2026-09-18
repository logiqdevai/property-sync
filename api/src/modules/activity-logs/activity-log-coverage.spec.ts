import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import * as fs from 'fs';
import * as path from 'path';
import {
  AUDITED_METADATA_KEY,
  SKIP_AUDIT_METADATA_KEY,
} from './constants/activity-log.constants';
import type { AuditedOptions } from './decorators/audited.decorator';
import { getEntityDefinition } from './entities/entity-registry';

const MUTATING = new Set<number>([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

const SRC_ROOT = path.resolve(__dirname, '..', '..');

function controllerFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated' || entry.name === 'node_modules') continue;
      controllerFiles(full, out);
    } else if (entry.name.endsWith('.controller.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface RouteInfo {
  label: string;
  audited?: AuditedOptions;
  skipped: boolean;
  mutating: boolean;
}

function collectRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const file of controllerFiles(SRC_ROOT)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const exported = require(file) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (typeof value !== 'function') continue;
      if (Reflect.getMetadata(PATH_METADATA, value) === undefined) continue; // not a @Controller
      const classSkipped = Boolean(Reflect.getMetadata(SKIP_AUDIT_METADATA_KEY, value));

      for (const name of Object.getOwnPropertyNames(value.prototype)) {
        if (name === 'constructor') continue;
        const handler = value.prototype[name] as (...args: unknown[]) => unknown;
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (method === undefined) continue; // not a route handler

        routes.push({
          label: `${path.relative(SRC_ROOT, file).split(path.sep).join('/')} ${value.name}.${name}`,
          audited: Reflect.getMetadata(AUDITED_METADATA_KEY, handler),
          skipped: classSkipped || Boolean(Reflect.getMetadata(SKIP_AUDIT_METADATA_KEY, handler)),
          mutating: MUTATING.has(method),
        });
      }
    }
  }
  return routes;
}

describe('activity log coverage', () => {
  jest.setTimeout(180_000);
  const routes = collectRoutes();

  it('discovers the application routes (guards against a silently empty scan)', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.filter((route) => route.mutating).length).toBeGreaterThan(100);
  });

  it('every mutating route has @Audited or @SkipAudit', () => {
    const unaudited = routes
      .filter((route) => route.mutating && !route.audited && !route.skipped)
      .map((route) => route.label);

    // To fix: add `@Audited({ action, entity, ids })` (see activity-logs/decorators) or, for
    // machine-to-machine routes that are not UI actions, `@SkipAudit()`.
    expect(unaudited).toEqual([]);
  });

  it('every @Audited entity exists in the entity registry', () => {
    const unknown = routes
      .filter((route) => route.audited?.entity && !getEntityDefinition(route.audited.entity))
      .map((route) => `${route.label} -> ${route.audited?.entity}`);
    expect(unknown).toEqual([]);
  });

  it('action names are lowercase dot-strings (e.g. user_property.update)', () => {
    const bad = routes
      .filter((route) => route.audited && !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(route.audited.action))
      .map((route) => `${route.label} -> ${route.audited?.action}`);
    expect(bad).toEqual([]);
  });
});
