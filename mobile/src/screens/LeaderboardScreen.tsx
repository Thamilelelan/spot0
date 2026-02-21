import React, { useCallback, useEffect, useState } from 'react';
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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Entry {
  user_id: string;
  name: string;
  avatar: string | null;
  total_points: number;
  cleanups_done: number;
  karma: number; // net upvotes across all cleanup reports
  score: number; // weighted: points + karma bonus
}

const MONTH = new Date().toISOString().slice(0, 7); // "YYYY-MM"

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'score' | 'points' | 'karma'>('score');

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Re-fetch every time this screen gains focus
  useFocusEffect(
    useCallback(() => { fetchLeaderboard(); }, [])
  );

  const fetchLeaderboard = async () => {
    setLoading(true);

    // total_karma is now a persistent column on users, no need for votes join
    const { data: users } = await supabase
      .from('users')
      .select('id, name, avatar, total_points, cleanups_done, total_karma')
      .order('total_points', { ascending: false })
      .limit(100);

    if (users) {
      const mapped: Entry[] = users.map((u: any) => {
        const karma = u.total_karma ?? 0;
        return {
          user_id: u.id,
          name: u.name ?? 'Anonymous',
          avatar: u.avatar ?? null,
          total_points: u.total_points ?? 0,
          cleanups_done: u.cleanups_done ?? 0,
          karma,
          score: (u.total_points ?? 0) + karma * 5, // each net upvote = 5 bonus score
        };
      });
      // Sort by score descending
      mapped.sort((a, b) => b.score - a.score);
      setEntries(mapped);
    }
    setLoading(false);
  };

  const sorted = [...entries].sort((a, b) => {
    if (tab === 'points') return b.total_points - a.total_points;
    if (tab === 'karma') return b.karma - a.karma;
    return b.score - a.score;
  });

  const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7c3a'];

  const renderItem = ({ item, index }: { item: Entry; index: number }) => {
    const isMe = item.user_id === user?.id;
    const isTop3 = index < 3;
    return (
      <TouchableOpacity
        style={[styles.row, isMe && styles.rowMe]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })}
      >
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

        {/* Name + meta */}
        <View style={styles.nameWrap}>
          <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            {isMe && <Text style={styles.youLabel}>You</Text>}
            <Text style={styles.metaText}>{item.cleanups_done} cleanups</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsCol}>
          {tab === 'score' && (
            <>
              <Text style={[styles.ptsValue, isMe && { color: '#16a34a' }]}>{item.score}</Text>
              <Text style={styles.ptsSub}>score</Text>
            </>
          )}
          {tab === 'points' && (
            <>
              <Text style={[styles.ptsValue, isMe && { color: '#16a34a' }]}>{item.total_points}</Text>
              <Text style={styles.ptsSub}>pts</Text>
            </>
          )}
          {tab === 'karma' && (
            <>
              <Text style={[styles.ptsValue, { color: item.karma >= 0 ? '#16a34a' : '#ef4444' }]}>
                {item.karma >= 0 ? '+' : ''}{item.karma}
              </Text>
              <Text style={styles.ptsSub}>karma</Text>
            </>
          )}
        </View>

        {/* Karma badge (always visible in score/points tabs) */}
        {tab !== 'karma' && (
          <View style={[styles.karmaBadge, { backgroundColor: item.karma >= 0 ? '#dcfce7' : '#fef2f2' }]}>
            <Ionicons
              name={item.karma >= 0 ? 'arrow-up' : 'arrow-down'}
              size={10}
              color={item.karma >= 0 ? '#16a34a' : '#ef4444'}
            />
            <Text style={[styles.karmaBadgeText, { color: item.karma >= 0 ? '#16a34a' : '#ef4444' }]}>
              {Math.abs(item.karma)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Banner */}
      <View style={styles.topBanner}>
        <Ionicons name="trophy-outline" size={20} color="#f59e0b" />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={styles.bannerTitle}>SpotZero Leaderboard</Text>
          <Text style={styles.bannerSub}>{MONTH} · Score = Points + Karma×5</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'score' as const, label: 'Score', icon: 'star' },
          { key: 'points' as const, label: 'Points', icon: 'flash' },
          { key: 'karma' as const, label: 'Karma', icon: 'heart' },
        ]).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons
              name={(tab === t.key ? t.icon : t.icon + '-outline') as any}
              size={14}
              color={tab === t.key ? '#16a34a' : '#94a3b8'}
            />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {entries.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="stats-chart-outline" size={48} color="#cbd5e1" />
          <Text style={styles.empty}>No entries yet</Text>
          <Text style={styles.emptySub}>Complete a cleanup to appear here</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(e) => e.user_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
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
  /* Tab bar */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
  },
  tabItemActive: {
    backgroundColor: '#dcfce7',
  },
  tabLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  tabLabelActive: { color: '#16a34a' },
  /* List */
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  youLabel: { fontSize: 10, color: '#16a34a', fontWeight: '600' },
  metaText: { fontSize: 10, color: '#94a3b8' },
  statsCol: { alignItems: 'flex-end', minWidth: 40 },
  ptsValue: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  ptsSub: { fontSize: 10, color: '#94a3b8', fontWeight: '500' },
  karmaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 2,
  },
  karmaBadgeText: { fontSize: 11, fontWeight: '700' },
  empty: { fontSize: 16, fontWeight: '600', color: '#475569', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
});
