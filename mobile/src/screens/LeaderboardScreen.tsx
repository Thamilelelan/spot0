import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../lib/api';

interface Entry {
  user_id: string;
  name: string;
  avatar: string | null;
  total_points: number;
  cleanups_done: number;
}

// Monthly entry shape returned by our backend /leaderboard?month=YYYY-MM
interface MonthlyEntry {
  rank: number;
  user_id: string;
  name: string;
  avatar: string | null;
  monthly_points: number;
}

const MONTH = new Date().toISOString().slice(0, 7); // "YYYY-MM"

export default function LeaderboardScreen() {
  const { user } = useAuth();

  // ── All-time (existing, untouched) ────────────────────────────────────────
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Tab toggle ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'alltime' | 'monthly'>('alltime');

  // ── Monthly (new) ─────────────────────────────────────────────────────────
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyEntry[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyFetched, setMonthlyFetched] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Fetch monthly only on first switch to that tab
  useEffect(() => {
    if (tab === 'monthly' && !monthlyFetched) {
      fetchMonthly();
    }
  }, [tab]);

  const fetchMonthly = async () => {
    setMonthlyLoading(true);
    try {
      const data = await apiGet<MonthlyEntry[]>(`/leaderboard?month=${MONTH}`, false);
      setMonthlyEntries(data);
      setMonthlyFetched(true);
    } catch {
      // non-critical: monthly tab silently shows empty if backend unreachable
    } finally {
      setMonthlyLoading(false);
    }
  };

  const fetchLeaderboard = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('id, name, avatar, total_points, cleanups_done')
      .order('total_points', { ascending: false })
      .limit(50);

    if (!error && data) {
      setEntries(
        data.map((u: any) => ({
          user_id: u.id,
          name: u.name ?? 'Anonymous',
          avatar: u.avatar ?? null,
          total_points: u.total_points ?? 0,
          cleanups_done: u.cleanups_done ?? 0,
        }))
      );
    }
    setLoading(false);
  };

  const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7c3a'];

  const renderItem = ({ item, index }: { item: Entry; index: number }) => {
    const isMe = item.user_id === user?.id;
    const isTop3 = index < 3;
    return (
      <View style={[styles.row, isMe && styles.rowMe]}>
        {/* Rank */}
        <View style={[styles.rankWrap, isTop3 && { backgroundColor: RANK_COLORS[index] + '20' }]}>
          {isTop3 ? (
            <Ionicons name="trophy" size={16} color={RANK_COLORS[index]} />
          ) : (
            <Text style={styles.rankNum}>{index + 1}</Text>
          )}
        </View>

        {/* Avatar */}
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        {/* Name */}
        <View style={styles.nameWrap}>
          <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
            {item.name}
          </Text>
          {isMe && <Text style={styles.youLabel}>You</Text>}
        </View>

        {/* Points */}
        <View style={styles.ptsWrap}>
          <Text style={[styles.ptsValue, isMe && { color: '#16a34a' }]}>
            {item.total_points}
          </Text>
          <Text style={styles.ptsSub}>pts</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Tab toggle ────────────────────────────────────────────────────── */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'alltime' && styles.tabBtnActive]}
          onPress={() => setTab('alltime')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={tab === 'alltime' ? 'trophy' : 'trophy-outline'}
            size={13}
            color={tab === 'alltime' ? '#fff' : '#64748b'}
          />
          <Text style={[styles.tabBtnText, tab === 'alltime' && styles.tabBtnTextActive]}>
            All Time
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'monthly' && styles.tabBtnActive]}
          onPress={() => setTab('monthly')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={tab === 'monthly' ? 'calendar' : 'calendar-outline'}
            size={13}
            color={tab === 'monthly' ? '#fff' : '#64748b'}
          />
          <Text style={[styles.tabBtnText, tab === 'monthly' && styles.tabBtnTextActive]}>
            This Month
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Banner ────────────────────────────────────────────────────────── */}
      <View style={styles.topBanner}>
        <Ionicons name="trophy-outline" size={20} color="#f59e0b" />
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.bannerTitle}>
            {tab === 'alltime' ? 'All-Time Leaderboard' : 'Monthly Leaderboard'}
          </Text>
          <Text style={styles.bannerSub}>
            {tab === 'alltime' ? 'Total points ever earned' : `${MONTH} · Resets next month`}
          </Text>
        </View>
      </View>

      {/* ── All-time list (existing query, untouched) ─────────────────────── */}
      {tab === 'alltime' && (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="stats-chart-outline" size={48} color="#cbd5e1" />
            <Text style={styles.empty}>No entries yet</Text>
            <Text style={styles.emptySub}>Complete a cleanup to appear here</Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => e.user_id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* ── Monthly list (backend GET /leaderboard?month=YYYY-MM) ─────────── */}
      {tab === 'monthly' && (
        monthlyLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        ) : monthlyEntries.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="calendar-outline" size={48} color="#cbd5e1" />
            <Text style={styles.empty}>No activity this month</Text>
            <Text style={styles.emptySub}>Complete a cleanup to appear here</Text>
          </View>
        ) : (
          <FlatList
            data={monthlyEntries.map((e) => ({
              user_id: e.user_id,
              name: e.name,
              avatar: e.avatar,
              total_points: e.monthly_points,
              cleanups_done: 0,
            }))}
            keyExtractor={(e) => e.user_id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  // Tab toggle
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    margin: 16,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
  },
  tabBtnActive: { backgroundColor: '#16a34a' },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  tabBtnTextActive: { color: '#fff' },
  topBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  bannerSub: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 10,
  },
  rowMe: { borderColor: '#16a34a', borderWidth: 1.5 },
  rankWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNum: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#16a34a', fontWeight: '700', fontSize: 15 },
  nameWrap: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  nameMe: { color: '#16a34a' },
  youLabel: { fontSize: 10, color: '#16a34a', fontWeight: '500', marginTop: 1 },
  ptsWrap: { alignItems: 'flex-end' },
  ptsValue: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  ptsSub: { fontSize: 10, color: '#94a3b8', fontWeight: '500' },
  empty: { fontSize: 16, fontWeight: '600', color: '#475569', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
});
