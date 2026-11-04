import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../components/ui/Icon';
import { Colors, Layout } from '../../constants/theme';

function tabIcon(name: IconName) {
  function TabIcon({ color }: { color: unknown }) {
    return <Icon name={name} size={24} color={String(color)} />;
  }
  return TabIcon;
}

function EntryIcon() {
  return (
    <View style={styles.fab}>
      <Icon name="plus" size={22} color="#fff" strokeWidth={2.4} />
    </View>
  );
}

const HIDDEN = ['notifications', 'parties', 'reports', 'ai', 'invoice/[id]', 'party/[id]', 'new-invoice', 'employees'];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

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
          height: Layout.tabBarHeight + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'الرئيسية', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="invoices" options={{ title: 'الفواتير', tabBarIcon: tabIcon('file') }} />
      <Tabs.Screen
        name="quick-entry"
        options={{ title: 'إدخال', tabBarIcon: () => <EntryIcon />, tabBarActiveTintColor: Colors.accent }}
      />
      <Tabs.Screen name="approvals" options={{ title: 'موافقات', tabBarIcon: tabIcon('checkSquare') }} />
      <Tabs.Screen name="more" options={{ title: 'المزيد', tabBarIcon: tabIcon('more') }} />
      {HIDDEN.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
