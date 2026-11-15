// ─────────────────────────────────────────────────────────────
// Savings Screen — live money saved, CO₂ avoided, and streak (Phase 10)
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { savingsApi, SavingsSummary } from '@/services/api';

export default function SavingsScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const c = theme.colors;
  const { user } = useAuthStore();

  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadSavings = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const data = await savingsApi.getSavings();
      setSavings(data);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to load savings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadSavings();
    } else {
      setLoading(false);
    }
  }, [user, loadSavings]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSavings(true);
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 56 }}>🔒</Text>
          <Text style={[styles.heading, { color: c.text }]}>Sign in to view savings</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            Track your real rupee savings, avoided emissions, and commute streak.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Equivalent trees calculation (1 tree absorbs ~20 kg CO2 / year)
  const co2Kg = savings?.co2_avoided_kg ?? 0;
  const treeEquiv = (co2Kg / 20).toFixed(2);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]}>Savings & Impact</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Your contribution to wallet and planet
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
        }
      >
        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.sub, { color: c.textSecondary, marginTop: 12 }]}>
              Calculating your savings...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 40 }}>⚠️</Text>
            <Text style={[styles.heading, { color: c.text }]}>Could not load</Text>
            <Text style={[styles.sub, { color: c.textSecondary }]}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: c.accent }]}
              onPress={() => loadSavings()}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Hero Money Saved Card */}
            <View style={[styles.heroCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.heroTop}>
                <Text style={styles.heroEmoji}>💰</Text>
                <View>
                  <Text style={[styles.heroLabel, { color: c.textSecondary }]}>
                    Total Money Saved
                  </Text>
                  <Text style={[styles.heroAmount, { color: c.accent }]}>
                    ₹{Math.round(savings?.money_saved ?? 0)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroFootnote, { color: c.textMuted }]}>
                Compared to paying full solo driving fuel costs on {savings?.total_trips ?? 0} shared rides
              </Text>
            </View>

            {/* Impact Metric Cards Grid */}
            <View style={styles.grid}>
              {/* CO2 Avoided */}
              <View style={[styles.metricCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={styles.metricEmoji}>🌱</Text>
                <Text style={[styles.metricValue, { color: '#10B981' }]}>
                  {Number(savings?.co2_avoided_kg ?? 0).toFixed(1)} kg
                </Text>
                <Text style={[styles.metricLabel, { color: c.textSecondary }]}>CO₂ Avoided</Text>
              </View>

              {/* Commute Streak */}
              <View style={[styles.metricCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={styles.metricEmoji}>🔥</Text>
                <Text style={[styles.metricValue, { color: '#F59E0B' }]}>
                  {savings?.commute_streak ?? 0}
                </Text>
                <Text style={[styles.metricLabel, { color: c.textSecondary }]}>Day Streak</Text>
              </View>

              {/* Total Shared Distance */}
              <View style={[styles.metricCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={styles.metricEmoji}>🛣️</Text>
                <Text style={[styles.metricValue, { color: c.text }]}>
                  {Math.round(savings?.total_distance_km ?? 0)} km
                </Text>
                <Text style={[styles.metricLabel, { color: c.textSecondary }]}>Shared Commute</Text>
              </View>

              {/* Completed Trips */}
              <View style={[styles.metricCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={styles.metricEmoji}>🚗</Text>
                <Text style={[styles.metricValue, { color: c.text }]}>
                  {savings?.total_trips ?? 0}
                </Text>
                <Text style={[styles.metricLabel, { color: c.textSecondary }]}>Shared Rides</Text>
              </View>
            </View>

            {/* Eco Tree Equivalence Banner */}
            <View style={[styles.ecoCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <Text style={styles.ecoEmoji}>🌳</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.ecoHeading}>
                  Equivalent to {treeEquiv} tree-years of carbon absorption!
                </Text>
                <Text style={styles.ecoSub}>
                  By pooling rides in Pune, you are reducing traffic congestion on corridors like Hinjewadi and SB Road.
                </Text>
              </View>
            </View>

            {/* Zero-Commission Cost Sharing Info */}
            <View style={[styles.infoCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.infoTitle, { color: c.text }]}>
                ⚖️ The Zero-Profit Principle
              </Text>
              <Text style={[styles.infoBody, { color: c.textSecondary }]}>
                RideColab charges ₹0 commission. Fares are strictly capped to the actual fuel cost of the vehicle split across passengers. Nobody profits — everyone saves.
              </Text>
            </View>

            {/* Action link */}
            {(savings?.total_trips ?? 0) === 0 && (
              <TouchableOpacity
                style={[styles.findRideBtn, { backgroundColor: c.accent }]}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onPress={() => router.push('/search-rides' as any)}
              >
                <Text style={styles.findRideBtnText}>Take Your First Shared Ride →</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  retryBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 8,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroEmoji: { fontSize: 44 },
  heroLabel: { fontSize: 13, fontWeight: '600' },
  heroAmount: { fontSize: 32, fontWeight: '900' },
  heroFootnote: { fontSize: 12, lineHeight: 16, marginTop: 4 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  metricEmoji: { fontSize: 28 },
  metricValue: { fontSize: 22, fontWeight: '800' },
  metricLabel: { fontSize: 12, fontWeight: '600' },

  ecoCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  ecoEmoji: { fontSize: 36 },
  ecoHeading: { fontSize: 14, fontWeight: '700', color: '#065F46' },
  ecoSub: { fontSize: 12, color: '#047857', lineHeight: 16 },

  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  infoTitle: { fontSize: 14, fontWeight: '700' },
  infoBody: { fontSize: 13, lineHeight: 18 },

  findRideBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  findRideBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
