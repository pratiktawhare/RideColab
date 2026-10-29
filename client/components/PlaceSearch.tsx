// ─────────────────────────────────────────────────────────────
// PlaceSearch — Professional, Uber-like top search overlay
// Pinned search bar at top + results above keyboard
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Modal, StatusBar, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useThemeStore } from '@/store/themeStore';
import { geocodingApi, GeoResult } from '@/services/api';

const DEBOUNCE_MS = 350;

interface PuneQuickPlace {
  name: string;
  sub: string;
  lat: number;
  lng: number;
}

const PUNE_POPULAR_PLACES: PuneQuickPlace[] = [
  { name: 'Hinjewadi IT Park', sub: 'Phase 1 / Rajiv Gandhi Infotech Park', lat: 18.5912, lng: 73.7386 },
  { name: 'Kothrud', sub: 'Chandani Chowk / MIT College area', lat: 18.5074, lng: 73.8077 },
  { name: 'Viman Nagar', sub: 'Phoenix Marketcity / Symbiosis area', lat: 18.5679, lng: 73.9143 },
  { name: 'Baner', sub: 'Balewadi High Street / Pan Card Club Rd', lat: 18.5590, lng: 73.7868 },
  { name: 'Magarpatta City', sub: 'Cybercity / Tower 1–12, Hadapsar', lat: 18.5134, lng: 73.9315 },
  { name: 'Shivajinagar Station', sub: 'Modern College / FC Road / JM Road', lat: 18.5308, lng: 73.8474 },
  { name: 'Pune Railway Station', sub: 'Station Road / Sangamwadi', lat: 18.5284, lng: 73.8744 },
  { name: 'Pune Airport (PNQ)', sub: 'Lohegaon Terminal', lat: 18.5822, lng: 73.9197 },
  { name: 'Wakad', sub: 'Bhumkar Chowk / Datta Mandir', lat: 18.5987, lng: 73.7634 },
  { name: 'Aundh', sub: 'Parihar Chowk / Westend Mall', lat: 18.5580, lng: 73.8072 },
  { name: 'Koregaon Park', sub: 'North Main Road / Osho Ashram', lat: 18.5362, lng: 73.8940 },
  { name: 'Swargate', sub: 'Bus Stand / Jedhe Chowk / Sarasbaug', lat: 18.5018, lng: 73.8576 },
];

interface Props {
  label: string;
  value: string;
  onSelect: (result: GeoResult) => void;
  dotColor?: string;
}

export function PlaceSearch({ label, value, onSelect, dotColor = '🟢' }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { theme } = useThemeStore() as any;
  const c = theme.colors as Record<string, string>;

  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync external value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await geocodingApi.search(q);
      // Deduplicate results
      const seen = new Set<string>();
      const unique = res.filter((item) => {
        const k = `${item.label.toLowerCase()}|${item.lat.toFixed(4)}|${item.lng.toFixed(4)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setResults(unique);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), DEBOUNCE_MS);
  };

  const handleSelect = (result: GeoResult) => {
    setQuery(result.label);
    setResults([]);
    setModalVisible(false);
    Keyboard.dismiss();
    onSelect(result);
  };

  // One-tap current location feature
  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Location permission is required to detect your location.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Try reverse geocoding via landmarks first or fallback label
      const res: GeoResult = {
        label: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        lat,
        lng,
        source: 'landmark',
      };
      handleSelect(res);
    } catch {
      alert('Could not determine current location. Please select from the list.');
    } finally {
      setLocating(false);
    }
  };

  const openModal = () => {
    setModalVisible(true);
    if (query.trim().length >= 2) {
      search(query);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.wrapper}>
      {/* ── Outer Trigger Field (in the parent card) ── */}
      <TouchableOpacity
        style={[styles.inputRow, { backgroundColor: c.inputBg, borderColor: c.border }]}
        onPress={openModal}
        activeOpacity={0.8}
        accessibilityLabel={label}
      >
        <Text style={styles.dot}>{dotColor}</Text>
        <Text
          style={[styles.triggerText, { color: value ? c.text : c.textMuted }]}
          numberOfLines={1}
        >
          {value || label}
        </Text>
        {value ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              setQuery('');
              onSelect({ label: '', lat: 0, lng: 0, source: 'landmark' });
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: c.textMuted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: c.textMuted, fontSize: 14 }}>🔍</Text>
        )}
      </TouchableOpacity>

      {/* ── Uber-style Full-Screen Search Modal ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <SafeAreaView style={[styles.modalRoot, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />

          {/* ── Top Pinned Search Bar ── */}
          <View style={[styles.topHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
            <View style={styles.searchRow}>
              {/* Back button */}
              <TouchableOpacity
                style={styles.backBtn}
                onPress={closeModal}
                accessibilityLabel="Go back"
              >
                <Text style={[styles.backIcon, { color: c.text }]}>←</Text>
              </TouchableOpacity>

              {/* Active Search Input */}
              <View style={[styles.modalInputBox, { backgroundColor: c.inputBg, borderColor: c.border }]}>
                <Text style={styles.dot}>{dotColor}</Text>
                <TextInput
                  style={[styles.modalInput, { color: c.text }]}
                  value={query}
                  onChangeText={handleQueryChange}
                  placeholder={label}
                  placeholderTextColor={c.textMuted}
                  autoFocus
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {loading && <ActivityIndicator size="small" color={c.accent} style={{ marginRight: 6 }} />}
                {query.length > 0 && !loading && (
                  <TouchableOpacity
                    onPress={() => {
                      setQuery('');
                      setResults([]);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.clearBtn, { color: c.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* ── Results List Pinned Directly Below Search Bar & Above Keyboard ── */}
          <ScrollView
            style={styles.resultsScroll}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Quick Current Location Button */}
            <TouchableOpacity
              style={[styles.currentLocationRow, { backgroundColor: c.surface, borderColor: c.border }]}
              onPress={handleUseCurrentLocation}
              disabled={locating}
            >
              <View style={[styles.iconCircle, { backgroundColor: c.accentMuted }]}>
                {locating ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <Text style={styles.currentLocIcon}>🎯</Text>
                )}
              </View>
              <View style={styles.itemTextCol}>
                <Text style={[styles.itemTitle, { color: c.accent }]}>
                  {locating ? 'Detecting your GPS location…' : 'Use Current Location'}
                </Text>
                <Text style={[styles.itemSubtitle, { color: c.textMuted }]}>
                  Instantly set your exact pickup spot
                </Text>
              </View>
            </TouchableOpacity>

            {/* 2. Live Search Results (when typing) */}
            {results.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionHeading, { color: c.textSecondary }]}>Search Results</Text>
                {results.map((item, idx) => (
                  <TouchableOpacity
                    key={`${item.lat},${item.lng}-${item.label}-${idx}`}
                    style={[styles.resultItem, { backgroundColor: c.surface, borderColor: c.border }]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: item.source === 'landmark' ? c.accentMuted : c.inputBg }]}>
                      <Text style={styles.resultIcon}>{item.source === 'landmark' ? '🏛️' : '📍'}</Text>
                    </View>
                    <View style={styles.itemTextCol}>
                      <Text style={[styles.itemTitle, { color: c.text }]} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Text style={[styles.itemSubtitle, { color: c.textMuted }]}>
                        {item.source === 'landmark' ? '⭐ Pune Verified Landmark' : 'Pune, Maharashtra'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* 3. Empty Search Feedback */}
            {query.trim().length >= 2 && !loading && results.length === 0 && (
              <View style={[styles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={{ fontSize: 32 }}>🔍</Text>
                <Text style={[styles.emptyTitle, { color: c.text }]}>No places found</Text>
                <Text style={[styles.emptySubtitle, { color: c.textMuted }]}>
                  Try typing a major Pune landmark like "Hinjewadi", "Kothrud", or "Viman Nagar"
                </Text>
              </View>
            )}

            {/* 4. Popular Places in Pune (shown when query is short/empty) */}
            {results.length === 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionHeading, { color: c.textSecondary }]}>Popular Locations in Pune</Text>
                {PUNE_POPULAR_PLACES.map((place, idx) => (
                  <TouchableOpacity
                    key={`${place.name}-${idx}`}
                    style={[styles.resultItem, { backgroundColor: c.surface, borderColor: c.border }]}
                    onPress={() =>
                      handleSelect({
                        label: `${place.name}, Pune`,
                        lat: place.lat,
                        lng: place.lng,
                        source: 'landmark',
                      })
                    }
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: c.inputBg }]}>
                      <Text style={styles.resultIcon}>📍</Text>
                    </View>
                    <View style={styles.itemTextCol}>
                      <Text style={[styles.itemTitle, { color: c.text }]}>{place.name}</Text>
                      <Text style={[styles.itemSubtitle, { color: c.textMuted }]} numberOfLines={1}>
                        {place.sub}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },

  // Trigger row on the form
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, height: 50, gap: 10,
  },
  dot: { fontSize: 13 },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '500' },

  // Full screen Modal
  modalRoot: { flex: 1 },
  topHeader: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 4,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 24, fontWeight: '700' },

  modalInputBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, height: 48, gap: 8,
  },
  modalInput: { flex: 1, fontSize: 16, fontWeight: '500', height: 48 },
  clearBtn: { fontSize: 16, paddingHorizontal: 4 },

  resultsScroll: { flex: 1 },
  resultsContent: { padding: 16, gap: 14, paddingBottom: 60 },

  // Current location button
  currentLocationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  currentLocIcon: { fontSize: 18 },

  section: { gap: 8 },
  sectionHeading: {
    fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginLeft: 4, marginBottom: 2,
  },

  resultItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 12, borderWidth: 1,
  },
  iconCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  resultIcon: { fontSize: 16 },
  itemTextCol: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600' },
  itemSubtitle: { fontSize: 12, marginTop: 2 },

  emptyBox: {
    borderRadius: 16, padding: 24, borderWidth: 1,
    alignItems: 'center', gap: 8, marginVertical: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
