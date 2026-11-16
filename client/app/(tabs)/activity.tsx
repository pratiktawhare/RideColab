// ─────────────────────────────────────────────────────────────
// Activity screen — Role-Separated Activity Management (BlaBlaCar & Quick Ride standard)
// Distinct "Offered (Driving)" and "Booked (Traveling)" tabs
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { bookingApi, tripsApi, Booking, Trip } from '@/services/api';

// ── Status pill colour map ────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E', label: '⏳ Pending Approval' },
  accepted:  { bg: '#D1FAE5', text: '#065F46', label: '✅ Confirmed'         },
  started:   { bg: '#DBEAFE', text: '#1E40AF', label: '🚗 In Ride'           },
  completed: { bg: '#F3F4F6', text: '#374151', label: '🏁 Completed'         },
  declined:  { bg: '#FEE2E2', text: '#991B1B', label: '❌ Declined'          },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: '🚫 Cancelled'         },
};

// ─────────────────────────────────────────────────────────────
// 1. DRIVER TRIP CARD (Trip-Centric View)
// ─────────────────────────────────────────────────────────────
function DriverTripCard({
  trip,
  bookings,
  onAccept,
  onDecline,
  actionLoadingId,
  c,
  router,
}: {
  trip: Trip;
  bookings: Booking[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  actionLoadingId: string | null;
  c: Record<string, string>;
  router: ReturnType<typeof useRouter>;
}) {
  const [expanded, setExpanded] = useState(true);

  const pendingRequests = bookings.filter((b) => b.status === 'pending');
  const acceptedPassengers = bookings.filter((b) => b.status === 'accepted' || b.status === 'started');
  const bookedSeats = bookings
    .filter((b) => b.status === 'accepted' || b.status === 'started')
    .reduce((sum, b) => sum + (b.seats_booked || 1), 0);

  const dateStr = trip.depart_at
    ? new Date(trip.depart_at).toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '';

  const openNavigation = () => {
    const dest = `${trip.dest_lat},${trip.dest_lng}`;
    const label = encodeURIComponent(trip.dest_label || 'Destination');
    const geoUrl = `geo:${dest}?q=${dest}(${label})`;
    const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${trip.origin_lat}%2C${trip.origin_lng}%3B${trip.dest_lat}%2C${trip.dest_lng}`;

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
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: pendingRequests.length > 0 ? '#F59E0B' : c.border }]}>
      {/* Header: Date + Seats Gauge */}
      <View style={styles.cardTop}>
        <View style={styles.headerLeft}>
          <Text style={[styles.tripDateText, { color: c.accent }]}>🗓️ {dateStr}</Text>
          {trip.vehicle_name ? (
            <Text style={[styles.vehicleSubText, { color: c.textSecondary }]}>🚗 {trip.vehicle_name}</Text>
          ) : null}
        </View>
        <View style={[styles.seatGauge, { backgroundColor: bookedSeats >= trip.seats_total ? '#FEF2F2' : c.accentMuted }]}>
          <Text style={[styles.seatGaugeText, { color: bookedSeats >= trip.seats_total ? '#DC2626' : c.accent }]}>
            💺 {bookedSeats}/{trip.seats_total} Booked
          </Text>
        </View>
      </View>

      {/* Main Route */}
      <View style={styles.routeContainer}>
        <View style={styles.routeRow}>
          <Text style={[styles.routeDot, { color: '#10B981' }]}>●</Text>
          <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
            {trip.origin_label}
          </Text>
        </View>
        <View style={[styles.routeLine, { backgroundColor: c.border }]} />
        <View style={styles.routeRow}>
          <Text style={[styles.routeDot, { color: '#EF4444' }]}>●</Text>
          <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
            {trip.dest_label}
          </Text>
        </View>
      </View>

      {/* Stopovers Chips */}
      {trip.stopovers && trip.stopovers.length > 0 && (
        <View style={styles.stopoversRow}>
          <Text style={[styles.stopoverHeading, { color: c.textMuted }]}>Via Stops:</Text>
          {trip.stopovers.map((s, idx) => (
            <View key={idx} style={[styles.stopoverChip, { backgroundColor: c.inputBg }]}>
              <Text style={[styles.stopoverChipText, { color: c.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Driver Actions: Start Ride + Turn-by-Turn Navigation */}
      <View style={styles.driverActionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.accent }]}
          onPress={() => {
            const activeBooking = acceptedPassengers[0] ?? bookings[0];
            router.push({
              pathname: '/live-ride',
              params: {
                tripId: trip.id,
                ...(activeBooking ? { bookingId: activeBooking.id } : {}),
              },
            });
          }}
        >
          <Text style={styles.actionBtnText}>🚗 Live Ride</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtnSecondary, { borderColor: c.accent, backgroundColor: c.accentMuted }]}
          onPress={openNavigation}
        >
          <Text style={[styles.actionBtnSecondaryText, { color: c.accent }]}>🗺️ Navigate</Text>
        </TouchableOpacity>
      </View>

      {/* Nested Passenger Requests Accordion Header */}
      <TouchableOpacity
        style={[styles.accordionHeader, { borderTopColor: c.border }]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={[styles.accordionTitle, { color: c.text }]}>
          👥 Passengers ({bookings.length})
          {pendingRequests.length > 0 ? (
            <Text style={{ color: '#D97706', fontWeight: '700' }}> · {pendingRequests.length} pending</Text>
          ) : null}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 16 }}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Nested Requests List */}
      {expanded && (
        <View style={styles.nestedRequestsContainer}>
          {bookings.length === 0 ? (
            <Text style={[styles.noRequestsText, { color: c.textMuted }]}>
              No passenger bookings yet. Co-travelers along your route will appear here.
            </Text>
          ) : (
            bookings.map((booking) => {
              const bStatus = STATUS_COLORS[booking.status] ?? STATUS_COLORS.pending;
              const isPending = booking.status === 'pending';

              return (
                <View
                  key={booking.id}
                  style={[
                    styles.nestedBookingItem,
                    {
                      backgroundColor: c.inputBg,
                      borderColor: isPending ? '#F59E0B' : c.border,
                    },
                  ]}
                >
                  <View style={styles.bookingItemTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.passengerName, { color: c.text }]}>
                        👤 {booking.passenger_name ?? 'Passenger'}
                        <Text style={[styles.trustText, { color: c.accent }]}> (⭐ {booking.passenger_trust ?? 50})</Text>
                      </Text>
                      <Text style={[styles.pickupSpotText, { color: c.textSecondary }]} numberOfLines={1}>
                        📍 Meet: {booking.pickup_landmark ?? booking.pickup_label ?? 'Trip Origin'}
                      </Text>
                      {booking.walking_distance_m ? (
                        <Text style={[styles.walkingText, { color: c.textMuted }]}>
                          🚶 Passenger walks {booking.walking_distance_m}m to route
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.miniStatusPill, { backgroundColor: bStatus.bg }]}>
                        <Text style={[styles.miniStatusText, { color: bStatus.text }]}>{bStatus.label}</Text>
                      </View>
                      <Text style={[styles.fareShareText, { color: c.text }]}>
                        ₹{booking.fare_share != null ? Math.round(booking.fare_share) : '—'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions for this specific passenger */}
                  {isPending ? (
                    <View style={styles.approvalButtonsRow}>
                      <TouchableOpacity
                        style={[styles.approveBtn, { backgroundColor: '#10B981' }]}
                        onPress={() => onAccept(booking.id)}
                        disabled={actionLoadingId === booking.id}
                      >
                        {actionLoadingId === booking.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.btnTextWhite}>✅ Approve</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.declineBtn, { backgroundColor: '#EF4444' }]}
                        onPress={() => onDecline(booking.id)}
                        disabled={actionLoadingId === booking.id}
                      >
                        <Text style={styles.btnTextWhite}>❌ Decline</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.acceptedActionsRow}>
                      <TouchableOpacity
                        style={[styles.chatBtn, { borderColor: c.border, backgroundColor: c.surface }]}
                        onPress={() => router.push({ pathname: '/booking-detail', params: { id: booking.id } })}
                      >
                        <Text style={[styles.chatBtnText, { color: c.text }]}>💬 Chat &amp; Details</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. PASSENGER TICKET CARD (Ticket-Centric View)
// ─────────────────────────────────────────────────────────────
function PassengerTicketCard({
  booking,
  c,
  router,
  onCancel,
}: {
  booking: Booking;
  c: Record<string, string>;
  router: ReturnType<typeof useRouter>;
  onCancel: (id: string) => void;
}) {
  const status = STATUS_COLORS[booking.status] ?? STATUS_COLORS.pending;
  const dateStr = booking.depart_at
    ? new Date(booking.depart_at).toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      onPress={() => router.push({ pathname: '/booking-detail', params: { id: booking.id } })}
      activeOpacity={0.85}
    >
      {/* Top Bar: Status + Fare */}
      <View style={styles.cardTop}>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
        </View>
        <Text style={[styles.ticketFare, { color: c.accent }]}>
          ₹{booking.fare_share != null ? Math.round(booking.fare_share) : '—'}
        </Text>
      </View>

      {/* Driver Info Header */}
      <View style={styles.driverInfoRow}>
        <View style={styles.driverAvatar}>
          <Text style={{ fontSize: 24 }}>🚗</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.driverName, { color: c.text }]}>{booking.rider_name ?? 'Rider'}</Text>
          <Text style={[styles.driverCar, { color: c.textSecondary }]}>
            {booking.vehicle_make} {booking.vehicle_model} · {booking.plate_number}
          </Text>
        </View>
        <Text style={[styles.trustPill, { color: c.accent, backgroundColor: c.accentMuted }]}>
          ⭐ {booking.rider_trust ?? 50}
        </Text>
      </View>

      {/* Pickup & Dropoff Route */}
      <View style={[styles.ticketRouteBox, { backgroundColor: c.inputBg }]}>
        <View style={styles.routeRow}>
          <Text style={[styles.routeDot, { color: '#10B981' }]}>●</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
              {booking.pickup_landmark ?? booking.pickup_label ?? booking.origin_label}
            </Text>
            {booking.walking_distance_m ? (
              <Text style={[styles.walkingText, { color: c.textMuted }]}>
                🚶 ~{booking.walking_distance_m}m walk from your pin
              </Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.routeLine, { backgroundColor: c.border, marginLeft: 6 }]} />
        <View style={styles.routeRow}>
          <Text style={[styles.routeDot, { color: '#EF4444' }]}>●</Text>
          <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
            {booking.dropoff_landmark ?? booking.dropoff_label ?? booking.dest_label}
          </Text>
        </View>
      </View>

      {/* Boarding OTP Box (Visible once accepted) */}
      {(booking.status === 'accepted' || booking.status === 'started') && booking.boarding_otp && (
        <View style={[styles.otpBox, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
          <Text style={styles.otpLabel}>🔑 Boarding OTP</Text>
          <Text style={styles.otpCode}>{booking.boarding_otp}</Text>
          <Text style={styles.otpSub}>Share this 4-digit code with your rider when boarding</Text>
        </View>
      )}

      {/* Meta: Departure Date + Seats */}
      <View style={styles.ticketMetaRow}>
        <Text style={[styles.metaText, { color: c.textMuted }]}>🗓️ {dateStr}</Text>
        <Text style={[styles.metaText, { color: c.textMuted }]}>💺 {booking.seats_booked} seat(s)</Text>
      </View>

      {/* Quick Action Footer */}
      <View style={styles.ticketActionRow}>
        {booking.status === 'started' || booking.status === 'accepted' ? (
          <TouchableOpacity
            style={[styles.ticketActionBtn, { backgroundColor: c.accent, flex: 1 }]}
            onPress={() =>
              router.push({
                pathname: '/live-ride',
                params: { bookingId: booking.id, tripId: booking.trip_id },
              })
            }
          >
            <Text style={styles.actionBtnText}>📍 Live Ride Map</Text>
          </TouchableOpacity>
        ) : booking.status === 'completed' ? (
          <TouchableOpacity
            style={[styles.ticketActionBtn, { backgroundColor: c.accent, flex: 1 }]}
            onPress={() => router.push({ pathname: '/rate-ride', params: { bookingId: booking.id, tripId: booking.trip_id, riderId: booking.rider_id } })}
          >
            <Text style={styles.actionBtnText}>⭐ Rate Rider</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.ticketActionBtnSecondary, { borderColor: c.border, flex: 1 }]}
            onPress={() => router.push({ pathname: '/booking-detail', params: { id: booking.id } })}
          >
            <Text style={[styles.actionBtnSecondaryText, { color: c.text }]}>View Details &amp; Chat</Text>
          </TouchableOpacity>
        )}

        {booking.status === 'pending' && (
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: '#FCA5A5' }]}
            onPress={() => onCancel(booking.id)}
          >
            <Text style={{ color: '#DC2626', fontWeight: '600', fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. MAIN ACTIVITY SCREEN
// ─────────────────────────────────────────────────────────────
export default function ActivityScreen() {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const router = useRouter();
  const { user } = useAuthStore();

  const [roleMode, setRoleMode] = useState<'offered' | 'booked'>('offered');
  const [timelineFilter, setTimelineFilter] = useState<'upcoming' | 'history'>('upcoming');

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [bookingsData, tripsData] = await Promise.all([
        bookingApi.mine(),
        tripsApi.mine().catch(() => []),
      ]);
      setBookings(bookingsData);
      setTrips(tripsData);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(true); };

  const handleAccept = async (bookingId: string) => {
    setActionLoadingId(bookingId);
    try {
      await bookingApi.accept(bookingId);
      await loadData(true);
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Failed to approve booking');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecline = async (bookingId: string) => {
    Alert.alert('Decline request?', 'This will free up the seats and notify the passenger.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setActionLoadingId(bookingId);
          try {
            await bookingApi.decline(bookingId);
            await loadData(true);
          } catch (e) {
            Alert.alert('Error', (e as Error).message ?? 'Failed to decline booking');
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleCancelBooking = async (bookingId: string) => {
    Alert.alert('Cancel Booking?', 'Are you sure you want to cancel this booking?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: async () => {
          try {
            await bookingApi.cancel(bookingId, 'Passenger cancelled');
            await loadData(true);
          } catch (e) {
            Alert.alert('Error', (e as Error).message ?? 'Failed to cancel booking');
          }
        },
      },
    ]);
  };

  // Group bookings under their trip for driver view
  const tripsWithBookings = useMemo(() => {
    if (!user) return [];
    return trips.map((trip) => {
      const tripBookings = bookings.filter((b) => b.trip_id === trip.id);
      return { trip, bookings: tripBookings };
    });
  }, [trips, bookings, user]);

  // Filter offered trips by timeline (upcoming vs history)
  const filteredOfferedTrips = useMemo(() => {
    return tripsWithBookings.filter(({ trip }) => {
      const isPast = trip.status === 'completed' || trip.status === 'cancelled';
      return timelineFilter === 'upcoming' ? !isPast : isPast;
    });
  }, [tripsWithBookings, timelineFilter]);

  // Passenger bookings where user is passenger
  const passengerBookings = useMemo(() => {
    if (!user) return [];
    return bookings.filter((b) => b.passenger_id === user.id);
  }, [bookings, user]);

  // Filter passenger bookings by timeline
  const filteredPassengerBookings = useMemo(() => {
    return passengerBookings.filter((b) => {
      const isPast = b.status === 'completed' || b.status === 'declined' || b.status === 'cancelled';
      return timelineFilter === 'upcoming' ? !isPast : isPast;
    });
  }, [passengerBookings, timelineFilter]);

  // Total counts for top badge
  const offeredCount = trips.length;
  const bookedCount = passengerBookings.length;

  // Pending approval banner count
  const pendingApprovalsCount = useMemo(() => {
    if (!user) return 0;
    return bookings.filter((b) => b.rider_id === user.id && b.status === 'pending').length;
  }, [bookings, user]);

  if (!user) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>🔒</Text>
          <Text style={[styles.heading, { color: c.text }]}>Sign in to view your activity</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* ── Top Header ── */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]}>Activity</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Manage your shared trips &amp; bookings
        </Text>

        {/* ── Segmented Control: Offered vs Booked ── */}
        <View style={[styles.segmentedContainer, { backgroundColor: c.inputBg }]}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              roleMode === 'offered' && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
            ]}
            onPress={() => setRoleMode('offered')}
          >
            <Text style={[styles.segmentBtnText, { color: roleMode === 'offered' ? c.accent : c.textSecondary, fontWeight: roleMode === 'offered' ? '700' : '500' }]}>
              🚗 Offered ({offeredCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              roleMode === 'booked' && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
            ]}
            onPress={() => setRoleMode('booked')}
          >
            <Text style={[styles.segmentBtnText, { color: roleMode === 'booked' ? c.accent : c.textSecondary, fontWeight: roleMode === 'booked' ? '700' : '500' }]}>
              🎫 Booked ({bookedCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Secondary Timeline Filter: Upcoming vs History ── */}
        <View style={styles.subFilterRow}>
          <TouchableOpacity
            style={[
              styles.subFilterChip,
              timelineFilter === 'upcoming' && { backgroundColor: c.accentMuted, borderColor: c.accent },
            ]}
            onPress={() => setTimelineFilter('upcoming')}
          >
            <Text style={[styles.subFilterText, { color: timelineFilter === 'upcoming' ? c.accent : c.textMuted }]}>
              Active &amp; Upcoming
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.subFilterChip,
              timelineFilter === 'history' && { backgroundColor: c.accentMuted, borderColor: c.accent },
            ]}
            onPress={() => setTimelineFilter('history')}
          >
            <Text style={[styles.subFilterText, { color: timelineFilter === 'history' ? c.accent : c.textMuted }]}>
              Past History
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Driver Pending Approval Banner ── */}
      {roleMode === 'offered' && pendingApprovalsCount > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>
            🔔 You have {pendingApprovalsCount} passenger request{pendingApprovalsCount > 1 ? 's' : ''} awaiting approval!
          </Text>
        </View>
      )}

      {/* ── Content Feed ── */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[styles.loadingText, { color: c.textSecondary }]}>Loading activity…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={[styles.heading, { color: c.text }]}>Could not load</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: c.accent }]} onPress={() => loadData()}>
            <Text style={styles.btnTextWhite}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : roleMode === 'offered' ? (
        /* ── Offered (Driver) List ── */
        <FlatList
          data={filteredOfferedTrips}
          keyExtractor={({ trip }) => trip.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[c.accent]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 48 }}>🚗</Text>
              <Text style={[styles.emptyHeading, { color: c.text }]}>
                {timelineFilter === 'upcoming' ? 'No active trips offered' : 'No past driving history'}
              </Text>
              <Text style={[styles.emptySub, { color: c.textSecondary }]}>
                {timelineFilter === 'upcoming'
                  ? 'Offer a ride on your daily route and share fuel costs with verified co-travelers.'
                  : 'Completed rides where you were the driver will be archived here.'}
              </Text>
              {timelineFilter === 'upcoming' && (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: c.accent }]}
                  onPress={() => router.push('/post-trip')}
                >
                  <Text style={styles.btnTextWhite}>+ Offer a Ride</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <DriverTripCard
              trip={item.trip}
              bookings={item.bookings}
              onAccept={handleAccept}
              onDecline={handleDecline}
              actionLoadingId={actionLoadingId}
              c={c}
              router={router}
            />
          )}
        />
      ) : (
        /* ── Booked (Passenger) List ── */
        <FlatList
          data={filteredPassengerBookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[c.accent]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 48 }}>🎫</Text>
              <Text style={[styles.heading, { color: c.text }]}>
                {timelineFilter === 'upcoming' ? 'No active rides booked' : 'No past booking history'}
              </Text>
              <Text style={[styles.sub, { color: c.textSecondary }]}>
                {timelineFilter === 'upcoming'
                  ? 'Search for rides along your route and travel safely at split-cost pricing.'
                  : 'Your completed bookings and receipts will appear here.'}
              </Text>
              {timelineFilter === 'upcoming' && (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: c.accent }]}
                  onPress={() => router.push('/search-rides')}
                >
                  <Text style={styles.btnTextWhite}>🔍 Search Rides</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <PassengerTicketCard
              booking={item}
              c={c}
              router={router}
              onCancel={handleCancelBooking}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },

  // Segmented control
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginTop: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnText: { fontSize: 14 },

  // Secondary filter
  subFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  subFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subFilterText: { fontSize: 12, fontWeight: '600' },

  // Pending Banner
  pendingBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B',
  },
  pendingBannerText: { color: '#92400E', fontSize: 13, fontWeight: '600' },

  // Lists
  listContent: { padding: 16, gap: 14 },

  // Cards
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  headerLeft: { flex: 1 },
  tripDateText: { fontSize: 14, fontWeight: '700' },
  vehicleSubText: { fontSize: 12, marginTop: 2 },
  seatGauge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  seatGaugeText: { fontSize: 12, fontWeight: '700' },

  // Routes
  routeContainer: { marginVertical: 6 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { fontSize: 10 },
  routeLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  routeLine: { width: 2, height: 12, marginLeft: 4, marginVertical: 2 },

  // Stopovers
  stopoversRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    marginTop: 6,
  },
  stopoverHeading: { fontSize: 11, fontWeight: '600' },
  stopoverChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stopoverChipText: { fontSize: 11, fontWeight: '500' },

  // Driver Actions
  driverActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionBtnSecondary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnSecondaryText: { fontWeight: '700', fontSize: 13 },

  // Accordion
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
  },
  accordionTitle: { fontSize: 13, fontWeight: '700' },
  nestedRequestsContainer: { marginTop: 10, gap: 8 },
  noRequestsText: { fontSize: 12, textAlign: 'center', paddingVertical: 8 },

  // Nested Request item
  nestedBookingItem: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  bookingItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  passengerName: { fontSize: 13, fontWeight: '700' },
  trustText: { fontSize: 12, fontWeight: '600' },
  pickupSpotText: { fontSize: 12, marginTop: 2 },
  walkingText: { fontSize: 11, marginTop: 2 },
  miniStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  miniStatusText: { fontSize: 10, fontWeight: '700' },
  fareShareText: { fontSize: 13, fontWeight: '700' },

  approvalButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  approveBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnTextWhite: { color: '#fff', fontWeight: '700', fontSize: 12 },
  acceptedActionsRow: {
    marginTop: 8,
  },
  chatBtn: {
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  chatBtnText: { fontSize: 12, fontWeight: '600' },

  // Ticket Card (Passenger)
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  ticketFare: { fontSize: 18, fontWeight: '800' },
  driverInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: { fontSize: 15, fontWeight: '700' },
  driverCar: { fontSize: 12, marginTop: 2 },
  trustPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '700',
  },
  ticketRouteBox: {
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
  },
  otpBox: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    marginVertical: 8,
  },
  otpLabel: { fontSize: 11, fontWeight: '700', color: '#166534', textTransform: 'uppercase' },
  otpCode: { fontSize: 26, fontWeight: '900', color: '#15803D', letterSpacing: 6, marginVertical: 2 },
  otpSub: { fontSize: 11, color: '#166534' },

  ticketMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metaText: { fontSize: 12 },
  ticketActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  ticketActionBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  ticketActionBtnSecondary: {
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },

  // State views
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  sub: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  loadingText: { fontSize: 13, marginTop: 10 },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyHeading: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  emptyBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
});
