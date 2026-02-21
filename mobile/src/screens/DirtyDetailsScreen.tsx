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
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteParams = { locationId: string; lat: number; lng: number };

interface ReportWithUser {
  id: string;
  user_id: string;
  location_id: string;
  photo_url: string;
  created_at: string;
  user_name: string;
  user_avatar: string | null;
}

export default function DirtyDetailsScreen() {
  const route = useRoute();
  const navigation = useNavigation<Nav>();
  const { locationId, lat, lng } = route.params as RouteParams;
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [reports, setReports] = useState<ReportWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationStatus, setLocationStatus] = useState<string>('pending');

  useEffect(() => {
    fetchReports();
    fetchLocationStatus();
  }, []);

  const fetchLocationStatus = async () => {
    const { data } = await supabase
      .from('locations')
      .select('status')
      .eq('id', locationId)
      .single();
    if (data) setLocationStatus(data.status);
  };

  const fetchReports = async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('dirty_reports')
      .select('id, user_id, location_id, photo_url, created_at, users(name, avatar)')
      .eq('location_id', locationId)
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (data) {
      setReports(
        data.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          location_id: r.location_id,
          photo_url: r.photo_url,
          created_at: r.created_at,
          user_name: r.users?.name ?? 'Anonymous',
          user_avatar: r.users?.avatar ?? null,
        })),
      );
    }
    setLoading(false);
  };

  const uniqueUsers = new Set(reports.map((r) => r.user_id)).size;
  const remaining = Math.max(0, 3 - uniqueUsers);
  const reached = uniqueUsers >= 3;
  const alreadyReported = reports.some((r) => r.user_id === user?.id);

  // Progress bar segments
  const segments = [0, 1, 2];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ── Header card ─────────────────────────────────────────── */}
      <View style={[s.headerCard, reached ? s.headerCardDirty : s.headerCardPending]}>
        <View style={s.headerTop}>
          <View style={[s.statusBadge, { backgroundColor: reached ? colors.danger : colors.warning }]}>
            <Ionicons name={reached ? 'warning' : 'time-outline'} size={14} color="#fff" />
            <Text style={s.statusBadgeText}>
              {reached ? 'Confirmed Dirty' : 'Pending Verification'}
            </Text>
          </View>
          <View style={s.coordPill}>
            <Ionicons name="location-outline" size={11} color={colors.textMuted} />
            <Text style={s.coordText}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressSection}>
          <Text style={s.progressLabel}>Reports needed</Text>
          <View style={s.progressBar}>
            {segments.map((i) => (
              <View
                key={i}
                style={[
                  s.progressSegment,
                  i < uniqueUsers
                    ? { backgroundColor: reached ? colors.danger : colors.warning }
                    : { backgroundColor: colors.border },
                  i === 0 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
                  i === 2 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
                ]}
              />
            ))}
          </View>
          <Text style={[s.progressCount, { color: reached ? colors.danger : colors.warning }]}>
            {uniqueUsers} / 3 unique reports
          </Text>
        </View>

        {/* Status message */}
        {reached ? (
          <View style={s.statusMsg}>
            <Ionicons name="alert-circle" size={16} color={colors.dangerDark} />
            <Text style={[s.statusMsgText, { color: colors.dangerDark }]}>
              3+ users confirmed — this area needs cleanup!
            </Text>
          </View>
        ) : (
          <View style={s.statusMsg}>
            <Ionicons name="people-outline" size={16} color={colors.warningDark} />
            <Text style={[s.statusMsgText, { color: colors.warningDark }]}>
              {remaining} more {remaining === 1 ? 'person needs' : 'people need'} to verify within 24h
            </Text>
          </View>
        )}
      </View>

      {/* ── Evidence section ────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.danger} style={{ marginTop: 48 }} />
      ) : reports.length === 0 ? (
        <View style={s.emptyWrap}>
          <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
          <Text style={s.emptyTitle}>No reports yet</Text>
          <Text style={s.emptyMsg}>Be the first to report this location as dirty.</Text>
        </View>
      ) : (
        <>
          <Text style={s.sectionHeader}>
            Evidence Reports ({reports.length})
          </Text>
          {reports.map((r, i) => (
            <TouchableOpacity
              key={r.id}
              style={s.reportCard}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('PublicProfile', { userId: r.user_id })}
            >
              {/* Photo */}
              <Image source={{ uri: r.photo_url }} style={s.reportPhoto} resizeMode="cover" />

              {/* Report number badge */}
              <View style={[s.reportNumberBadge, {
                backgroundColor: i < 3 && reached ? colors.danger : colors.warning,
              }]}>
                <Text style={s.reportNumberText}>#{i + 1}</Text>
              </View>

              {/* Info bar */}
              <View style={s.reportInfo}>
                <View style={s.reportUser}>
                  {r.user_avatar ? (
                    <Image source={{ uri: r.user_avatar }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatarPlaceholder, { backgroundColor: colors.border }]}>
                      <Ionicons name="person" size={12} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.userName} numberOfLines={1}>{r.user_name}</Text>
                    <Text style={s.reportTime}>
                      {new Date(r.created_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
                <View style={s.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
                  <Text style={s.verifiedText}>Verified</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* ── CTA buttons ──────────────────────────────────────────── */}
      {reached && (
        <TouchableOpacity
          style={[s.ctaBtn, { backgroundColor: '#16a34a' }]}
          onPress={() => navigation.navigate('CleanSpot', { locationId, lat, lng })}
          activeOpacity={0.85}
        >
          <Ionicons name="sparkles-outline" size={18} color="#fff" />
          <Text style={s.ctaBtnText}>Clean This Spot</Text>
        </TouchableOpacity>
      )}

      {alreadyReported ? (
        <View style={[s.ctaBtn, s.ctaBtnDisabled]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.textMuted} />
          <Text style={[s.ctaBtnText, { color: colors.textMuted }]}>
            You've already reported this location today
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[s.ctaBtn, { backgroundColor: colors.danger }]}
          onPress={() => navigation.navigate('DirtyReport', { locationId, lat, lng })}
          activeOpacity={0.85}
        >
          <Ionicons name="camera-outline" size={18} color="#fff" />
          <Text style={s.ctaBtnText}>
            {reports.length === 0 ? 'Report This Location as Dirty' : 'Add Your Verification Report'}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48 },

    /* ── Header card ─────────────────────────────── */
    headerCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
    },
    headerCardPending: {
      backgroundColor: c.warningBg,
      borderColor: c.warning + '33',
    },
    headerCardDirty: {
      backgroundColor: c.dangerBg,
      borderColor: c.danger + '33',
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

    /* ── Progress bar ────────────────────────────── */
    progressSection: { marginBottom: 12 },
    progressLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    progressBar: {
      flexDirection: 'row',
      gap: 3,
      height: 10,
      marginBottom: 6,
    },
    progressSegment: {
      flex: 1,
      height: 10,
    },
    progressCount: {
      fontSize: 13,
      fontWeight: '700',
    },

    /* ── Status message ──────────────────────────── */
    statusMsg: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusMsgText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500' },

    /* ── Empty state ─────────────────────────────── */
    emptyWrap: { alignItems: 'center', marginTop: 48, gap: 8 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    emptyMsg: { fontSize: 13, color: c.textMuted, textAlign: 'center' },

    /* ── Section header ──────────────────────────── */
    sectionHeader: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
      marginBottom: 12,
    },

    /* ── Report card ─────────────────────────────── */
    reportCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 14,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    reportPhoto: {
      width: '100%',
      height: 200,
    },
    reportNumberBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    reportNumberText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 12,
    },
    reportInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
    },
    reportUser: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    avatarPlaceholder: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    userName: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    reportTime: {
      fontSize: 11,
      color: c.textMuted,
    },
    verifiedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: c.primaryLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    verifiedText: {
      fontSize: 10,
      fontWeight: '700',
      color: c.primary,
    },

    /* ── CTA ─────────────────────────────────────── */
    ctaBtn: {
      marginTop: 20,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    ctaBtnDisabled: {
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    ctaBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },
  });
}
