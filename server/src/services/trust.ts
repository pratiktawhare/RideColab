// ─────────────────────────────────────────────────────────────
// Trust service — block users, file reports
// ─────────────────────────────────────────────────────────────
import { query } from '~/db/pool';
import { logger } from '~/utils/logger';

// ── Block / Unblock ───────────────────────────────────────────
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) {
    throw Object.assign(new Error('You cannot block yourself'), { code: 'INVALID_TARGET', status: 400 });
  }

  try {
    await query(
      `INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [blockerId, blockedId],
    );
    logger.info({ blockerId, blockedId }, 'User blocked');
  } catch (err) {
    throw err;
  }
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await query(
    `DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, blockedId],
  );
  logger.info({ blockerId, blockedId }, 'User unblocked');
}

export async function isBlocked(userId: string, otherUserId: string): Promise<boolean> {
  const res = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM blocked_users
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
     ) AS exists`,
    [userId, otherUserId],
  );
  return res.rows[0]?.exists ?? false;
}

// ── Reports ───────────────────────────────────────────────────
export interface ReportInput {
  reported_id: string;
  booking_id?: string;
  reason: string;
  details?: string;
}

export interface ReportRow {
  id: string;
  reporter_id: string;
  reported_id: string;
  booking_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

export const VALID_REASONS = [
  'unsafe_driving',
  'harassment',
  'no_show',
  'wrong_fare',
  'impersonation',
  'inappropriate_behaviour',
  'other',
];

export async function fileReport(reporterId: string, input: ReportInput): Promise<ReportRow> {
  if (reporterId === input.reported_id) {
    throw Object.assign(new Error('You cannot report yourself'), { code: 'INVALID_TARGET', status: 400 });
  }

  if (!VALID_REASONS.includes(input.reason)) {
    throw Object.assign(
      new Error(`Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}`),
      { code: 'INVALID_REASON', status: 400 },
    );
  }

  // Verify the reported user exists
  const userRes = await query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND is_active = TRUE`,
    [input.reported_id],
  );
  if (!userRes.rows[0]) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND', status: 404 });
  }

  // If booking_id provided, verify it exists and reporter is a participant
  if (input.booking_id) {
    const bookingRes = await query<{ id: string }>(
      `SELECT b.id FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       WHERE b.id = $1 AND (b.passenger_id = $2 OR t.rider_id = $2)`,
      [input.booking_id, reporterId],
    );
    if (!bookingRes.rows[0]) {
      throw Object.assign(new Error('Booking not found or you are not a participant'), { code: 'FORBIDDEN', status: 403 });
    }
  }

  const res = await query<ReportRow>(
    `INSERT INTO reports (reporter_id, reported_id, booking_id, reason, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, reporter_id, reported_id, booking_id, reason, details, status, created_at`,
    [reporterId, input.reported_id, input.booking_id ?? null, input.reason, input.details ?? null],
  );

  logger.info({ reporterId, reportedId: input.reported_id, reason: input.reason }, 'Report filed');
  if (!res.rows[0]) {
    throw Object.assign(new Error('Failed to file report'), { code: 'REPORT_FAILED', status: 500 });
  }
  return res.rows[0];
}

