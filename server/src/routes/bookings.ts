import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '~/middleware/authenticate';
import { query } from '~/db/pool';
import { logger } from '~/utils/logger';
import { encryptMessage, decryptMessage } from '~/services/chat';
import {
  createBooking,
  getBookingById,
  getMyBookings,
  acceptBooking,
  declineBooking,
  cancelBooking,
  startRide,
  completeRide,
  generateRideCodeForBooking,
} from '~/services/bookings';
import { registerPushToken } from '~/services/notifications';

const router = Router();
router.use(authenticate);

// ── Validation schemas ────────────────────────────────────────
const CreateBookingSchema = z.object({
  trip_id:       z.string().uuid(),
  seats_booked:  z.number().int().min(1).max(6).default(1),
  pickup_label:  z.string().optional(),
  pickup_lat:    z.number().optional(),
  pickup_lng:    z.number().optional(),
  dropoff_label: z.string().optional(),
  dropoff_lat:   z.number().optional(),
  dropoff_lng:   z.number().optional(),
});

const SendMessageSchema = z.object({
  body: z.string().min(1).max(1000),
});

const RegisterPushSchema = z.object({
  push_token: z.string().min(1),
});

// ── POST /bookings — create booking request ───────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = CreateBookingSchema.parse(req.body);
    const booking = await createBooking(req.user!.sub, data.trip_id, {
      seatsBooked:  data.seats_booked,
      pickupLabel:  data.pickup_label,
      pickupLat:    data.pickup_lat,
      pickupLng:    data.pickup_lng,
      dropoffLabel: data.dropoff_label,
      dropoffLat:   data.dropoff_lat,
      dropoffLng:   data.dropoff_lng,
    });
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// ── GET /bookings/mine ────────────────────────────────────────
router.get('/mine', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookings = await getMyBookings(req.user!.sub);
    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
});

// ── POST /bookings/push-token — register Expo push token ─────
router.post('/push-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { push_token } = RegisterPushSchema.parse(req.body);
    await registerPushToken(req.user!.sub, push_token);
    res.json({ success: true, data: { registered: true } });
  } catch (err) {
    next(err);
  }
});

// ── GET /bookings/:id ─────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookingId = req.params['id']!;
    const booking = await getBookingById(bookingId, req.user!.sub);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found', details: null },
      });
    }
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// ── POST /bookings/:id/accept ─────────────────────────────────
router.post('/:id/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await acceptBooking(req.params['id']!, req.user!.sub);
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// ── POST /bookings/:id/decline ────────────────────────────────
router.post('/:id/decline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await declineBooking(req.params['id']!, req.user!.sub);
    res.json({ success: true, data: { declined: true } });
  } catch (err) {
    next(err);
  }
});

// ── POST /bookings/:id/cancel ─────────────────────────────────
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
    await cancelBooking(req.params['id']!, req.user!.sub, reason);
    res.json({ success: true, data: { cancelled: true } });
  } catch (err) {
    next(err);
  }
});

// ── POST /bookings/:id/ride-code — rider generates code ──────
router.post('/:id/ride-code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = await generateRideCodeForBooking(req.params['id']!, req.user!.sub);
    res.json({ success: true, data: { ride_code: code } });
  } catch (err) {
    next(err);
  }
});

// ── POST /bookings/:id/start — rider starts ride with code ───
router.post('/:id/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ride_code } = z.object({ ride_code: z.string().min(6).max(6) }).parse(req.body);
    const booking = await startRide(req.params['id']!, req.user!.sub, ride_code);
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// ── POST /bookings/:id/complete ───────────────────────────────
router.post('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await completeRide(req.params['id']!, req.user!.sub);
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// ── GET /bookings/:id/messages — chat history ─────────────────
router.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookingId = req.params['id']!;
    const userId = req.user!.sub;

    // Verify participant
    const booking = await getBookingById(bookingId, userId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found', details: null },
      });
    }

    const messagesRes = await query<{
      id: string;
      sender_id: string;
      sender_name: string;
      body_encrypted: string | null;
      iv: string | null;
      created_at: string;
    }>(
      `SELECT m.id, m.sender_id, u.name AS sender_name,
              m.body_encrypted, m.iv, m.sent_at AS created_at
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.booking_id = $1
       ORDER BY m.sent_at ASC`,
      [bookingId],
    );

    const messages = messagesRes.rows.map((msg) => {
      let body = '';
      try {
        if (msg.body_encrypted && msg.iv) {
          body = decryptMessage(msg.body_encrypted, msg.iv, bookingId);
        }
      } catch {
        body = '[message unavailable]';
      }
      return {
        id: msg.id,
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        body,
        created_at: msg.created_at,
        is_mine: msg.sender_id === userId,
      };
    });

    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
});

// ── POST /bookings/:id/messages — send a message ─────────────
router.post('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookingId = req.params['id']!;
    const userId = req.user!.sub;

    const { body } = SendMessageSchema.parse(req.body);

    // Verify participant and booking is not completed/cancelled
    const booking = await getBookingById(bookingId, userId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found', details: null },
      });
    }

    if (['cancelled', 'declined'].includes(booking.status)) {
      return res.status(409).json({
        success: false,
        error: { code: 'BOOKING_CLOSED', message: 'Cannot message on a closed booking', details: null },
      });
    }

    const { bodyEncrypted, iv } = encryptMessage(body, bookingId);

    const msgRes = await query<{ id: string; sent_at: string }>(
      `INSERT INTO messages (booking_id, sender_id, body_encrypted, iv)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sent_at`,
      [bookingId, userId, bodyEncrypted, iv],
    );

    const msg = msgRes.rows[0]!;
    logger.info({ bookingId, userId, messageId: msg.id }, 'chat message sent');

    res.status(201).json({
      success: true,
      data: {
        id: msg.id,
        sender_id: userId,
        body,
        created_at: msg.sent_at,
        is_mine: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

