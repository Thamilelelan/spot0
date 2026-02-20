import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Registers for push notifications and saves the Expo push token.
 *
 * NOTE: Remote push notifications are NOT supported in Expo Go from SDK 53+.
 * This function will silently skip token registration when running in Expo Go.
 * For the hackathon demo, all other app features (map, cleanup, leaderboard) work fine.
 * Push notifications will work once you build a development build or production APK.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications: skipped (not a physical device)');
    return null;
  }

  // Android requires a notification channel (local notifications still work in Expo Go)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('guardian-alerts', {
      name: 'Guardian Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#16a34a',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notifications: permission denied');
    return null;
  }

  try {
    // getExpoPushTokenAsync will throw in Expo Go (SDK 53+) — catch silently
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId: 'YOUR_EXPO_PROJECT_ID', // Replace with your project ID from expo.dev
      })
    ).data;

    await supabase
      .from('users')
      .update({ expo_push_token: token })
      .eq('id', userId);

    return token;
  } catch (err) {
    // Expected in Expo Go — push tokens require a development build or EAS build
    console.log('Push token registration skipped (Expo Go limitation in SDK 53+)');
    return null;
  }
}

// Configure how notifications appear while the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

