// ─────────────────────────────────────────────────────────────
// Passenger search screen — Phase 7 + Ride Polishing
// Sub-route corridor matching with walking distance & pro-rata fares
// ─────────────────────────────────────────────────────────────
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Switch, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useTripsStore } from '@/store/tripsStore';
import { PlaceSearch } from '@/components/PlaceSearch';
import { AppButton } from '@/components/AppButton';
import { searchApi, bookingApi, GeoResult, MatchResult } from '@/services/api';

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

  const calculatedFare = match.pro_rata_fare_set != null
    ? match.pro_rata_fare_set
    : match.fare_set != null
    ? Math.ceil(match.fare_set / (match.seats_available + 1))
    : '—';

  const calculatedCap = match.pro_rata_fare_cap != null
    ? match.pro_rata_fare_cap
    : Math.ceil(match.fare_cap / (match.seats_available + 1));

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Header row: Rider info + Relative Time Pill */}
      <View style={styles.cardHeader}>
        <View style={styles.riderInfo}>
          <Text style={[styles.riderName, { color: c.text }]}>{match.rider_name}</Text>
          <Text style={[styles.trustBadge, { color: c.accent }]}>⭐ {match.trust_score}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {match.relative_time_badge ? (
            <View style={[styles.timeBadge, { backgroundColor: c.accentMuted }]}>
              <Text style={[styles.timeBadgeText, { color: c.accent }]}>{match.relative_time_badge}</Text>
            </View>
          ) : null}
          <View style={[styles.scorePill, { backgroundColor: c.inputBg }]}>
            <Text style={[styles.scoreText, { color: c.textSecondary }]}>{scorePercent}%</Text>
          </View>
        </View>
      </View>

      {/* Driver's Total Route */}
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

      {/* Smart Meeting Point & Walking Distance (BlaBlaCar standard) */}
      <View style={[styles.pickupBadge, { backgroundColor: c.accentMuted }]}>
        <Text style={[styles.pickupText, { color: c.accent }]}>
          📍 Meet at: {match.smart_pickup.landmark ?? `${match.smart_pickup.lat.toFixed(4)}, ${match.smart_pickup.lng.toFixed(4)}`}
          {match.walking_distance_m > 0 ? (
            <Text style={{ fontWeight: '500' }}> · ~{match.walking_distance_m}m walk</Text>
          ) : null}
        </Text>
      </View>

      {/* Dropoff landmark if available */}
      {match.smart_dropoff?.landmark && (
        <View style={[styles.dropoffBadge, { backgroundColor: c.inputBg }]}>
          <Text style={[styles.dropoffText, { color: c.textSecondary }]}>
            🏁 Drops you at: {match.smart_dropoff.landmark}
            {match.sub_leg_distance_km ? ` · ${match.sub_leg_distance_km} km` : ''}
          </Text>
        </View>
      )}

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

      {/* Pro-rata Fare share (strictly adhering to THE MONEY RULE) */}
      <View style={styles.fareRow}>
        <View>
          <Text style={[styles.fareLabel, { color: c.textSecondary }]}>Your split fuel share</Text>
          {match.sub_leg_distance_km > 0 ? (
            <Text style={[styles.fareSub, { color: c.textMuted }]}>Pro-rata for {match.sub_leg_distance_km} km</Text>
          ) : null}
        </View>
        <Text style={[styles.fareValue, { color: c.accent }]}>
          ₹{calculatedFare}
          <Text style={[styles.fareCap, { color: c.textSecondary }]}>
            {' '}/ max ₹{calculatedCap}
          </Text>
        </Text>
      </View>

      {/* Score breakdown */}
      <View style={styles.whyRow}>
        <Text style={[styles.whyLabel, { color: c.textSecondary }]}>Match fit:</Text>
        <Text style={[styles.whyChips, { color: c.textSecondary }]}>
          Corridor {Math.round(match.score_breakdown.route_overlap * 100 / 0.30)}% ·{' '}
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

  const { search: storeSearch } = useTripsStore();

  const [pickup, setPickup] = useState<GeoResult | null>(storeSearch.origin);
  const [dropoff, setDropoff] = useState<GeoResult | null>(storeSearch.destination);
  const [seats, setSeats] = useState<number>(1);
  const [womenOnly, setWomenOnly] = useState<boolean>(false);
  const [radiusM, setRadiusM] = useState<number>(1500); // 1.5km default
  const [windowMins, setWindowMins] = useState<number>(90); // ±90 mins default

  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canSearch = Boolean(pickup && dropoff);

  const handlePickupSelect = (r: GeoResult) => { setPickup(r); setResults(null); };
  const handleDropoffSelect = (r: GeoResult) => { setDropoff(r); setResults(null); };

  const handleSearch = useCallback(async (originOverride?: GeoResult, destOverride?: GeoResult) => {
    const pOrigin = originOverride ?? pickup;
    const pDest = destOverride ?? dropoff;
    if (!pOrigin || !pDest) return;

    setLoading(true);
    setError(null);
    try {
      const data = await searchApi.searchRides({
        pickup_lat:     pOrigin.lat,
        pickup_lng:     pOrigin.lng,
        dropoff_lat:    pDest.lat,
        dropoff_lng:    pDest.lng,
        departure_time: new Date(Date.now() + 30 * 60_000).toISOString(),
        seats,
        radius_m:       radiusM,
        window_mins:    windowMins,
        women_only:     womenOnly,
      });
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pickup, dropoff, seats, radiusM, windowMins, womenOnly]);

  useEffect(() => {
    if (storeSearch.origin && storeSearch.destination) {
      handleSearch(storeSearch.origin, storeSearch.destination);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectMatch = (match: MatchResult) => {
    const farePerSeat = match.pro_rata_fare_set ?? (match.fare_set != null ? Math.ceil(match.fare_set / (match.seats_available + 1)) : 0);
    const estShare = farePerSeat * seats;

    Alert.alert(
      'Request Booking',
      `🚗 Rider: ${match.rider_name} (${match.vehicle_make} ${match.vehicle_model})\n` +
      `💺 Seats: ${seats}\n` +
      `💰 Split Cost: ₹${estShare} (No Commission)\n` +
      `📍 Meet at: ${match.smart_pickup.landmark ?? 'Route Point'}\n` +
      `🏁 Drop at: ${match.smart_dropoff?.landmark ?? match.destination_label}\n\n` +
      `Send booking request to rider?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Seat',
          onPress: async () => {
            try {
              const booking = await bookingApi.create({
                trip_id:             match.trip_id,
                seats_booked:        seats,
                pickup_label:        pickup?.label ?? match.origin_label,
                pickup_lat:          pickup?.lat,
                pickup_lng:          pickup?.lng,
                dropoff_label:       dropoff?.label ?? match.destination_label,
                dropoff_lat:         dropoff?.lat,
                dropoff_lng:         dropoff?.lng,
                pickup_landmark:     match.smart_pickup.landmark ?? undefined,
                dropoff_landmark:    match.smart_dropoff?.landmark ?? undefined,
                walking_distance_m:  match.walking_distance_m,
                sub_leg_distance_km: match.sub_leg_distance_km,
                fare_share:          estShare,
              });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              router.push({ pathname: '/booking-detail', params: { id: booking.id } } as any);
            } catch (err) {
              Alert.alert('Booking Error', (err as Error).message ?? 'Could not create booking');
            }
          },
        },
      ],
    );
  };

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

          {/* Corridor Radius Selector */}
          <View style={{ marginTop: 6 }}>
            <Text style={[styles.filterSubLabel, { color: c.textSecondary }]}>Corridor Radius:</Text>
            <View style={styles.filterChipRow}>
              {[
                { label: '500m (Strict)', val: 500 },
                { label: '1.5km (Standard)', val: 1500 },
                { label: '3.0km (Highway)', val: 3000 },
              ].map((chip) => (
                <TouchableOpacity
                  key={chip.val}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: radiusM === chip.val ? c.accent : c.inputBg,
                      borderColor: radiusM === chip.val ? c.accent : c.border,
                    },
                  ]}
                  onPress={() => setRadiusM(chip.val)}
                >
                  <Text style={[styles.filterChipText, { color: radiusM === chip.val ? '#fff' : c.textSecondary }]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Departure Window Selector */}
          <View style={{ marginTop: 6 }}>
            <Text style={[styles.filterSubLabel, { color: c.textSecondary }]}>Departure Window:</Text>
            <View style={styles.filterChipRow}>
              {[
                { label: '±30m', val: 30 },
                { label: '±90m (Standard)', val: 90 },
                { label: '±3 hours', val: 180 },
              ].map((chip) => (
                <TouchableOpacity
                  key={chip.val}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: windowMins === chip.val ? c.accent : c.inputBg,
                      borderColor: windowMins === chip.val ? c.accent : c.border,
                    },
                  ]}
                  onPress={() => setWindowMins(chip.val)}
                >
                  <Text style={[styles.filterChipText, { color: windowMins === chip.val ? '#fff' : c.textSecondary }]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
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
            onPress={() => handleSearch()}
            variant="primary"
            disabled={!canSearch || loading}
            style={{ marginTop: 8 }}
          />
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.loadingText, { color: c.textSecondary }]}>Finding matching rides along corridor…</Text>
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
                ? 'No rides found for this route and time window.'
                : `${results.length} ride${results.length !== 1 ? 's' : ''} found · sorted by match score`}
            </Text>

            {results.length === 0 && (
              <View style={[styles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={{ fontSize: 40 }}>🔍</Text>
                <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                  No open rides match your corridor right now.{'\n'}
                  Try selecting a 3.0km corridor or expanding the departure window.
                </Text>
              </View>
            )}

            {results.map((match) => (
              <RideMatchCard
                key={match.trip_id}
                match={match}
                onPress={() => handleSelectMatch(match)}
                c={c}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { marginRight: 12, padding: 4 },
  backIcon: { fontSize: 20 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 16, gap: 12 },

  formCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  connector: { width: 2, height: 8, marginLeft: 16, marginVertical: -2 },

  seatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  seatsLabel: { fontSize: 14, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIcon: { fontSize: 18, fontWeight: '700', lineHeight: 20 },
  stepValue: { fontSize: 16, fontWeight: '700', minWidth: 20, textAlign: 'center' },

  filterSubLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  filterChipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 11, fontWeight: '600' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  switchLabel: { fontSize: 14, fontWeight: '500' },

  centered: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  loadingText: { fontSize: 14 },
  errorBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
  errorText: { color: '#DC2626', fontSize: 13 },

  resultsLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  emptyBox: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  riderInfo: { flex: 1, gap: 2 },
  riderName: { fontSize: 15, fontWeight: '700' },
  trustBadge: { fontSize: 12, fontWeight: '600' },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timeBadgeText: { fontSize: 11, fontWeight: '700' },
  scorePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scoreText: { fontSize: 11, fontWeight: '700' },

  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { fontSize: 10 },
  routeLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  routeLine: { width: 2, height: 10, marginLeft: 4, marginVertical: 1 },

  pickupBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2,
  },
  pickupText: { fontSize: 12, fontWeight: '700' },
  dropoffBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dropoffText: { fontSize: 11, fontWeight: '500' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '500' },

  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  fareLabel: { fontSize: 13, fontWeight: '600' },
  fareSub: { fontSize: 11 },
  fareValue: { fontSize: 17, fontWeight: '800' },
  fareCap: { fontSize: 11, fontWeight: '400' },

  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whyLabel: { fontSize: 11, fontWeight: '600' },
  whyChips: { fontSize: 11, flex: 1 },
});
