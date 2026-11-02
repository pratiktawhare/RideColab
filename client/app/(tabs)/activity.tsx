// ─────────────────────────────────────────────────────────────
// Activity screen — my bookings list (Phase 8)
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl,
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

function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
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
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Status pill */}
      <View style={styles.cardTop}>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
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
        <Text style={[styles.metaText, { color: c.textSecondary }]}>
          🚗 {booking.rider_name ?? 'Rider'}
        </Text>
        {booking.vehicle_make ? (
          <Text style={[styles.metaText, { color: c.textSecondary }]}>
            · {booking.vehicle_make} {booking.vehicle_model}
          </Text>
        ) : null}
        {dateStr ? (
          <Text style={[styles.metaText, { color: c.textMuted }]}>· {dateStr}</Text>
        ) : null}
      </View>
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
      </View>

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
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 56 }}>🎫</Text>
          <Text style={[styles.heading, { color: c.text }]}>No bookings yet</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            When you book a ride or receive a booking request, it will appear here.
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: c.accent }]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push('/search-rides' as any)}
          >
            <Text style={styles.retryBtnText}>Find a Ride →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
          }
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
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
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  loadingText: { fontSize: 14, marginTop: 8 },
  retryBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  card: {
    borderRadius: 16, borderWidth: 1, padding: 14, gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  fareText: { fontSize: 13, fontWeight: '700' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { fontSize: 10 },
  routeLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  routeLine: { width: 2, height: 6, marginLeft: 5, borderRadius: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  metaText: { fontSize: 12 },
});
