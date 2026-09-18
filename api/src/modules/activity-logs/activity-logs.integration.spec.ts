import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  INestApplication,
  Injectable,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { ActivityLogsModule } from './activity-logs.module';
import { ActivityLogsService } from './activity-logs.service';
import { Audited } from './decorators/audited.decorator';

/** Stands in for JwtGuard: populates req.user before the (global) interceptor runs. */
@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const raw = req.headers['x-test-user'];
    if (!raw) throw new ForbiddenException('no user');
    req.user = JSON.parse(raw as string);
    return true;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Controller('things')
@UseGuards(FakeAuthGuard)
class ThingsController {
  constructor(private readonly activityLogs: ActivityLogsService) {}

  @Get()
  list() {
    return [];
  }

  @Patch(':id')
  @Audited({ action: 'thing.update', entity: 'UserProperty', ids: { param: 'id' } })
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return { id, ...body };
  }

  @Delete(':id')
  @Audited({ action: 'thing.delete', entity: 'UserProperty', ids: { param: 'id' } })
  async remove() {
    return { deleted: true };
  }

  /** Records from a later async tick to prove the CLS context survives awaits. */
  @Post(':id/merge')
  @Audited({ action: 'thing.merge' })
  async merge(@Param('id') id: string) {
    await sleep(id === 'slow' ? 40 : 5);
    this.activityLogs.recordChange('Property', id, { merged: false }, { merged: true });
    return { ok: true, job_log_id: `job-${id}` };
  }
}

describe('ActivityLogs (HTTP integration)', () => {
  let app: INestApplication;
  const prisma = {
    userProperty: { findMany: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'admin@x.com' }) },
    activityLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const admin = JSON.stringify({ id: 'admin-1', role: 'ADMIN' });
  const impersonating = JSON.stringify({ id: 'user-9', role: 'ADMIN', actor_id: 'admin-1' });

  const flush = async () => {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  const rows = () => prisma.activityLog.create.mock.calls.map((call) => call[0].data);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ActivityLogsModule],
      controllers: [ThingsController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.userProperty.findMany.mockReset().mockResolvedValue([]);
    prisma.activityLog.create.mockClear();
  });

  it('logs a PATCH end-to-end with before/after, headers and redacted body', async () => {
    prisma.userProperty.findMany
      .mockResolvedValueOnce([{ id: 'p1', title: 'Old', updated_at: new Date(1) }])
      .mockResolvedValueOnce([{ id: 'p1', title: 'New', updated_at: new Date(2) }]);

    await request(app.getHttpServer())
      .patch('/things/p1')
      .set('x-test-user', admin)
      .set('x-request-id', 'req-42')
      .set('x-client-route', '/dashboard/properties/p1')
      .set('x-session-id', 'sess-7')
      .send({ title: 'New', password: 'hunter2' })
      .expect(200);
    await flush();

    const [row] = rows();
    expect(row).toMatchObject({
      action: 'thing.update',
      method: 'PATCH',
      route: '/things/:id',
      path: '/things/p1',
      status_code: 200,
      outcome: 'SUCCESS',
      actor_id: 'admin-1',
      actor_email: 'admin@x.com',
      request_id: 'req-42',
      client_route: '/dashboard/properties/p1',
      client_session_id: 'sess-7',
      request_body: { title: 'New', password: '[REDACTED]' },
    });
    expect(row.changes.createMany.data[0]).toMatchObject({
      entity_id: 'p1',
      operation: 'UPDATE',
      changes: [{ path: 'title', from: 'Old', to: 'New' }],
    });
    expect(JSON.stringify(row)).not.toContain('hunter2');
  });

  it('logs deletes and does not log reads', async () => {
    prisma.userProperty.findMany
      .mockResolvedValueOnce([{ id: 'p1', title: 'Gone' }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer()).get('/things').set('x-test-user', admin).expect(200);
    await request(app.getHttpServer()).delete('/things/p1').set('x-test-user', admin).expect(200);
    await flush();

    expect(rows()).toHaveLength(1);
    expect(rows()[0].changes.createMany.data[0].operation).toBe('DELETE');
  });

  it('does not log requests rejected by the guard', async () => {
    await request(app.getHttpServer()).patch('/things/p1').expect(403);
    await flush();
    expect(rows()).toHaveLength(0);
  });

  it('marks impersonated requests', async () => {
    await request(app.getHttpServer())
      .patch('/things/p1')
      .set('x-test-user', impersonating)
      .send({})
      .expect(200);
    await flush();
    expect(rows()[0]).toMatchObject({
      actor_id: 'admin-1',
      effective_user_id: 'user-9',
      is_impersonated: true,
    });
  });

  it('keeps recordChange() collectors isolated across concurrent requests', async () => {
    await Promise.all([
      request(app.getHttpServer()).post('/things/slow/merge').set('x-test-user', admin).expect(201),
      request(app.getHttpServer()).post('/things/fast/merge').set('x-test-user', admin).expect(201),
    ]);
    await flush();

    const byJob = Object.fromEntries(rows().map((row) => [row.job_log_id, row]));
    expect(Object.keys(byJob).sort()).toEqual(['job-fast', 'job-slow']);
    for (const [job, id] of [['job-slow', 'slow'], ['job-fast', 'fast']] as const) {
      const changes = byJob[job].changes.createMany.data;
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ entity_id: id, changes: [{ path: 'merged', from: false, to: true }] });
    }
  });
});
