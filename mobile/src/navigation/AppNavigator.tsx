import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import MapScreen from '../screens/MapScreen';
import SubmitCleanupScreen from '../screens/SubmitCleanupScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RewardsScreen from '../screens/RewardsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import DirtyReportScreen from '../screens/DirtyReportScreen';
import DirtyDetailsScreen from '../screens/DirtyDetailsScreen';
import GuardianScreen from '../screens/GuardianScreen';

export type RootStackParamList = {
  Tabs: undefined;
  DirtyReport: { locationId: string; lat: number; lng: number };
  DirtyDetails: { locationId: string; lat: number; lng: number };
  Guardian: { locationId: string };
  Notifications: undefined;
};

export type TabParamList = {
  Home: undefined;
  Map: undefined;
  Submit: undefined;
  Leaderboard: undefined;
  Rewards: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, { active: string; inactive: string }> = {
            Home: { active: 'home', inactive: 'home-outline' },
            Map: { active: 'map', inactive: 'map-outline' },
            Submit: { active: 'camera', inactive: 'camera-outline' },
            Leaderboard: { active: 'trophy', inactive: 'trophy-outline' },
            Rewards: { active: 'gift', inactive: 'gift-outline' },
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
        tabBarActiveTintColor: '#16a34a',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
          backgroundColor: '#fff',
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerStyle: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' } as any,
        headerTintColor: '#0f172a',
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Cleanliness Map' }} />
      <Tab.Screen
        name="Submit"
        component={SubmitCleanupScreen}
        options={{ title: 'Submit Cleanup' }}
      />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
      <Tab.Screen name="Rewards" component={RewardsScreen} options={{ title: 'Rewards' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  if (!session) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={LoginScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
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
          name="Guardian"
          component={GuardianScreen}
          options={{ title: 'Guardian Mode', headerStyle: { backgroundColor: '#16a34a' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications', headerStyle: { backgroundColor: '#16a34a' }, headerTintColor: '#fff' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
