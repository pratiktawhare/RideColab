import { create } from 'zustand';
import type { GeoResult, Trip } from '@/services/api';

// ─────────────────────────────────────────────────────────────
// Trips store — search state + posted trip cache
// ─────────────────────────────────────────────────────────────

export interface SearchState {
  origin: GeoResult | null;
  destination: GeoResult | null;
}

interface TripsStore {
  search: SearchState;
  myTrips: Trip[];
  setOrigin: (origin: GeoResult | null) => void;
  setDestination: (dest: GeoResult | null) => void;
  clearSearch: () => void;
  setMyTrips: (trips: Trip[]) => void;
  prependTrip: (trip: Trip) => void;
  removeTrip: (id: string) => void;
}

export const useTripsStore = create<TripsStore>((set) => ({
  search: { origin: null, destination: null },
  myTrips: [],

  setOrigin: (origin) =>
    set((s) => ({ search: { ...s.search, origin } })),

  setDestination: (destination) =>
    set((s) => ({ search: { ...s.search, destination } })),

  clearSearch: () =>
    set({ search: { origin: null, destination: null } }),

  setMyTrips: (trips) => set({ myTrips: trips }),

  prependTrip: (trip) =>
    set((s) => ({ myTrips: [trip, ...s.myTrips] })),

  removeTrip: (id) =>
    set((s) => ({ myTrips: s.myTrips.filter((t) => t.id !== id) })),
}));
