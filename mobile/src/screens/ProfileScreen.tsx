import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { UserBadge } from '../types';

const { width } = Dimensions.get('window');
const CELL = Math.floor((width - 3) / 3);

// ── Shared types ─────────────────────────────────────────────────────────────

export interface CleanupPost {
  id: string;
  before_image: string;
  after_image: string;
  after_time: string;
  verified: boolean;
  karma: number;
  upvotes: number;
  downvotes: number;
  my_vote: 'up' | 'down' | null;
}

// ── ProfileBody: shared by own tab + public stack ─────────────────────────────

export function ProfileBody({
  userId,
  isOwn,
  onSignOut,
}: {
  userId: string;
  isOwn: boolean;
  onSignOut?: () => void;
}) {
  const { user } = useAuth();
  const { colors, isDark, toggle: toggleTheme } = useTheme();
  const [profileData, setProfileData] = useState<{
    name: string; avatar: string | null;
    total_points: number; cleanups_done: number;
  } | null>(null);
  const [posts, setPosts] = useState<CleanupPost[]>([]);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CleanupPost | null>(null);
  const [showBefore, setShowBefore] = useState(false);

  const load = useCallback(async () => {
    const [{ data: u }, { data: cr }, { data: b }] = await Promise.all([
      supabase.from('users').select('name, avatar, total_points, cleanups_done').eq('id', userId).single(),
      supabase.from('cleanup_reports')
        .select('id, before_image, after_image, after_time, verified')
        .eq('user_id', userId)
        .order('after_time', { ascending: false })
        .limit(30),
      supabase.from('user_badges').select('*').eq('user_id', userId).order('awarded_at', { ascending: false }),
    ]);
    if (b) setBadges(b as UserBadge[]);
    if (u) setProfileData(u as any);
    if (!cr) { setLoading(false); return; }
    const ids = (cr as any[]).map((r) => r.id);
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
    setPosts((cr as any[]).map((r) => {
      const d = vm[r.id] ?? { up: 0, down: 0, mine: null };
      return {
        id: r.id, before_image: r.before_image, after_image: r.after_image,
        after_time: r.after_time, verified: r.verified,
        karma: d.up - d.down, upvotes: d.up, downvotes: d.down, my_vote: d.mine,
      };
    }));
    setLoading(false);
  }, [userId, user?.id]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const castVote = async (post: CleanupPost, vt: 'up' | 'down') => {
    if (!user) return;
    const same = post.my_vote === vt;
    const applyUpdate = (p: CleanupPost): CleanupPost => {
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
    setSelected((prev) => (prev?.id === post.id ? applyUpdate(prev) : prev));

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
      return;
    }

    // Persist karma to DB so leaderboard stays in sync
    await supabase.rpc('recalc_user_karma', { target_user_id: userId });
  };

  const netKarma = posts.reduce((s, p) => s + p.karma, 0);
  const s = useMemo(() => makeStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!profileData) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Instagram-style header ── */}
      <View style={s.header}>
        {profileData.avatar
          ? <Image source={{ uri: profileData.avatar }} style={s.avatar} />
          : <View style={[s.avatar, s.avatarFallback]}>
              <Text style={[s.avatarInitial, { color: colors.primary }]}>
                {profileData.name.charAt(0).toUpperCase()}
              </Text>
            </View>}
        <View style={s.statsRow}>
          <StatPill value={posts.length} label="Posts" color={colors.text} muted={colors.textMuted} />
          <StatPill value={profileData.total_points} label="Points" color={colors.primary} muted={colors.textMuted} />
          <StatPill
            value={netKarma}
            label="Karma"
            color={netKarma >= 0 ? colors.upvote : colors.downvote}
            muted={colors.textMuted}
          />
        </View>
      </View>

      {/* Name + tag */}
      <View style={s.nameSection}>
        <Text style={[s.userName, { color: colors.text }]}>{profileData.name}</Text>
        <View style={s.tagRow}>
          <Ionicons name="leaf-outline" size={11} color={colors.primary} />
          <Text style={[s.tagText, { color: colors.primary }]}>City Volunteer</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={s.btnRow}>
        {isOwn ? (
          <>
            <TouchableOpacity
              style={[s.btn, { borderColor: colors.border, backgroundColor: colors.card }]}
              activeOpacity={0.8}
            >
              <Text style={[s.btnText, { color: colors.text }]}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnSquare, { borderColor: colors.border, backgroundColor: colors.card }]}
              activeOpacity={0.8}
              onPress={toggleTheme}
            >
              <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnSquare, { borderColor: '#fecaca', backgroundColor: colors.card }]}
              activeOpacity={0.8}
              onPress={onSignOut}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </>
        ) : (
          <View style={[s.btn, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="person-outline" size={14} color={colors.textMuted} />
            <Text style={[s.btnText, { color: colors.textMuted }]}>Public Profile</Text>
          </View>
        )}
      </View>

      {/* Grid header */}
      <View style={[s.divider, { borderTopColor: colors.border }]}>
        <Ionicons name="grid-outline" size={16} color={colors.textMuted} />
      </View>

      {/* Photo grid */}
      {posts.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.textSub }]}>No cleanups yet</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>
            {isOwn ? 'Complete your first cleanup' : 'No cleanups posted yet'}
          </Text>
        </View>
      ) : (
        <View style={s.grid}>
          {posts.map((p) => (
            <TouchableOpacity
              key={p.id} style={s.cell} activeOpacity={0.85}
              onPress={() => { setSelected(p); setShowBefore(false); }}
            >
              <Image source={{ uri: p.after_image }} style={s.cellImg} />
              {p.karma !== 0 && (
                <View style={[s.karmaBadge, { backgroundColor: p.karma > 0 ? colors.upvote + 'cc' : colors.downvote + 'cc' }]}>
                  <Ionicons name={p.karma > 0 ? 'arrow-up' : 'arrow-down'} size={9} color="#fff" />
                  <Text style={s.karmaBadgeTxt}>{Math.abs(p.karma)}</Text>
                </View>
              )}
              {!p.verified && (
                <View style={s.pendingDot}>
                  <Ionicons name="time-outline" size={9} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Badges section */}
      {badges.length > 0 && (
        <>
          <View style={[s.divider, { borderTopColor: colors.border }]}>
            <Ionicons name="trophy-outline" size={16} color={colors.textMuted} />
          </View>
          <View style={s.badgesRow}>
            {badges.map((badge) => (
              <View key={badge.id} style={[s.badgeItem, { borderColor: badge.badge_color + '55', backgroundColor: badge.badge_color + '11' }]}>
                <Text style={s.badgeIcon}>{badge.badge_icon}</Text>
                <Text style={[s.badgeName, { color: badge.badge_color }]}>{badge.badge_name}</Text>
                <Text style={[s.badgeDate, { color: colors.textMuted }]}>
                  {new Date(badge.awarded_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Post detail modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={s.backdrop} onPress={() => setSelected(null)}>
          <Pressable
            style={[s.sheet, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            {selected && (
              <>
                <View>
                  <Image
                    source={{ uri: showBefore ? selected.before_image : selected.after_image }}
                    style={s.sheetPhoto}
                    resizeMode="cover"
                  />
                  <TouchableOpacity style={s.toggleBtn} onPress={() => setShowBefore((v) => !v)}>
                    <Text style={s.toggleTxt}>{showBefore ? 'BEFORE' : 'AFTER'}</Text>
                    <Ionicons name="swap-horizontal" size={12} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.closeBtn} onPress={() => setSelected(null)}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Karma row */}
                <View style={[s.sheetActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity
                    style={[s.voteBtn, selected.my_vote === 'up' && { backgroundColor: colors.upvote + '22' }]}
                    onPress={() => castVote(selected, 'up')}
                  >
                    <Ionicons
                      name="arrow-up" size={22}
                      color={selected.my_vote === 'up' ? colors.upvote : colors.textMuted}
                    />
                    <Text style={[s.voteCnt, { color: selected.my_vote === 'up' ? colors.upvote : colors.textMuted }]}>
                      {selected.upvotes}
                    </Text>
                  </TouchableOpacity>
                  <View style={s.karmaCenter}>
                    <Text style={[s.karmaNum, { color: selected.karma >= 0 ? colors.upvote : colors.downvote }]}>
                      {selected.karma > 0 ? '+' : ''}{selected.karma}
                    </Text>
                    <Text style={[s.karmaLbl, { color: colors.textMuted }]}>karma</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.voteBtn, selected.my_vote === 'down' && { backgroundColor: colors.downvote + '22' }]}
                    onPress={() => castVote(selected, 'down')}
                  >
                    <Ionicons
                      name="arrow-down" size={22}
                      color={selected.my_vote === 'down' ? colors.downvote : colors.textMuted}
                    />
                    <Text style={[s.voteCnt, { color: selected.my_vote === 'down' ? colors.downvote : colors.textMuted }]}>
                      {selected.downvotes}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[s.sheetDate, { color: colors.textMuted }]}>
                  {new Date(selected.after_time).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ value, label, color, muted }: { value: number; label: string; color: string; muted: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: muted, marginTop: 2, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

// ── Themed styles ─────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 20 },
    avatar: { width: 86, height: 86, borderRadius: 43 },
    avatarFallback: { backgroundColor: c.primaryLight, justifyContent: 'center', alignItems: 'center' },
    avatarInitial: { fontSize: 34, fontWeight: '800' },
    statsRow: { flex: 1, flexDirection: 'row' },
    nameSection: { paddingHorizontal: 20, paddingBottom: 14 },
    userName: { fontSize: 17, fontWeight: '700' },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
    tagText: { fontSize: 12, fontWeight: '600' },
    btnRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1.5 },
    btnSquare: { flex: 0, paddingHorizontal: 14 },
    btnText: { fontSize: 14, fontWeight: '600' },
    divider: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, marginTop: 4 },
    emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
    emptySub: { fontSize: 13, marginTop: 4, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 },
    cell: { width: CELL, height: CELL },
    cellImg: { width: '100%', height: '100%' },
    karmaBadge: { position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
    karmaBadgeTxt: { fontSize: 9, fontWeight: '700', color: '#fff' },
    pendingDot: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(245,158,11,0.9)', borderRadius: 8, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
    badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
    badgeItem: {
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1.5,
      paddingVertical: 10,
      paddingHorizontal: 14,
      minWidth: 90,
    },
    badgeIcon: { fontSize: 28, marginBottom: 4 },
    badgeName: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
    badgeDate: { fontSize: 9, marginTop: 2 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', paddingBottom: 28 },
    sheetPhoto: { width: '100%', height: 340 },
    toggleBtn: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    toggleTxt: { color: '#fff', fontWeight: '700', fontSize: 11 },
    closeBtn: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    sheetActions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1 },
    voteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
    voteCnt: { fontSize: 16, fontWeight: '700' },
    karmaCenter: { flex: 1, alignItems: 'center' },
    karmaNum: { fontSize: 28, fontWeight: '800' },
    karmaLbl: { fontSize: 11, fontWeight: '500', marginTop: 1 },
    sheetDate: { textAlign: 'center', fontSize: 12, paddingVertical: 6 },
  });
}

// ── Default export: own profile tab ──────────────────────────────────────────

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const handleSignOut = () =>
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  if (!user) return null;
  return <ProfileBody userId={user.id} isOwn={true} onSignOut={handleSignOut} />;
}
