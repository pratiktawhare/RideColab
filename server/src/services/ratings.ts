// ─────────────────────────────────────────────────────────────
// Ratings service — submit reviews, paginate, recalc trust score
// ─────────────────────────────────────────────────────────────
import { query } from '~/db/pool';
import { logger } from '~/utils/logger';

// ── Types ──────────────────────────────────────────────────────
export interface ReviewInput {
  rating: number;        // 1–5
  tags: string[];        // e.g. ['Punctual', 'Safe Driver']
  comment?: string;
}

export interface ReviewRow {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewee_id: string;
  rating: number;
  tags: string[];
  comment: string | null;
  created_at: string;
}

// Valid rating tags
export const VALID_TAGS = [
  'Punctual', 'Safe Driver', 'Clean Vehicle', 'Friendly',
  'Good Communicator', 'Late', 'Unsafe Driving', 'Rude',
];

// ── Trust score computation ────────────────────────────────────
export interface TrustScore {
  score: number;
  badge: 'New' | 'Regular' | 'Trusted' | 'Verified';
  avg_rating: number;
  total_trips: number;
  total_ratings: number;
  community_member: boolean;
  profile_complete: boolean;
  cancellation_rate: number;
}

export function getTrustBadge(score: number): 'New' | 'Regular' | 'Trusted' | 'Verified' {
  if (score >= 76) return 'Verified';
  if (score >= 51) return 'Trusted';
  if (score >= 21) return 'Regular';
  return 'New';
}

export async function recalcTrustScore(userId: string): Promise<TrustScore> {
  // 1. Profile completeness (upi_id set + declarations done = 100%)
  const profileRes = await query<{
    has_upi: boolean;
    has_declaration: boolean;
  }>(
    `SELECT
       (u.upi_id IS NOT NULL AND u.upi_id != '') AS has_upi,
       EXISTS(SELECT 1 FROM user_declarations WHERE user_id = u.id AND has_valid_licence = TRUE) AS has_declaration
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  const profile = profileRes.rows[0] ?? { has_upi: false, has_declaration: false };
  const profileComplete = profile.has_upi && profile.has_declaration;

  // 2. Community member
  const communityRes = await query<{ is_member: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM community_members WHERE user_id = $1) AS is_member`,
    [userId],
  );
  const communityMember = communityRes.rows[0]?.is_member ?? false;

  // 3. Completed trips (as rider OR passenger)
  const tripsRes = await query<{ total_trips: string }>(
    `SELECT
       (
         (SELECT COUNT(*) FROM trips        WHERE rider_id = $1    AND status = 'completed') +
         (SELECT COUNT(*) FROM bookings     WHERE passenger_id = $1 AND status = 'completed')
       ) AS total_trips`,
    [userId],
  );
  const totalTrips = parseInt(tripsRes.rows[0]?.total_trips ?? '0', 10);

  // 4. Average rating
  const ratingRes = await query<{ avg_rating: string; total_ratings: string }>(
    `SELECT
       COALESCE(AVG(rating), 0)::NUMERIC(3,2) AS avg_rating,
       COUNT(*) AS total_ratings
     FROM reviews WHERE reviewee_id = $1`,
    [userId],
  );
  const avgRating = parseFloat(ratingRes.rows[0]?.avg_rating ?? '0');
  const totalRatings = parseInt(ratingRes.rows[0]?.total_ratings ?? '0', 10);

  // 5. Cancellation rate (last 30 days)
  const cancelRes = await query<{ cancel_rate: string }>(
    `SELECT
       CASE WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::NUMERIC / COUNT(*), 4)
       END AS cancel_rate
     FROM bookings
     WHERE passenger_id = $1
       AND created_at >= NOW() - INTERVAL '30 days'`,
    [userId],
  );
  const cancellationRate = parseFloat(cancelRes.rows[0]?.cancel_rate ?? '0');

  // ── Formula ──
  const scoreRaw =
    (profileComplete ? 15 : 0) +
    (communityMember ? 10 : 0) +
    Math.min(totalTrips * 2, 30) +
    (avgRating / 5) * 25 +
    (1 - cancellationRate) * 20;

  const score = Math.round(Math.min(100, Math.max(0, scoreRaw)));
  const badge = getTrustBadge(score);

  // Persist to trust_scores (upsert)
  await query(
    `INSERT INTO trust_scores
       (user_id, score, total_trips, avg_rating, total_ratings, cancellation_rate, community_member, profile_complete)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       score              = EXCLUDED.score,
       total_trips        = EXCLUDED.total_trips,
       avg_rating         = EXCLUDED.avg_rating,
       total_ratings      = EXCLUDED.total_ratings,
       cancellation_rate  = EXCLUDED.cancellation_rate,
       community_member   = EXCLUDED.community_member,
       profile_complete   = EXCLUDED.profile_complete,
       updated_at         = NOW()`,
    [userId, score, totalTrips, avgRating, totalRatings, cancellationRate, communityMember, profileComplete],
  );

  logger.debug({ userId, score, badge }, 'Trust score recalculated');
  return { score, badge, avg_rating: avgRating, total_trips: totalTrips, total_ratings: totalRatings, community_member: communityMember, profile_complete: profileComplete, cancellation_rate: cancellationRate };
}

// ── Submit rating ──────────────────────────────────────────────
export async function submitRating(
  bookingId: string,
  reviewerId: string,
  input: ReviewInput,
): Promise<ReviewRow> {
  // 1. Validate rating value
  if (input.rating < 1 || input.rating > 5) {
    throw Object.assign(new Error('Rating must be between 1 and 5'), { code: 'RATING_INVALID', status: 400 });
  }

  // 2. Validate tags
  const invalidTags = input.tags.filter(t => !VALID_TAGS.includes(t));
  if (invalidTags.length > 0) {
    throw Object.assign(new Error(`Invalid tags: ${invalidTags.join(', ')}`), { code: 'TAG_INVALID', status: 400 });
  }

  // 3. Fetch booking and verify participation + completion + 24h window
  const bookingRes = await query<{
    id: string;
    passenger_id: string;
    rider_id: string;
    status: string;
    completed_at: string | null;
  }>(
    `SELECT b.id, b.passenger_id, t.rider_id, b.status, b.completed_at
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     WHERE b.id = $1`,
    [bookingId],
  );

  const booking = bookingRes.rows[0];
  if (!booking) {
    throw Object.assign(new Error('Booking not found'), { code: 'NOT_FOUND', status: 404 });
  }

  // Must be a participant
  const isPassenger = booking.passenger_id === reviewerId;
  const isRider = booking.rider_id === reviewerId;
  if (!isPassenger && !isRider) {
    throw Object.assign(new Error('You are not a participant in this booking'), { code: 'FORBIDDEN', status: 403 });
  }

  // Must be completed
  if (booking.status !== 'completed') {
    throw Object.assign(new Error('You can only rate a completed ride'), { code: 'BOOKING_NOT_COMPLETED', status: 422 });
  }

  // Must be within 24 hours
  if (!booking.completed_at) {
    throw Object.assign(new Error('Booking completion time not found'), { code: 'BOOKING_NOT_COMPLETED', status: 422 });
  }
  const completedAt = new Date(booking.completed_at);
  const hoursElapsed = (Date.now() - completedAt.getTime()) / 1000 / 3600;
  if (hoursElapsed > 24) {
    throw Object.assign(new Error('Rating window has closed (24 hours after completion)'), { code: 'RATING_WINDOW_CLOSED', status: 403 });
  }

  // Reviewee is the other person
  const revieweeId = isPassenger ? booking.rider_id : booking.passenger_id;

  // 4. Insert review (UNIQUE constraint handles duplicates)
  try {
    const res = await query<ReviewRow>(
      `INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, tags, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, booking_id, reviewer_id, reviewee_id, rating, tags, comment, created_at`,
      [bookingId, reviewerId, revieweeId, input.rating, input.tags, input.comment ?? null],
    );
    const review = res.rows[0];
    if (!review) {
      throw Object.assign(new Error('Failed to create review'), { code: 'REVIEW_FAILED', status: 500 });
    }

    // 5. Recalculate trust score for the reviewee
    await recalcTrustScore(revieweeId);

    return review;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505') {
      throw Object.assign(new Error('You have already rated this booking'), { code: 'ALREADY_RATED', status: 409 });
    }
    throw err;
  }
}

// ── Get ratings for a user ─────────────────────────────────────
export async function getRatings(
  userId: string,
  page = 1,
  limit = 20,
): Promise<{ reviews: ReviewRow[]; total: number; page: number }> {
  const offset = (page - 1) * limit;

  const [reviewsRes, countRes] = await Promise.all([
    query<ReviewRow & { reviewer_name: string }>(
      `SELECT
         r.id, r.booking_id, r.reviewer_id, u.name AS reviewer_name,
         r.reviewee_id, r.rating, r.tags, r.comment, r.created_at
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM reviews WHERE reviewee_id = $1`,
      [userId],
    ),
  ]);

  return {
    reviews: reviewsRes.rows,
    total: parseInt(countRes.rows[0]?.total ?? '0', 10),
    page,
  };
}

// ── Get trust score for a user ─────────────────────────────────
export async function getTrustScore(userId: string): Promise<TrustScore> {
  const res = await query<{
    score: string;
    total_trips: string;
    avg_rating: string;
    total_ratings: string;
    cancellation_rate: string;
    community_member: boolean;
    profile_complete: boolean;
  }>(
    `SELECT score, total_trips, avg_rating, total_ratings, cancellation_rate, community_member, profile_complete
     FROM trust_scores WHERE user_id = $1`,
    [userId],
  );

  if (!res.rows[0]) {
    // Not yet seeded — recalc on the fly
    return recalcTrustScore(userId);
  }

  const row = res.rows[0];
  const score = Math.round(parseFloat(row.score));
  return {
    score,
    badge: getTrustBadge(score),
    avg_rating: parseFloat(row.avg_rating),
    total_trips: parseInt(row.total_trips, 10),
    total_ratings: parseInt(row.total_ratings, 10),
    community_member: row.community_member,
    profile_complete: row.profile_complete,
    cancellation_rate: parseFloat(row.cancellation_rate),
  };
}

