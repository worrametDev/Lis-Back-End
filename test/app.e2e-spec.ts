import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from './../src/prisma/prisma.service';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';
import { MonitoringController } from './../src/monitoring/monitoring.controller';
import { MetricsService } from './../src/monitoring/metrics.service';
import { ConfigService } from '@nestjs/config';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController, MonitoringController],
      providers: [
        AppService,
        MetricsService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('e2e-monitoring-token') },
        },
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET) returns database readiness', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'ok', database: 'up' });
      });
  });

  it('/health (GET) returns 503 when database is unavailable', async () => {
    queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    await request(app.getHttpServer()).get('/health').expect(503);
  });

  it('/metrics (GET) rejects missing monitoring token', () => {
    return request(app.getHttpServer()).get('/metrics').expect(401);
  });

  it('/metrics (GET) returns Prometheus-compatible metrics', () => {
    return request(app.getHttpServer())
      .get('/metrics')
      .set('x-monitoring-token', 'e2e-monitoring-token')
      .expect(200)
      .expect('content-type', /text\/plain/)
      .expect((response) => {
        expect(response.text).toContain('process_uptime_seconds');
      });
  });
});
