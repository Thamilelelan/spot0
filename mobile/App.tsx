import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { NavigationContainerRef } from '@react-navigation/native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotifications } from './src/lib/notifications';

// ─── Inner component so we can consume AuthContext ────────────────────────────
function AppInner() {
  const { user } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    if (user) {
      registerForPushNotifications(user.id);
    }

    // Handle notification received while app is open
    try {
      notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
        console.log('Notification received:', notification);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
        console.log('Notification tapped:', response);
      });
    } catch {
      // Expo Go SDK 53+ does not support notification listeners
    }

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user]);

  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </AuthProvider>
  );
}
