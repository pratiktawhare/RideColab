// ─────────────────────────────────────────────────────────────
// live-ride.tsx — Phase 9 & Ride Polishing Live Ride screen
// Connects Socket.io, shows real-time map, SOS, helmet check,
// night rules check-in, deviation/long-stop alerts, share link,
// boarding OTP verification, 1-tap turn-by-turn nav, & post-ride UPI
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
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

  // ── Modals & Actions ─────────────────────────────────────
  const [helmetModalVisible, setHelmetModalVisible] = useState(false);
  const [helmetChecked, setHelmetChecked] = useState(false);
  const [nightModalVisible, setNightModalVisible] = useState(false);
  const [nightChecked, setNightChecked] = useState(false);
  const [safeArrivalLoading, setSafeArrivalLoading] = useState(false);
  const [safeArrivalDone, setSafeArrivalDone] = useState(false);

  // ── Ride Polishing additions ─────────────────────────────
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [boardingOtpInput, setBoardingOtpInput] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);

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

        // Fetch existing live locations immediately so occupants see positions right away
        liveApi
          .getLocations(b.trip_id)
          .then((existingLocs) => {
            if (!isMountedRef.current || !existingLocs) return;
            if (existingLocs.length > 0) {
              setLocations(existingLocs);
            }
          })
          .catch(() => {});

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

  // Periodic status poll (every 15s) so state transitions (started, completed, boarded) sync
  useEffect(() => {
    if (!bookingId || booking?.status === 'completed') return;
    const pollInterval = setInterval(() => {
      bookingApi
        .getById(bookingId)
        .then((b) => {
          if (isMountedRef.current) setBooking(b);
        })
        .catch(() => {});
    }, 15000);

    return () => clearInterval(pollInterval);
  }, [bookingId, booking?.status]);

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

        // Rider emits location every 5s and updates local state immediately
        if (isRider) {
          startLocationEmit(tripId, async () => {
            const loc = await getMyLocation();
            if (loc && isMountedRef.current) {
              setLocations((prev) => {
                const filtered = prev.filter((l) => l.userId !== user.id);
                return [
                  ...filtered,
                  {
                    userId: user.id,
                    lat: loc.lat,
                    lng: loc.lng,
                    bearing: loc.bearing,
                    speed: loc.speed,
                    ts: Date.now(),
                  },
                ];
              });
            }
            return loc;
          });
        } else {
          // Passenger: get own position once for map context
          getMyLocation().then((loc) => {
            if (loc && isMountedRef.current) {
              setLocations((prev) => {
                const filtered = prev.filter((l) => l.userId !== user.id);
                return [
                  ...filtered,
                  {
                    userId: user.id,
                    lat: loc.lat,
                    lng: loc.lng,
                    bearing: loc.bearing,
                    speed: loc.speed,
                    ts: Date.now(),
                  },
                ];
              });
            }
          });
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

              for (const contact of result.emergency_contacts) {
                const smsUrl = `sms:${contact.phone}?body=SOS! I need help. I am on a RideColab trip. Please call me immediately.`;
                const canOpen = await Linking.canOpenURL(smsUrl);
                if (canOpen) {
                  await Linking.openURL(smsUrl);
                  break;
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

  // ── 1-Tap Turn-by-Turn Navigation (Rider) ─────────────────
  const handleNavigate = useCallback(() => {
    if (!booking) return;
    // Route to passenger pickup first if not boarded, else destination
    const targetLat = !booking.boarded_at && booking.pickup_lat != null ? booking.pickup_lat : booking.dest_lat;
    const targetLng = !booking.boarded_at && booking.pickup_lng != null ? booking.pickup_lng : booking.dest_lng;
    if (targetLat == null || targetLng == null) return;

    const label = encodeURIComponent(
      !booking.boarded_at && booking.pickup_landmark
        ? booking.pickup_landmark
        : booking.dest_label || 'Destination',
    );
    const dest = `${targetLat},${targetLng}`;
    const geoUrl = `geo:${dest}?q=${dest}(${label})`;
    const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${booking.origin_lat}%2C${booking.origin_lng}%3B${targetLat}%2C${targetLng}`;

    if (Platform.OS === 'android') {
      Linking.canOpenURL(geoUrl)
        .then((supported) => {
          if (supported) return Linking.openURL(geoUrl);
          return Linking.openURL(osmUrl);
        })
        .catch(() => Linking.openURL(osmUrl));
    } else if (Platform.OS === 'ios') {
      Linking.openURL(`maps://?daddr=${dest}&q=${label}`).catch(() => Linking.openURL(osmUrl));
    } else {
      Linking.openURL(osmUrl).catch(() => Alert.alert('Error', 'Could not open navigation.'));
    }
  }, [booking]);

  // ── Verify Boarding OTP (Rider) ───────────────────────────
  const handleVerifyOtp = useCallback(async () => {
    if (!bookingId) return;
    if (boardingOtpInput.trim().length !== 4) {
      Alert.alert('Invalid OTP', 'Please enter the 4-digit code provided by your passenger.');
      return;
    }
    setOtpVerifying(true);
    try {
      await bookingApi.verifyBoardingOtp(bookingId, boardingOtpInput.trim());
      Alert.alert('Success ✅', 'Passenger boarding confirmed!');
      setOtpModalVisible(false);
      setBoardingOtpInput('');
      const updated = await bookingApi.getById(bookingId);
      setBooking(updated);
    } catch (err) {
      Alert.alert('Verification Failed', (err as Error).message ?? 'Invalid OTP code.');
    } finally {
      setOtpVerifying(false);
    }
  }, [bookingId, boardingOtpInput]);

  // ── Complete Ride (Rider) ─────────────────────────────────
  const handleCompleteRide = useCallback(() => {
    if (!bookingId) return;
    Alert.alert(
      '🏁 Complete Ride?',
      'This will mark the ride as finished and prompt passenger for direct fuel cost sharing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Ride',
          onPress: async () => {
            setCompleteLoading(true);
            try {
              const updated = await bookingApi.complete(bookingId);
              setBooking(updated);
              Alert.alert('🎉 Ride Completed', 'Trip completed successfully! Please rate your passenger.');
            } catch (err) {
              Alert.alert('Error', (err as Error).message ?? 'Could not complete ride.');
            } finally {
              setCompleteLoading(false);
            }
          },
        },
      ],
    );
  }, [bookingId]);

  // ── UPI Direct Payment (Passenger) ────────────────────────
  const doUpiPay = useCallback(() => {
    if (!booking?.fare_share) return;
    const upiId = booking.rider_upi?.trim();
    if (!upiId) {
      Alert.alert(
        'Rider UPI ID Not Set',
        `The rider has not added a UPI ID yet.\n\nPlease pay ₹${Number(booking.fare_share).toFixed(0)} in cash or scan their UPI QR code directly.`,
        [
          {
            text: 'Simulate Demo Payment',
            onPress: () =>
              Alert.alert(
                'Demo Payment Successful ✅',
                `Simulated payment of ₹${Number(booking.fare_share).toFixed(0)} sent to ${booking.rider_name ?? 'Rider'}.`,
              ),
          },
          { text: 'OK', style: 'cancel' },
        ],
      );
      return;
    }

    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(booking.rider_name ?? 'Rider')}&am=${Number(booking.fare_share).toFixed(2)}&cu=INR&tn=${encodeURIComponent('RideColab fuel cost share')}`;
    Linking.openURL(upiUrl).catch(() =>
      Alert.alert(
        'UPI App Not Found',
        `Could not open UPI app.\n\nYou can manually send ₹${Number(booking.fare_share).toFixed(0)} to:\n\n${upiId}`,
      ),
    );
  }, [booking]);

  // ─────────────────────────────────────────────────────────
  if (loading || !booking) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={[styles.loadingText, { color: c.textSecondary }]}>Loading live ride…</Text>
      </View>
    );
  }

  const isRider = booking.rider_id === user?.id;
  const isCompleted = booking.status === 'completed';

  // Overall trip origin and destination
  const tripOrigin =
    booking.origin_lat != null && booking.origin_lng != null
      ? {
          lat: Number(booking.origin_lat),
          lng: Number(booking.origin_lng),
          label: booking.origin_label,
        }
      : null;

  const tripDestination =
    booking.dest_lat != null && booking.dest_lng != null
      ? {
          lat: Number(booking.dest_lat),
          lng: Number(booking.dest_lng),
          label: booking.dest_label,
        }
      : null;

  // Passenger specific pickup and dropoff points
  const passengerPickup =
    booking.pickup_lat != null && booking.pickup_lng != null
      ? {
          lat: Number(booking.pickup_lat),
          lng: Number(booking.pickup_lng),
          label: booking.pickup_label ?? booking.origin_label,
        }
      : null;

  const passengerDropoff =
    booking.dropoff_lat != null && booking.dropoff_lng != null
      ? {
          lat: Number(booking.dropoff_lat),
          lng: Number(booking.dropoff_lng),
          label: booking.dropoff_label ?? booking.dest_label,
        }
      : null;

  const primaryOrigin = isRider
    ? tripOrigin ?? passengerPickup
    : passengerPickup ?? tripOrigin;

  const primaryDestination = isRider
    ? tripDestination ?? passengerDropoff
    : passengerDropoff ?? tripDestination;

  const displayFrom = !isRider
    ? passengerPickup?.label ?? booking.origin_label
    : booking.origin_label;
  const displayTo = !isRider
    ? passengerDropoff?.label ?? booking.dest_label
    : booking.dest_label;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayFrom} → {displayTo}
          </Text>
          <Text style={styles.headerSub}>
            {socketReady ? '🟢 Live' : '⏳ Connecting…'}
            {isRider && booking.passenger_name ? ` • Passenger: ${booking.passenger_name}` : ''}
            {!isRider && booking.rider_name ? ` • Rider: ${booking.rider_name}` : ''}
          </Text>
        </View>
        {isRider && (
          <TouchableOpacity
            style={[styles.navHeaderBtn, { backgroundColor: c.accent }]}
            onPress={handleNavigate}
          >
            <Text style={styles.navHeaderBtnText}>🗺️ Nav</Text>
          </TouchableOpacity>
        )}
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
          riderId={booking.rider_id}
          isRider={isRider}
          routeGeoJson={booking.route_geojson}
          origin={primaryOrigin}
          destination={primaryDestination}
          pickup={passengerPickup}
          dropoff={passengerDropoff}
          bottomPadding={0}
        />
        {locations.length === 0 ? (
          <View style={styles.noLocationOverlay}>
            <Text style={styles.noLocationText}>📍 Waiting for live location…</Text>
          </View>
        ) : null}
      </View>

      {/* ── Passenger Boarding Pass Card ── */}
      {!isRider && !isCompleted && (
        <View style={[styles.boardingCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          {!booking.boarded_at ? (
            <View>
              <View style={styles.boardingHeaderRow}>
                <View>
                  <Text style={[styles.boardingCardSub, { color: c.textSecondary }]}>YOUR BOARDING PASS</Text>
                  <Text style={[styles.boardingCardTitle, { color: c.text }]}>Share OTP with Driver</Text>
                </View>
                <View style={[styles.otpBadge, { backgroundColor: c.accent + '20', borderColor: c.accent }]}>
                  <Text style={[styles.otpBadgeText, { color: c.accent }]}>
                    {booking.boarding_otp ?? '----'}
                  </Text>
                </View>
              </View>
              {booking.pickup_landmark ? (
                <Text style={[styles.pickupNote, { color: c.textSecondary }]}>
                  📍 Meeting point:{' '}
                  <Text style={{ fontWeight: '700', color: c.text }}>{booking.pickup_landmark}</Text>
                  {booking.walking_distance_m != null ? ` (${booking.walking_distance_m}m walk)` : ''}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.boardedRow}>
              <Text style={styles.boardedText}>✅ Boarded successfully</Text>
              {booking.fare_share != null && (
                <Text style={[styles.fareNote, { color: c.textSecondary }]}>
                  Fare: ₹{Number(booking.fare_share).toFixed(0)}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Post-Trip Completion Panel (if completed) ── */}
      {isCompleted && (
        <View style={[styles.completedCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={styles.completedEmoji}>🏁</Text>
          <Text style={[styles.completedTitle, { color: c.text }]}>Ride Completed!</Text>
          <Text style={[styles.completedSub, { color: c.textSecondary }]}>
            {!isRider
              ? `You've arrived! Please settle ₹${Number(booking.fare_share ?? 0).toFixed(0)} directly with ${booking.rider_name ?? 'your driver'}.`
              : 'Thank you for sharing your ride and keeping Pune moving!'}
          </Text>

          <View style={styles.completedActions}>
            {!isRider && booking.fare_share != null && (
              <TouchableOpacity
                style={[styles.compActionBtn, { backgroundColor: '#10B981' }]}
                onPress={doUpiPay}
              >
                <Text style={styles.compActionBtnText}>
                  💸 Pay ₹{Number(booking.fare_share).toFixed(0)} via UPI
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.compActionBtn, { backgroundColor: c.accent }]}
              onPress={() =>
                router.replace({
                  pathname: '/rate-ride',
                  params: {
                    bookingId: booking.id,
                    revieweeName: isRider ? booking.passenger_name ?? 'Passenger' : booking.rider_name ?? 'Rider',
                    revieweeRole: isRider ? 'passenger' : 'rider',
                  },
                })
              }
            >
              <Text style={styles.compActionBtnText}>
                ⭐ Rate {isRider ? 'Passenger' : 'Driver'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.compActionBtnSecondary]}
              onPress={() => router.replace('/(tabs)/activity')}
            >
              <Text style={[styles.compActionBtnSecondaryText, { color: c.textSecondary }]}>
                Done • Back to Activity
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Bottom Action Bar (during active ride) ── */}
      {!isCompleted && (
        <View style={[styles.actions, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          {/* SOS — always visible during active ride */}
          <TouchableOpacity
            style={styles.sosBtn}
            onPress={handleSos}
            disabled={sosLoading}
          >
            {sosLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sosBtnText}>🚨 SOS</Text>
            )}
          </TouchableOpacity>

          {/* Rider: Boarding OTP check if not yet boarded */}
          {isRider && !booking.boarded_at && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: c.accent }]}
              onPress={() => setOtpModalVisible(true)}
            >
              <Text style={styles.actionBtnText}>🔑 Verify OTP</Text>
            </TouchableOpacity>
          )}

          {/* Rider: 1-tap Navigation */}
          {isRider && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: c.primary }]}
              onPress={handleNavigate}
            >
              <Text style={styles.actionBtnText}>🗺️ Navigate</Text>
            </TouchableOpacity>
          )}

          {/* Rider: Complete ride */}
          {isRider && booking.status === 'started' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
              onPress={handleCompleteRide}
              disabled={completeLoading}
            >
              {completeLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>🏁 Finish</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Rider: Share link */}
          {isRider && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#6B7280' }]}
              onPress={handleShare}
              disabled={sharingLoading}
            >
              {sharingLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>🔗 Share</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Passenger: Safe arrival */}
          {!isRider && booking.status === 'started' && !safeArrivalDone && (
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
          )}

          {safeArrivalDone && (
            <View style={[styles.actionBtn, { backgroundColor: '#10b981' }]}>
              <Text style={styles.actionBtnText}>✅ Logged</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Driver OTP Verification Modal ── */}
      <Modal visible={otpModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>🔑 Verify Passenger Boarding</Text>
            <Text style={[styles.modalBody, { color: c.textSecondary }]}>
              Ask {booking.passenger_name ?? 'the passenger'} for their 4-digit boarding OTP to confirm pickup.
            </Text>
            <TextInput
              style={[
                styles.otpInput,
                {
                  color: c.text,
                  borderColor: c.border,
                  backgroundColor: c.background,
                },
              ]}
              placeholder="4-digit OTP"
              placeholderTextColor={c.textSecondary}
              keyboardType="number-pad"
              maxLength={4}
              value={boardingOtpInput}
              onChangeText={setBoardingOtpInput}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: c.accent }]}
              onPress={handleVerifyOtp}
              disabled={otpVerifying || boardingOtpInput.length !== 4}
            >
              {otpVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalBtnText}>Confirm Boarding</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalBtnSecondary}
              onPress={() => setOtpModalVisible(false)}
            >
              <Text style={[styles.modalBtnSecondaryText, { color: c.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Helmet Check Modal ── */}
      <Modal visible={helmetModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>🪖 Helmet Check</Text>
            <Text style={[styles.modalBody, { color: c.textSecondary }]}>
              Safety first! Please confirm that all riders are wearing helmets before starting
              the ride. This is mandatory for two-wheeler trips.
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: c.accent }]}
              onPress={handleHelmetCheck}
            >
              <Text style={styles.modalBtnText}>✅ Confirmed — Helmets On</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalBtnSecondary}
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
  navHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  navHeaderBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

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

  // ── Boarding Card ──
  boardingCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  boardingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  boardingCardSub: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  boardingCardTitle: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  otpBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  otpBadgeText: { fontSize: 20, fontWeight: '900', letterSpacing: 4 },
  pickupNote: { fontSize: 12, marginTop: 8 },
  boardedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  boardedText: { color: '#10B981', fontWeight: '700', fontSize: 14 },
  fareNote: { fontSize: 13, fontWeight: '600' },

  // ── Completed Card ──
  completedCard: {
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
  completedEmoji: { fontSize: 44, marginBottom: 8 },
  completedTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  completedSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  completedActions: { width: '100%', gap: 10 },
  compActionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compActionBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  compActionBtnSecondary: { paddingVertical: 10, alignItems: 'center' },
  compActionBtnSecondaryText: { fontSize: 14, fontWeight: '600' },

  // ── Actions ──
  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    paddingBottom: 28,
  },
  sosBtn: {
    flex: 0.9,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── Modals ──
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
  otpInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 8,
    paddingVertical: 12,
  },
  modalBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBtnSecondary: { paddingVertical: 12, alignItems: 'center' },
  modalBtnSecondaryText: { fontSize: 14 },
});
