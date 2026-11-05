import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/ui/Toast';
import { Colors } from '../constants/theme';
import { AuthProvider, useAuth } from '../lib/AuthContext';
import { I18nProvider, t, useI18n } from '../lib/i18n';
import { NotificationsProvider } from '../lib/notifications';
import { ThemeProvider, useTheme } from '../lib/theme';

function RootNavigator() {
  const { user, loading } = useAuth();
  const { mode } = useTheme();
  const { language } = useI18n();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const titled = (title: string) => ({
    headerShown: true,
    title: t(title),
    headerTitleAlign: 'center' as const,
    headerShadowVisible: false,
  });

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        key={language}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { color: Colors.text },
        }}
      >
        <Stack.Screen name="notifications" options={titled('الإشعارات')} />
        <Stack.Screen name="parties" options={titled('العملاء والموردون')} />
        <Stack.Screen name="reports" options={titled('التقارير')} />
        <Stack.Screen name="transactions" options={titled('سجل المعاملات')} />
        <Stack.Screen name="inventory" options={titled('المخزون والمنتجات')} />
        <Stack.Screen name="cheques" options={titled('الشيكات')} />
        <Stack.Screen name="ai" options={titled('المساعد الذكي')} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <ToastProvider>
              <NotificationsProvider>
                <RootNavigator />
              </NotificationsProvider>
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
