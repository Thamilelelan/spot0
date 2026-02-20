import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Reward {
  id: string;
  title: string;
  points_required: number;
  merchant_name: string;
  merchant_location: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function RewardsScreen() {
  const { profile } = useAuth();

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  // ─── Fetch rewards on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetchRewards();
  }, []);

  const fetchRewards = async () => {
    setLoading(true);
    try {
      const data = await apiGet<Reward[]>('/rewards', false); // public endpoint
      setRewards(data);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not load rewards');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render a single reward card ──────────────────────────────────────────
  const renderReward = ({ item }: { item: Reward }) => {
    const canAfford = (profile?.total_points ?? 0) >= item.points_required;

    return (
      <View style={styles.card}>
        {/* Left: icon */}
        <View style={[styles.iconWrap, !canAfford && styles.iconWrapDisabled]}>
          <Ionicons name="gift" size={26} color={canAfford ? '#16a34a' : '#94a3b8'} />
        </View>

        {/* Middle: info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardMerchant} numberOfLines={1}>
            <Ionicons name="storefront-outline" size={12} color="#94a3b8" />{' '}
            {item.merchant_name}
          </Text>
          {item.merchant_location ? (
            <Text style={styles.cardLocation} numberOfLines={1}>
              <Ionicons name="location-outline" size={11} color="#cbd5e1" />{' '}
              {item.merchant_location}
            </Text>
          ) : null}
        </View>

        {/* Right: points */}
        <View style={styles.cardRight}>
          <View style={[styles.ptsBadge, !canAfford && styles.ptsBadgeDisabled]}>
            <Text style={[styles.ptsNum, !canAfford && styles.ptsNumDisabled]}>
              {item.points_required}
            </Text>
            <Text style={[styles.ptsSub, !canAfford && styles.ptsSubDisabled]}>pts</Text>
          </View>
        </View>
      </View>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Points balance banner */}
      <View style={styles.balanceBanner}>
        <View>
          <Text style={styles.balanceLabel}>Your Points</Text>
          <Text style={styles.balanceValue}>{profile?.total_points ?? 0} pts</Text>
        </View>
        <View style={styles.balanceIcon}>
          <Ionicons name="star" size={22} color="#f59e0b" />
        </View>
      </View>

      {/* Rewards list */}
      {rewards.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="gift-outline" size={52} color="#cbd5e1" />
          <Text style={styles.emptyText}>No rewards available</Text>
          <Text style={styles.emptySub}>Check back soon!</Text>
        </View>
      ) : (
        <FlatList
          data={rewards}
          keyExtractor={(r) => r.id}
          renderItem={renderReward}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Balance banner
  balanceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  balanceLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '500', marginBottom: 2 },
  balanceValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  balanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // List
  list: { padding: 16, gap: 12 },

  // Reward card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapDisabled: { backgroundColor: '#f1f5f9' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 3 },
  cardMerchant: { fontSize: 12, color: '#64748b', fontWeight: '500', marginBottom: 2 },
  cardLocation: { fontSize: 11, color: '#94a3b8' },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  ptsBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 2,
  },
  ptsBadgeDisabled: { backgroundColor: '#f1f5f9' },
  ptsNum: { fontSize: 15, fontWeight: '800', color: '#16a34a' },
  ptsNumDisabled: { color: '#94a3b8' },
  ptsSub: { fontSize: 10, fontWeight: '600', color: '#16a34a' },
  ptsSubDisabled: { color: '#94a3b8' },
  // Empty state
  emptyText: { fontSize: 16, fontWeight: '600', color: '#475569', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
});
