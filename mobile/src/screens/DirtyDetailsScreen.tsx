import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { DirtyReport } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteParams = { locationId: string; lat: number; lng: number };

export default function DirtyDetailsScreen() {
  const route = useRoute();
  const navigation = useNavigation<Nav>();
  const { locationId, lat, lng } = route.params as RouteParams;

  const [reports, setReports] = useState<DirtyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('dirty_reports')
      .select('*')
      .eq('location_id', locationId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (data) setReports(data as DirtyReport[]);
    setLoading(false);
  };

  const uniqueUsers = new Set(reports.map((r) => r.user_id)).size;
  const remaining = Math.max(0, 3 - uniqueUsers);
  const reached = uniqueUsers >= 3;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header badge */}
      <View style={styles.headerRow}>
        <View style={[styles.badge, reached ? styles.badgeDirty : styles.badgePending]}>
          <Ionicons name="people" size={14} color="#fff" />
          <Text style={styles.badgeText}>{uniqueUsers} / 3 reports</Text>
        </View>
        <Text style={styles.coord}>
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </Text>
      </View>

      {/* Status message */}
      {reached ? (
        <View style={[styles.infoBox, styles.infoBoxDirty]}>
          <Ionicons name="warning" size={18} color="#b91c1c" />
          <Text style={[styles.infoText, { color: '#7f1d1d' }]}>
            Consensus reached — this area is confirmed dirty.
          </Text>
        </View>
      ) : (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color="#b45309" />
          <Text style={styles.infoText}>
            {remaining} more independent{' '}
            {remaining === 1 ? 'report' : 'reports'} needed within 24h to confirm dirty.
          </Text>
        </View>
      )}

      {/* Photos */}
      {loading ? (
        <ActivityIndicator size="large" color="#ef4444" style={{ marginTop: 40 }} />
      ) : reports.length === 0 ? (
        <Text style={styles.empty}>No reports in the last 24 hours for this location.</Text>
      ) : (
        <View style={styles.grid}>
          {reports.map((r, i) => (
            <View key={r.id} style={styles.photoCard}>
              <Image source={{ uri: r.photo_url }} style={styles.photo} resizeMode="cover" />
              <View style={styles.photoMeta}>
                <Ionicons name="camera-outline" size={13} color="#94a3b8" />
                <Text style={styles.photoMetaText}>
                  Report {i + 1} · {new Date(r.created_at).toLocaleString()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Add report button */}
      <TouchableOpacity
        style={styles.reportBtn}
        onPress={() => navigation.navigate('DirtyReport', { locationId, lat, lng })}
      >
        <Ionicons name="warning-outline" size={16} color="#fff" />
        <Text style={styles.reportBtnText}>Add Your Report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 48 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  badgeDirty: { backgroundColor: '#ef4444' },
  badgePending: { backgroundColor: '#f59e0b' },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  coord: { fontSize: 12, color: '#94a3b8' },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  infoBoxDirty: { backgroundColor: '#fee2e2' },
  infoText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 },

  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 48,
    fontSize: 15,
    lineHeight: 22,
  },

  grid: { gap: 16 },
  photoCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  photo: { width: '100%', height: 230 },
  photoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  photoMetaText: { fontSize: 12, color: '#64748b' },

  reportBtn: {
    marginTop: 28,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  reportBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
