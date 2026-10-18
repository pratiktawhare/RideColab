// ─────────────────────────────────────────────────────────────
// MatchCard — displays a ride match result
// Used in: Home screen search results (Phase 7 will populate with real data)
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '@/store/themeStore';

export interface MatchCardData {
  id: string;
  riderName: string;
  trustScore: number;
  gender?: 'male' | 'female' | 'other';
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleType?: 'car' | 'bike' | 'ev';
  pickupLabel: string;
  dropoffLabel: string;
  walkDistanceM?: number;
  detourKm?: number;
  departureTime: string;
  fareShare: number;
  seatsAvailable: number;
  communityName?: string;
  isWomenOnly?: boolean;
  whyChips?: string[];
}

interface MatchCardProps {
  data: MatchCardData;
  onPress?: () => void;
}

function TrustBadge({ score, accent, accentMuted }: { score: number; accent: string; accentMuted: string }) {
  const label =
    score >= 76 ? 'Verified' :
    score >= 51 ? 'Trusted' :
    score >= 21 ? 'Regular' : 'New';
  return (
    <View style={[badge.wrap, { backgroundColor: accentMuted }]}>
      <Text style={[badge.text, { color: accent }]}>⭐ {score} · {label}</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '700' },
});

function VehicleTag({ vehicleMake, vehicleModel, vehicleType }: Pick<MatchCardData, 'vehicleMake' | 'vehicleModel' | 'vehicleType'>) {
  const emoji = vehicleType === 'bike' ? '🏍️' : vehicleType === 'ev' ? '⚡' : '🚗';
  const label = [vehicleMake, vehicleModel].filter(Boolean).join(' ') || 'Vehicle';
  return <Text style={{ fontSize: 12, color: '#6B7280' }}>{emoji} {label}</Text>;
}

export function MatchCard({ data, onPress }: MatchCardProps) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      {/* Header row */}
      <View style={styles.header}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: c.accent }]}>
          <Text style={styles.avatarText}>{data.riderName[0]?.toUpperCase() ?? '?'}</Text>
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: c.text }]}>{data.riderName}</Text>
            {data.isWomenOnly && (
              <View style={[styles.pill, { backgroundColor: '#FCE7F3' }]}>
                <Text style={[styles.pillText, { color: '#DB2777' }]}>♀ Women only</Text>
              </View>
            )}
            {data.gender === 'female' && !data.isWomenOnly && (
              <View style={[styles.pill, { backgroundColor: '#EDE9FE' }]}>
                <Text style={[styles.pillText, { color: '#7C3AED' }]}>♀</Text>
              </View>
            )}
          </View>
          <TrustBadge score={data.trustScore} accent={c.accent} accentMuted={c.accentMuted} />
          <VehicleTag vehicleMake={data.vehicleMake} vehicleModel={data.vehicleModel} vehicleType={data.vehicleType} />
        </View>

        {/* Fare */}
        <View style={styles.fareWrap}>
          <Text style={[styles.fareAmount, { color: c.text }]}>₹{data.fareShare}</Text>
          <Text style={[styles.fareLabel, { color: c.textMuted }]}>per seat</Text>
        </View>
      </View>

      {/* Route */}
      <View style={[styles.routeBox, { backgroundColor: c.inputBg, borderColor: c.border }]}>
        <View style={styles.routeRow}>
          <Text style={styles.dot}>🟢</Text>
          <Text style={[styles.routeText, { color: c.text }]} numberOfLines={1}>{data.pickupLabel}</Text>
          {data.walkDistanceM !== undefined && (
            <Text style={[styles.walkLabel, { color: c.textMuted }]}>~{Math.round(data.walkDistanceM)}m walk</Text>
          )}
        </View>
        <View style={[styles.connector, { backgroundColor: c.border }]} />
        <View style={styles.routeRow}>
          <Text style={styles.dot}>🔴</Text>
          <Text style={[styles.routeText, { color: c.text }]} numberOfLines={1}>{data.dropoffLabel}</Text>
        </View>
      </View>

      {/* Meta chips */}
      <View style={styles.chips}>
        <Chip label={`🕐 ${data.departureTime}`} color={c.textSecondary} bg={c.inputBg} border={c.border} />
        <Chip label={`💺 ${data.seatsAvailable} seat${data.seatsAvailable !== 1 ? 's' : ''}`} color={c.textSecondary} bg={c.inputBg} border={c.border} />
        {data.detourKm !== undefined && (
          <Chip label={`↪ ${data.detourKm.toFixed(1)} km detour`} color={c.textSecondary} bg={c.inputBg} border={c.border} />
        )}
        {data.communityName && (
          <Chip label={`🏫 ${data.communityName}`} color={c.accent} bg={c.accentMuted} border="transparent" />
        )}
      </View>

      {/* "Why this match" chips */}
      {data.whyChips && data.whyChips.length > 0 && (
        <View style={styles.whyRow}>
          <Text style={[styles.whyLabel, { color: c.textMuted }]}>Why this match: </Text>
          {data.whyChips.map((chip) => (
            <Text key={chip} style={[styles.whyChip, { color: c.accent }]}>{chip}</Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function Chip({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    gap: 12,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  info: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 16, fontWeight: '700' },
  pill: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '600' },
  fareWrap: { alignItems: 'flex-end' },
  fareAmount: { fontSize: 20, fontWeight: '800' },
  fareLabel: { fontSize: 11 },
  routeBox: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 4 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { fontSize: 10 },
  routeText: { flex: 1, fontSize: 13, fontWeight: '500' },
  walkLabel: { fontSize: 11 },
  connector: { width: 2, height: 8, marginLeft: 11, borderRadius: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '500' },
  whyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  whyLabel: { fontSize: 12 },
  whyChip: { fontSize: 12, fontWeight: '600' },
});
