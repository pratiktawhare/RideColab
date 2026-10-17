import { pool, withTransaction } from './pool';
import { env } from '~/config/app';
import { logger } from '~/utils/logger';
import bcrypt from 'bcryptjs';

// ─────────────────────────────────────────────────────────────
// Seed script — safe to re-run (uses ON CONFLICT DO NOTHING)
// ─────────────────────────────────────────────────────────────

// ── Pune landmarks ────────────────────────────────────────────
const LANDMARKS = [
  { name: 'Pune Railway Station', name_hi: 'पुणे रेलवे स्टेशन', name_mr: 'पुणे रेल्वे स्थानक', category: 'transport', lat: 18.5284, lng: 73.8742 },
  { name: 'Shivajinagar', name_hi: 'शिवाजीनगर', name_mr: 'शिवाजीनगर', category: 'area', lat: 18.5308, lng: 73.8476 },
  { name: 'Hinjewadi IT Park', name_hi: 'हिंजेवाड़ी IT पार्क', name_mr: 'हिंजेवाडी IT पार्क', category: 'office', lat: 18.5912, lng: 73.7390 },
  { name: 'Magarpatta City', name_hi: 'मगरपट्टा सिटी', name_mr: 'मगरपट्टा सिटी', category: 'office', lat: 18.5116, lng: 73.9264 },
  { name: 'Baner', name_hi: 'बाणेर', name_mr: 'बाणेर', category: 'area', lat: 18.5590, lng: 73.7868 },
  { name: 'Wakad', name_hi: 'वाकड', name_mr: 'वाकड', category: 'area', lat: 18.5985, lng: 73.7641 },
  { name: 'Kothrud', name_hi: 'कोथरुड', name_mr: 'कोथरूड', category: 'area', lat: 18.5074, lng: 73.8063 },
  { name: 'Viman Nagar', name_hi: 'विमान नगर', name_mr: 'विमान नगर', category: 'area', lat: 18.5679, lng: 73.9143 },
  { name: 'Hadapsar', name_hi: 'हड़पसर', name_mr: 'हडपसर', category: 'area', lat: 18.5018, lng: 73.9259 },
  { name: 'Pimpri', name_hi: 'पिंपरी', name_mr: 'पिंपरी', category: 'area', lat: 18.6279, lng: 73.7986 },
  { name: 'Chinchwad', name_hi: 'चिंचवड', name_mr: 'चिंचवड', category: 'area', lat: 18.6264, lng: 73.7784 },
  { name: 'Swargate', name_hi: 'स्वारगेट', name_mr: 'स्वारगेट', category: 'transport', lat: 18.5001, lng: 73.8578 },
  { name: 'Deccan Gymkhana', name_hi: 'डेक्कन जिमखाना', name_mr: 'डेक्कन जिमखाना', category: 'area', lat: 18.5175, lng: 73.8401 },
  { name: 'Camp (Pune Cantonment)', name_hi: 'कैंप', name_mr: 'कॅम्प', category: 'area', lat: 18.5204, lng: 73.8777 },
  { name: 'Kharadi', name_hi: 'खराड़ी', name_mr: 'खराडी', category: 'office', lat: 18.5500, lng: 73.9396 },
  { name: 'Pune Airport', name_hi: 'पुणे हवाई अड्डा', name_mr: 'पुणे विमानतळ', category: 'transport', lat: 18.5822, lng: 73.9197 },
  { name: 'Aundh', name_hi: 'औंध', name_mr: 'औंध', category: 'area', lat: 18.5596, lng: 73.8079 },
  { name: 'Bavdhan', name_hi: 'बावधन', name_mr: 'बावधन', category: 'area', lat: 18.5280, lng: 73.7696 },
  { name: 'Katraj', name_hi: 'कात्रज', name_mr: 'कात्रज', category: 'area', lat: 18.4531, lng: 73.8562 },
  { name: 'Pune University', name_hi: 'पुणे विश्वविद्यालय', name_mr: 'पुणे विद्यापीठ', category: 'education', lat: 18.5593, lng: 73.8143 },
  { name: 'COEP', name_hi: 'सीओईपी', name_mr: 'COEP', category: 'education', lat: 18.5300, lng: 73.8571 },
  { name: 'Zeal College of Engineering and Research', name_hi: 'जील इंजीनियरिंग और अनुसंधान कॉलेज', name_mr: 'झील अभियांत्रिकी व संशोधन महाविद्यालय', category: 'education', lat: 18.4698, lng: 73.8503 },
  { name: 'Symbiosis', name_hi: 'सिम्बायोसिस', name_mr: 'सिम्बायोसिस', category: 'education', lat: 18.5116, lng: 73.8158 },
  { name: 'Phoenix Mall Wakad', name_hi: 'फीनिक्स मॉल वाकड', name_mr: 'फिनिक्स मॉल वाकड', category: 'shopping', lat: 18.5991, lng: 73.7644 },
  { name: 'Amanora Mall', name_hi: 'अमनोरा मॉल', name_mr: 'अमनोरा मॉल', category: 'shopping', lat: 18.5051, lng: 73.9299 },
  { name: 'Koregaon Park', name_hi: 'कोरेगांव पार्क', name_mr: 'कोरेगाव पार्क', category: 'area', lat: 18.5362, lng: 73.8943 },
  { name: 'Yerwada', name_hi: 'येरवडा', name_mr: 'येरवडा', category: 'area', lat: 18.5497, lng: 73.8897 },
  { name: 'Kondhwa', name_hi: 'कोंढवा', name_mr: 'कोंढवा', category: 'area', lat: 18.4763, lng: 73.8835 },
  { name: 'Wagholi', name_hi: 'वाघोली', name_mr: 'वाघोळी', category: 'area', lat: 18.5731, lng: 73.9855 },
  { name: 'Pimple Saudagar', name_hi: 'पिंपले सौदागर', name_mr: 'पिंपळे सौदागर', category: 'area', lat: 18.6066, lng: 73.7861 },
];

// ── Vehicle catalog (sample — ARAI figures, placeholder note) ─
const VEHICLE_CATALOG = [
  // Cars - Petrol
  { type: 'car', make: 'Maruti Suzuki', model: 'Swift', variant: 'VXi', fuel_type: 'petrol', claimed_kmpl: 23.20, seats: 5 },
  { type: 'car', make: 'Maruti Suzuki', model: 'Dzire', variant: 'VXi', fuel_type: 'petrol', claimed_kmpl: 23.26, seats: 5 },
  { type: 'car', make: 'Maruti Suzuki', model: 'Baleno', variant: 'Sigma', fuel_type: 'petrol', claimed_kmpl: 22.35, seats: 5 },
  { type: 'car', make: 'Maruti Suzuki', model: 'WagonR', variant: '1.0 LXi', fuel_type: 'petrol', claimed_kmpl: 24.43, seats: 5 },
  { type: 'car', make: 'Maruti Suzuki', model: 'Alto K10', variant: 'Std', fuel_type: 'petrol', claimed_kmpl: 24.90, seats: 5 },
  { type: 'car', make: 'Hyundai', model: 'i20', variant: 'Magna', fuel_type: 'petrol', claimed_kmpl: 20.35, seats: 5 },
  { type: 'car', make: 'Hyundai', model: 'Verna', variant: 'S', fuel_type: 'petrol', claimed_kmpl: 18.40, seats: 5 },
  { type: 'car', make: 'Hyundai', model: 'Creta', variant: 'E', fuel_type: 'petrol', claimed_kmpl: 17.40, seats: 5 },
  { type: 'car', make: 'Honda', model: 'Amaze', variant: 'S MT', fuel_type: 'petrol', claimed_kmpl: 19.00, seats: 5 },
  { type: 'car', make: 'Honda', model: 'City', variant: 'S MT', fuel_type: 'petrol', claimed_kmpl: 17.80, seats: 5 },
  { type: 'car', make: 'Tata', model: 'Nexon', variant: 'Smart', fuel_type: 'petrol', claimed_kmpl: 17.01, seats: 5 },
  { type: 'car', make: 'Tata', model: 'Punch', variant: 'Pure', fuel_type: 'petrol', claimed_kmpl: 18.82, seats: 5 },
  { type: 'car', make: 'Renault', model: 'Kwid', variant: 'STD', fuel_type: 'petrol', claimed_kmpl: 22.30, seats: 5 },
  { type: 'car', make: 'Kia', model: 'Sonet', variant: 'HTX', fuel_type: 'petrol', claimed_kmpl: 18.40, seats: 5 },
  { type: 'car', make: 'Toyota', model: 'Glanza', variant: 'S', fuel_type: 'petrol', claimed_kmpl: 22.35, seats: 5 },
  // Cars - Diesel
  { type: 'car', make: 'Maruti Suzuki', model: 'Dzire', variant: 'VDi', fuel_type: 'diesel', claimed_kmpl: 31.12, seats: 5 },
  { type: 'car', make: 'Hyundai', model: 'Creta', variant: 'E (Diesel)', fuel_type: 'diesel', claimed_kmpl: 21.40, seats: 5 },
  { type: 'car', make: 'Kia', model: 'Seltos', variant: 'HTX (Diesel)', fuel_type: 'diesel', claimed_kmpl: 21.00, seats: 5 },
  { type: 'car', make: 'Tata', model: 'Nexon', variant: 'Smart (Diesel)', fuel_type: 'diesel', claimed_kmpl: 20.47, seats: 5 },
  { type: 'car', make: 'MG', model: 'Hector', variant: 'Style (Diesel)', fuel_type: 'diesel', claimed_kmpl: 16.96, seats: 5 },
  // Cars - CNG
  { type: 'car', make: 'Maruti Suzuki', model: 'Ertiga', variant: 'VXi CNG', fuel_type: 'cng', claimed_kmpl: 26.08, seats: 7 },
  { type: 'car', make: 'Maruti Suzuki', model: 'WagonR', variant: 'CNG', fuel_type: 'cng', claimed_kmpl: 34.05, seats: 5 },
  { type: 'car', make: 'Hyundai', model: 'Aura', variant: 'S CNG', fuel_type: 'cng', claimed_kmpl: 28.40, seats: 5 },
  // EVs
  { type: 'ev', make: 'Tata', model: 'Nexon EV', variant: 'Medium Range', fuel_type: 'electric', kwh_per_100km: 13.5, claimed_kmpl: null, seats: 5 },
  { type: 'ev', make: 'Tata', model: 'Tiago EV', variant: 'XT', fuel_type: 'electric', kwh_per_100km: 12.0, claimed_kmpl: null, seats: 5 },
  { type: 'ev', make: 'MG', model: 'Comet EV', variant: 'Pace', fuel_type: 'electric', kwh_per_100km: 10.5, claimed_kmpl: null, seats: 4 },
  { type: 'ev', make: 'Mahindra', model: 'XUV400 EV', variant: 'EC Pro', fuel_type: 'electric', kwh_per_100km: 15.1, claimed_kmpl: null, seats: 5 },
  // Bikes - Petrol
  { type: 'bike', make: 'Honda', model: 'Activa 6G', variant: 'Std', fuel_type: 'petrol', claimed_kmpl: 60.00, seats: 2 },
  { type: 'bike', make: 'Hero', model: 'Splendor Plus', variant: 'Kick', fuel_type: 'petrol', claimed_kmpl: 60.00, seats: 2 },
  { type: 'bike', make: 'Hero', model: 'Passion Pro', variant: 'Kick', fuel_type: 'petrol', claimed_kmpl: 65.00, seats: 2 },
  { type: 'bike', make: 'Bajaj', model: 'Pulsar 150', variant: 'Std', fuel_type: 'petrol', claimed_kmpl: 49.50, seats: 2 },
  { type: 'bike', make: 'TVS', model: 'Jupiter', variant: 'Std', fuel_type: 'petrol', claimed_kmpl: 62.00, seats: 2 },
  { type: 'bike', make: 'Royal Enfield', model: 'Meteor 350', variant: 'Fireball', fuel_type: 'petrol', claimed_kmpl: 36.20, seats: 2 },
];

// ── App config defaults ───────────────────────────────────────
const APP_CONFIG: Array<{ key: string; value: string; description: string }> = [
  { key: 'fare.real_world_factor', value: '0.8', description: 'Multiplier applied to ARAI mileage for real-world fare cap' },
  { key: 'trip.weekly_limit', value: '14', description: 'Max trips a rider can post per week (Mon-Sun)' },
  { key: 'trip.max_seats', value: '6', description: 'Maximum seats a rider can offer on a single trip' },
  { key: 'trust.min_score_to_ride', value: '0', description: 'Minimum trust score to make a booking' },
  { key: 'trust.min_score_to_post', value: '0', description: 'Minimum trust score to post a trip' },
  { key: 'cache.ors_ttl_hours', value: '24', description: 'TTL in hours for ORS geocoding cache' },
  { key: 'cache.route_ttl_days', value: '30', description: 'TTL in days for ORS directions route cache' },
  { key: 'weather.cache_ttl_hours', value: '1', description: 'TTL in hours for Open-Meteo weather cache' },
  { key: 'app.disclaimer', value: 'Not a taxi service. No commission. Student project.', description: 'In-app legal disclaimer text' },
  { key: 'app.maintenance_mode', value: 'false', description: 'Set to true to show maintenance screen' },
];

async function seed(): Promise<void> {
  logger.info('Starting seed...');

  await withTransaction(async (client) => {
    // ── Landmarks
    logger.info('Seeding landmarks...');
    for (const lm of LANDMARKS) {
      await client.query(
        `INSERT INTO landmarks (name, name_hi, name_mr, category, location, city)
         VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($6, $5), 4326), 'Pune')
         ON CONFLICT DO NOTHING`,
        [lm.name, lm.name_hi, lm.name_mr, lm.category, lm.lat, lm.lng],
      );
    }
    logger.info({ count: LANDMARKS.length }, 'Landmarks seeded');

    // ── Vehicle catalog
    logger.info('Seeding vehicle catalog...');
    for (const v of VEHICLE_CATALOG) {
      await client.query(
        `INSERT INTO vehicle_catalog (type, make, model, variant, fuel_type, claimed_kmpl, kwh_per_100km, seats, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ARAI — placeholder figures, verify before launch')
         ON CONFLICT DO NOTHING`,
        [v.type, v.make, v.model, v.variant ?? null, v.fuel_type, v.claimed_kmpl ?? null, (v as { kwh_per_100km?: number }).kwh_per_100km ?? null, v.seats],
      );
    }
    logger.info({ count: VEHICLE_CATALOG.length }, 'Vehicle catalog seeded');

    // ── Fuel prices (₹ as of Phase 2)
    logger.info('Seeding fuel prices...');
    const fuelPrices = [
      { fuel_type: 'petrol',   price: 106.00, unit: 'litre' },
      { fuel_type: 'diesel',   price:  92.00, unit: 'litre' },
      { fuel_type: 'cng',      price:  85.00, unit: 'kg' },
      { fuel_type: 'electric', price:   8.00, unit: 'kWh' },
    ];
    for (const fp of fuelPrices) {
      await client.query(
        `INSERT INTO fuel_prices (fuel_type, price_per_unit, unit)
         VALUES ($1, $2, $3)
         ON CONFLICT (fuel_type) DO UPDATE SET price_per_unit = EXCLUDED.price_per_unit`,
        [fp.fuel_type, fp.price, fp.unit],
      );
    }
    logger.info('Fuel prices seeded');

    // ── App config
    logger.info('Seeding app_config...');
    for (const cfg of APP_CONFIG) {
      await client.query(
        `INSERT INTO app_config (key, value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [cfg.key, cfg.value, cfg.description],
      );
    }
    logger.info({ count: APP_CONFIG.length }, 'App config seeded');

    // ── Admin user
    const adminEmail = env.ADMIN_EMAIL;
    const adminPasswordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

    const existingAdmin = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail],
    );
    if (existingAdmin.rows.length === 0) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, name, role, mode, consent_given_at)
         VALUES ($1, $2, 'Admin', 'admin', 'rider', NOW())
         RETURNING id`,
        [adminEmail, adminPasswordHash],
      );
      await client.query(
        'INSERT INTO trust_scores (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        [rows[0]!.id],
      );
      logger.info({ email: adminEmail }, 'Admin user created');
    } else {
      logger.info({ email: adminEmail }, 'Admin user already exists — skipping');
    }

    // ── Demo community
    await client.query(
      `INSERT INTO communities (name, description, invite_code)
       VALUES ('Zeal College', 'Students and alumni of Zeal College of Engineering and Research, Pune', 'ZEAL2025')
       ON CONFLICT (invite_code) DO NOTHING`,
    );
    logger.info('Demo community seeded');

    // ── Demo users
    const demoHash = await bcrypt.hash('Demo@1234', 12);
    for (const u of [
      { email: 'rider@demo.ridecolab.dev', name: 'Demo Rider', mode: 'rider' },
      { email: 'passenger@demo.ridecolab.dev', name: 'Demo Passenger', mode: 'passenger' },
    ]) {
      const exists = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (exists.rows.length === 0) {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, name, mode, consent_given_at)
           VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
          [u.email, demoHash, u.name, u.mode],
        );
        await client.query(
          'INSERT INTO trust_scores (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          [rows[0]!.id],
        );
        logger.info({ email: u.email }, 'Demo user created');
      }
    }
  });

  logger.info('✅ Seed complete');
  await pool.end();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
