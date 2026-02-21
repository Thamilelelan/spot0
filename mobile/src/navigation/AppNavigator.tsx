import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import MapScreen from '../screens/MapScreen';
import SubmitCleanupScreen from '../screens/SubmitCleanupScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import DirtyReportScreen from '../screens/DirtyReportScreen';
import DirtyDetailsScreen from '../screens/DirtyDetailsScreen';
import GuardianScreen from '../screens/GuardianScreen';
import CommunityScreen from '../screens/CommunityScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import DriveDetailsScreen from '../screens/DriveDetailsScreen';
import CleanedReportScreen from '../screens/CleanedReportScreen';

export type RootStackParamList = {
  Tabs: undefined;
  DirtyReport: { locationId: string; lat: number; lng: number };
  DirtyDetails: { locationId: string; lat: number; lng: number };
  CleanSpot: { locationId: string; lat: number; lng: number };
  CleanedReport: { locationId: string; lat: number; lng: number };
  Guardian: { locationId: string };
  Notifications: undefined;
  PublicProfile: { userId: string };
  DriveDetails: { driveId: string };
};

export type TabParamList = {
  Home: undefined;
  Map: undefined;
  Submit: undefined;
  Community: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabNavigator() {
  const { colors, isDark } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, { active: string; inactive: string }> = {
            Home: { active: 'home', inactive: 'home-outline' },
            Map: { active: 'map', inactive: 'map-outline' },
            Submit: { active: 'camera', inactive: 'camera-outline' },
            Community: { active: 'people', inactive: 'people-outline' },
            Profile: { active: 'person', inactive: 'person-outline' },
          };
          const icon = icons[route.name];
          return (
            <Ionicons
              name={(focused ? icon?.active : icon?.inactive) as any}
              size={size}
              color={color}
            />
          );
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.tabBar,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.headerBg, borderBottomWidth: 1, borderBottomColor: colors.border } as any,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'SpotZero' }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
      <Tab.Screen
        name="Submit"
        component={SubmitCleanupScreen}
        options={{ title: 'Submit Cleanup' }}
      />
      <Tab.Screen name="Community" component={CommunityScreen} options={{ title: 'Community' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, loading } = useAuth();
  const { isDark } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  if (!session) {
    return (
      <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={LoginScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
        <Stack.Screen
          name="DirtyReport"
          component={DirtyReportScreen}
          options={{ title: 'Report Dirty Location', headerStyle: { backgroundColor: '#16a34a' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="DirtyDetails"
          component={DirtyDetailsScreen}
          options={{ title: 'Dirty Reports', headerStyle: { backgroundColor: '#ef4444' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="CleanSpot"
          component={SubmitCleanupScreen}
          options={{ title: 'Clean This Spot', headerStyle: { backgroundColor: '#16a34a' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="CleanedReport"
          component={CleanedReportScreen}
          options={{ title: 'Cleanup Report', headerStyle: { backgroundColor: '#3b82f6' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Guardian"
          component={GuardianScreen}
          options={{ title: 'Guardian Mode', headerStyle: { backgroundColor: '#16a34a' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="PublicProfile"
          component={PublicProfileScreen}
          options={{ title: 'Profile', headerStyle: { backgroundColor: isDark ? '#1e293b' : '#fff' }, headerTintColor: isDark ? '#f1f5f9' : '#0f172a' }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications', headerStyle: { backgroundColor: '#16a34a' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="DriveDetails"
          component={DriveDetailsScreen}
          options={({ route }) => ({
            title: 'Drive Details',
            headerStyle: { backgroundColor: isDark ? '#101827' : '#fff' },
            headerTintColor: isDark ? '#e2e8f0' : '#0f172a',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
