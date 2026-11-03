import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Colors } from '../../constants/theme';
import { useSession } from '../../lib/session';

export default function Home() {
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function exit() {
    if (busy) return;
    setBusy(true); setError('');
    try { await signOut(); }
    catch { setError('تعذّر تسجيل الخروج. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.logo}>AccoNova</Text>
      <Text style={styles.title}>مرحباً، {user?.name}</Text>
      <Text style={styles.subtitle}>أهلاً بك في مساحة عملك</Text>
      <Card style={styles.card}>
        <Text style={styles.heading}>حسابك</Text>
        <Text style={styles.subtitle}>{user?.name}</Text>
        <Text selectable style={styles.email}>{user?.email}</Text>
      </Card>
      <Card style={styles.card}>
        <Text style={styles.heading}>تطبيق أكّونوفا للجوال</Text>
        <Text style={styles.subtitle}>تم تسجيل الدخول بحسابك. شاشات الفواتير والدفعات والحضور ستتوفر في المراحل القادمة.</Text>
      </Card>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Button label="تسجيل الخروج" variant="ghost" loading={busy} onPress={() => void exit()} />
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 24, gap: 20, maxWidth: 640, width: '100%', alignSelf: 'center' },
  logo: { color: Colors.accent, fontSize: 24, fontWeight: '800', textAlign: 'right' },
  title: { color: Colors.text, fontSize: 28, fontWeight: '700', textAlign: 'right' },
  heading: { color: Colors.text, fontSize: 19, fontWeight: '600', textAlign: 'right' },
  subtitle: { color: Colors.textSoft, fontSize: 16, lineHeight: 26, textAlign: 'right' },
  email: { color: Colors.textMuted, fontSize: 16 },
  card: { gap: 12, padding: 24 },
  error: { color: Colors.danger, textAlign: 'right' },
});

