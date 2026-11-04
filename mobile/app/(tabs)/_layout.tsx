import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Colors } from '../../constants/theme';

function Icon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={[styles.icon, { color }]}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.line,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color }) => <Icon glyph="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: 'الفواتير',
          tabBarIcon: ({ color }) => <Icon glyph="📄" color={color} />,
        }}
      />
      <Tabs.Screen
        name="quick-entry"
        options={{
          title: 'إدخال',
          tabBarIcon: ({ color }) => <Icon glyph="＋" color={color} />,
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: 'موافقات',
          tabBarIcon: ({ color }) => <Icon glyph="✓" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'المزيد',
          tabBarIcon: ({ color }) => <Icon glyph="⋯" color={color} />,
        }}
      />
      {/* Hidden from tab bar — accessible via navigation */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="parties" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="ai" options={{ href: null }} />
      <Tabs.Screen name="invoice/[id]" options={{ href: null }} />
      <Tabs.Screen name="party/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 20 },
});
