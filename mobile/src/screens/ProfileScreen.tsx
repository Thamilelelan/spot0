import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface RecentCleanup {
  id: string;
  after_image: string;
  after_time: string;
  verified: boolean;
}

export default function ProfileScreen() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [cleanups, setCleanups] = useState<RecentCleanup[]>([]);

  useEffect(() => {
    fetchRecentCleanups();
    refreshProfile();
  }, []);

  const fetchRecentCleanups = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cleanup_reports')
      .select('id, after_image, after_time, verified')
      .eq('user_id', user.id)
      .order('after_time', { ascending: false })
      .limit(6);
    if (data) setCleanups(data as RecentCleanup[]);
  };

  if (!profile) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile header */}
      <View style={styles.profileHeader}>
        {profile.avatar ? (
          <Image source={{ uri: profile.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{profile.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatBox value={profile.total_points} label="Total Points" icon="star-outline" color="#16a34a" />
        <StatBox value={profile.cleanups_done} label="Cleanups" icon="checkmark-circle-outline" color="#2563eb" />
      </View>

      {/* Recent cleanups */}
      <Text style={styles.sectionTitle}>Recent Cleanups</Text>
      {cleanups.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="camera-outline" size={40} color="#cbd5e1" />
          <Text style={styles.emptyText}>No cleanups yet</Text>
          <Text style={styles.emptySub}>Complete your first cleanup to see it here</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {cleanups.map((c) => (
            <View key={c.id} style={styles.thumb}>
              <Image source={{ uri: c.after_image }} style={styles.thumbImg} />
              <View style={[styles.badge, { backgroundColor: c.verified ? '#16a34a' : '#f59e0b' }]}>
                <Ionicons
                  name={c.verified ? 'checkmark' : 'time-outline'}
                  size={10}
                  color="#fff"
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Sign out */}
      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={() =>
          Alert.alert('Sign Out', 'Are you sure?', [
            { text: 'Cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
          ])
        }
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={17} color="#ef4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatBox({ value, label, icon, color }: { value: number; label: string; icon: any; color: string }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={20} color={color} style={{ marginBottom: 6 }} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 32 },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 14,
  },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 26, color: '#16a34a', fontWeight: '700' },
  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  email: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: '500' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#475569', marginTop: 10 },
  emptySub: { fontSize: 12, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  thumb: { width: '30%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    backgroundColor: '#fff5f5',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 8,
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
});
