// ─────────────────────────────────────────────────────────────
// Passenger search screen — Phase 7 Matching Engine
// ─────────────────────────────────────────────────────────────
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Switch, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useTripsStore } from '@/store/tripsStore';
import { PlaceSearch } from '@/components/PlaceSearch';
import { AppButton } from '@/components/AppButton';
import { searchApi, GeoResult, MatchResult } from '@/services/api';

// ── Match result card ─────────────────────────────────────────────────────────
function RideMatchCard({
  match,
  onPress,
  c,
}: {
  match: MatchResult;
  onPress: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: Record<string, string>;
}) {
  const depTime = new Date(match.departure_time);
  const timeStr = depTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = depTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const scorePercent = Math.round(match.score * 100);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.riderInfo}>
          <Text style={[styles.riderName, { color: c.text }]}>{match.rider_name}</Text>
          <Text style={[styles.trustBadge, { color: c.accent }]}>⭐ {match.trust_score}</Text>
        </View>
        <View style={[styles.scorePill, { backgroundColor: c.accentMuted }]}>
          <Text style={[styles.scoreText, { color: c.accent }]}>{scorePercent}% match</Text>
        </View>
      </View>

      {/* Route */}
      <View style={styles.routeRow}>
        <Text style={styles.routeDot}>🟢</Text>
        <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
          {match.origin_label}
        </Text>
      </View>
      <View style={[styles.routeLine, { backgroundColor: c.border }]} />
      <View style={styles.routeRow}>
        <Text style={styles.routeDot}>🔴</Text>
        <Text style={[styles.routeLabel, { color: c.text }]} numberOfLines={1}>
          {match.destination_label}
        </Text>
      </View>

      {/* Smart pickup */}
      <View style={[styles.pickupBadge, { backgroundColor: c.accentMuted }]}>
        <Text style={[styles.pickupText, { color: c.accent }]}>
          📍 Meet at: {match.smart_pickup.landmark ?? `${match.smart_pickup.lat.toFixed(4)}, ${match.smart_pickup.lng.toFixed(4)}`}
        </Text>
      </View>

      {/* Meta chips */}
      <View style={styles.chipRow}>
        <View style={[styles.chip, { backgroundColor: c.background }]}>
          <Text style={[styles.chipText, { color: c.textSecondary }]}>🕐 {timeStr} · {dateStr}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: c.background }]}>
          <Text style={[styles.chipText, { color: c.textSecondary }]}>💺 {match.seats_available} seat{match.seats_available !== 1 ? 's' : ''}</Text>
        </View>
        {match.is_women_only && (
          <View style={[styles.chip, { backgroundColor: '#FDF2F8' }]}>
            <Text style={[styles.chipText, { color: '#9D174D' }]}>👩 Women only</Text>
          </View>
        )}
        <View style={[styles.chip, { backgroundColor: c.background }]}>
          <Text style={[styles.chipText, { color: c.textSecondary }]}>
            🚗 {match.vehicle_make} {match.vehicle_model}
          </Text>
        </View>
      </View>

      {/* Fare */}
      <View style={styles.fareRow}>
        <Text style={[styles.fareLabel, { color: c.textSecondary }]}>Your share</Text>
        <Text style={[styles.fareValue, { color: c.text }]}>
          ₹{match.fare_set != null ? Math.ceil(match.fare_set / (match.seats_available + 1)) : '—'}
          <Text style={[styles.fareCap, { color: c.textSecondary }]}>
            {' '}/ max ₹{Math.ceil(match.fare_cap / (match.seats_available + 1))}
          </Text>
        </Text>
      </View>

      {/* Score breakdown — "Why this match?" */}
      <View style={styles.whyRow}>
        <Text style={[styles.whyLabel, { color: c.textSecondary }]}>Why this match?</Text>
        <Text style={[styles.whyChips, { color: c.textSecondary }]}>
          Route {Math.round(match.score_breakdown.route_overlap * 100 / 0.30)}% ·{' '}
          Time {Math.round(match.score_breakdown.time_fit * 100 / 0.25)}% ·{' '}
          Trust {Math.round(match.score_breakdown.trust * 100 / 0.15)}%
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SearchRidesScreen() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { theme } = useThemeStore() as any;
  const c = theme.colors as Record<string, string>;
  const { search: storeSearch, setOrigin, setDestination } = useTripsStore();

  const [pickup, setPickup] = useState<GeoResult | null>(storeSearch.origin);
  const [dropoff, setDropoff] = useState<GeoResult | null>(storeSearch.destination);
  const [womenOnly, setWomenOnly] = useState(false);
  const [seats, setSeats] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MatchResult[] | null>(null);

  const canSearch = pickup && dropoff;

  const handlePickupSelect = (r: GeoResult) => {
    setPickup(r);
    setOrigin(r);
  };

  const handleDropoffSelect = (r: GeoResult) => {
    setDropoff(r);
    setDestination(r);
  };

  const handleSearch = useCallback(async (pOrigin = pickup, pDest = dropoff) => {
    if (!pOrigin || !pDest) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await searchApi.searchRides({
        pickup_lat:     pOrigin.lat,
        pickup_lng:     pOrigin.lng,
        dropoff_lat:    pDest.lat,
        dropoff_lng:    pDest.lng,
        departure_time: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min from now
        seats,
        radius_m: 800,
        women_only: womenOnly,
      });
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pickup, dropoff, seats, womenOnly]);

  // Auto-search on mount if origin and destination were passed from Home screen
  useEffect(() => {
    if (storeSearch.origin && storeSearch.destination) {
      handleSearch(storeSearch.origin, storeSearch.destination);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backIcon, { color: c.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>Find a ride</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search form */}
        <View style={[styles.formCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ gap: 8, zIndex: 30 }}>
            <PlaceSearch
              label="Your pickup point"
              value={pickup?.label ?? ''}
              onSelect={handlePickupSelect}
              dotColor="🟢"
            />
            <View style={[styles.connector, { backgroundColor: c.border }]} />
            <PlaceSearch
              label="Drop-off destination"
              value={dropoff?.label ?? ''}
              onSelect={handleDropoffSelect}
              dotColor="🔴"
            />
          </View>

          {/* Seats stepper */}
          <View style={styles.seatsRow}>
            <Text style={[styles.seatsLabel, { color: c.text }]}>💺 Seats needed</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: c.border }]}
                onPress={() => setSeats(s => Math.max(1, s - 1))}
              >
                <Text style={[styles.stepIcon, { color: c.text }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.stepValue, { color: c.text }]}>{seats}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: c.border }]}
                onPress={() => setSeats(s => Math.min(6, s + 1))}
              >
                <Text style={[styles.stepIcon, { color: c.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Women-only filter */}
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: c.text }]}>👩 Women-only trips only</Text>
            <Switch
              value={womenOnly}
              onValueChange={setWomenOnly}
              trackColor={{ false: c.border, true: c.accent }}
              thumbColor="#fff"
            />
          </View>

          <AppButton
            label={loading ? 'Searching…' : canSearch ? '🔍 Search rides' : 'Enter pickup & drop-off'}
            onPress={handleSearch}
            variant="primary"
            disabled={!canSearch || loading}
            style={{ marginTop: 4 }}
          />
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.loadingText, { color: c.textSecondary }]}>Finding matching rides…</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={[styles.errorBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* Results */}
        {results !== null && !loading && (
          <>
            <Text style={[styles.resultsLabel, { color: c.textSecondary }]}>
              {results.length === 0
                ? 'No rides found for this route and time.'
                : `${results.length} ride${results.length !== 1 ? 's' : ''} found · sorted by match score`}
            </Text>

            {results.length === 0 && (
              <View style={[styles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={{ fontSize: 40 }}>🔍</Text>
                <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                  No open rides match your corridor right now.{'\n'}
                  Try a wider radius or a different time.
                </Text>
              </View>
            )}

            {results.map(match => (
              <RideMatchCard
                key={match.trip_id}
                match={match}
                c={c}
                onPress={() => {
                  // Phase 8: navigate to booking screen
                  // router.push(`/book/${match.trip_id}`);
                }}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, fontWeight: '700' },
  headerTitle: { fontSize: 20, fontWeight: '700' },

  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  formCard: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 14 },
  connector: { width: 2, height: 8, marginLeft: 17, borderRadius: 1 },

  seatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seatsLabel: { fontSize: 15, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepIcon: { fontSize: 18, fontWeight: '700', lineHeight: 20 },
  stepValue: { fontSize: 17, fontWeight: '700', minWidth: 20, textAlign: 'center' },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 15, fontWeight: '500' },

  centered: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  loadingText: { fontSize: 14 },

  errorBox: { borderRadius: 12, padding: 14, borderWidth: 1 },
  errorText: { color: '#B91C1C', fontSize: 14 },

  resultsLabel: { fontSize: 13, fontWeight: '500', marginBottom: -4 },

  emptyBox: { borderRadius: 16, padding: 28, borderWidth: 1, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // Match card
  card: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  riderInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  riderName: { fontSize: 16, fontWeight: '700' },
  trustBadge: { fontSize: 13, fontWeight: '600' },
  scorePill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText: { fontSize: 12, fontWeight: '700' },

  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { fontSize: 12 },
  routeLabel: { fontSize: 14, fontWeight: '500', flex: 1 },
  routeLine: { width: 2, height: 6, marginLeft: 9, borderRadius: 1 },

  pickupBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  pickupText: { fontSize: 12, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '500' },

  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  fareLabel: { fontSize: 13 },
  fareValue: { fontSize: 18, fontWeight: '700' },
  fareCap: { fontSize: 13 },

  whyRow: { gap: 2 },
  whyLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  whyChips: { fontSize: 12 },
});
