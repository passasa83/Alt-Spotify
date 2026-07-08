import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize } from '../utils/theme';
import type { MainTabParamList } from './types';

import HomeScreen from '../screens/main/HomeScreen';
import SearchScreen from '../screens/main/SearchScreen';
import LibraryScreen from '../screens/main/LibraryScreen';
import PodcastsScreen from '../screens/main/PodcastsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<keyof MainTabParamList, { focused: string; default: string }> = {
  HomeTab: { focused: 'home', default: 'home-outline' },
  SearchTab: { focused: 'search', default: 'search-outline' },
  LibraryTab: { focused: 'library', default: 'library-outline' },
  PodcastsTab: { focused: 'headset', default: 'headset-outline' },
  ProfileTab: { focused: 'person', default: 'person-outline' },
};

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = tabIcons[route.name];
          const iconName = focused ? icons.focused : icons.default;
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 85,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="SearchTab" component={SearchScreen} options={{ tabBarLabel: 'Search' }} />
      <Tab.Screen name="LibraryTab" component={LibraryScreen} options={{ tabBarLabel: 'Library' }} />
      <Tab.Screen name="PodcastsTab" component={PodcastsScreen} options={{ tabBarLabel: 'Podcasts' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}
