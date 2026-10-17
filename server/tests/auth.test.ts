import request from 'supertest';
import app from '../src/index';
import { pool, query } from '../src/db/pool';

// ─────────────────────────────────────────────────────────────
// Phase 3 — Auth integration tests
// ─────────────────────────────────────────────────────────────

const TEST_EMAIL = `test_${Date.now()}@ridecolab.test`;
const TEST_PASSWORD = 'Test@12345';
const TEST_NAME = 'Test User';

let accessToken: string;
let refreshToken: string;
let userId: string;

afterAll(async () => {
  // Clean up test user
  await query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
  await pool.end();
});

describe('POST /auth/register', () => {
  it('creates a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
    expect(res.body.data.user.email).toBe(TEST_EMAIL);

    accessToken = res.body.data.access_token as string;
    refreshToken = res.body.data.refresh_token as string;
    userId = res.body.data.user.id as string;
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTH_EMAIL_EXISTS');
  });

  it('rejects short password with 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'other@test.com', password: '123', name: 'X' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  it('returns tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toBeTruthy();
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@nope.com', password: 'anything' });

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
    // Update for subsequent tests
    accessToken = res.body.data.access_token as string;
    refreshToken = res.body.data.refresh_token as string;
  });

  it('rejects invalid refresh token with 401', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refresh_token: 'invalid_token_xyz' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/users/me', () => {
  it('returns profile with valid token', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(TEST_EMAIL);
    expect(res.body.data.trust_score).toBeDefined();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('updates profile fields', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated Name', language: 'hi' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
    expect(res.body.data.language).toBe('hi');
  });
});

describe('PATCH /api/v1/users/me/settings', () => {
  it('switches mode to rider', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mode: 'rider' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('rider');
  });
});

describe('POST /auth/consent', () => {
  it('records consent', async () => {
    const res = await request(app)
      .post('/auth/consent')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Emergency contacts', () => {
  let contactId: string;

  it('adds an emergency contact', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/emergency-contacts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Parent', phone: '9876543210', relation: 'parent' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Parent');
    contactId = res.body.data.id as string;
  });

  it('lists emergency contacts', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/emergency-contacts')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('deletes emergency contact', async () => {
    const res = await request(app)
      .delete(`/api/v1/users/me/emergency-contacts/${contactId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/users/me/declarations', () => {
  it('records licence and insurance declaration', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/declarations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ has_valid_licence: true, has_insurance: true });

    expect(res.status).toBe(200);
    expect(res.body.data.has_valid_licence).toBe(true);
  });
});

describe('GET /api/v1/catalog/vehicles', () => {
  it('returns vehicle catalog without auth', async () => {
    const res = await request(app).get('/api/v1/catalog/vehicles');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('filters by type=car', async () => {
    const res = await request(app).get('/api/v1/catalog/vehicles?type=car');
    expect(res.status).toBe(200);
    expect(res.body.data.every((v: { type: string }) => v.type === 'car')).toBe(true);
  });
});

describe('My vehicles', () => {
  let catalogId: string;
  let vehicleId: string;

  it('gets a catalog ID to use', async () => {
    const res = await request(app).get('/api/v1/catalog/vehicles?type=car');
    catalogId = res.body.data[0].id as string;
    expect(catalogId).toBeTruthy();
  });

  it('adds a vehicle', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/vehicles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ catalog_id: catalogId, plate_number: 'MH12AB1234' });

    expect(res.status).toBe(201);
    vehicleId = res.body.data.id as string;
  });

  it('lists my vehicles', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/vehicles')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a vehicle', async () => {
    const res = await request(app)
      .delete(`/api/v1/users/me/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/v1/users/me (DPDP anonymise)', () => {
  it('anonymises account', async () => {
    const res = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
