// ─────────────────────────────────────────────────────────────
// Push notification service — Expo Push Notifications
// Gracefully skips if EXPO_PUSH_ACCESS_TOKEN is not set
// ─────────────────────────────────────────────────────────────
import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import { env } from '~/config/app';
import { logger } from '~/utils/logger';
import { query } from '~/db/pool';

const expo = new Expo({
  accessToken: env.EXPO_PUSH_ACCESS_TOKEN ?? undefined,
});

/**
 * Fetch the Expo push token for a user from the notifications table.
 */
async function getPushToken(userId: string): Promise<string | null> {
  try {
    const res = await query<{ push_token: string }>(
      `SELECT push_token FROM notifications
       WHERE user_id = $1 AND push_token IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    return res.rows[0]?.push_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a push notification to a single user.
 * Silently skips if user has no push token or token is invalid.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!env.EXPO_PUSH_ACCESS_TOKEN) return; // push disabled

  const token = await getPushToken(userId);
  if (!token || !Expo.isExpoPushToken(token)) return;

  const message: ExpoPushMessage = {
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          logger.warn({ ticket }, 'push notification error');
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'push notification send failed (non-fatal)');
  }
}

/**
 * Register a push token for the authenticated user.
 */
export async function registerPushToken(userId: string, pushToken: string): Promise<void> {
  if (!Expo.isExpoPushToken(pushToken)) {
    throw new Error('Invalid Expo push token format');
  }
  await query(
    `INSERT INTO notifications (user_id, push_token, type, title, body)
     VALUES ($1, $2, 'push_token', 'Device Token', 'Push token registered')
     ON CONFLICT (user_id) DO UPDATE SET push_token = $2`,
    [userId, pushToken],
  );
}

