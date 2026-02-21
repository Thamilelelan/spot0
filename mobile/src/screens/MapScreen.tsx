import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, Region, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { LocationRow, LocationStatus, Drive, CleanupReport } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { haversineKm } from '../lib/haversine';
import { useTheme } from '../context/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type LocationWithMeta = LocationRow & {
  reportCount: number;
  guardianCount: number;
  inDrive: boolean;
  recentCleanup: boolean; // has a cleanup_report in the last 24h
};

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
  const { colors, isDark } = useTheme();
  const [locations, setLocations] = useState<LocationWithMeta[]>([]);
  const [activeDrives, setActiveDrives] = useState<Drive[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>({
    latitude: 13.0827,
    longitude: 80.2707,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // Refresh map data whenever this screen gains focus (e.g. returning from DirtyReport)
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, []),
  );

  useEffect(() => {
    getLocation();
  }, []);

  // Track region for Circle re-render (fixes drive zone disappearing on zoom)
  const [mapKey, setMapKey] = useState(0);

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

  const fetchAll = async () => {
    setLoading(true);
    const now = new Date().toISOString();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: locs }, { data: reports }, { data: guardians }, { data: drives }, { data: cleanups }] =
      await Promise.all([
        supabase.from('locations').select('*'),
        supabase.from('dirty_reports').select('location_id, user_id').gte('created_at', since),
        supabase.from('guardians').select('location_id, user_id'),
        supabase
          .from('drives')
          .select('*')
          .eq('status', 'active')
          .lte('start_time', now)
          .gte('end_time', now),
        supabase.from('cleanup_reports').select('location_id').gte('created_at', since),
      ]);

    const activeDriveList = (drives ?? []) as Drive[];
    setActiveDrives(activeDriveList);

    if (locs) {
      // Report count map (unique reporters per location)
      const reportMap: Record<string, Set<string>> = {};
      (reports ?? []).forEach((r: any) => {
        if (!reportMap[r.location_id]) reportMap[r.location_id] = new Set();
        reportMap[r.location_id].add(r.user_id);
      });

      // Guardian count map
      const guardianMap: Record<string, number> = {};
      (guardians ?? []).forEach((g: any) => {
        guardianMap[g.location_id] = (guardianMap[g.location_id] ?? 0) + 1;
      });

      // Recent cleanup set — locations with a cleanup_report in last 24h
      const recentCleanupSet = new Set<string>();
      (cleanups ?? []).forEach((c: any) => recentCleanupSet.add(c.location_id));

      // Only show: clean locations (always) + dirty/pending with recent reports
      const enriched = locs.map((l: any) => ({
        ...l,
        reportCount: reportMap[l.id]?.size ?? 0,
        guardianCount: guardianMap[l.id] ?? 0,
        recentCleanup: recentCleanupSet.has(l.id),
        inDrive: activeDriveList.some(
          (d) => haversineKm(l.lat, l.lng, d.lat, d.lng) <= d.radius_km,
        ),
      })) as LocationWithMeta[];

      // Show: clean (always) + dirty (confirmed, always) + pending (only if recent reports)
      setLocations(
        enriched.filter(
          (l) => l.status === 'clean' || l.status === 'dirty' || l.reportCount > 0,
        ),
      );
    }
    setLoading(false);
  };

  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        region={region}
        showsUserLocation
        showsMyLocationButton
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        onRegionChangeComplete={() => setMapKey((k) => k + 1)}
      >
        {/* Drive zone circles — key includes mapKey so they re-render on zoom */}
        {activeDrives.map((drive) => (
          <Circle
            key={`${drive.id}-${mapKey}`}
            center={{ latitude: drive.lat, longitude: drive.lng }}
            radius={drive.radius_km * 1000}
            fillColor={drive.badge_color + '28'}
            strokeColor={drive.badge_color + 'cc'}
            strokeWidth={2.5}
            zIndex={1}
          />
        ))}

        {/* Location markers — custom views with single-tap navigation */}
        {locations.map((loc) => {
          // Determine effective display color:
          // - clean location with recent cleanup → stays clean (green) with sparkle
          // - clean location with dirty reports but NO recent cleanup → show as pending (yellow)
          // - pending with ≥3 reports → show as dirty (red) even before server syncs
          let effectiveStatus: LocationStatus = loc.status;
          if (loc.status === 'clean' && loc.reportCount > 0 && !loc.recentCleanup) {
            // Old dirty reports exist and nobody has cleaned yet
            effectiveStatus = 'pending';
          } else if (loc.status === 'pending' && loc.reportCount >= 3) {
            effectiveStatus = 'dirty';
          }
          const markerColor = loc.recentCleanup && loc.status === 'clean'
            ? '#3b82f6' // blue for recently cleaned
            : STATUS_COLORS[effectiveStatus];
          const showCount = effectiveStatus === 'dirty' || effectiveStatus === 'pending';

          return (
            <Marker
              key={loc.id}
              coordinate={{ latitude: loc.lat, longitude: loc.lng }}
              tracksViewChanges={Platform.OS !== 'ios'}
              onPress={() => {
                // Recently cleaned → show before/after cleanup report
                if (loc.recentCleanup && loc.status === 'clean') {
                  navigation.navigate('CleanedReport', {
                    locationId: loc.id,
                    lat: loc.lat,
                    lng: loc.lng,
                  });
                // If location has dirty reports, go to DirtyDetails
                } else if (loc.reportCount > 0 || loc.status === 'dirty' || loc.status === 'pending') {
                  navigation.navigate('DirtyDetails', {
                    locationId: loc.id,
                    lat: loc.lat,
                    lng: loc.lng,
                  });
                } else {
                  navigation.navigate('Guardian', { locationId: loc.id });
                }
              }}
            >
              {/* Compact pin marker */}
              <View style={styles.markerWrap}>
                <View style={[styles.markerPin, { backgroundColor: markerColor }]}>
                  {loc.recentCleanup && loc.status === 'clean' ? (
                    <Ionicons name="sparkles" size={14} color="#fff" />
                  ) : showCount ? (
                    <Text style={styles.markerCount}>
                      {Math.min(loc.reportCount, 3)}/3
                    </Text>
                  ) : loc.status === 'clean' ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <Ionicons name="alert" size={14} color="#fff" />
                  )}
                </View>
                {loc.inDrive && (
                  <View style={styles.markerDriveDot} />
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Active drive banner — positioned at top-left */}
      {activeDrives.length > 0 && (
        <TouchableOpacity
          style={[styles.driveBanner, { borderLeftColor: activeDrives[0].badge_color }]}
          onPress={() => navigation.navigate('DriveDetails', { driveId: activeDrives[0].id })}
        >
          <Text style={styles.driveBannerIcon}>{activeDrives[0].badge_icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.driveBannerTitle}>{activeDrives[0].title}</Text>
            <Text style={styles.driveBannerSub}>
              {activeDrives.length > 1 ? `+${activeDrives.length - 1} more drives` : '2× points in the zone • Tap for details'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Legend — below the banner */}
      <View style={[styles.legend, activeDrives.length > 0 ? styles.legendWithBanner : null]}>
        {(['dirty', 'pending', 'clean'] as LocationStatus[]).map((s) => (
          <View key={s} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLORS[s] }]} />
            <Text style={styles.legendText}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
          </View>
        ))}
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: '#3b82f6' }]} />
          <Text style={styles.legendText}>Recently Cleaned</Text>
        </View>
        {activeDrives.length > 0 && (
          <View style={styles.legendRow}>
            <View style={[styles.driveCircleIcon, { borderColor: activeDrives[0].badge_color }]} />
            <Text style={styles.legendText}>Drive Zone</Text>
          </View>
        )}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      )}

      {/* My Location button */}
      <TouchableOpacity
        style={styles.myLocationBtn}
        onPress={async () => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const newRegion = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          };
          mapRef.current?.animateToRegion(newRegion, 600);
        }}
      >
        <Ionicons name="locate" size={22} color="#16a34a" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.refreshBtn} onPress={fetchAll}>
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
          // Round to 4 decimal places (~11 m grid) matching the DB unique index
          const lat_grid = Math.round(lat * 10000) / 10000;
          const lng_grid = Math.round(lng * 10000) / 10000;
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

const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    map: { flex: 1 },
    /* ── Custom marker ─────────────────────────────────────────────── */
    markerWrap: {
      alignItems: 'center',
      width: 36,
      height: 36,
    },
    markerPin: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2.5,
      borderColor: '#fff',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 4,
    },
    markerCount: { color: '#fff', fontWeight: '800', fontSize: 11 },
    markerDriveDot: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#eab308',
      borderWidth: 2,
      borderColor: '#fff',
    },
    /* ── Legend ────────────────────────────────────────────────────── */
    legend: {
      position: 'absolute',
      top: 12,
      right: 12,
      backgroundColor: colors.card + 'ee',
      borderRadius: 10,
      padding: 10,
      gap: 6,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 4,
    },    legendWithBanner: {
      top: 70,
    },    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    driveCircleIcon: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      backgroundColor: 'transparent',
    },
    legendText: { fontSize: 12, color: colors.text },
    /* ── Drive banner ─────────────────────────────────────────────── */
    driveBanner: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      backgroundColor: colors.card + 'f0',
      borderRadius: 10,
      borderLeftWidth: 4,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 5,
      zIndex: 10,
    },
    driveBannerIcon: { fontSize: 22 },
    driveBannerTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
    driveBannerSub: { fontSize: 11, color: colors.textSub },
    /* ── Overlay / buttons ────────────────────────────────────────── */
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
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    },
    refreshText: { color: '#fff', fontWeight: '600' },
    myLocationBtn: {
      position: 'absolute',
      bottom: 70,
      right: 16,
      backgroundColor: '#fff',
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
      borderWidth: 1,
      borderColor: '#e2e8f0',
    },
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
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    },
    reportBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  });
