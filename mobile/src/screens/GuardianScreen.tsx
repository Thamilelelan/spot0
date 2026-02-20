import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type RouteParams = { locationId: string };

export default function GuardianScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { locationId } = route.params as RouteParams;

  const [isGuardian, setIsGuardian] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardianCount, setGuardianCount] = useState(0);

  useEffect(() => {
    checkGuardianStatus();
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
    <View style={styles.container}>
      {/* Hero icon */}
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

      {/* Status */}
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
    </View>
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
});
