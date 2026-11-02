// ─────────────────────────────────────────────────────────────
// Activity screen — my bookings list & rider approvals (Phase 8)
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { bookingApi, Booking } from '@/services/api';

// ── Status pill colour map ────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E', label: '⏳ Pending'   },
  accepted:  { bg: '#D1FAE5', text: '#065F46', label: '✅ Accepted'  },
  started:   { bg: '#DBEAFE', text: '#1E40AF', label: '🚗 In Ride'   },
  completed: { bg: '#F3F4F6', text: '#374151', label: '🏁 Completed' },
  declined:  { bg: '#FEE2E2', text: '#991B1B', label: '❌ Declined'  },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: '🚫 Cancelled' },
};

function BookingCard({
  booking,
  currentUserId,
  onPress,
  onAccept,
  onDecline,
  actionLoading,
}: {
  booking: Booking;
  currentUserId?: string;
  onPress: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  actionLoading?: boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const isRider = Boolean(currentUserId && booking.rider_id === currentUserId);
  const status = STATUS_COLORS[booking.status] ?? STATUS_COLORS.pending;

  const fareText = booking.fare_share != null
    ? `₹${Number(booking.fare_share).toFixed(0)} fare share`
    : 'Fare TBD';

  const dateStr = booking.depart_at
    ? new Date(booking.depart_at).toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: isRider && booking.status === 'pending' ? '#F59E0B' : c.border,
          borderWidth: isRider && booking.status === 'pending' ? 1.5 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Status pill & role badge */}
      <View style={styles.cardTop}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
          </View>
          <View style={[styles.rolePill, { backgroundColor: isRider ? c.accentMuted : c.inputBg }]}>
            <Text style={[styles.roleText, { color: isRider ? c.accent : c.textSecondary }]}>
              {isRider ? '📥 Request for your trip' : '🎫 Your booking'}
            </Text>
          </View>
        </View>
        <Text style={[styles.fareText, { color: c.accent }]}>{fareText}</Text>
      </View>

      {/* Route */}
      <View style={styles.routeRow}>
        <Text style={[styles.routeDot, { color: '#10B981' }]}>●</Text>
        <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
          {booking.origin_label ?? booking.pickup_label ?? '—'}
        </Text>
      </View>
      <View style={[styles.routeLine, { backgroundColor: c.border }]} />
      <View style={styles.routeRow}>
        <Text style={[styles.routeDot, { color: '#EF4444' }]}>●</Text>
        <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
          {booking.dest_label ?? booking.dropoff_label ?? '—'}
        </Text>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        {isRider ? (
          <Text style={[styles.metaText, { color: c.textSecondary }]}>
            👤 Passenger: <Text style={{ fontWeight: '700', color: c.text }}>{booking.passenger_name ?? 'Passenger'}</Text> (⭐ {booking.passenger_trust ?? 50})
          </Text>
        ) : (
          <Text style={[styles.metaText, { color: c.textSecondary }]}>
            🚗 Rider: <Text style={{ fontWeight: '700', color: c.text }}>{booking.rider_name ?? 'Rider'}</Text>
          </Text>
        )}
        <Text style={[styles.metaText, { color: c.textSecondary }]}>
          · 💺 {booking.seats_booked} seat{booking.seats_booked !== 1 ? 's' : ''}
        </Text>
        {dateStr ? (
          <Text style={[styles.metaText, { color: c.textMuted }]}>· {dateStr}</Text>
        ) : null}
      </View>

      {/* Quick Rider Approval Actions for pending requests */}
      {isRider && booking.status === 'pending' && onAccept && onDecline ? (
        <View style={styles.quickActionRow}>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: '#10B981', flex: 1 }]}
            onPress={onAccept}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.quickBtnText}>✅ Approve</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: '#EF4444', flex: 1 }]}
            onPress={onDecline}
            disabled={actionLoading}
          >
            <Text style={styles.quickBtnText}>❌ Decline</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function ActivityScreen() {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const router = useRouter();
  const { user } = useAuthStore();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'requests' | 'bookings'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await bookingApi.mine();
      setBookings(data);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load bookings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleAccept = async (bookingId: string) => {
    setActionLoadingId(bookingId);
    try {
      await bookingApi.accept(bookingId);
      await load(true);
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
            await load(true);
          } catch (e) {
            Alert.alert('Error', (e as Error).message ?? 'Failed to decline booking');
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const pendingRiderRequests = useMemo(() => {
    if (!user) return [];
    return bookings.filter((b) => b.rider_id === user.id && b.status === 'pending');
  }, [bookings, user]);

  const filteredBookings = useMemo(() => {
    if (!user) return bookings;
    if (filter === 'requests') {
      return bookings.filter((b) => b.rider_id === user.id);
    }
    if (filter === 'bookings') {
      return bookings.filter((b) => b.passenger_id === user.id);
    }
    return bookings;
  }, [bookings, filter, user]);

  if (!user) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>🔒</Text>
          <Text style={[styles.heading, { color: c.text }]}>Sign in to see bookings</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]}>Activity</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Your trips &amp; bookings
        </Text>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'All' },
            { key: 'requests', label: `Requests (${bookings.filter((b) => b.rider_id === user.id).length})` },
            { key: 'bookings', label: `My Rides (${bookings.filter((b) => b.passenger_id === user.id).length})` },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === tab.key ? c.accent : c.inputBg,
                  borderColor: filter === tab.key ? c.accent : c.border,
                },
              ]}
              onPress={() => setFilter(tab.key as typeof filter)}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: filter === tab.key ? '#fff' : c.textSecondary },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pending Rider Requests Banner */}
      {pendingRiderRequests.length > 0 ? (
        <View style={[styles.pendingBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
          <Text style={styles.pendingBannerText}>
            🔔 You have {pendingRiderRequests.length} pending request{pendingRiderRequests.length > 1 ? 's' : ''} waiting for your approval!
          </Text>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[styles.loadingText, { color: c.textSecondary }]}>Loading bookings…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={[styles.heading, { color: c.text }]}>Could not load</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: c.accent }]}
            onPress={() => load()}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredBookings.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 56 }}>🎫</Text>
          <Text style={[styles.heading, { color: c.text }]}>
            {filter === 'requests' ? 'No incoming requests' : filter === 'bookings' ? 'No bookings found' : 'No activity yet'}
          </Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            {filter === 'requests'
              ? 'When passengers request to join your posted trips, they will appear here for your approval.'
              : 'When you book a ride or post a trip, your activity will appear here.'}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: c.accent }]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push(filter === 'requests' ? ('/post-trip' as any) : ('/search-rides' as any))}
          >
            <Text style={styles.retryBtnText}>
              {filter === 'requests' ? 'Post a Trip →' : 'Find a Ride →'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
          }
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              currentUserId={user.id}
              actionLoading={actionLoadingId === item.id}
              onAccept={() => handleAccept(item.id)}
              onDecline={() => handleDecline(item.id)}
              onPress={() =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push({ pathname: '/booking-detail', params: { id: item.id } } as any)
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, gap: 10,
  },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  filterPill: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  filterText: { fontSize: 12, fontWeight: '600' },

  pendingBanner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  pendingBannerText: { color: '#92400E', fontSize: 13, fontWeight: '700' },

  list: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  loadingText: { fontSize: 14, marginTop: 8 },
  retryBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  card: {
    borderRadius: 16, padding: 14, gap: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  rolePill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  roleText: { fontSize: 11, fontWeight: '600' },
  fareText: { fontSize: 13, fontWeight: '700' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { fontSize: 10 },
  routeLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  routeLine: { width: 2, height: 6, marginLeft: 5, borderRadius: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  metaText: { fontSize: 12 },

  quickActionRow: {
    flexDirection: 'row', gap: 10, marginTop: 8, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
  },
  quickBtn: {
    borderRadius: 10, paddingVertical: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  quickBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
