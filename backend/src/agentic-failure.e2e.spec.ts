import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './presentation/app.module';
import { SqliteConfig } from './infrastructure/config/sqlite.config';

describe('Agent ecosystem e2e without OPENAI_API_KEY', () => {
  let app: INestApplication;
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SqliteConfig)
      .useValue({ dbPath: ':memory:' })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (app) await app.close();
  });

  it('returns a server error for /api/agents/architecture but keeps the app alive', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/agents/architecture')
      .send({ request: 'Design an autonomous agent ecosystem' });

    expect(response.status).toBeGreaterThanOrEqual(500);

    await request(app.getHttpServer()).get('/api/health').expect(200);
  }, 30000);

  it('returns a server error for /api/agents/deploy but keeps the app alive', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/agents/deploy')
      .send({
        request: 'Design an autonomous agent ecosystem',
        workspaceName: 'no-key-check',
      });

    expect(response.status).toBeGreaterThanOrEqual(500);

    await request(app.getHttpServer()).get('/api/health').expect(200);
  }, 30000);
});
