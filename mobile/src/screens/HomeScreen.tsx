import React, { useEffect, useMemo, useState } from 'react';
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
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { TabParamList } from '../navigation/AppNavigator';
import { Drive } from '../types';

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
  const { colors, isDark } = useTheme();
  const [stats, setStats] = useState<Stats>({ totalCleanups: 0, activeVolunteers: 0, areasRestored: 0 });
  const [activeDrives, setActiveDrives] = useState<Drive[]>([]);

  const s = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const now = new Date().toISOString();
    const [cleanups, volunteers, areas, drives] = await Promise.all([
      supabase.from('cleanup_reports').select('id', { count: 'exact', head: true }).eq('verified', true),
      supabase.from('users').select('id', { count: 'exact', head: true }).gt('cleanups_done', 0),
      supabase.from('locations').select('id', { count: 'exact', head: true }).eq('status', 'clean'),
      supabase.from('drives').select('*').eq('status', 'active').lte('start_time', now).gte('end_time', now),
    ]);
    setStats({
      totalCleanups: cleanups.count ?? 0,
      activeVolunteers: volunteers.count ?? 0,
      areasRestored: areas.count ?? 0,
    });
    setActiveDrives((drives.data ?? []) as Drive[]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={[s.greeting, { color: colors.text }]}>Hello, {profile?.name ?? 'Volunteer'}</Text>
          <Text style={[s.sub, { color: colors.textSub }]}>Zero dirt. Full credit.</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Notifications')}
          style={[s.notifBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Active drive banner */}
      {activeDrives.length > 0 && (
        <TouchableOpacity
          style={[s.driveBanner, { borderLeftColor: activeDrives[0].badge_color }]}
          onPress={() => (navigation as any).navigate('DriveDetails', { driveId: activeDrives[0].id })}
          activeOpacity={0.85}
        >
          <Text style={s.driveBannerEmoji}>{activeDrives[0].badge_icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.driveBannerTitle, { color: colors.text }]}>{activeDrives[0].title}</Text>
            <Text style={[s.driveBannerSub, { color: colors.textSub }]}>
              Clean in the zone · 2× points · Earn the badge
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Points card */}
      <View style={s.pointsCard}>
        <View style={s.pointsLeft}>
          <Text style={s.pointsLabel}>Your Points</Text>
          <Text style={s.pointsValue}>{profile?.total_points ?? 0}</Text>
          <Text style={s.cleanupCount}>{profile?.cleanups_done ?? 0} cleanups completed</Text>
        </View>
        <View style={s.pointsIconWrap}>
          <Ionicons name="star" size={40} color="rgba(255,255,255,0.3)" />
        </View>
      </View>

      {/* Platform stats */}
      <Text style={[s.sectionTitle, { color: colors.textSub }]}>Platform Impact</Text>
      <View style={s.statsRow}>
        <StatCard icon="leaf-outline" value={stats.totalCleanups} label="Cleanups" color={colors.primary} bg={colors.primaryLight} colors={colors} />
        <StatCard icon="people-outline" value={stats.activeVolunteers} label="Volunteers" color={colors.info} bg={colors.infoBg} colors={colors} />
        <StatCard icon="location-outline" value={stats.areasRestored} label="Clean Areas" color={colors.warning} bg={colors.warningBg} colors={colors} />
      </View>

      {/* Quick actions */}
      <Text style={[s.sectionTitle, { color: colors.textSub }]}>Actions</Text>
      <TouchableOpacity
        style={[s.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => navigation.navigate('Submit')}
        activeOpacity={0.8}
      >
        <View style={[s.actionIconWrap, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="camera-outline" size={22} color={colors.primary} />
        </View>
        <View style={s.actionTextWrap}>
          <Text style={[s.actionTitle, { color: colors.text }]}>Start a Cleanup</Text>
          <Text style={[s.actionSub, { color: colors.textMuted }]}>Document before & after</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => navigation.navigate('Map')}
        activeOpacity={0.8}
      >
        <View style={[s.actionIconWrap, { backgroundColor: colors.infoBg }]}>
          <Ionicons name="map-outline" size={22} color={colors.info} />
        </View>
        <View style={s.actionTextWrap}>
          <Text style={[s.actionTitle, { color: colors.text }]}>View Map</Text>
          <Text style={[s.actionSub, { color: colors.textMuted }]}>Report dirty locations nearby</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ icon, value, label, color, bg, colors }: { icon: any; value: number; label: string; color: string; bg: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 8, backgroundColor: bg }}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <Text style={{ fontSize: 21, fontWeight: '800', color, marginBottom: 2 }}>{value}</Text>
      <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600', textAlign: 'center', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  greeting: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  sub: { fontSize: 13, marginTop: 2 },
  notifBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  pointsCard: {
    backgroundColor: c.primary,
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
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionBtn: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTextWrap: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600' },
  actionSub: { fontSize: 12, marginTop: 2 },
  driveBanner: {
    borderRadius: 14,
    borderLeftWidth: 4,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  driveBannerEmoji: { fontSize: 26 },
  driveBannerTitle: { fontSize: 14, fontWeight: '700' },
  driveBannerSub: { fontSize: 12, marginTop: 2 },
  });
}

