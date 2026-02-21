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
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';

type Route = RouteProp<RootStackParamList, 'DriveDetails'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Drive {
  id: string;
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  radius_km: number;
  start_time: string;
  end_time: string;
  badge_name: string;
  badge_color: string;
  badge_icon: string;
  points_multiplier: number;
  status: string;
  users: { name: string; avatar: string | null };
}

interface RecentCleanup {
  id: string;
  after_image: string;
  after_time: string;
  users: { name: string; avatar: string | null };
}

export default function DriveDetailsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { driveId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [drive, setDrive] = useState<Drive | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [recentCleanups, setRecentCleanups] = useState<RecentCleanup[]>([]);
  const [hasMyBadge, setHasMyBadge] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, [driveId]);

  const fetchAll = async () => {
    setLoading(true);
    const [driveRes, countRes, cleanupRes, badgeRes] = await Promise.all([
      supabase
        .from('drives')
        .select('*, users(name, avatar)')
        .eq('id', driveId)
        .single(),
      supabase
        .from('user_badges')
        .select('id', { count: 'exact', head: true })
        .eq('drive_id', driveId),
      supabase
        .from('cleanup_reports')
        .select('id, after_image, after_time, users(name, avatar)')
        .eq('verified', true)
        .order('after_time', { ascending: false })
        .limit(6),
      user
        ? supabase.from('user_badges').select('id').eq('drive_id', driveId).eq('user_id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (driveRes.data) setDrive(driveRes.data as any);
    setParticipantCount(countRes.count ?? 0);
    if (cleanupRes.data) setRecentCleanups(cleanupRes.data as any);
    setHasMyBadge(!!badgeRes.data);
    setLoading(false);
  };

  if (loading || !drive) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isActive = drive.status === 'active' && new Date(drive.end_time) > new Date();
  const startDate = new Date(drive.start_time).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const endDate = new Date(drive.end_time).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* Drive hero */}
      <View style={[s.hero, { backgroundColor: drive.badge_color + '18', borderColor: drive.badge_color + '44' }]}>
        <View style={[s.heroIconRing, { backgroundColor: drive.badge_color + '20', borderColor: drive.badge_color + '50' }]}>
          <Ionicons name={drive.badge_icon as any} size={36} color={drive.badge_color} />
        </View>
        <Text style={[s.driveTitle, { color: colors.text }]}>{drive.title}</Text>
        {drive.description && (
          <Text style={[s.driveDesc, { color: colors.textSub }]}>{drive.description}</Text>
        )}
        <View style={[s.statusPill, { backgroundColor: isActive ? colors.primary + '22' : colors.textMuted + '22' }]}>
          <View style={[s.statusDot, { backgroundColor: isActive ? colors.primary : colors.textMuted }]} />
          <Text style={[s.statusText, { color: isActive ? colors.primary : colors.textMuted }]}>
            {isActive ? 'Active Drive' : 'Ended'}
          </Text>
        </View>
      </View>

      {/* My badge */}
      {hasMyBadge && (
        <View style={[s.myBadgeBanner, { backgroundColor: drive.badge_color + '18', borderColor: drive.badge_color + '44' }]}>
          <Ionicons name="shield-checkmark" size={18} color={drive.badge_color} />
          <Text style={[s.myBadgeText, { color: drive.badge_color }]}>
            You earned the "{drive.badge_name}" badge!
          </Text>
        </View>
      )}

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Ionicons name="people-outline" size={20} color={colors.primary} />
          <Text style={[s.statValue, { color: colors.text }]}>{participantCount}</Text>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>Participants</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statBox}>
          <Ionicons name="star-outline" size={20} color={colors.warning} />
          <Text style={[s.statValue, { color: colors.text }]}>{drive.points_multiplier}×</Text>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>Pts Multiplier</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statBox}>
          <Ionicons name="locate-outline" size={20} color={colors.info} />
          <Text style={[s.statValue, { color: colors.text }]}>{drive.radius_km} km</Text>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>Zone Radius</Text>
        </View>
      </View>

      {/* Drive period */}
      <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={s.infoRow}>
          <View style={[s.infoIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="calendar-outline" size={17} color={colors.primary} />
          </View>
          <View style={s.infoTextCol}>
            <Text style={[s.infoLabel, { color: colors.textMuted }]}>Drive Period</Text>
            <Text style={[s.infoValue, { color: colors.text }]}>{startDate} → {endDate}</Text>
          </View>
        </View>
        <View style={[s.divider, { backgroundColor: colors.borderFaint }]} />
        <View style={s.infoRow}>
          <View style={[s.infoIconWrap, { backgroundColor: colors.infoBg }]}>
            <Ionicons name="location-outline" size={17} color={colors.info} />
          </View>
          <View style={s.infoTextCol}>
            <Text style={[s.infoLabel, { color: colors.textMuted }]}>Zone Center</Text>
            <Text style={[s.infoValue, { color: colors.text }]}>
              {drive.lat.toFixed(4)}, {drive.lng.toFixed(4)} ({drive.radius_km} km radius)
            </Text>
          </View>
        </View>
        <View style={[s.divider, { backgroundColor: colors.borderFaint }]} />
        <View style={s.infoRow}>
          <View style={[s.infoIconWrap, { backgroundColor: colors.warningBg }]}>
            <Ionicons name="person-outline" size={17} color={colors.warning} />
          </View>
          <View style={s.infoTextCol}>
            <Text style={[s.infoLabel, { color: colors.textMuted }]}>Organized by</Text>
            <Text style={[s.infoValue, { color: colors.text }]}>{(drive as any).users?.name ?? 'City Official'}</Text>
          </View>
        </View>
      </View>

      {/* How to participate */}
      <View style={[s.howCard, { backgroundColor: drive.badge_color + '0d', borderColor: drive.badge_color + '33' }]}>
        <Text style={[s.howTitle, { color: drive.badge_color }]}>How to earn the badge</Text>
        {[
          { icon: 'locate-outline', text: `Be physically inside the ${drive.radius_km} km drive zone` },
          { icon: 'camera-outline', text: 'Submit a verified cleanup (before + after photo)' },
          { icon: 'star-outline', text: `Earn ${drive.points_multiplier}× points automatically` },
          { icon: 'shield-checkmark-outline', text: `"${drive.badge_name}" badge awarded instantly` },
        ].map((row, i) => (
          <View key={i} style={s.howRow}>
            <Ionicons name={row.icon as any} size={15} color={drive.badge_color} />
            <Text style={[s.howText, { color: colors.textSub }]}>{row.text}</Text>
          </View>
        ))}
      </View>

      {/* Recent cleanups */}
      {recentCleanups.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>Recent Cleanups</Text>
          <View style={s.cleanupGrid}>
            {recentCleanups.map((c) => (
              <View key={c.id} style={[s.cleanupCard, { borderColor: colors.border }]}>
                <Image source={{ uri: c.after_image }} style={s.cleanupImg} resizeMode="cover" />
                <View style={[s.cleanupFooter, { backgroundColor: colors.card }]}>
                  <Text style={[s.cleanupUser, { color: colors.text }]} numberOfLines={1}>
                    {(c as any).users?.name ?? 'Volunteer'}
                  </Text>
                  <Text style={[s.cleanupTime, { color: colors.textMuted }]}>
                    {new Date(c.after_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* CTA */}
      {isActive && (
        <TouchableOpacity
          style={[s.ctaBtn, { backgroundColor: drive.badge_color }]}
          onPress={() => navigation.navigate('Tabs')}
          activeOpacity={0.85}
        >
          <Ionicons name="camera-outline" size={18} color="#fff" />
          <Text style={s.ctaBtnText}>Submit a Cleanup in this Zone</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 18, paddingBottom: 48 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
    hero: {
      alignItems: 'center',
      padding: 24,
      borderRadius: 18,
      borderWidth: 1,
      marginBottom: 14,
    },
    heroIconRing: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    driveTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
    driveDesc: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 280 },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      marginTop: 12,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, fontWeight: '700' },
    myBadgeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 14,
    },
    myBadgeText: { fontWeight: '700', fontSize: 13 },
    statsRow: {
      flexDirection: 'row',
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 14,
    },
    statBox: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 },
    statDivider: { width: 1, marginVertical: 12 },
    statValue: { fontSize: 18, fontWeight: '800' },
    statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    infoCard: {
      borderRadius: 14,
      borderWidth: 1,
      overflow: 'hidden',
      marginBottom: 14,
    },
    infoRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
    divider: { height: 1, marginHorizontal: 14 },
    infoIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    infoTextCol: { flex: 1 },
    infoLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    infoValue: { fontSize: 14, fontWeight: '500' },
    howCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 16,
      marginBottom: 14,
      gap: 10,
    },
    howTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
    howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    howText: { flex: 1, fontSize: 13, lineHeight: 18 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    cleanupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    cleanupCard: {
      width: '47%',
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
    },
    cleanupImg: { width: '100%', height: 120 },
    cleanupFooter: { padding: 8 },
    cleanupUser: { fontSize: 12, fontWeight: '600' },
    cleanupTime: { fontSize: 10, marginTop: 1 },
    ctaBtn: {
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
