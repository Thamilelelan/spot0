import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../lib/api';

type RouteParams = { locationId: string };

interface GuardianPerformance {
  total_guarded: number;
  total_notified: number;
  total_responded: number;
  avg_response_time_minutes: number;
  level: string;
  reliability: string;
  response_rate: number;
  best_streak: number;
}

const LEVEL_EMOJI: Record<string, string> = {
  Watcher:   '\ud83d\udc41\ufe0f',
  Protector: '\ud83d\udee1\ufe0f',
  Keeper:    '\u2694\ufe0f',
  Steward:   '\ud83d\udc51',
};

const RELIABILITY_COLOR: Record<string, string> = {
  New:      '#9ca3af',
  Passive:  '#f97316',
  Active:   '#3b82f6',
  Reliable: '#16a34a',
};

export default function GuardianScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { locationId } = route.params as RouteParams;

  const [isGuardian, setIsGuardian] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardianCount, setGuardianCount] = useState(0);
  const [performance, setPerformance]     = useState<GuardianPerformance | null>(null);
  const [dirtySince, setDirtySince]       = useState<string | null>(null);
  const [hoursDirty, setHoursDirty]       = useState<number>(0);
  const [isDirty, setIsDirty]             = useState<boolean>(false);

  useEffect(() => {
    checkGuardianStatus();
    fetchPerformance();
    fetchDirtyCountdown();
  }, []);

  const checkGuardianStatus = async () => {
    if (!user) return;
    setLoading(true);
    const [mine, all] = await Promise.all([
      supabase
        .from('guardians')
        .select('id')
        .eq('user_id', user.id)
        .eq('location_id', locationId)
        .maybeSingle(),
      supabase
        .from('guardians')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', locationId),
    ]);
    setIsGuardian(!!mine.data);
    setGuardianCount(all.count ?? 0);
    setLoading(false);
  };

  const fetchPerformance = async () => {
    try {
      const data = await apiGet<GuardianPerformance>('/guardians/performance', true);
      setPerformance(data);
    } catch {
      // silently fail — stats card is optional
    }
  };

  const fetchDirtyCountdown = async () => {
    try {
      const data = await apiGet<{
        dirty_since: string | null;
        hours_since_dirty: number;
        is_dirty: boolean;
      }>(`/guardians/dirty-countdown/${locationId}`, false);
      setDirtySince(data.dirty_since);
      setHoursDirty(data.hours_since_dirty);
      setIsDirty(data.is_dirty);
    } catch {
      // silently fail — countdown is optional
    }
  };

  const toggleGuardian = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (isGuardian) {
        const { error } = await supabase
          .from('guardians')
          .delete()
          .eq('user_id', user.id)
          .eq('location_id', locationId);
        if (error) throw error;
        setIsGuardian(false);
        setGuardianCount((c) => Math.max(0, c - 1));
        Alert.alert('Unsubscribed', 'You are no longer a Guardian for this location.');
      } else {
        const { error } = await supabase
          .from('guardians')
          .insert({ user_id: user.id, location_id: locationId });
        if (error) throw error;
        setIsGuardian(true);
        setGuardianCount((c) => c + 1);
        Alert.alert('Subscribed! 🛡️', 'You will be notified if this area becomes dirty again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Hero icon */}}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🛡️</Text>
        <Text style={styles.heroTitle}>Guardian Mode</Text>
        <Text style={styles.heroSub}>
          Subscribe to this location and get notified whenever it becomes dirty again.
        </Text>
      </View>

      {/* Info card */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="people-outline" size={18} color="#16a34a" />
          <Text style={styles.infoText}>{guardianCount} guardian{guardianCount !== 1 ? 's' : ''} watching this spot</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="notifications-outline" size={18} color="#16a34a" />
          <Text style={styles.infoText}>Push notification when status → Red</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={18} color="#16a34a" />
          <Text style={styles.infoText}>No obligation to clean every time</Text>
        </View>
      </View>

      {/* Dirty Alert Banner — shown only when location is currently RED */}
      {isDirty && (
        <View style={styles.dirtyBanner}>
          <Text style={{ fontSize: 20 }}>🔴</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.dirtyBannerTitle}>Location is currently DIRTY</Text>
            <Text style={styles.dirtyBannerSub}>
              Dirty for{' '}
              {hoursDirty < 1
                ? 'less than 1 hour'
                : `${hoursDirty.toFixed(1)} hours`}
            </Text>
          </View>
        </View>
      )}

      {/* Guardian Level & Reliability */}
      {performance && (
        <View style={styles.levelCard}>
          <View style={styles.levelLeft}>
            <Text style={styles.levelEmoji}>
              {LEVEL_EMOJI[performance.level] ?? '\ud83d\udc41\ufe0f'}
            </Text>
            <View>
              <Text style={styles.levelTitle}>{performance.level}</Text>
              <Text
                style={[
                  styles.reliabilityBadge,
                  { color: RELIABILITY_COLOR[performance.reliability] ?? '#9ca3af' },
                ]}
              >
                {performance.reliability}
              </Text>
            </View>
          </View>
          <View style={styles.levelRight}>
            <Text style={styles.responseRateValue}>{performance.response_rate}%</Text>
            <Text style={styles.responseRateLabel}>response rate</Text>
          </View>
        </View>
      )}

      {/* Performance Stats Grid */}
      {performance && (
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{performance.total_guarded}</Text>
            <Text style={styles.statLabel}>Guarding</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{performance.total_notified}</Text>
            <Text style={styles.statLabel}>Notified</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{performance.total_responded}</Text>
            <Text style={styles.statLabel}>Responded</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {performance.avg_response_time_minutes > 0
                ? performance.avg_response_time_minutes < 60
                  ? `${performance.avg_response_time_minutes}m`
                  : `${(performance.avg_response_time_minutes / 60).toFixed(1)}h`
                : '\u2014'}
            </Text>
            <Text style={styles.statLabel}>Avg Response</Text>
          </View>
          {performance.best_streak > 0 && (
            <View style={[styles.statBox, styles.statBoxStreak]}>
              <Text style={[styles.statValue, { color: '#f59e0b' }]}>
                🔥 {performance.best_streak}
              </Text>
              <Text style={styles.statLabel}>Best Streak</Text>
            </View>
          )}
        </View>
      )}

      {/* Status */}}
      <View style={[styles.statusBadge, { backgroundColor: isGuardian ? '#dcfce7' : '#f3f4f6' }]}>
        <Text style={[styles.statusText, { color: isGuardian ? '#16a34a' : '#6b7280' }]}>
          {isGuardian ? '✅ You are a Guardian for this location' : '⬜ You are not subscribed yet'}
        </Text>
      </View>

      {/* Toggle button */}
      <TouchableOpacity
        style={[styles.btn, isGuardian ? styles.btnUnsubscribe : styles.btnSubscribe]}
        onPress={toggleGuardian}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons
              name={isGuardian ? 'shield-checkmark-outline' : 'shield-outline'}
              size={20}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.btnText}>
              {isGuardian ? 'Unsubscribe as Guardian' : 'Become a Guardian'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back to Map</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4', padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { alignItems: 'center', marginBottom: 28 },
  heroIcon: { fontSize: 56 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 8 },
  heroSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 14,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 14, color: '#374151', flex: 1 },
  statusBadge: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  statusText: { fontWeight: '600', fontSize: 14 },
  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnSubscribe: { backgroundColor: '#16a34a' },
  btnUnsubscribe: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  backBtn: { alignItems: 'center', paddingVertical: 8 },
  backText: { color: '#16a34a', fontWeight: '600', fontSize: 14 },
  // ── Dirty Banner ──────────────────────────────────────
  dirtyBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  dirtyBannerTitle: { fontWeight: '700', color: '#dc2626', fontSize: 14 },
  dirtyBannerSub:   { color: '#ef4444', fontSize: 12, marginTop: 2 },
  // ── Level Card ────────────────────────────────────────
  levelCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  levelLeft:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelEmoji:        { fontSize: 32 },
  levelTitle:        { fontWeight: '800', fontSize: 18, color: '#111827' },
  reliabilityBadge:  { fontWeight: '600', fontSize: 13, marginTop: 2 },
  levelRight:        { alignItems: 'center' },
  responseRateValue: { fontSize: 24, fontWeight: '800', color: '#16a34a' },
  responseRateLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  // ── Stats Grid ────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statBoxStreak: { borderWidth: 1, borderColor: '#fde68a' },
  statValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'center' },
});
