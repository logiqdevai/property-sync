import { BadRequestException, CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { ActivityChangeOperation, ActivityOutcome } from 'generated/prisma';
import { ActivityLogsService } from '../activity-logs.service';
import { MAX_SNAPSHOT_ENTITIES } from '../constants/activity-log.constants';
import { Audited, SkipAudit } from '../decorators/audited.decorator';
import { defaultAction, ActivityLogInterceptor } from './activity-log.interceptor';

class ThingsController {
  @Audited({ action: 'thing.update', entity: 'UserProperty', ids: { param: 'id' } })
  update() {}

  @Audited({ action: 'thing.delete', entity: 'UserProperty', ids: { body: 'ids' } })
  bulkDelete() {}

  @Audited({ action: 'thing.create', entity: 'UserProperty' })
  create() {}

  @Audited({ action: 'integration.update', entity: 'UserIntegration', ids: { param: 'id' } })
  updateIntegration() {}

  @Audited({
    action: 'thing.composite',
    entity: 'UserProperty',
    ids: async (_req, { prisma }) =>
      (await (prisma as any).userProperty.findMany({ where: {} })).map((row: any) => row.id),
  })
  composite() {}

  @Audited({ action: 'thing.recorded' })
  withRecordChange() {}

  @Audited({ action: 'secret.reveal' })
  revealSecrets() {}

  pushToCms() {}

  @SkipAudit()
  webhook() {}
}

function fakeCls() {
  const store = new Map<string, unknown>();
  return {
    isActive: () => true,
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => void store.set(key, value),
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};

function setup() {
  const prisma = {
    userProperty: { findMany: jest.fn().mockResolvedValue([]) },
    userIntegration: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'admin@x.com' }) },
    activityLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const service = new ActivityLogsService(prisma as any, fakeCls() as any);
  const interceptor = new ActivityLogInterceptor(new Reflector(), service, prisma as any);

  const run = async (
    handlerName: keyof ThingsController,
    reqOverrides: Record<string, unknown> = {},
    handler: () => unknown = () => of({}),
  ) => {
    const req = {
      method: 'PATCH',
      originalUrl: '/things/abc?x=1',
      path: '/things/abc',
      route: { path: '/things/:id' },
      params: { id: 'abc' },
      body: {},
      query: {},
      headers: {
        'user-agent': 'jest',
        'x-request-id': 'req-1',
        'x-client-route': '/dashboard/things',
        'x-session-id': 'sess-1',
      },
      ip: '1.2.3.4',
      user: { id: 'user-1', role: 'ADMIN' },
      ...reqOverrides,
    };
    const context = {
      getType: () => 'http',
      getHandler: () => ThingsController.prototype[handlerName],
      getClass: () => ThingsController,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => handler() as any };
    const result = await lastValueFrom(interceptor.intercept(context, next));
    await flush();
    return result;
  };

  const created = () => prisma.activityLog.create.mock.calls[0]?.[0]?.data;
  return { prisma, service, run, created };
}

describe('ActivityLogInterceptor', () => {
  it('does not log read-only requests without @Audited', async () => {
    const { run, prisma } = setup();
    await run('pushToCms', { method: 'GET' });
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('does not log routes marked @SkipAudit', async () => {
    const { run, prisma } = setup();
    await run('webhook', { method: 'POST' });
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('logs an un-decorated mutating route generically with a derived action', async () => {
    const { run, created } = setup();
    await run('pushToCms', { method: 'POST', body: { note: 'hi' } });

    expect(created()).toMatchObject({
      action: 'things.push_to_cms',
      category: 'things',
      method: 'POST',
      route: '/things/:id',
      path: '/things/abc',
      status_code: 201,
      outcome: ActivityOutcome.SUCCESS,
      actor_id: 'user-1',
      actor_email: 'admin@x.com',
      actor_role: 'ADMIN',
      effective_user_id: 'user-1',
      is_impersonated: false,
      client_route: '/dashboard/things',
      client_session_id: 'sess-1',
      request_id: 'req-1',
      request_body: { note: 'hi' },
    });
    expect(created().changes).toBeUndefined();
  });

  it('logs a GET when the handler is @Audited', async () => {
    const { run, prisma } = setup();
    await run('revealSecrets', { method: 'GET' });
    expect(prisma.activityLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.activityLog.create.mock.calls[0][0].data.action).toBe('secret.reveal');
  });

  it('captures before/after snapshots and the field diff for an update', async () => {
    const { run, prisma, created } = setup();
    prisma.userProperty.findMany
      .mockResolvedValueOnce([{ id: 'abc', title: 'Old', price: 1, updated_at: new Date(1) }])
      .mockResolvedValueOnce([{ id: 'abc', title: 'New', price: 1, updated_at: new Date(2) }]);

    await run('update');

    const [row] = created().changes.createMany.data;
    expect(row).toMatchObject({
      entity_type: 'UserProperty',
      entity_id: 'abc',
      operation: ActivityChangeOperation.UPDATE,
      changes: [{ path: 'title', from: 'Old', to: 'New' }],
    });
    expect(row.before.title).toBe('Old');
    expect(row.after.title).toBe('New');
    expect(created().affected_count).toBe(1);
  });

  it('records deletes with after = null', async () => {
    const { run, prisma, created } = setup();
    prisma.userProperty.findMany
      .mockResolvedValueOnce([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }])
      .mockResolvedValueOnce([]);

    await run('bulkDelete', { method: 'POST', body: { ids: ['a', 'b'] } });

    const rows = created().changes.createMany.data;
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.operation === ActivityChangeOperation.DELETE)).toBe(true);
    expect(rows.every((r: any) => r.after === undefined)).toBe(true);
  });

  it('records creates using the id returned by the handler', async () => {
    const { run, prisma, created } = setup();
    // No `ids` source => no pre-handler read; the single read is the after-snapshot.
    prisma.userProperty.findMany.mockResolvedValueOnce([{ id: 'new-1', title: 'Hello' }]);

    const result = await run('create', { method: 'POST', params: {} }, () => of({ id: 'new-1' }));

    expect(result).toEqual({ id: 'new-1' });
    const [row] = created().changes.createMany.data;
    expect(row).toMatchObject({ entity_id: 'new-1', operation: ActivityChangeOperation.CREATE });
    expect(prisma.userProperty.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: { in: ['new-1'] } } }),
    );
  });

  it('re-runs function id sources after the handler so created rows are captured', async () => {
    const { run, prisma, created } = setup();
    // 1st: resolver before the handler -> nothing yet (empty ids => no snapshot read).
    // 2nd: resolver re-run after the handler -> finds the new row.
    // 3rd: after-snapshot of that row.
    prisma.userProperty.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'made-1' }])
      .mockResolvedValueOnce([{ id: 'made-1', title: 'T' }]);

    await run('composite', { method: 'PUT' });

    const [row] = created().changes.createMany.data;
    expect(row).toMatchObject({ entity_id: 'made-1', operation: ActivityChangeOperation.CREATE });
  });

  it('excludes registry-omitted secret columns from snapshot queries', async () => {
    const { run, prisma } = setup();
    await run('updateIntegration');

    const args = prisma.userIntegration.findMany.mock.calls[0][0];
    expect(args.omit).toEqual({
      api_key_secret: true,
      webhook_key: true,
      password: true,
      config: true,
    });
  });

  it('redacts secrets in the request body', async () => {
    const { run, created } = setup();
    await run('pushToCms', {
      method: 'POST',
      body: { current_password: 'hunter2', api_key_secret: 'sk-live', name: 'x' },
    });
    expect(created().request_body).toEqual({
      current_password: '[REDACTED]',
      api_key_secret: '[REDACTED]',
      name: 'x',
    });
    expect(JSON.stringify(created())).not.toMatch(/hunter2|sk-live/);
  });

  it('flags a changed secret without storing either value', async () => {
    const { run, service, created } = setup();
    await run('withRecordChange', { method: 'PUT' }, () => {
      service.recordChange('Custom', 'c1', { password: 'old-pw', name: 'n' }, { password: 'new-pw', name: 'n' });
      return of({});
    });

    const [row] = created().changes.createMany.data;
    expect(row.changes).toEqual([{ path: 'password', redacted: true }]);
    expect(JSON.stringify(created())).not.toMatch(/old-pw|new-pw/);
  });

  it('flushes recordChange() calls made during the request', async () => {
    const { run, service, created } = setup();
    await run('withRecordChange', { method: 'POST' }, () => {
      service.recordChange('Property', 'p1', { status: 'A' }, { status: 'B' });
      return of({});
    });

    const [row] = created().changes.createMany.data;
    expect(row).toMatchObject({
      entity_type: 'Property',
      entity_id: 'p1',
      changes: [{ path: 'status', from: 'A', to: 'B' }],
    });
  });

  it('attributes impersonated requests to the real actor', async () => {
    const { run, created } = setup();
    await run('pushToCms', {
      method: 'POST',
      user: { id: 'target-user', role: 'ADMIN', actor_id: 'admin-1' },
    });
    expect(created()).toMatchObject({
      actor_id: 'admin-1',
      effective_user_id: 'target-user',
      is_impersonated: true,
    });
  });

  it('logs a failure, keeps the original error and skips snapshots', async () => {
    const { run, prisma, created } = setup();
    prisma.userProperty.findMany.mockResolvedValue([{ id: 'abc', title: 'Old' }]);

    await expect(
      run('update', {}, () => throwError(() => new BadRequestException('nope'))),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(created()).toMatchObject({
      outcome: ActivityOutcome.FAILURE,
      status_code: 400,
      error_message: 'nope',
    });
    expect(created().changes).toBeUndefined();
    // only the pre-handler snapshot was read
    expect(prisma.userProperty.findMany).toHaveBeenCalledTimes(1);
  });

  it('attributes a login response to the returned user and a failed login to the attempted email', async () => {
    const ok = setup();
    await ok.run('pushToCms', { method: 'POST', user: undefined, path: '/auth/email/login', body: { email: 'a@b.com', password: 'x' } },
      () => of({ access_token: 't', user: { id: 'u9', email: 'a@b.com', role: 'USER' } }));
    expect(ok.created()).toMatchObject({ actor_id: 'u9', actor_email: 'a@b.com', actor_role: 'USER' });
    expect(JSON.stringify(ok.created())).not.toMatch(/"t"/);

    const bad = setup();
    await expect(
      bad.run('pushToCms', { method: 'POST', user: undefined, path: '/auth/email/login', body: { email: 'a@b.com', password: 'x' } },
        () => throwError(() => new BadRequestException('Invalid credentials'))),
    ).rejects.toBeDefined();
    expect(bad.created()).toMatchObject({ actor_id: null, actor_email: 'a@b.com', outcome: ActivityOutcome.FAILURE });
  });

  it('extracts job_log_id from the response', async () => {
    const { run, created } = setup();
    await run('pushToCms', { method: 'POST' }, () => of({ job_log_id: 'job-7', enqueued: 3 }));
    expect(created().job_log_id).toBe('job-7');
  });

  it('caps snapshots at MAX_SNAPSHOT_ENTITIES and flags truncation', async () => {
    const { run, prisma, created } = setup();
    const ids = Array.from({ length: MAX_SNAPSHOT_ENTITIES + 25 }, (_, i) => `id-${i}`);
    await run('bulkDelete', { method: 'POST', body: { ids } });

    const requested = prisma.userProperty.findMany.mock.calls[0][0].where.id.in;
    expect(requested).toHaveLength(MAX_SNAPSHOT_ENTITIES);
    expect(created().snapshots_truncated).toBe(true);
  });

  it('never breaks the request when persisting the log fails', async () => {
    const { run, prisma } = setup();
    prisma.activityLog.create.mockRejectedValue(new Error('db down'));
    await expect(run('pushToCms', { method: 'POST' }, () => of({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('never breaks the request when snapshot loading fails', async () => {
    const { run, prisma, created } = setup();
    prisma.userProperty.findMany.mockRejectedValue(new Error('boom'));
    await expect(run('update', {}, () => of({ ok: true }))).resolves.toEqual({ ok: true });
    expect(created()).toBeDefined();
  });
});

describe('defaultAction', () => {
  it('derives a snake_case action from controller and handler names', () => {
    expect(defaultAction('UserPropertiesController', 'pushToCms')).toBe('user_properties.push_to_cms');
    expect(defaultAction('EmailController', 'adminLoginToAccount')).toBe('email.admin_login_to_account');
  });
});
