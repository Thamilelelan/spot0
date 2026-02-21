import React from 'react';
import { useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ProfileBody } from './ProfileScreen';
import { useAuth } from '../context/AuthContext';

type Route = RouteProp<RootStackParamList, 'PublicProfile'>;

export default function PublicProfileScreen() {
  const route = useRoute<Route>();
  const { userId } = route.params;
  const { user } = useAuth();
  return <ProfileBody userId={userId} isOwn={userId === user?.id} />;
}

