// ─────────────────────────────────────────────────────────────
// Post-Trip screen — "Offer a ride" form
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, Modal,
  TouchableOpacity, Switch, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useTripsStore } from '@/store/tripsStore';
import { AppButton } from '@/components/AppButton';
import { PlaceSearch } from '@/components/PlaceSearch';
import { tripsApi, GeoResult } from '@/services/api';
import type { CreateTripPayload } from '@/services/api';

interface VehicleOption {
  id: string;
  label: string;
}

export default function PostTripScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const { prependTrip } = useTripsStore();
  const c = theme.colors;

  const [origin, setOrigin] = useState<GeoResult | null>(null);
  const [destination, setDestination] = useState<GeoResult | null>(null);
  const [departAt, setDepartAt] = useState<Date>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState<'date' | 'time' | null>(null);
  // Temp values while picker is open
  const [tmpDate, setTmpDate] = useState(new Date());
  const [seats, setSeats] = useState('1');
  const [fareSet, setFareSet] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Load user vehicles
  useEffect(() => {
    (async () => {
      try {
        const myVehicles = await fetch(
          `${require('@/constants/env').env.API_URL}/users/me/vehicles`,
          {
            headers: { Authorization: `Bearer ${require('@/store/authStore').useAuthStore.getState().accessToken}` },
          },
        ).then((r) => r.json()) as {
          success: boolean;
          data: Array<{ id: string; make: string; model: string; plate_number: string }>;
        };

        if (myVehicles.success && myVehicles.data.length > 0) {
          // Server JOIN already returns make & model
          const opts = myVehicles.data.map((v) => ({
            id: v.id,
            label: `${v.make} ${v.model} · ${v.plate_number}`,
          }));
          setVehicles(opts);
          if (opts[0]) setVehicleId(opts[0].id);
        }
      } catch {
        // silent
      }
    })();
  }, []);

  const openDatePicker = () => { setTmpDate(new Date(departAt)); setShowPicker('date'); };
  const openTimePicker = () => { setTmpDate(new Date(departAt)); setShowPicker('time'); };

  const adjustDate = (days: number) => {
    setTmpDate((d) => { const n = new Date(d); n.setDate(n.getDate() + days); return n; });
  };
  const adjustHour = (h: number) => {
    setTmpDate((d) => { const n = new Date(d); n.setHours((n.getHours() + h + 24) % 24); return n; });
  };
  const adjustMinute = (m: number) => {
    setTmpDate((d) => { const n = new Date(d); n.setMinutes((n.getMinutes() + m + 60) % 60); return n; });
  };
  const confirmPicker = () => { setDepartAt(new Date(tmpDate)); setShowPicker(null); };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const handlePost = async () => {
    if (!origin || !destination) {
      Alert.alert('Missing location', 'Please select both pickup and destination.');
      return;
    }
    if (departAt <= new Date()) {
      Alert.alert('Invalid time', 'Departure must be in the future.');
      return;
    }
    if (!vehicleId) {
      Alert.alert('No vehicle', 'Please add a vehicle first in Account → My Vehicles.');
      return;
    }
    const fareNum = parseFloat(fareSet);
    if (isNaN(fareNum) || fareNum <= 0) {
      Alert.alert('Invalid fare', 'Please enter a valid trip cost.');
      return;
    }

    setLoading(true);
    try {
      const payload: CreateTripPayload = {
        origin_label: origin.label,
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        dest_label: destination.label,
        dest_lat: destination.lat,
        dest_lng: destination.lng,
        depart_at: departAt.toISOString(),
        seats_total: parseInt(seats, 10) || 1,
        fare_set: fareNum,
        vehicle_id: vehicleId,
        is_recurring: isRecurring,
        rrule: isRecurring ? 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' : undefined,
        notes: notes.trim() || undefined,
      };

      const trip = await tripsApi.create(payload);
      prependTrip(trip);
      Alert.alert(
        'Trip posted! 🎉',
        `Route: ${origin.label} → ${destination.label}\nFare cap: ₹${trip.fare_estimate.cap.toFixed(0)}/trip`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ text: 'View my trips', onPress: () => router.push('/my-trips' as any) }],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post trip';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={[styles.back, { color: c.accent }]}>← Back</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: c.text }]}>Offer a ride</Text>
            <View style={{ width: 50 }} />
          </View>

          <Text style={[styles.disclaimer, { color: c.textSecondary, backgroundColor: c.accentMuted }]}>
            ⚖️ You can only charge up to the real fuel cost. No profit allowed.
          </Text>

          {/* Route */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.text }]}>Route</Text>
            <View style={{ gap: 8, zIndex: 20 }}>
              <PlaceSearch
                label="Pickup point"
                value={origin?.label ?? ''}
                onSelect={setOrigin}
                dotColor="🟢"
              />
              <View style={[styles.routeConnector, { backgroundColor: c.border }]} />
              <PlaceSearch
                label="Destination"
                value={destination?.label ?? ''}
                onSelect={setDestination}
                dotColor="🔴"
              />
            </View>
          </View>

          {/* Date & Time */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.text }]}>Departure</Text>
            <View style={styles.row}>
              {/* Date picker */}
              <TouchableOpacity
                style={[styles.pickerBtn, { backgroundColor: c.inputBg, borderColor: c.border, flex: 1 }]}
                onPress={openDatePicker}
              >
                <Text style={[styles.inputLabel, { color: c.textMuted }]}>📅 Date</Text>
                <Text style={[styles.pickerValue, { color: c.text }]}>{formatDate(departAt)}</Text>
              </TouchableOpacity>
              {/* Time picker */}
              <TouchableOpacity
                style={[styles.pickerBtn, { backgroundColor: c.inputBg, borderColor: c.border, flex: 1 }]}
                onPress={openTimePicker}
              >
                <Text style={[styles.inputLabel, { color: c.textMuted }]}>🕐 Time</Text>
                <Text style={[styles.pickerValue, { color: c.text }]}>{formatTime(departAt)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Seats & Fare */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.text }]}>Seats & Fare</Text>
            <View style={styles.row}>
              <View style={[styles.inputBox, { backgroundColor: c.inputBg, borderColor: c.border, flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: c.textMuted }]}>Seats available</Text>
                <TextInput
                  style={[styles.textInput, { color: c.text }]}
                  value={seats}
                  onChangeText={setSeats}
                  keyboardType="numeric"
                  placeholder="1–6"
                  placeholderTextColor={c.textMuted}
                />
              </View>
              <View style={[styles.inputBox, { backgroundColor: c.inputBg, borderColor: c.border, flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: c.textMuted }]}>Total trip cost (₹)</Text>
                <TextInput
                  style={[styles.textInput, { color: c.text }]}
                  value={fareSet}
                  onChangeText={setFareSet}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 80"
                  placeholderTextColor={c.textMuted}
                />
              </View>
            </View>
            <Text style={[styles.hint, { color: c.textMuted }]}>
              Each passenger pays ₹{fareSet ? (parseFloat(fareSet) / (parseInt(seats, 10) + 1 || 2)).toFixed(0) : '?'}
            </Text>
          </View>

          {/* Vehicle */}
          {vehicles.length > 0 && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.text }]}>Vehicle</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {vehicles.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vehicleChip,
                      {
                        backgroundColor: vehicleId === v.id ? c.accent : c.inputBg,
                        borderColor: vehicleId === v.id ? c.accent : c.border,
                      },
                    ]}
                    onPress={() => setVehicleId(v.id)}
                  >
                    <Text style={[styles.vehicleChipText, { color: vehicleId === v.id ? '#fff' : c.text }]}>
                      🚗 {v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {vehicles.length === 0 && (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.warning }]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push('/my-vehicles' as any)}
            >
              <Text style={[styles.noVehicleText, { color: c.warning }]}>
                ⚠️ No vehicles found. Add one in Account → My Vehicles.
              </Text>
            </TouchableOpacity>
          )}

          {/* Recurring toggle */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.toggleRow}>
              <View>
                <Text style={[styles.toggleLabel, { color: c.text }]}>Recurring trip</Text>
                <Text style={[styles.hint, { color: c.textMuted, marginTop: 2 }]}>
                  Repeats Mon–Fri at the same time
                </Text>
              </View>
              <Switch
                value={isRecurring}
                onValueChange={setIsRecurring}
                trackColor={{ false: c.border, true: c.accent }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Notes */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.text }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.notesInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="No smoking, ladies only, AC available…"
              placeholderTextColor={c.textMuted}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>

          <AppButton
            label={loading ? 'Posting…' : 'Post trip 🚗'}
            onPress={handlePost}
            loading={loading}
            variant="primary"
            style={{ marginTop: 8, marginBottom: 40 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pure-JS Date / Time Picker Modal */}
      <Modal visible={!!showPicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: c.surface }]}>
            <Text style={[styles.pickerTitle, { color: c.text }]}>
              {showPicker === 'date' ? '📅 Pick date' : '🕐 Pick time'}
            </Text>

            {showPicker === 'date' && (
              <View style={styles.pickerRow}>
                <TouchableOpacity style={[styles.adjBtn, { borderColor: c.border }]} onPress={() => adjustDate(-1)}>
                  <Text style={[styles.adjText, { color: c.text }]}>‹ Prev</Text>
                </TouchableOpacity>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={[styles.pickerBig, { color: c.text }]}>
                    {tmpDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })}
                  </Text>
                  <Text style={[{ color: c.textSecondary, fontSize: 12 }]}>
                    {tmpDate.getFullYear()}
                  </Text>
                </View>
                <TouchableOpacity style={[styles.adjBtn, { borderColor: c.border }]} onPress={() => adjustDate(1)}>
                  <Text style={[styles.adjText, { color: c.text }]}>Next ›</Text>
                </TouchableOpacity>
              </View>
            )}

            {showPicker === 'time' && (
              <View style={styles.pickerRow}>
                {/* Hour */}
                <View style={styles.timeUnit}>
                  <TouchableOpacity style={[styles.adjCircle, { borderColor: c.accent }]} onPress={() => adjustHour(1)}>
                    <Text style={[styles.adjCircleText, { color: c.accent }]}>＋</Text>
                  </TouchableOpacity>
                  <Text style={[styles.pickerBig, { color: c.text }]}>
                    {String(tmpDate.getHours()).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity style={[styles.adjCircle, { borderColor: c.accent }]} onPress={() => adjustHour(-1)}>
                    <Text style={[styles.adjCircleText, { color: c.accent }]}>－</Text>
                  </TouchableOpacity>
                  <Text style={[styles.timeLabel, { color: c.textMuted }]}>Hour</Text>
                </View>
                <Text style={[styles.pickerBig, { color: c.text, alignSelf: 'center', marginBottom: 24 }]}>:</Text>
                {/* Minute */}
                <View style={styles.timeUnit}>
                  <TouchableOpacity style={[styles.adjCircle, { borderColor: c.accent }]} onPress={() => adjustMinute(5)}>
                    <Text style={[styles.adjCircleText, { color: c.accent }]}>＋</Text>
                  </TouchableOpacity>
                  <Text style={[styles.pickerBig, { color: c.text }]}>
                    {String(tmpDate.getMinutes()).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity style={[styles.adjCircle, { borderColor: c.accent }]} onPress={() => adjustMinute(-5)}>
                    <Text style={[styles.adjCircleText, { color: c.accent }]}>－</Text>
                  </TouchableOpacity>
                  <Text style={[styles.timeLabel, { color: c.textMuted }]}>Min (±5)</Text>
                </View>
              </View>
            )}

            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={[styles.pickerAction, { borderColor: c.border, borderWidth: 1 }]}
                onPress={() => setShowPicker(null)}
              >
                <Text style={[{ color: c.text, fontWeight: '600' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerAction, { backgroundColor: c.accent }]}
                onPress={confirmPicker}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Done ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700' },
  disclaimer: {
    fontSize: 12, borderRadius: 10, padding: 10, lineHeight: 18,
  },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '700' },
  routeConnector: { width: 2, height: 8, marginLeft: 18, borderRadius: 1 },
  row: { flexDirection: 'row', gap: 10 },
  pickerBtn: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 4 },
  pickerValue: { fontSize: 15, fontWeight: '600' },
  inputBox: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 4 },
  inputLabel: { fontSize: 11, fontWeight: '600' },
  textInput: { fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 12 },
  vehicleChip: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  vehicleChipText: { fontSize: 13, fontWeight: '600' },
  noVehicleText: { fontSize: 13, textAlign: 'center', fontWeight: '500' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  notesInput: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  // Picker modal
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 16,
  },
  pickerTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  pickerBig: { fontSize: 32, fontWeight: '700' },
  adjBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  adjText: { fontSize: 14, fontWeight: '600' },
  timeUnit: { alignItems: 'center', gap: 8, flex: 1 },
  adjCircle: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  adjCircleText: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  timeLabel: { fontSize: 11, fontWeight: '600' },
  pickerAction: {
    flex: 1, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
});
