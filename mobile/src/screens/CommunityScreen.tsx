import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface FeedPost {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  before_image: string;
  after_image: string;
  after_time: string;
  karma: number;
  upvotes: number;
  downvotes: number;
  my_vote: 'up' | 'down' | null;
}

interface LeaderEntry {
  user_id: string;
  name: string;
  avatar: string | null;
  total_points: number;
  cleanups_done: number;
  karma: number;
  score: number;
}

export default function CommunityScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const [tab, setTab] = useState<'feed' | 'leaderboard'>('feed');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadAll(); }, []);

  // Re-fetch leaderboard every time this screen gains focus
  useFocusEffect(
    useCallback(() => { loadLeaderboard(); }, [])
  );

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadFeed(), loadLeaderboard()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFeed(), loadLeaderboard()]);
    setRefreshing(false);
  };

  const loadFeed = async () => {
    const { data: reports } = await supabase
      .from('cleanup_reports')
      .select('id, user_id, before_image, after_image, after_time, users(name, avatar)')
      .eq('verified', true)
      .order('after_time', { ascending: false })
      .limit(40);

    if (!reports) return;

    const ids = (reports as any[]).map((r) => r.id);
    const { data: votes } = ids.length > 0
      ? await supabase.from('votes').select('report_id, vote_type, user_id').in('report_id', ids)
      : { data: [] };

    const vm: Record<string, { up: number; down: number; mine: 'up' | 'down' | null }> = {};
    (votes ?? []).forEach((v: any) => {
      if (!vm[v.report_id]) vm[v.report_id] = { up: 0, down: 0, mine: null };
      if (v.vote_type === 'up') vm[v.report_id].up += 1;
      else vm[v.report_id].down += 1;
      if (v.user_id === user?.id) vm[v.report_id].mine = v.vote_type;
    });

    setPosts(
      (reports as any[]).map((r) => {
        const d = vm[r.id] ?? { up: 0, down: 0, mine: null };
        return {
          id: r.id,
          user_id: r.user_id,
          user_name: r.users?.name ?? 'Anonymous',
          user_avatar: r.users?.avatar ?? null,
          before_image: r.before_image,
          after_image: r.after_image,
          after_time: r.after_time,
          karma: d.up - d.down,
          upvotes: d.up,
          downvotes: d.down,
          my_vote: d.mine,
        };
      })
    );
  };

  const loadLeaderboard = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, name, avatar, total_points, cleanups_done, total_karma')
      .order('total_points', { ascending: false })
      .limit(50);
    if (data) {
      const mapped = (data as any[]).map((u) => {
        const karma = u.total_karma ?? 0;
        const pts = u.total_points ?? 0;
        return {
          user_id: u.id,
          name: u.name ?? 'Anonymous',
          avatar: u.avatar ?? null,
          total_points: pts,
          cleanups_done: u.cleanups_done ?? 0,
          karma,
          score: pts + karma * 5,
        };
      });
      mapped.sort((a, b) => b.score - a.score);
      setLeaderboard(mapped);
    }
  };

  const castVote = async (post: FeedPost, vt: 'up' | 'down') => {
    if (!user) return;
    const same = post.my_vote === vt;
    const applyUpdate = (p: FeedPost): FeedPost => {
      let up = p.upvotes, down = p.downvotes;
      if (same) {
        vt === 'up' ? up-- : down--;
        return { ...p, my_vote: null, upvotes: up, downvotes: down, karma: up - down };
      }
      if (vt === 'up') { up++; if (p.my_vote === 'down') down--; }
      else { down++; if (p.my_vote === 'up') up--; }
      return { ...p, my_vote: vt, upvotes: up, downvotes: down, karma: up - down };
    };
    setPosts((prev) => prev.map((p) => p.id === post.id ? applyUpdate(p) : p));

    let error: any = null;
    if (same) {
      ({ error } = await supabase.from('votes').delete().eq('user_id', user.id).eq('report_id', post.id));
    } else if (post.my_vote) {
      ({ error } = await supabase.from('votes').update({ vote_type: vt }).eq('user_id', user.id).eq('report_id', post.id));
    } else {
      ({ error } = await supabase.from('votes').insert({ user_id: user.id, report_id: post.id, vote_type: vt }));
    }

    if (error) {
      console.warn('Vote failed:', error.message);
      // Revert optimistic update
      await loadFeed();
      return;
    }

    // Persist karma to the users table via SECURITY DEFINER function
    await supabase.rpc('recalc_user_karma', { target_user_id: post.user_id });

    // Refresh leaderboard so rankings update immediately after voting
    await loadLeaderboard();
  };

  const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7c3a'];
  const s = useMemo(() => makeStyles(colors), [colors]);

  const renderPost = ({ item }: { item: FeedPost }) => (
    <PostCard
      post={item}
      colors={colors}
      onVote={(vt) => castVote(item, vt)}
      onUserPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })}
    />
  );

  const renderRankRow = ({ item, index }: { item: LeaderEntry; index: number }) => {
    const isTop3 = index < 3;
    const isMe = item.user_id === user?.id;
    return (
      <TouchableOpacity
        style={[s.rankRow, isMe && { borderColor: colors.primary, borderWidth: 1.5 }]}
        onPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })}
        activeOpacity={0.7}
      >
        <View style={[s.rankBadge, isTop3 && { backgroundColor: RANK_COLORS[index] + '20' }]}>
          {isTop3
            ? <Ionicons name="trophy" size={14} color={RANK_COLORS[index]} />
            : <Text style={[s.rankNum, { color: colors.textMuted }]}>{index + 1}</Text>}
        </View>
        {item.avatar
          ? <Image source={{ uri: item.avatar }} style={s.rankAvatar} />
          : <View style={[s.rankAvatar, { backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={[s.rankAvatarText, { color: colors.primary }]}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>}
        <View style={{ flex: 1 }}>
          <Text style={[s.rankName, { color: isMe ? colors.primary : colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {isMe && <Text style={[s.youTag, { color: colors.primary }]}>You</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.rankPts, { color: colors.text }]}>{item.score}</Text>
          <Text style={[s.rankPtsSub, { color: colors.textMuted }]}>score</Text>
        </View>
        {item.karma !== 0 && (
          <View style={{ backgroundColor: item.karma >= 0 ? '#dcfce7' : '#fef2f2', flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
            <Ionicons name={item.karma >= 0 ? 'arrow-up' : 'arrow-down'} size={10} color={item.karma >= 0 ? '#16a34a' : '#ef4444'} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: item.karma >= 0 ? '#16a34a' : '#ef4444' }}>{Math.abs(item.karma)}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Segment toggle */}
      <View style={[s.segment, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[s.segBtn, { backgroundColor: colors.bg }, tab === 'feed' && { backgroundColor: colors.primaryLight }]}
          onPress={() => setTab('feed')}
        >
          <Ionicons name="grid-outline" size={15} color={tab === 'feed' ? colors.primary : colors.textMuted} />
          <Text style={[s.segLabel, { color: tab === 'feed' ? colors.primary : colors.textMuted }]}>Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.segBtn, { backgroundColor: colors.bg }, tab === 'leaderboard' && { backgroundColor: colors.primaryLight }]}
          onPress={() => setTab('leaderboard')}
        >
          <Ionicons name="trophy-outline" size={15} color={tab === 'leaderboard' ? colors.primary : colors.textMuted} />
          <Text style={[s.segLabel, { color: tab === 'leaderboard' ? colors.primary : colors.textMuted }]}>Leaderboard</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : tab === 'feed' ? (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderPost}
          contentContainerStyle={s.feedList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textSub }]}>No cleanups yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>Be the first to clean up your city!</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(e) => e.user_id}
          renderItem={renderRankRow}
          contentContainerStyle={s.rankList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="stats-chart-outline" size={48} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textSub }]}>No entries yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ── PostCard ──────────────────────────────────────────────────────────────────

function PostCard({
  post, colors, onVote, onUserPress,
}: {
  post: FeedPost;
  colors: ThemeColors;
  onVote: (vt: 'up' | 'down') => void;
  onUserPress: () => void;
}) {
  const [showBefore, setShowBefore] = useState(false);

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <View style={[pcStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Author */}
      <TouchableOpacity style={pcStyles.author} onPress={onUserPress} activeOpacity={0.7}>
        {post.user_avatar
          ? <Image source={{ uri: post.user_avatar }} style={pcStyles.avatar} />
          : <View style={[pcStyles.avatar, { backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={[pcStyles.avatarText, { color: colors.primary }]}>{post.user_name.charAt(0).toUpperCase()}</Text>
            </View>}
        <View style={{ flex: 1 }}>
          <Text style={[pcStyles.authorName, { color: colors.text }]}>{post.user_name}</Text>
          <Text style={[pcStyles.time, { color: colors.textMuted }]}>{timeAgo(post.after_time)}</Text>
        </View>
        <View style={[pcStyles.verifiedBadge, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
          <Text style={[pcStyles.verifiedText, { color: colors.primary }]}>Verified</Text>
        </View>
      </TouchableOpacity>

      {/* Photo */}
      <View>
        <Image
          source={{ uri: showBefore ? post.before_image : post.after_image }}
          style={pcStyles.photo}
          resizeMode="cover"
        />
        <TouchableOpacity
          style={pcStyles.toggleBtn}
          onPress={() => setShowBefore((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={pcStyles.toggleText}>{showBefore ? 'BEFORE' : 'AFTER'}</Text>
          <Ionicons name="swap-horizontal" size={12} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Karma row */}
      <View style={[pcStyles.actions, { borderTopColor: colors.border }]}>
        {/* Upvote */}
        <TouchableOpacity
          style={[pcStyles.voteBtn, post.my_vote === 'up' && { backgroundColor: colors.upvote + '22' }]}
          onPress={() => onVote('up')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={post.my_vote === 'up' ? colors.upvote : colors.textMuted}
          />
          <Text style={[pcStyles.voteTxt, { color: post.my_vote === 'up' ? colors.upvote : colors.textMuted }]}>
            {post.upvotes}
          </Text>
        </TouchableOpacity>

        {/* Net karma score */}
        <View style={pcStyles.karmaBlock}>
          <Text style={[pcStyles.karmaScore, { color: post.karma >= 0 ? colors.upvote : colors.downvote }]}>
            {post.karma > 0 ? '+' : ''}{post.karma}
          </Text>
          <Text style={[pcStyles.karmaLabel, { color: colors.textMuted }]}>karma</Text>
        </View>

        {/* Downvote */}
        <TouchableOpacity
          style={[pcStyles.voteBtn, post.my_vote === 'down' && { backgroundColor: colors.downvote + '22' }]}
          onPress={() => onVote('down')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="arrow-down"
            size={18}
            color={post.my_vote === 'down' ? colors.downvote : colors.textMuted}
          />
          <Text style={[pcStyles.voteTxt, { color: post.my_vote === 'down' ? colors.downvote : colors.textMuted }]}>
            {post.downvotes}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onUserPress} activeOpacity={0.7} style={{ marginLeft: 'auto' as any }}>
          <Text style={[pcStyles.profileLink, { color: colors.primary }]}>View Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pcStyles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  author: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarText: { fontWeight: '700', fontSize: 15 },
  authorName: { fontSize: 14, fontWeight: '700' },
  time: { fontSize: 12, marginTop: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  verifiedText: { fontSize: 11, fontWeight: '600' },
  photo: { width: '100%', height: 260 },
  toggleBtn: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  toggleText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 4, borderTopWidth: 1 },
  voteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  voteTxt: { fontSize: 13, fontWeight: '700' },
  karmaBlock: { flex: 1, alignItems: 'center' },
  karmaScore: { fontSize: 17, fontWeight: '800' },
  karmaLabel: { fontSize: 10, fontWeight: '500' },
  profileLink: { fontSize: 12, fontWeight: '600' },
});

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    segment: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 },
    segLabel: { fontSize: 13, fontWeight: '600' },
    feedList: { paddingTop: 12, paddingBottom: 32 },
    rankList: { padding: 16, gap: 8, paddingBottom: 32 },
    rankRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: c.border, gap: 10 },
    rankBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' },
    rankNum: { fontSize: 13, fontWeight: '700' },
    rankAvatar: { width: 40, height: 40, borderRadius: 20 },
    rankAvatarText: { fontWeight: '700', fontSize: 15 },
    rankName: { fontSize: 14, fontWeight: '600' },
    youTag: { fontSize: 10, fontWeight: '500', marginTop: 1 },
    rankPts: { fontSize: 17, fontWeight: '800' },
    rankPtsSub: { fontSize: 10, fontWeight: '500' },
    emptyText: { fontSize: 16, fontWeight: '600', marginTop: 12 },
    emptySub: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  });
}

