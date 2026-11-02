// ─────────────────────────────────────────────────────────────
// live-ride.tsx — Phase 9 Live Ride screen
// Connects Socket.io, shows real-time map, SOS, helmet check,
// night rules check-in, deviation/long-stop alerts, share link
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useAuthStore } from '@/store/authStore';
import { bookingApi, liveApi, LiveLocationPoint } from '@/services/api';
import type { Booking } from '@/services/api';
import {
  connectSocket,
  disconnectSocket,
  joinTrip,
  leaveTrip,
  startLocationEmit,
  stopLocationEmit,
  onLocationUpdate,
  onDeviationAlert,
  onLongStopAlert,
} from '@/services/socket';
import { useThemeStore } from '@/store/themeStore';

// Lazy import the map only on native (web uses web fallback)
const LiveRideMap =
  Platform.OS !== 'web'
    ? require('@/components/LiveRideMap.native').default
    : require('@/components/LiveRideMap.web').default;

// ─────────────────────────────────────────────────────────────

export default function LiveRideScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const { theme } = useThemeStore();
  const c = theme.colors;

  // ── State ────────────────────────────────────────────────
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LiveLocationPoint[]>([]);
  const [socketReady, setSocketReady] = useState(false);
  const [deviationM, setDeviationM] = useState<number | null>(null);
  const [longStop, setLongStop] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);

  // ── Modals ────────────────────────────────────────────────
  const [helmetModalVisible, setHelmetModalVisible] = useState(false);
  const [helmetChecked, setHelmetChecked] = useState(false);
  const [nightModalVisible, setNightModalVisible] = useState(false);
  const [nightChecked, setNightChecked] = useState(false);
  const [safeArrivalLoading, setSafeArrivalLoading] = useState(false);
  const [safeArrivalDone, setSafeArrivalDone] = useState(false);

  const isMountedRef = useRef(true);
  const tripIdRef = useRef<string | null>(null);

  // ── Load booking ──────────────────────────────────────────
  useEffect(() => {
    if (!bookingId) return;
    bookingApi
      .getById(bookingId)
      .then((b) => {
        if (!isMountedRef.current) return;
        setBooking(b);
        setLoading(false);
        tripIdRef.current = b.trip_id;

        // Show helmet check modal if not yet checked
        if (!b.helmet_checked_at && b.status === 'started') {
          setHelmetModalVisible(true);
        }

        // Night rules: female passenger in night hours
        const hour = new Date().getHours();
        const isNight = hour >= 21 || hour < 5;
        if (isNight && user?.gender === 'female' && !nightChecked) {
          setNightModalVisible(true);
        }
      })
      .catch(() => {
        setLoading(false);
      });
  }, [bookingId, user?.gender, nightChecked]);

  // ── Resolve user's location for emitting ─────────────────
  const getMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        bearing: pos.coords.heading ?? undefined,
        speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined, // m/s → km/h
      };
    } catch {
      return null;
    }
  }, []);

  // ── Connect socket + join trip room ──────────────────────
  useEffect(() => {
    if (!booking || !accessToken || !user) return;
    const tripId = booking.trip_id;
    const isRider = booking.rider_id === user.id;

    // Connect
    const sock = connectSocket(accessToken);

    const onConnect = async () => {
      try {
        await joinTrip(tripId, accessToken);
        if (!isMountedRef.current) return;
        setSocketReady(true);

        // Rider emits location every 5s
        if (isRider) {
          startLocationEmit(tripId, getMyLocation);
        }
      } catch (err) {
        console.warn('[LiveRide] join_trip failed:', err);
      }
    };

    if (sock.connected) {
      void onConnect();
    } else {
      sock.once('connect', () => void onConnect());
    }

    // ── Listen for remote location updates ─────────────────
    const offLoc = onLocationUpdate((loc) => {
      if (!isMountedRef.current) return;
      setLocations((prev) => {
        const filtered = prev.filter((l) => l.userId !== loc.userId);
        return [...filtered, loc];
      });
    });

    const offDev = onDeviationAlert((alert) => {
      if (!isMountedRef.current) return;
      setDeviationM(alert.deviationM);
      // Auto-clear after 30s
      setTimeout(() => {
        if (isMountedRef.current) setDeviationM(null);
      }, 30_000);
    });

    const offStop = onLongStopAlert(() => {
      if (!isMountedRef.current) return;
      setLongStop(true);
      setTimeout(() => {
        if (isMountedRef.current) setLongStop(false);
      }, 60_000);
    });

    return () => {
      isMountedRef.current = false;
      stopLocationEmit();
      leaveTrip(tripId);
      offLoc();
      offDev();
      offStop();
      disconnectSocket();
    };
  }, [booking, accessToken, user, getMyLocation]);

  // ── SOS handler ───────────────────────────────────────────
  const handleSos = useCallback(async () => {
    if (!booking || !user) return;
    Alert.alert(
      '🚨 SOS Alert',
      'This will notify your emergency contacts and the RideColab admin. Confirm?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            setSosLoading(true);
            try {
              const loc = await getMyLocation();
              const result = await liveApi.triggerSos(
                booking.trip_id,
                loc?.lat,
                loc?.lng,
              );

              // Open SMS deep link for each emergency contact
              for (const contact of result.emergency_contacts) {
                const smsUrl = `sms:${contact.phone}?body=SOS! I need help. I am on a RideColab trip. Please call me immediately.`;
                const canOpen = await Linking.canOpenURL(smsUrl);
                if (canOpen) {
                  await Linking.openURL(smsUrl);
                  break; // open only first one
                }
              }

              Alert.alert(
                'SOS Sent',
                'Emergency contacts have been notified. Stay calm — help is on the way.',
              );
            } catch {
              Alert.alert('Error', 'SOS could not be sent. Please call emergency services directly.');
            } finally {
              setSosLoading(false);
            }
          },
        },
      ],
    );
  }, [booking, user, getMyLocation]);

  // ── Share link handler ────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!booking) return;
    setSharingLoading(true);
    try {
      const result = await liveApi.shareLink(booking.trip_id);
      setShareUrl(result.share_url);
      Alert.alert('Share Link', result.share_url, [
        {
          text: 'Copy & Share',
          onPress: () => {
            Linking.openURL(result.share_url).catch(() => {});
          },
        },
        { text: 'OK' },
      ]);
    } catch {
      Alert.alert('Error', 'Could not generate share link.');
    } finally {
      setSharingLoading(false);
    }
  }, [booking]);

  // ── Helmet check ──────────────────────────────────────────
  const handleHelmetCheck = useCallback(async () => {
    if (!bookingId) return;
    try {
      await liveApi.helmetCheck(bookingId);
      setHelmetChecked(true);
      setHelmetModalVisible(false);
    } catch {
      Alert.alert('Error', 'Could not log helmet check. Please try again.');
    }
  }, [bookingId]);

  // ── Safe arrival ──────────────────────────────────────────
  const handleSafeArrival = useCallback(async () => {
    if (!bookingId) return;
    setSafeArrivalLoading(true);
    try {
      await liveApi.safeArrival(bookingId);
      setSafeArrivalDone(true);
      Alert.alert('✅ Safe Arrival', 'Your safe arrival has been logged. Thank you for riding with RideColab!');
    } catch {
      Alert.alert('Error', 'Could not log safe arrival.');
    } finally {
      setSafeArrivalLoading(false);
    }
  }, [bookingId]);

  // ─────────────────────────────────────────────────────────
  if (loading || !booking) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={[styles.loadingText, { color: c.textSecondary }]}>Loading ride…</Text>
      </View>
    );
  }

  const isRider = booking.rider_id === user?.id;
  const isCompleted = booking.status === 'completed';

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {booking.origin_label} → {booking.dest_label}
          </Text>
          <Text style={styles.headerSub}>
            {socketReady ? '🟢 Live' : '⏳ Connecting…'}
          </Text>
        </View>
      </View>

      {/* ── Alert banners ── */}
      {deviationM !== null ? (
        <View style={[styles.alertBanner, { backgroundColor: '#F59E0B' }]}>
          <Text style={styles.alertText}>
            ⚠️ Route deviation detected ({Math.round(deviationM)}m off route)
          </Text>
        </View>
      ) : null}
      {longStop ? (
        <View style={[styles.alertBanner, { backgroundColor: '#EF4444' }]}>
          <Text style={styles.alertText}>🛑 Vehicle appears to have stopped for 5+ minutes</Text>
        </View>
      ) : null}

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <LiveRideMap
          locations={locations}
          myUserId={user?.id ?? ''}
          bottomPadding={0}
        />
        {locations.length === 0 ? (
          <View style={styles.noLocationOverlay}>
            <Text style={styles.noLocationText}>📍 Waiting for live location…</Text>
          </View>
        ) : null}
      </View>

      {/* ── Action buttons ── */}
      <View style={[styles.actions, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        {/* SOS — always visible during active ride */}
        {!isCompleted ? (
          <TouchableOpacity
            style={[styles.sosBtn]}
            onPress={handleSos}
            disabled={sosLoading}
          >
            {sosLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sosBtnText}>🚨 SOS</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Share link — rider only */}
        {isRider && !isCompleted ? (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: c.accent }]}
            onPress={handleShare}
            disabled={sharingLoading}
          >
            {sharingLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>🔗 Share</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Safe arrival — passenger only, once ride started */}
        {!isRider && booking.status === 'started' && !safeArrivalDone ? (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: c.primary }]}
            onPress={handleSafeArrival}
            disabled={safeArrivalLoading}
          >
            {safeArrivalLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>✅ Safe Arrival</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {safeArrivalDone ? (
          <View style={[styles.actionBtn, { backgroundColor: '#10b981' }]}>
            <Text style={styles.actionBtnText}>✅ Arrival Logged</Text>
          </View>
        ) : null}
      </View>

      {/* ── Helmet Check Modal ── */}
      <Modal visible={helmetModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>🪖 Helmet Check</Text>
            <Text style={[styles.modalBody, { color: c.textSecondary }]}>
              Safety first! Please confirm that all riders are wearing helmets before starting
              the ride. This is mandatory for bike trips.
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: c.accent }]}
              onPress={handleHelmetCheck}
            >
              <Text style={styles.modalBtnText}>✅ Confirmed — Helmets On</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtnSecondary]}
              onPress={() => setHelmetModalVisible(false)}
            >
              <Text style={[styles.modalBtnSecondaryText, { color: c.textSecondary }]}>
                Remind me later
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Night Rules Modal (non-dismissible for female passengers) ── */}
      <Modal
        visible={nightModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {/* non-dismissible */}}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>🌙 Night Safety Check</Text>
            <Text style={[styles.modalBody, { color: c.textSecondary }]}>
              This is a night trip (21:00–05:00). We recommend travelling only with verified
              riders. Your emergency contacts will receive a check-in notification if you
              don't confirm arrival within 10 minutes of your ETA.{'\n\n'}
              Consider using women-only trips for added safety.
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: c.primary }]}
              onPress={() => {
                setNightChecked(true);
                setNightModalVisible(false);
              }}
            >
              <Text style={styles.modalBtnText}>I Understand — Proceed Safely</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: '#fff', fontSize: 22 },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerSub: { color: '#9ca3af', fontSize: 12, marginTop: 2 },

  alertBanner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  alertText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  mapContainer: { flex: 1, position: 'relative' },
  noLocationOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  noLocationText: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 13,
    overflow: 'hidden',
  },

  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    paddingBottom: 28,
  },
  sosBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBtnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalBody: { fontSize: 14, lineHeight: 22 },
  modalBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBtnSecondary: { paddingVertical: 12, alignItems: 'center' },
  modalBtnSecondaryText: { fontSize: 14 },
});
