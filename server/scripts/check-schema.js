require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const tables = ['users', 'notifications', 'bookings', 'messages'];
  for (const t of tables) {
    const r = await p.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name=$1",
      [t]
    );
    console.log(`\n${t}: ${r.rows.map(x => x.column_name).join(', ')}`);
  }
  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });

