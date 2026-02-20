import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { LocationRow, LocationStatus } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type LocationWithCount = LocationRow & { reportCount: number };

const STATUS_COLORS: Record<LocationStatus, string> = {
  dirty: '#ef4444',
  pending: '#f59e0b',
  clean: '#22c55e',
};

const STATUS_LABELS: Record<LocationStatus, string> = {
  dirty: 'Dirty',
  pending: 'Pending',
  clean: 'Clean',
};

export default function MapScreen() {
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<MapView>(null);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>({
    latitude: 13.0827,
    longitude: 80.2707,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  useEffect(() => {
    getLocation();
    fetchLocations();
  }, []);

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    });
  };

  const fetchLocations = async () => {
    setLoading(true);
    const [{ data: locs }, { data: reports }] = await Promise.all([
      supabase.from('locations').select('*'),
      supabase
        .from('dirty_reports')
        .select('location_id, user_id')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);
    if (locs) {
      // Count unique reporters per location in last 24h
      const countMap: Record<string, Set<string>> = {};
      (reports ?? []).forEach((r: any) => {
        if (!countMap[r.location_id]) countMap[r.location_id] = new Set();
        countMap[r.location_id].add(r.user_id);
      });
      setLocations(
        locs.map((l: any) => ({ ...l, reportCount: countMap[l.id]?.size ?? 0 })) as LocationWithCount[]
      );
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        region={region}
        showsUserLocation
        showsMyLocationButton
      >
        {locations.map((loc) => (
          <Marker
            key={loc.id}
            coordinate={{ latitude: loc.lat, longitude: loc.lng }}
            pinColor={STATUS_COLORS[loc.status]}
          >
            <Callout tooltip={false}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (loc.status === 'clean') {
                    navigation.navigate('Guardian', { locationId: loc.id });
                  } else if (loc.status === 'dirty') {
                    navigation.navigate('DirtyDetails', {
                      locationId: loc.id,
                      lat: loc.lat,
                      lng: loc.lng,
                    });
                  } else {
                    navigation.navigate('DirtyReport', {
                      locationId: loc.id,
                      lat: loc.lat,
                      lng: loc.lng,
                    });
                  }
                }}
              >
              <View style={styles.callout}>
                <View style={styles.calloutStatusRow}>
                  <View style={[styles.calloutDot, { backgroundColor: STATUS_COLORS[loc.status] }]} />
                  <Text style={styles.calloutStatus}>{STATUS_LABELS[loc.status]}</Text>
                  {(loc.status === 'dirty' || loc.status === 'pending') && (
                    <Text style={styles.calloutCount}>{loc.reportCount}/3</Text>
                  )}
                </View>
                <Text style={styles.calloutCoord}>
                  {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                </Text>
                {loc.last_cleaned_at && (
                  <Text style={styles.calloutSub}>
                    Last cleaned: {new Date(loc.last_cleaned_at).toLocaleDateString()}
                  </Text>
                )}
                <Text style={styles.calloutAction}>
                  {loc.status === 'clean'
                    ? 'Tap to subscribe as Guardian'
                    : loc.status === 'dirty'
                    ? `View ${loc.reportCount} report${loc.reportCount !== 1 ? 's' : ''} →`
                    : `${loc.reportCount}/3 confirmations — Tap to report`}
                </Text>
              </View>
              </TouchableOpacity>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Legend */}
      <View style={styles.legend}>
        {(['dirty', 'pending', 'clean'] as LocationStatus[]).map((s) => (
          <View key={s} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLORS[s] }]} />
            <Text style={styles.legendText}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
          </View>
        ))}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      )}

      <TouchableOpacity style={styles.refreshBtn} onPress={fetchLocations}>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>

      {/* Report current location as dirty */}
      <TouchableOpacity
        style={styles.reportBtn}
        onPress={async () => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Location required', 'Allow location access to report dirty areas.');
            return;
          }
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          const lat_grid = Math.round(lat * 5000) / 5000; // ~22m grid cells
          const lng_grid = Math.round(lng * 5000) / 5000;
          // Upsert location row (deduped by grid)
          const { data: existing } = await supabase
            .from('locations')
            .select('id')
            .eq('lat_grid', lat_grid)
            .eq('lng_grid', lng_grid)
            .maybeSingle();
          let locationId: string;
          if (existing) {
            locationId = existing.id;
          } else {
            const { data: created, error } = await supabase
              .from('locations')
              .insert({ lat, lng, lat_grid, lng_grid, status: 'pending' })
              .select('id')
              .single();
            if (error || !created) {
              Alert.alert('Error', 'Could not create location.');
              return;
            }
            locationId = created.id;
          }
          navigation.navigate('DirtyReport', { locationId, lat, lng });
        }}
      >
        <Ionicons name="location" size={16} color="#fff" />
        <Text style={styles.reportBtnText}> Report Here as Dirty</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  legend: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#374151' },
  callout: { width: 190, padding: 8 },
  calloutStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  calloutDot: { width: 8, height: 8, borderRadius: 4 },
  calloutStatus: { fontWeight: '700', fontSize: 13 },
  calloutCount: { fontSize: 11, color: '#6b7280', backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  calloutCoord: { fontSize: 11, color: '#6b7280' },
  calloutSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  calloutAction: { fontSize: 11, color: '#16a34a', marginTop: 6, fontWeight: '600' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  refreshBtn: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    backgroundColor: '#16a34a',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  refreshText: { color: '#fff', fontWeight: '600' },
  reportBtn: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reportBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
