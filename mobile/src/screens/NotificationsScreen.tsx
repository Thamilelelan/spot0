import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { NotificationRow } from '../types';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchNotifications(); }, []);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications').select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setNotifications(data as NotificationRow[]);
    setLoading(false);
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true })
      .eq('user_id', user.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header strip */}
      {unreadCount > 0 && (
        <View style={s.topBar}>
          <Text style={s.topBarLabel}>{unreadCount} unread</Text>
          <TouchableOpacity style={s.markAllBtn} onPress={markAllRead} activeOpacity={0.7}>
            <Ionicons name="checkmark-done-outline" size={14} color={colors.primary} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      {notifications.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="notifications-off-outline" size={36} color={colors.textMuted} />
          </View>
          <Text style={s.emptyTitle}>No notifications yet</Text>
          <Text style={s.emptySub}>You'll see alerts here when your area status changes.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.card, !item.read && s.cardUnread]}
              onPress={() => !item.read && markRead(item.id)}
              activeOpacity={0.7}
            >
              <View style={[s.iconWrap, item.read ? s.iconWrapRead : s.iconWrapUnread]}>
                <Ionicons
                  name={item.read ? 'notifications-outline' : 'notifications'}
                  size={20}
                  color={item.read ? colors.textMuted : colors.primary}
                />
              </View>
              <View style={s.textWrap}>
                <Text style={[s.msg, !item.read && s.msgUnread]} numberOfLines={3}>
                  {item.message}
                </Text>
                <Text style={s.time}>
                  {new Date(item.created_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
              </View>
              {!item.read && <View style={s.unreadDot} />}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: c.bg,
      padding: 32,
      gap: 8,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.borderFaint,
      backgroundColor: c.card,
    },
    topBarLabel: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
    markAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.primaryLight,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    markAllText: { color: c.primary, fontWeight: '600', fontSize: 12 },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 4,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    emptySub: { fontSize: 13, color: c.textSub, textAlign: 'center', lineHeight: 19 },
    list: { padding: 14, gap: 8, paddingBottom: 24 },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    cardUnread: {
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
      backgroundColor: c.card,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconWrapUnread: { backgroundColor: c.primaryLight },
    iconWrapRead: { backgroundColor: c.cardAlt },
    textWrap: { flex: 1 },
    msg: { fontSize: 14, color: c.textSub, lineHeight: 20 },
    msgUnread: { fontWeight: '600', color: c.text },
    time: { fontSize: 11, color: c.textMuted, marginTop: 5 },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.primary,
      marginTop: 4,
    },
  });
}
