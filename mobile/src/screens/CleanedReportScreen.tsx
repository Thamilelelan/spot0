import React, { useEffect, useMemo, useState } from 'react';
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
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteParams = { locationId: string; lat: number; lng: number };

interface CleanupWithUser {
  id: string;
  user_id: string;
  before_image: string;
  after_image: string;
  before_time: string;
  after_time: string;
  verified: boolean;
  user_name: string;
  user_avatar: string | null;
}

export default function CleanedReportScreen() {
  const route = useRoute();
  const navigation = useNavigation<Nav>();
  const { locationId, lat, lng } = route.params as RouteParams;
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [reports, setReports] = useState<CleanupWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCleanups();
  }, []);

  const fetchCleanups = async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('cleanup_reports')
      .select('id, user_id, before_image, after_image, before_time, after_time, verified, users(name, avatar)')
      .eq('location_id', locationId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (data) {
      setReports(
        data.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          before_image: r.before_image,
          after_image: r.after_image,
          before_time: r.before_time,
          after_time: r.after_time,
          verified: r.verified,
          user_name: r.users?.name ?? 'Anonymous',
          user_avatar: r.users?.avatar ?? null,
        })),
      );
    }
    setLoading(false);
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={s.headerCard}>
        <View style={s.headerTop}>
          <View style={s.statusBadge}>
            <Ionicons name="sparkles" size={14} color="#fff" />
            <Text style={s.statusBadgeText}>Recently Cleaned</Text>
          </View>
          <View style={s.coordPill}>
            <Ionicons name="location-outline" size={11} color={colors.textMuted} />
            <Text style={s.coordText}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
          </View>
        </View>

        <View style={s.statusMsg}>
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text style={s.statusMsgText}>
            This area was cleaned! The report will be visible for 24 hours.
          </Text>
        </View>
      </View>

      {/* ── Reports ─────────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 48 }} />
      ) : reports.length === 0 ? (
        <View style={s.emptyWrap}>
          <Ionicons name="images-outline" size={48} color={colors.textMuted} />
          <Text style={s.emptyTitle}>No cleanup reports found</Text>
        </View>
      ) : (
        reports.map((r, i) => (
          <View key={r.id} style={s.reportCard}>
            {/* User row */}
            <TouchableOpacity
              style={s.userRow}
              onPress={() => navigation.navigate('PublicProfile', { userId: r.user_id })}
            >
              {r.user_avatar ? (
                <Image source={{ uri: r.user_avatar }} style={s.avatar} />
              ) : (
                <View style={[s.avatarPlaceholder, { backgroundColor: colors.border }]}>
                  <Ionicons name="person" size={14} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.userName}>{r.user_name}</Text>
                <Text style={s.cleanedAt}>Cleaned {fmtTime(r.after_time)}</Text>
              </View>
              {r.verified && (
                <View style={s.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                  <Text style={s.verifiedText}>Verified</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Before / After comparison */}
            <View style={s.compareRow}>
              <View style={s.compareItem}>
                <View style={s.compareLabelWrap}>
                  <View style={[s.compareDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={s.compareLabel}>Before</Text>
                </View>
                <Image source={{ uri: r.before_image }} style={s.compareImg} resizeMode="cover" />
                <Text style={s.compareTime}>{fmtTime(r.before_time)}</Text>
              </View>
              <View style={s.compareArrow}>
                <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
              </View>
              <View style={s.compareItem}>
                <View style={s.compareLabelWrap}>
                  <View style={[s.compareDot, { backgroundColor: '#22c55e' }]} />
                  <Text style={s.compareLabel}>After</Text>
                </View>
                <Image source={{ uri: r.after_image }} style={s.compareImg} resizeMode="cover" />
                <Text style={s.compareTime}>{fmtTime(r.after_time)}</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {/* ── Guardian CTA ────────────────────────────────────────── */}
      <TouchableOpacity
        style={s.ctaBtn}
        onPress={() => navigation.navigate('Guardian', { locationId })}
        activeOpacity={0.85}
      >
        <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
        <Text style={s.ctaBtnText}>Become a Guardian</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48 },

    /* Header */
    headerCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      backgroundColor: '#eff6ff',
      borderColor: '#3b82f633',
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: '#3b82f6',
    },
    statusBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    coordPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: c.card,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    coordText: { fontSize: 10, color: c.textMuted, fontWeight: '500' },
    statusMsg: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusMsgText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500', color: '#1d4ed8' },

    /* Empty */
    emptyWrap: { alignItems: 'center', marginTop: 48, gap: 8 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.text },

    /* Report card */
    reportCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    avatarPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    userName: { fontSize: 14, fontWeight: '700', color: c.text },
    cleanedAt: { fontSize: 11, color: c.textMuted },
    verifiedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: '#dcfce7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    verifiedText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },

    /* Compare */
    compareRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    compareItem: { flex: 1 },
    compareLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 6,
    },
    compareDot: { width: 8, height: 8, borderRadius: 4 },
    compareLabel: { fontSize: 12, fontWeight: '700', color: c.text },
    compareImg: { width: '100%', height: 160, borderRadius: 10 },
    compareTime: { fontSize: 10, color: c.textMuted, marginTop: 4, textAlign: 'center' },
    compareArrow: {
      paddingHorizontal: 6,
      paddingTop: 24,
    },

    /* CTA */
    ctaBtn: {
      marginTop: 8,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#16a34a',
    },
    ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
