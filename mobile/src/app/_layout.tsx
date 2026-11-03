import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '../../lib/session';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/theme';

function Navigation() {
  const { user, loading, error, restore } = useSession();
  if (loading || error) {
    return <View style={styles.loading}>
      {loading ? <ActivityIndicator size="large" color={Colors.accent} /> : <>
        <Text style={styles.error}>{error}</Text>
        <Button label="إعادة المحاولة" onPress={() => void restore()} />
      </>}
    </View>;
  }
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!user}><Stack.Screen name="login" /></Stack.Protected>
    <Stack.Protected guard={!!user}><Stack.Screen name="index" /></Stack.Protected>
  </Stack>;
}

export default function RootLayout() {
  return <SafeAreaProvider><SessionProvider>
    <StatusBar style="dark" /><Navigation />
  </SessionProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', padding: 24, gap: 24, backgroundColor: Colors.bg },
  error: { textAlign: 'center', color: Colors.text, fontSize: 16 },
});
