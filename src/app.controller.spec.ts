import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let queryRaw: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('returns ok when database is reachable', async () => {
      await expect(appController.health()).resolves.toMatchObject({
        status: 'ok',
        database: 'up',
      });
    });

    it('throws 503 when database is unavailable', async () => {
      queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
      await expect(appController.health()).rejects.toMatchObject({
        status: 503,
      });
    });
  });
});
