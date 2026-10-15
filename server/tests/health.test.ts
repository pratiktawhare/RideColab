import request from 'supertest';
import app from '../src/index';

describe('GET /api/v1/health', () => {
  it('returns 200 with success:true and required fields', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      app: 'RideColab',
    });
    expect(typeof res.body.data.version).toBe('string');
    expect(typeof res.body.data.ts).toBe('string');
    expect(typeof res.body.data.uptime_s).toBe('number');
    expect(typeof res.body.data.cold_start_ms).toBe('number');
  });
});

describe('GET /api/v1/version', () => {
  it('returns 200 with version fields', async () => {
    const res = await request(app).get('/api/v1/version');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.version).toBe('string');
    expect(typeof res.body.data.minClientVersion).toBe('string');
  });
});

describe('404 handler', () => {
  it('returns 404 with consistent error shape for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nonexistent-route-xyz');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(typeof res.body.error.message).toBe('string');
  });
});

describe('Error response shape', () => {
  it('all error responses have success:false and error.code', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
