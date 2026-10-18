// ─────────────────────────────────────────────────────────────
// Tabs layout — themed tab bar
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  // Simple emoji icons — swap for @expo/vector-icons in Phase 5+
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const { theme } = useThemeStore();
  const c = theme.colors;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: c.tabActive,
        tabBarInactiveTintColor: c.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏫" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
