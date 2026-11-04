import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuickActionsSheet } from '../../components/QuickActionsSheet';
import { Icon, IconName } from '../../components/ui/Icon';
import { Colors, Layout } from '../../constants/theme';
import { useAuth } from '../../lib/AuthContext';
import { t, useI18n } from '../../lib/i18n';
import { useStyles, useTheme } from '../../lib/theme';

function tabIcon(name: IconName) {
  function TabIcon({ color }: { color: unknown }) {
    return <Icon name={name} size={24} color={String(color)} />;
  }
  return TabIcon;
}

function EntryIcon() {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.fab}>
      <Icon name="plus" size={22} color="#fff" strokeWidth={2.4} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { activeOrganizationId } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  useTheme();
  useI18n();

  return (
    <>
      <Tabs
        key={activeOrganizationId ?? 'none'}
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
        <Tabs.Screen name="index" options={{ title: t('الرئيسية'), tabBarIcon: tabIcon('home') }} />
        <Tabs.Screen name="invoices" options={{ title: t('الفواتير'), tabBarIcon: tabIcon('file') }} />
        <Tabs.Screen
          name="quick-entry"
          options={{
            title: t('إضافة'),
            tabBarIcon: () => <EntryIcon />,
            tabBarIconStyle: { width: 42, height: 42, marginTop: -8 },
            tabBarButton: (props) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('إضافة سريعة')}
                onPress={() => setSheetOpen(true)}
                style={props.style}
              >
                {props.children}
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen name="approvals" options={{ title: t('موافقات'), tabBarIcon: tabIcon('checkSquare') }} />
        <Tabs.Screen name="more" options={{ title: t('المزيد'), tabBarIcon: tabIcon('more') }} />
      </Tabs>
      <QuickActionsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

const createStyles = () => StyleSheet.create({
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
