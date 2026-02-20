import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { TabParamList } from '../navigation/AppNavigator';

// Using any here because we navigate both to tab screens and parent stack screens
type Nav = BottomTabNavigationProp<TabParamList, 'Home'> & { navigate: (screen: string) => void };

interface Stats {
  totalCleanups: number;
  activeVolunteers: number;
  areasRestored: number;
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState<Stats>({ totalCleanups: 0, activeVolunteers: 0, areasRestored: 0 });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const [cleanups, volunteers, areas] = await Promise.all([
      supabase.from('cleanup_reports').select('id', { count: 'exact', head: true }).eq('verified', true),
      supabase.from('users').select('id', { count: 'exact', head: true }).gt('cleanups_done', 0),
      supabase.from('locations').select('id', { count: 'exact', head: true }).eq('status', 'clean'),
    ]);
    setStats({
      totalCleanups: cleanups.count ?? 0,
      activeVolunteers: volunteers.count ?? 0,
      areasRestored: areas.count ?? 0,
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {profile?.name ?? 'Volunteer'}</Text>
          <Text style={styles.sub}>Every cleanup counts</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Notifications')}
          style={styles.notifBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      {/* Points card */}
      <View style={styles.pointsCard}>
        <View style={styles.pointsLeft}>
          <Text style={styles.pointsLabel}>Your Points</Text>
          <Text style={styles.pointsValue}>{profile?.total_points ?? 0}</Text>
          <Text style={styles.cleanupCount}>{profile?.cleanups_done ?? 0} cleanups completed</Text>
        </View>
        <View style={styles.pointsIconWrap}>
          <Ionicons name="star" size={40} color="rgba(255,255,255,0.3)" />
        </View>
      </View>

      {/* Platform stats */}
      <Text style={styles.sectionTitle}>Platform Impact</Text>
      <View style={styles.statsRow}>
        <StatCard icon="leaf-outline" value={stats.totalCleanups} label="Cleanups" color="#16a34a" bg="#f0fdf4" />
        <StatCard icon="people-outline" value={stats.activeVolunteers} label="Volunteers" color="#2563eb" bg="#eff6ff" />
        <StatCard icon="location-outline" value={stats.areasRestored} label="Clean Areas" color="#d97706" bg="#fffbeb" />
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Actions</Text>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => navigation.navigate('Submit')}
        activeOpacity={0.8}
      >
        <View style={styles.actionIconWrap}>
          <Ionicons name="camera-outline" size={22} color="#16a34a" />
        </View>
        <View style={styles.actionTextWrap}>
          <Text style={styles.actionTitle}>Start a Cleanup</Text>
          <Text style={styles.actionSub}>Document before & after</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => navigation.navigate('Map')}
        activeOpacity={0.8}
      >
        <View style={[styles.actionIconWrap, { backgroundColor: '#eff6ff' }]}>
          <Ionicons name="map-outline" size={22} color="#2563eb" />
        </View>
        <View style={styles.actionTextWrap}>
          <Text style={styles.actionTitle}>View Map</Text>
          <Text style={styles.actionSub}>Report dirty locations nearby</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ icon, value, label, color, bg }: { icon: any; value: number; label: string; color: string; bg: string }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: '#0f172a', letterSpacing: -0.3 },
  sub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pointsCard: {
    backgroundColor: '#16a34a',
    borderRadius: 20,
    padding: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  pointsLeft: { flex: 1 },
  pointsLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 4 },
  pointsValue: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  cleanupCount: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },
  pointsIconWrap: { marginLeft: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  stat: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '500', textAlign: 'center' },
  actionBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 10,
    gap: 12,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTextWrap: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  actionSub: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
});
