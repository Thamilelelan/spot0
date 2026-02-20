import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Reward {
  id: string;
  title: string;
  points_required: number;
  merchant_name: string;
  merchant_location: string;
}

interface RedeemResult {
  qr_token: string;
  reward_title: string;
  points_required: number;
  expires_in: number; // seconds
  message: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function RewardsScreen() {
  const { profile, refreshProfile } = useAuth();

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null); // reward id being redeemed

  // QR modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [activeToken, setActiveToken] = useState<RedeemResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // ─── Redeem a reward ──────────────────────────────────────────────────────
  const handleRedeem = async (reward: Reward) => {
    if (!profile) {
      Alert.alert('Not logged in', 'Please log in to redeem rewards');
      return;
    }
    if ((profile.total_points ?? 0) < reward.points_required) {
      Alert.alert(
        'Not enough points',
        `You need ${reward.points_required} pts. You have ${profile.total_points ?? 0} pts.`
      );
      return;
    }

    Alert.alert(
      'Redeem Reward',
      `Redeem "${reward.title}" for ${reward.points_required} pts?\n\nPoints are deducted when the merchant scans your code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Get Code',
          onPress: async () => {
            setRedeeming(reward.id);
            try {
              const result = await apiPost<RedeemResult>(
                `/redeem/${reward.id}`,
                {}
              );
              openTokenModal(result);
            } catch (err: any) {
              Alert.alert('Redemption failed', err.message ?? 'Try again');
            } finally {
              setRedeeming(null);
            }
          },
        },
      ]
    );
  };

  // ─── Open QR modal + start countdown ─────────────────────────────────────
  const openTokenModal = (result: RedeemResult) => {
    setActiveToken(result);
    setSecondsLeft(result.expires_in);
    setModalVisible(true);

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ─── Close modal + cleanup ────────────────────────────────────────────────
  const closeModal = () => {
    setModalVisible(false);
    setActiveToken(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    refreshProfile(); // refresh points balance in case merchant already confirmed
  };

  // ─── Countdown display ────────────────────────────────────────────────────
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isExpired = secondsLeft === 0;

  // ─── Token display helpers ────────────────────────────────────────────────
  // Show token in groups of 8 for readability
  const formatToken = (token: string) =>
    token.match(/.{1,8}/g)?.join(' ') ?? token;

  // ─── Render a single reward card ──────────────────────────────────────────
  const renderReward = ({ item }: { item: Reward }) => {
    const canAfford = (profile?.total_points ?? 0) >= item.points_required;
    const isLoading = redeeming === item.id;

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

        {/* Right: points + button */}
        <View style={styles.cardRight}>
          <View style={[styles.ptsBadge, !canAfford && styles.ptsBadgeDisabled]}>
            <Text style={[styles.ptsNum, !canAfford && styles.ptsNumDisabled]}>
              {item.points_required}
            </Text>
            <Text style={[styles.ptsSub, !canAfford && styles.ptsSubDisabled]}>pts</Text>
          </View>
          <TouchableOpacity
            style={[styles.redeemBtn, !canAfford && styles.redeemBtnDisabled]}
            onPress={() => handleRedeem(item)}
            disabled={!canAfford || isLoading}
            activeOpacity={0.75}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.redeemBtnText}>
                {canAfford ? 'Redeem' : 'Need more'}
              </Text>
            )}
          </TouchableOpacity>
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

      {/* ── QR Token Modal ───────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Your Redemption Code</Text>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={26} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Reward title */}
            {activeToken && (
              <Text style={styles.modalRewardTitle}>{activeToken.reward_title}</Text>
            )}

            {/* Countdown ring + time */}
            <View style={styles.countdownWrap}>
              <View style={[styles.countdownRing, isExpired && styles.countdownRingExpired]}>
                <Text style={[styles.countdownText, isExpired && styles.countdownExpiredText]}>
                  {isExpired ? 'EXPIRED' : formatTime(secondsLeft)}
                </Text>
                {!isExpired && (
                  <Text style={styles.countdownSub}>remaining</Text>
                )}
              </View>
            </View>

            {isExpired ? (
              <View style={styles.expiredBox}>
                <Ionicons name="warning-outline" size={20} color="#ef4444" />
                <Text style={styles.expiredText}>
                  This code has expired. Please redeem again.
                </Text>
              </View>
            ) : (
              <>
                {/* Token display */}
                <Text style={styles.tokenLabel}>Show this code to the merchant:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tokenBox}>
                    <Text style={styles.tokenText} selectable>
                      {activeToken ? formatToken(activeToken.qr_token) : ''}
                    </Text>
                  </View>
                </ScrollView>

                {/* Instruction */}
                <View style={styles.instructionRow}>
                  <Ionicons name="information-circle-outline" size={16} color="#64748b" />
                  <Text style={styles.instructionText}>
                    {activeToken?.message ?? 'Show to merchant for confirmation'}
                  </Text>
                </View>

                {/* Points note */}
                <Text style={styles.pointsNote}>
                  {activeToken?.points_required} pts will be deducted after merchant confirms
                </Text>
              </>
            )}

            <TouchableOpacity style={styles.doneBtn} onPress={closeModal}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  redeemBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 80,
    alignItems: 'center',
  },
  redeemBtnDisabled: { backgroundColor: '#e2e8f0' },
  redeemBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Empty state
  emptyText: { fontSize: 16, fontWeight: '600', color: '#475569', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 4 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  modalRewardTitle: {
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },

  // Countdown
  countdownWrap: { alignItems: 'center', marginBottom: 20 },
  countdownRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    borderColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
  },
  countdownRingExpired: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  countdownText: { fontSize: 26, fontWeight: '800', color: '#16a34a' },
  countdownExpiredText: { color: '#ef4444', fontSize: 18 },
  countdownSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  // Expired
  expiredBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  expiredText: { flex: 1, color: '#ef4444', fontSize: 13, fontWeight: '500' },

  // Token
  tokenLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  tokenBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    alignSelf: 'center',
    minWidth: '100%',
  },
  tokenText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  // Instruction
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 6,
  },
  instructionText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 18 },
  pointsNote: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 4,
  },

  // Done button
  doneBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
