// ─────────────────────────────────────────────────────────────
// My Vehicles screen — list, add and remove rider vehicles
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, RefreshControl, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { catalogApi } from '@/services/api';
import { env } from '@/constants/env';

interface VehicleCatalog {
  id: string;
  make: string;
  model: string;
  type: string;
  fuel_type: string;
  arai_kmpl: number;
}

interface MyVehicle {
  id: string;
  catalog_id: string;
  nickname?: string;
  make?: string;
  model?: string;
  fuel_type?: string;
}

async function authedFetch(path: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${env.API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  return res.json();
}

export default function MyVehiclesScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [vehicles, setVehicles] = useState<MyVehicle[]>([]);
  const [catalog, setCatalog] = useState<VehicleCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [adding, setAdding] = useState(false);
  const [filterType, setFilterType] = useState('all');

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const [myRes, catRes] = await Promise.all([
        authedFetch('/users/me/vehicles'),
        catalogApi.vehicles(),
      ]);
      const cat = catRes as VehicleCatalog[];
      setCatalog(cat);
      if (myRes.success) {
        // Enrich with catalog data
        const enriched = (myRes.data as MyVehicle[]).map((v) => {
          const c = cat.find((c) => c.id === v.catalog_id);
          return { ...v, make: c?.make, model: c?.model, fuel_type: c?.fuel_type };
        });
        setVehicles(enriched);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const handleAdd = async () => {
    if (!selectedCatalogId) {
      Alert.alert('Select a vehicle', 'Pick a vehicle from the list.');
      return;
    }
    setAdding(true);
    try {
      const res = await authedFetch('/users/me/vehicles', {
        method: 'POST',
        body: JSON.stringify({ catalog_id: selectedCatalogId }),
      });
      if (res.success) {
        setAddModal(false);
        setSelectedCatalogId('');
        fetchVehicles();
      } else {
        Alert.alert('Error', res.error?.message ?? 'Failed to add vehicle');
      }
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = (id: string, label: string) => {
    Alert.alert(
      'Remove vehicle?',
      `Remove "${label}" from your vehicles?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await authedFetch(`/users/me/vehicles/${id}`, { method: 'DELETE' });
              setVehicles((v) => v.filter((x) => x.id !== id));
            } catch {
              Alert.alert('Error', 'Failed to remove vehicle');
            }
          },
        },
      ],
    );
  };

  const fuelIcon: Record<string, string> = {
    petrol: '⛽',
    diesel: '🛢️',
    electric: '⚡',
    cng: '🟢',
  };

  const types = ['all', ...Array.from(new Set(catalog.map((c) => c.type)))];
  const filteredCatalog = filterType === 'all'
    ? catalog
    : catalog.filter((c) => c.type === filterType);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: c.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>My Vehicles</Text>
        <TouchableOpacity onPress={() => setAddModal(true)}>
          <Text style={[styles.addBtn, { color: c.accent }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await fetchVehicles(); setRefreshing(false); }}
              tintColor={c.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🚗</Text>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No vehicles yet</Text>
              <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>
                Add your vehicle to start offering rides.
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: c.accent }]}
                onPress={() => setAddModal(true)}
              >
                <Text style={styles.emptyBtnText}>Add a vehicle</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.cardLeft}>
                <Text style={styles.fuelIcon}>
                  {fuelIcon[item.fuel_type ?? ''] ?? '🚗'}
                </Text>
                <View>
                  <Text style={[styles.vehicleName, { color: c.text }]}>
                    {item.make} {item.model}
                  </Text>
                  <Text style={[styles.vehicleMeta, { color: c.textSecondary }]}>
                    {item.fuel_type ? item.fuel_type.charAt(0).toUpperCase() + item.fuel_type.slice(1) : '—'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleRemove(item.id, `${item.make} ${item.model}`)}
                style={[styles.removeBtn, { borderColor: c.danger }]}
              >
                <Text style={[styles.removeText, { color: c.danger }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Add Vehicle Modal */}
      <Modal visible={addModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modal, { backgroundColor: c.background }]} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Add Vehicle</Text>
            <TouchableOpacity onPress={() => { setAddModal(false); setSelectedCatalogId(''); }}>
              <Text style={[styles.modalClose, { color: c.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Type filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {types.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.filterChip, { backgroundColor: filterType === t ? c.accent : c.surface, borderColor: filterType === t ? c.accent : c.border }]}
                onPress={() => setFilterType(t)}
              >
                <Text style={[styles.filterChipText, { color: filterType === t ? '#fff' : c.text }]}>
                  {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredCatalog}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 120 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.catalogItem,
                  {
                    backgroundColor: selectedCatalogId === item.id ? c.accentMuted : c.surface,
                    borderColor: selectedCatalogId === item.id ? c.accent : c.border,
                  },
                ]}
                onPress={() => setSelectedCatalogId(item.id)}
              >
                <Text style={styles.catalogIcon}>{fuelIcon[item.fuel_type] ?? '🚗'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catalogName, { color: c.text }]}>
                    {item.make} {item.model}
                  </Text>
                  <Text style={[styles.catalogMeta, { color: c.textSecondary }]}>
                    {item.fuel_type} · {item.arai_kmpl} km/l · {item.type}
                  </Text>
                </View>
                {selectedCatalogId === item.id && (
                  <Text style={{ color: c.accent, fontSize: 18 }}>✓</Text>
                )}
              </TouchableOpacity>
            )}
          />

          <View style={[styles.modalFooter, { backgroundColor: c.background, borderTopColor: c.border }]}>
            <TouchableOpacity
              style={[styles.addConfirmBtn, { backgroundColor: selectedCatalogId ? c.accent : c.border }]}
              onPress={handleAdd}
              disabled={adding || !selectedCatalogId}
            >
              {adding
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.addConfirmText}>Add this vehicle</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
  addBtn: { fontSize: 15, fontWeight: '700' },
  card: {
    borderRadius: 16, padding: 16, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fuelIcon: { fontSize: 28 },
  vehicleName: { fontSize: 15, fontWeight: '600' },
  vehicleMeta: { fontSize: 12, marginTop: 2 },
  removeBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  removeText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  emptyBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  // Modal
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalClose: { fontSize: 20, paddingHorizontal: 4 },
  filterRow: { maxHeight: 48, marginBottom: 8 },
  filterChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  catalogItem: {
    borderRadius: 12, borderWidth: 1, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  catalogIcon: { fontSize: 22 },
  catalogName: { fontSize: 14, fontWeight: '600' },
  catalogMeta: { fontSize: 12, marginTop: 2 },
  modalFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, borderTopWidth: 1,
  },
  addConfirmBtn: {
    height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  addConfirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
