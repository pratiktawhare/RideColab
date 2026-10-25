// ─────────────────────────────────────────────────────────────
// My Trips screen — rider's active + past trips
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useTripsStore } from '@/store/tripsStore';
import { tripsApi, Trip } from '@/services/api';
import { EmptyState } from '@/components/StateViews';
import { SkeletonCard } from '@/components/SkeletonLoader';

const STATUS_COLOR: Record<string, string> = {
  open: '#10B981',       // green
  full: '#F59E0B',       // amber
  in_progress: '#3B82F6',
  completed: '#6B7280',
  cancelled: '#EF4444',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  full: 'Full',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function TripCard({
  trip,
  onCancel,
}: {
  trip: Trip;
  onCancel: (id: string) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const depart = new Date(trip.depart_at);
  const dateStr = depart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = depart.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const distKm = trip.distance_m ? (trip.distance_m / 1000).toFixed(1) : null;
  const farePerPax = trip.seats_total > 0
    ? (Number(trip.fare_set) / (trip.seats_total + 1)).toFixed(0)
    : '—';

  const canCancel = trip.status === 'open' || trip.status === 'full';

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Status badge */}
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLOR[trip.status]}22` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLOR[trip.status] }]}>
            {STATUS_LABEL[trip.status] ?? trip.status}
          </Text>
        </View>
        {trip.is_recurring && (
          <View style={[styles.recBadge, { backgroundColor: c.accentMuted }]}>
            <Text style={[styles.recText, { color: c.accent }]}>🔁 Recurring</Text>
          </View>
        )}
      </View>

      {/* Route */}
      <View style={styles.routeRow}>
        <View style={styles.routeDots}>
          <View style={[styles.dotGreen, { backgroundColor: '#10B981' }]} />
          <View style={[styles.dotLine, { backgroundColor: c.border }]} />
          <View style={[styles.dotRed, { backgroundColor: '#EF4444' }]} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
            {trip.origin_label}
          </Text>
          <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
            {trip.dest_label}
          </Text>
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaChip, { color: c.textSecondary }]}>
          📅 {dateStr} · {timeStr}
        </Text>
        <Text style={[styles.metaChip, { color: c.textSecondary }]}>
          💺 {trip.seats_available}/{trip.seats_total} seats
        </Text>
        {distKm && (
          <Text style={[styles.metaChip, { color: c.textSecondary }]}>
            🛣️ {distKm} km
          </Text>
        )}
        <Text style={[styles.metaChip, { color: c.accent, fontWeight: '700' }]}>
          ₹{farePerPax}/pax
        </Text>
      </View>

      {trip.notes && (
        <Text style={[styles.notes, { color: c.textSecondary }]} numberOfLines={2}>
          📝 {trip.notes}
        </Text>
      )}

      {canCancel && (
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: '#EF4444' }]}
          onPress={() => onCancel(trip.id)}
        >
          <Text style={styles.cancelText}>Cancel trip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function MyTripsScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { myTrips, setMyTrips, removeTrip } = useTripsStore();
  const c = theme.colors;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const trips = await tripsApi.mine();
      setMyTrips(trips);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [setMyTrips]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const handleCancel = (id: string) => {
    Alert.alert(
      'Cancel trip?',
      'This will cancel the trip and notify all passengers.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Yes, cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await tripsApi.cancel(id);
              removeTrip(id);
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: c.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>My Trips</Text>
        <TouchableOpacity
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/post-trip' as any)}
        >
          <Text style={[styles.postBtn, { color: c.accent }]}>+ Post</Text>
        </TouchableOpacity>
      </View>

      {loading && myTrips.length === 0 ? (
        <View style={{ padding: 20, gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={myTrips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await fetchTrips();
                setRefreshing(false);
              }}
              tintColor={c.accent}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No trips yet"
              subtitle="Post your first trip to start sharing rides."
              actionLabel="Post a trip"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onAction={() => router.push('/post-trip' as any)}
            />
          }
          renderItem={({ item }) => (
            <TripCard trip={item} onCancel={handleCancel} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14,
  },
  back: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700' },
  postBtn: { fontSize: 15, fontWeight: '700' },

  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  cardHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  recBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  recText: { fontSize: 12, fontWeight: '600' },

  routeRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  routeDots: { alignItems: 'center', gap: 3 },
  dotGreen: { width: 10, height: 10, borderRadius: 5 },
  dotLine: { width: 2, height: 20, borderRadius: 1 },
  dotRed: { width: 10, height: 10, borderRadius: 5 },
  routeLabel: { fontSize: 14, fontWeight: '500' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip: { fontSize: 12 },
  notes: { fontSize: 13, fontStyle: 'italic' },

  cancelBtn: {
    borderWidth: 1, borderRadius: 10, paddingVertical: 8,
    alignItems: 'center', marginTop: 4,
  },
  cancelText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
});
