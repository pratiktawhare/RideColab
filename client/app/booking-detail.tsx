// ─────────────────────────────────────────────────────────────
// Booking Detail screen — full state machine UI (Phase 8)
// Rider: accept/decline/generate code/start/complete
// Passenger: view status, show ride code, pay, chat, cancel
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Linking, KeyboardAvoidingView,
  Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { bookingApi, Booking, ChatMessage } from '@/services/api';

// ── Status colours ─────────────────────────────────────────────
const STATUS_META: Record<string, { color: string; label: string; emoji: string }> = {
  pending:   { color: '#F59E0B', label: 'Pending approval',  emoji: '⏳' },
  accepted:  { color: '#10B981', label: 'Accepted',          emoji: '✅' },
  started:   { color: '#3B82F6', label: 'Ride in progress',  emoji: '🚗' },
  completed: { color: '#6B7280', label: 'Completed',         emoji: '🏁' },
  declined:  { color: '#EF4444', label: 'Declined',          emoji: '❌' },
  cancelled: { color: '#EF4444', label: 'Cancelled',         emoji: '🚫' },
};

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useThemeStore();
  const c = theme.colors;
  const { user } = useAuthStore();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [rideCode, setRideCode] = useState('');
  const [rideCodeInput, setRideCodeInput] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelInput, setShowCancelInput] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isRider = booking?.rider_id === user?.id;
  const isPassenger = booking?.passenger_id === user?.id;
  const sm = STATUS_META[booking?.status ?? 'pending'] ?? STATUS_META.pending;

  const loadBooking = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const [b, msgs] = await Promise.all([
        bookingApi.getById(id),
        bookingApi.getMessages(id).catch(() => [] as ChatMessage[]),
      ]);
      setBooking(b);
      setMessages(msgs);
      if (b.ride_code) setRideCode(b.ride_code);
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Could not load booking');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { loadBooking(); }, [loadBooking]);

  // ── Actions ─────────────────────────────────────────────────

  const doAccept = async () => {
    if (!booking) return;
    setActionLoading(true);
    try {
      const updated = await bookingApi.accept(booking.id);
      setBooking(updated);
    } catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setActionLoading(false); }
  };

  const doDecline = async () => {
    if (!booking) return;
    Alert.alert('Decline booking?', 'This will free the seats and notify the passenger.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await bookingApi.decline(booking.id);
            await loadBooking(true);
          } catch (e) { Alert.alert('Error', (e as Error).message); }
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const doGenerateCode = async () => {
    if (!booking) return;
    setCodeLoading(true);
    try {
      const res = await bookingApi.generateRideCode(booking.id);
      setRideCode(res.ride_code);
    } catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setCodeLoading(false); }
  };

  const doStart = async () => {
    if (!booking) return;
    if (rideCodeInput.trim().length !== 6) {
      Alert.alert('Enter 6-character ride code', 'Ask the passenger to show you their ride code.');
      return;
    }
    setActionLoading(true);
    try {
      const updated = await bookingApi.startRide(booking.id, rideCodeInput.trim().toUpperCase());
      setBooking(updated);
      setRideCodeInput('');
    } catch (e) { Alert.alert('Wrong code', (e as Error).message); }
    finally { setActionLoading(false); }
  };

  const doComplete = async () => {
    if (!booking) return;
    Alert.alert('Complete ride?', 'This will mark the trip as done.', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Complete', onPress: async () => {
          setActionLoading(true);
          try {
            const updated = await bookingApi.complete(booking.id);
            setBooking(updated);
          } catch (e) { Alert.alert('Error', (e as Error).message); }
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const doCancel = async () => {
    if (!booking) return;
    setActionLoading(true);
    try {
      await bookingApi.cancel(booking.id, cancelReason || undefined);
      setShowCancelInput(false);
      setCancelReason('');
      await loadBooking(true);
    } catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setActionLoading(false); }
  };

  const doSendMessage = async () => {
    if (!booking || !msgText.trim()) return;
    setSending(true);
    try {
      const msg = await bookingApi.sendMessage(booking.id, msgText.trim());
      setMessages((prev) => [...prev, msg]);
      setMsgText('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { Alert.alert('Error', (e as Error).message); }
    finally { setSending(false); }
  };

  const doUpiPay = () => {
    if (!booking?.fare_share || !booking.rider_id) return;
    // UPI deep link — no money handled server-side
    const upiUrl = `upi://pay?pa=&pn=${encodeURIComponent(booking.rider_name ?? 'Rider')}&am=${Number(booking.fare_share).toFixed(2)}&cu=INR&tn=${encodeURIComponent('RideColab fare share')}`;
    Linking.openURL(upiUrl).catch(() =>
      Alert.alert('UPI not available', 'Open your UPI app manually and pay ₹' + Number(booking.fare_share).toFixed(0)),
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: c.accent }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>🔍</Text>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Booking not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canCancel = ['pending', 'accepted'].includes(booking.status);
  const isClosed = ['completed', 'cancelled', 'declined'].includes(booking.status);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: c.accent }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.text }]}>Booking Details</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBooking(true); }} tintColor={c.accent} />
          }
        >
          {/* ── Status Banner ── */}
          <View style={[styles.statusBanner, { backgroundColor: sm.color + '1A', borderColor: sm.color }]}>
            <Text style={{ fontSize: 28 }}>{sm.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusLabel, { color: sm.color }]}>{sm.label}</Text>
              {booking.cancelled_at ? (
                <Text style={[styles.statusSub, { color: c.textSecondary }]}>
                  {booking.cancel_reason ? `Reason: ${booking.cancel_reason}` : 'No reason given'}
                </Text>
              ) : null}
            </View>
          </View>

          {/* ── Trip Info ── */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Trip Route</Text>
            <View style={styles.routeRow}>
              <Text style={[styles.routeDot, { color: '#10B981' }]}>●</Text>
              <Text style={[styles.routeText, { color: c.text }]} numberOfLines={2}>
                {booking.origin_label ?? booking.pickup_label ?? '—'}
              </Text>
            </View>
            <View style={[styles.routeLine, { backgroundColor: c.border }]} />
            <View style={styles.routeRow}>
              <Text style={[styles.routeDot, { color: '#EF4444' }]}>●</Text>
              <Text style={[styles.routeText, { color: c.text }]} numberOfLines={2}>
                {booking.dest_label ?? booking.dropoff_label ?? '—'}
              </Text>
            </View>
            <View style={styles.infoGrid}>
              <InfoRow label="Rider" value={booking.rider_name ?? '—'} c={c} />
              <InfoRow label="Trust score" value={`⭐ ${booking.rider_trust ?? '—'}`} c={c} />
              {booking.vehicle_make ? (
                <InfoRow label="Vehicle" value={`${booking.vehicle_make} ${booking.vehicle_model}`} c={c} />
              ) : null}
              {booking.plate_number ? (
                <InfoRow label="Plate" value={booking.plate_number} c={c} />
              ) : null}
              {booking.depart_at ? (
                <InfoRow
                  label="Departure"
                  value={new Date(booking.depart_at).toLocaleString('en-IN', {
                    weekday: 'short', day: 'numeric', month: 'short',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  c={c}
                />
              ) : null}
              <InfoRow label="Seats booked" value={String(booking.seats_booked)} c={c} />
            </View>
          </View>

          {/* ── Fare & Payment ── */}
          {booking.fare_share != null && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Fare Share</Text>
              <Text style={[styles.fareAmount, { color: c.accent }]}>
                ₹{Number(booking.fare_share).toFixed(0)}
              </Text>
              <Text style={[styles.fareNote, { color: c.textSecondary }]}>
                Direct fuel cost share only — no commission, no markup.
              </Text>
              {isPassenger && booking.status === 'completed' && (
                <TouchableOpacity style={[styles.upiBtn, { backgroundColor: '#10B981' }]} onPress={doUpiPay}>
                  <Text style={styles.upiBtnText}>💸 Pay via UPI</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Rider Actions ── */}
          {isRider && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Rider Actions</Text>

              {/* Accept / Decline */}
              {booking.status === 'pending' && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10B981', flex: 1 }]}
                    onPress={doAccept}
                    disabled={actionLoading}
                  >
                    {actionLoading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.actionBtnText}>✅ Accept</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#EF4444', flex: 1 }]}
                    onPress={doDecline}
                    disabled={actionLoading}
                  >
                    <Text style={styles.actionBtnText}>❌ Decline</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Generate Ride Code */}
              {booking.status === 'accepted' && (
                <>
                  <Text style={[styles.hint, { color: c.textSecondary }]}>
                    Generate a 6-character ride code. Show it to your passenger when they board.
                  </Text>
                  {rideCode ? (
                    <View style={[styles.rideCodeBox, { backgroundColor: c.accentMuted, borderColor: c.accent }]}>
                      <Text style={[styles.rideCodeLabel, { color: c.textSecondary }]}>Ride Code</Text>
                      <Text style={[styles.rideCodeValue, { color: c.accent }]}>{rideCode}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: c.accent }]}
                      onPress={doGenerateCode}
                      disabled={codeLoading}
                    >
                      {codeLoading
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.actionBtnText}>🔑 Generate Ride Code</Text>}
                    </TouchableOpacity>
                  )}

                  {/* Start Ride — verify passenger's code */}
                  <Text style={[styles.hint, { color: c.textSecondary, marginTop: 12 }]}>
                    Ask the passenger for their code to start the ride:
                  </Text>
                  <TextInput
                    style={[styles.codeInput, { borderColor: c.border, color: c.text, backgroundColor: c.inputBg }]}
                    value={rideCodeInput}
                    onChangeText={(t) => setRideCodeInput(t.toUpperCase())}
                    placeholder="Enter passenger's code"
                    placeholderTextColor={c.textMuted}
                    maxLength={6}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
                    onPress={doStart}
                    disabled={actionLoading}
                  >
                    {actionLoading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.actionBtnText}>🚗 Start Ride</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* Complete Ride */}
              {booking.status === 'started' && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                  onPress={doComplete}
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.actionBtnText}>🏁 Complete Ride</Text>}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Passenger: Show Ride Code ── */}
          {isPassenger && booking.status === 'accepted' && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Your Ride Code</Text>
              <Text style={[styles.hint, { color: c.textSecondary }]}>
                Show this to your rider when they ask to verify you.
              </Text>
              {booking.ride_code ? (
                <View style={[styles.rideCodeBox, { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }]}>
                  <Text style={[styles.rideCodeLabel, { color: '#3B82F6' }]}>Show to rider</Text>
                  <Text style={[styles.rideCodeValue, { color: '#1E40AF' }]}>{booking.ride_code}</Text>
                </View>
              ) : (
                <Text style={[styles.hint, { color: c.textMuted }]}>
                  Waiting for rider to generate your code…
                </Text>
              )}
            </View>
          )}

          {/* ── Cancel ── */}
          {canCancel && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              {showCancelInput ? (
                <>
                  <Text style={[styles.cardTitle, { color: c.text }]}>Cancel Booking</Text>
                  <TextInput
                    style={[styles.codeInput, { borderColor: c.border, color: c.text, backgroundColor: c.inputBg }]}
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    placeholder="Reason (optional)"
                    placeholderTextColor={c.textMuted}
                  />
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#EF4444', flex: 1 }]}
                      onPress={doCancel}
                      disabled={actionLoading}
                    >
                      {actionLoading
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.actionBtnText}>Confirm Cancel</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: c.inputBg, flex: 1 }]}
                      onPress={() => setShowCancelInput(false)}
                    >
                      <Text style={[styles.actionBtnText, { color: c.text }]}>Keep Booking</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444' }]}
                  onPress={() => setShowCancelInput(true)}
                >
                  <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>🚫 Cancel Booking</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Chat ── */}
          {!isClosed && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>💬 Trip Chat</Text>
              <Text style={[styles.hint, { color: c.textSecondary }]}>
                Messages are end-to-end encrypted.
              </Text>

              {/* Message list */}
              <View style={styles.chatList}>
                {messages.length === 0 ? (
                  <Text style={[styles.hint, { color: c.textMuted, textAlign: 'center', paddingVertical: 16 }]}>
                    No messages yet. Say hi! 👋
                  </Text>
                ) : (
                  messages.map((msg) => (
                    <View
                      key={msg.id}
                      style={[
                        styles.bubble,
                        msg.is_mine
                          ? [styles.bubbleMine, { backgroundColor: c.accent }]
                          : [styles.bubbleOther, { backgroundColor: c.inputBg }],
                      ]}
                    >
                      {!msg.is_mine && (
                        <Text style={[styles.bubbleSender, { color: c.textSecondary }]}>
                          {msg.sender_name}
                        </Text>
                      )}
                      <Text style={[styles.bubbleText, { color: msg.is_mine ? '#fff' : c.text }]}>
                        {msg.body}
                      </Text>
                      <Text style={[styles.bubbleTime, { color: msg.is_mine ? 'rgba(255,255,255,0.65)' : c.textMuted }]}>
                        {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  ))
                )}
              </View>

              {/* Send input */}
              <View style={[styles.chatInputRow, { borderTopColor: c.border }]}>
                <TextInput
                  style={[styles.chatInput, { backgroundColor: c.inputBg, color: c.text, borderColor: c.border }]}
                  value={msgText}
                  onChangeText={setMsgText}
                  placeholder="Type a message…"
                  placeholderTextColor={c.textMuted}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={doSendMessage}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: c.accent, opacity: msgText.trim() ? 1 : 0.5 }]}
                  onPress={doSendMessage}
                  disabled={sending || !msgText.trim()}
                >
                  {sending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.sendBtnText}>↑</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Completion summary */}
          {booking.status === 'completed' && (
            <View style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#10B981' }]}>
              <Text style={{ fontSize: 32, textAlign: 'center' }}>🎉</Text>
              <Text style={[styles.cardTitle, { color: '#065F46', textAlign: 'center' }]}>
                Ride Complete!
              </Text>
              {isPassenger && booking.fare_share != null && (
                <>
                  <Text style={[styles.hint, { color: '#065F46', textAlign: 'center' }]}>
                    Please pay your fare share of ₹{Number(booking.fare_share).toFixed(0)} directly to the rider.
                  </Text>
                  <TouchableOpacity style={[styles.upiBtn, { backgroundColor: '#10B981' }]} onPress={doUpiPay}>
                    <Text style={styles.upiBtnText}>💸 Pay ₹{Number(booking.fare_share).toFixed(0)} via UPI</Text>
                  </TouchableOpacity>
                </>
              )}
              <Text style={[styles.hint, { color: '#6B7280', textAlign: 'center', fontSize: 11 }]}>
                No commission. No markup. Pure cost sharing. 🤝
              </Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Helpers ────────────────────────────────────────────────────
function InfoRow({ label, value, c }: { label: string; value: string; c: Record<string, string> }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { paddingVertical: 8, paddingRight: 8 },
  backText: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  scroll: { padding: 16, gap: 14, paddingBottom: 60 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14, borderWidth: 1.5,
  },
  statusLabel: { fontSize: 16, fontWeight: '700' },
  statusSub: { fontSize: 12, marginTop: 2 },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },

  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  routeDot: { fontSize: 12, marginTop: 2 },
  routeText: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  routeLine: { width: 2, height: 8, marginLeft: 5, borderRadius: 1 },

  infoGrid: { gap: 6, marginTop: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 8 },

  fareAmount: { fontSize: 32, fontWeight: '800' },
  fareNote: { fontSize: 12, lineHeight: 18 },

  upiBtn: {
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20,
    alignItems: 'center', marginTop: 4,
  },
  upiBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center', minHeight: 46,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  hint: { fontSize: 13, lineHeight: 18 },

  rideCodeBox: {
    borderRadius: 14, padding: 16, borderWidth: 1.5,
    alignItems: 'center', marginTop: 4,
  },
  rideCodeLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  rideCodeValue: { fontSize: 36, fontWeight: '900', letterSpacing: 8, marginTop: 4 },

  codeInput: {
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 18, textAlign: 'center', fontWeight: '700', letterSpacing: 6,
    marginTop: 4,
  },

  sectionTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },

  chatList: { gap: 8, minHeight: 60 },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 10, gap: 2 },
  bubbleMine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleOther: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleSender: { fontSize: 11, fontWeight: '600', marginBottom: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTime: { fontSize: 10, textAlign: 'right', marginTop: 2 },

  chatInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    borderTopWidth: 1, paddingTop: 10, marginTop: 4,
  },
  chatInput: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});

