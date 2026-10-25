// ─────────────────────────────────────────────────────────────
// PlaceSearch — debounced place search with landmark quick-picks
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { geocodingApi, GeoResult } from '@/services/api';

const DEBOUNCE_MS = 400;

const QUICK_PICKS = [
  'Hinjewadi IT Park',
  'Kothrud',
  'Viman Nagar',
  'Baner',
  'Hadapsar',
  'Pimpri',
  'Koregaon Park',
  'Magarpatta City',
  'Wakad',
  'Aundh',
];

interface Props {
  label: string;
  value: string;
  onSelect: (result: GeoResult) => void;
  dotColor?: string;
}

export function PlaceSearch({ label, value, onSelect, dotColor = '🟢' }: Props) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await geocodingApi.search(q);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), DEBOUNCE_MS) as ReturnType<typeof setTimeout>;
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  const handleSelect = (result: GeoResult) => {
    setQuery(result.label);
    setResults([]);
    setFocused(false);
    onSelect(result);
  };

  const showDropdown = focused && (results.length > 0 || loading);
  const showQuickPicks = focused && query.trim().length === 0;

  return (
    <View style={styles.wrapper}>
      {/* Input row */}
      <View style={[styles.inputRow, { backgroundColor: c.inputBg, borderColor: c.border }]}>
        <Text style={styles.dot}>{dotColor}</Text>
        <TextInput
          style={[styles.input, { color: c.text }]}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={label}
          placeholderTextColor={c.textMuted}
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={c.accent} style={{ marginRight: 8 }} />}
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
            <Text style={{ color: c.textMuted, paddingHorizontal: 8, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick picks (shown when input is focused but empty) */}
      {showQuickPicks && (
        <View style={[styles.dropdown, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.dropdownHeader, { color: c.textSecondary }]}>
            Popular in Pune
          </Text>
          {QUICK_PICKS.map((place) => (
            <TouchableOpacity
              key={place}
              style={[styles.resultRow, { borderBottomColor: c.border }]}
              onPress={() => handleSelect({ label: place, lat: 0, lng: 0, source: 'landmark' })}
            >
              <Text style={styles.resultIcon}>📍</Text>
              <Text style={[styles.resultLabel, { color: c.text }]}>{place}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search results dropdown */}
      {showDropdown && (
        <View style={[styles.dropdown, { backgroundColor: c.surface, borderColor: c.border }]}>
          <FlatList
            data={results}
            keyExtractor={(item) => `${item.lat},${item.lng}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.resultRow, { borderBottomColor: c.border }]}
                onPress={() => handleSelect(item)}
              >
                <Text style={styles.resultIcon}>
                  {item.source === 'landmark' ? '🏛️' : '📍'}
                </Text>
                <View style={styles.resultTextCol}>
                  <Text style={[styles.resultLabel, { color: c.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.source === 'landmark' && (
                    <Text style={[styles.resultSub, { color: c.textMuted }]}>Pune landmark</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', zIndex: 10 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, height: 48, gap: 10,
  },
  dot: { fontSize: 12 },
  input: { flex: 1, fontSize: 15 },
  dropdown: {
    position: 'absolute', top: 52, left: 0, right: 0,
    borderRadius: 12, borderWidth: 1,
    maxHeight: 250,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 8,
    overflow: 'hidden',
  },
  dropdownHeader: {
    fontSize: 11, fontWeight: '600', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  resultIcon: { fontSize: 16, width: 22 },
  resultTextCol: { flex: 1 },
  resultLabel: { fontSize: 14, fontWeight: '500' },
  resultSub: { fontSize: 11, marginTop: 1 },
});
