import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeColors } from '../context/ThemeContext';

type RouteParams = { locationId: string };

interface GuardianUser {
  user_id: string;
  name: string;
  avatar: string | null;
  subscribed_at: string;
}

export default function GuardianScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { locationId } = route.params as RouteParams;
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [isGuardian, setIsGuardian] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardianCount, setGuardianCount] = useState(0);
  const [guardianSlots, setGuardianSlots] = useState(3);
  const [guardianList, setGuardianList] = useState<GuardianUser[]>([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [locRes, guardRes] = await Promise.all([
      supabase.from('locations').select('guardian_slots').eq('id', locationId).single(),
      supabase.from('guardians')
        .select('user_id, subscribed_at, users(name, avatar)')
        .eq('location_id', locationId)
        .order('subscribed_at', { ascending: true }),
    ]);

    if (locRes.data) setGuardianSlots(locRes.data.guardian_slots ?? 3);

    if (guardRes.data) {
      const list: GuardianUser[] = (guardRes.data as any[]).map((g) => ({
        user_id: g.user_id,
        name: g.users?.name ?? 'Volunteer',
        avatar: g.users?.avatar ?? null,
        subscribed_at: g.subscribed_at,
      }));
      setGuardianList(list);
      setGuardianCount(list.length);
      setIsGuardian(list.some((g) => g.user_id === user.id));
    }
    setLoading(false);
  };

  const toggleGuardian = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (isGuardian) {
        const { error } = await supabase.from('guardians').delete()
          .eq('user_id', user.id).eq('location_id', locationId);
        if (error) throw error;
        setIsGuardian(false);
        setGuardianList((prev) => prev.filter((g) => g.user_id !== user.id));
        setGuardianCount((c) => Math.max(0, c - 1));
        Alert.alert('Unsubscribed', 'You are no longer a Guardian for this location.');
      } else {
        if (guardianCount >= guardianSlots) {
          Alert.alert('Slots full', `This location has reached its limit of ${guardianSlots} guardians.`);
          return;
        }
        const { error } = await supabase.from('guardians')
          .insert({ user_id: user.id, location_id: locationId });
        if (error) throw error;
        setIsGuardian(true);
        const { data: me } = await supabase.from('users').select('name, avatar').eq('id', user.id).single();
        setGuardianList((prev) => [
          ...prev,
          { user_id: user.id, name: (me as any)?.name ?? 'You', avatar: (me as any)?.avatar ?? null, subscribed_at: new Date().toISOString() },
        ]);
        setGuardianCount((c) => c + 1);
        Alert.alert('Subscribed!', 'You will be notified whenever this area becomes dirty again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const slotsFull = guardianCount >= guardianSlots;
  const filledFraction = Math.min(guardianCount / guardianSlots, 1);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={s.hero}>
        <View style={s.heroIconRing}>
          <Ionicons name="shield" size={40} color={colors.primary} />
        </View>
        <Text style={s.heroTitle}>Guardian Mode</Text>
        <Text style={s.heroSub}>
          Subscribe to this location and get notified whenever it becomes dirty again.
        </Text>
      </View>

      {/* Slot progress */}
      <View style={[s.slotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={s.slotHeader}>
          <Text style={[s.slotLabel, { color: colors.text }]}>Guardian Slots</Text>
          <Text style={[s.slotCount, { color: slotsFull ? colors.danger : colors.primary }]}>
            {guardianCount} / {guardianSlots}
          </Text>
        </View>
        <View style={[s.progressTrack, { backgroundColor: colors.borderFaint }]}>
          <View
            style={[
              s.progressFill,
              {
                width: `${filledFraction * 100}%` as any,
                backgroundColor: slotsFull ? colors.danger : colors.primary,
              },
            ]}
          />
        </View>
        <Text style={[s.slotSub, { color: colors.textMuted }]}>
          {slotsFull
            ? 'All guardian slots are filled for this location'
            : `${guardianSlots - guardianCount} slot${guardianSlots - guardianCount !== 1 ? 's' : ''} still available`}
        </Text>
      </View>

      {/* Status chip */}
      <View style={[s.statusChip, isGuardian ? s.chipActive : s.chipInactive]}>
        <Ionicons
          name={isGuardian ? 'shield-checkmark' : 'shield-outline'}
          size={16}
          color={isGuardian ? colors.primary : colors.textMuted}
        />
        <Text style={[s.chipText, { color: isGuardian ? colors.primary : colors.textMuted }]}>
          {isGuardian ? 'You are a Guardian for this location' : 'Not subscribed yet'}
        </Text>
      </View>

      {/* Toggle button */}
      <TouchableOpacity
        style={[s.btn, isGuardian ? s.btnDanger : slotsFull ? s.btnDisabled : s.btnPrimary]}
        onPress={toggleGuardian}
        disabled={saving || (slotsFull && !isGuardian)}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons
              name={isGuardian ? 'shield-checkmark-outline' : 'shield-outline'}
              size={19}
              color="#fff"
            />
            <Text style={s.btnText}>
              {isGuardian ? 'Unsubscribe as Guardian' : slotsFull ? 'Slots Full' : 'Become a Guardian'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Guardian list */}
      {guardianList.length > 0 && (
        <View style={[s.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.listTitle, { color: colors.text }]}>Current Guardians</Text>
          {guardianList.map((g, i) => (
            <View key={g.user_id} style={[s.listRow, i < guardianList.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderFaint }]}>
              {g.avatar
                ? <Image source={{ uri: g.avatar }} style={s.listAvatar} />
                : <View style={[s.listAvatarFallback, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[s.listAvatarInitial, { color: colors.primary }]}>{g.name.charAt(0).toUpperCase()}</Text>
                  </View>}
              <View style={{ flex: 1 }}>
                <Text style={[s.listName, { color: colors.text }]}>
                  {g.name}{g.user_id === user?.id ? ' (you)' : ''}
                </Text>
                <Text style={[s.listSub, { color: colors.textMuted }]}>
                  Since {new Date(g.subscribed_at).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
            </View>
          ))}
        </View>
      )}

      {/* Info rows */}
      <View style={[s.featureCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          { icon: 'notifications-outline', text: 'Push notification when status changes to dirty' },
          { icon: 'shield-checkmark-outline', text: 'No obligation — just stay informed' },
        ].map((f, i) => (
          <View key={i} style={[s.featureRow, i === 0 && { borderBottomWidth: 1, borderBottomColor: colors.borderFaint }]}>
            <View style={[s.featureIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name={f.icon as any} size={18} color={colors.primary} />
            </View>
            <Text style={[s.featureText, { color: colors.textSub }]}>{f.text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back-outline" size={14} color={colors.primary} />
        <Text style={[s.backText, { color: colors.primary }]}>Back to Map</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.bg },
    container: { padding: 24, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
    hero: { alignItems: 'center', marginBottom: 22 },
    heroIconRing: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: c.primaryLight,
      borderWidth: 2,
      borderColor: c.primaryMid,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    heroTitle: { fontSize: 24, fontWeight: '800', color: c.text },
    heroSub: {
      fontSize: 14,
      color: c.textSub,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 20,
      maxWidth: 280,
    },
    slotCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      marginBottom: 14,
    },
    slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    slotLabel: { fontSize: 14, fontWeight: '700' },
    slotCount: { fontSize: 15, fontWeight: '800' },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressFill: { height: 8, borderRadius: 4 },
    slotSub: { fontSize: 12 },
    featureCard: {
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 14,
      overflow: 'hidden',
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },
    featureIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    featureText: { flex: 1, fontSize: 14, lineHeight: 19 },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
    },
    chipActive: {
      backgroundColor: c.primaryLight,
      borderColor: c.primaryMid,
    },
    chipInactive: {
      backgroundColor: c.cardAlt,
      borderColor: c.border,
    },
    chipText: { fontWeight: '600', fontSize: 14 },
    btn: {
      borderRadius: 13,
      paddingVertical: 15,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    btnPrimary: { backgroundColor: c.primary },
    btnDanger: { backgroundColor: c.danger },
    btnDisabled: { backgroundColor: c.textMuted },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    listCard: {
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 14,
      overflow: 'hidden',
    },
    listTitle: { fontSize: 14, fontWeight: '700', padding: 14, paddingBottom: 10 },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    listAvatar: { width: 36, height: 36, borderRadius: 18 },
    listAvatarFallback: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listAvatarInitial: { fontSize: 16, fontWeight: '700' },
    listName: { fontSize: 14, fontWeight: '600' },
    listSub: { fontSize: 11, marginTop: 1 },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      gap: 5,
    },
    backText: { fontWeight: '600', fontSize: 14 },
  });
}
