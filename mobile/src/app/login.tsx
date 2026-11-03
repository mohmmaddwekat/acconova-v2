import { useState } from 'react';
import { isAxiosError } from 'axios';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Colors } from '../../constants/theme';
import { useSession } from '../../lib/session';

export default function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    if (!email.trim() || !password) { setError('أدخل البريد الإلكتروني وكلمة المرور.'); return; }
    setBusy(true); setError('');
    try { await signIn(email, password); }
    catch (cause) {
      const status = isAxiosError(cause) ? cause.response?.status : undefined;
      setError(status === 401 || status === 422 ? 'تأكد من البريد الإلكتروني وكلمة المرور.'
        : status === 429 ? 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.'
          : 'تعذّر تسجيل الدخول. تحقق من الاتصال وحاول مجدداً.');
    } finally { setBusy(false); }
  }
  return <SafeAreaView style={styles.page}>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}><Text style={styles.logo}>AccoNova</Text><Text style={styles.subtitle}>أعمالك معك، أينما كنت</Text></View>
        <Card style={styles.form}>
          <Text style={styles.title}>تسجيل الدخول</Text>
          <Text style={styles.subtitle}>استخدم حسابك الحالي في أكّونوفا</Text>
          <Input label="البريد الإلكتروني" accessibilityLabel="البريد الإلكتروني" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} />
          <Input label="كلمة المرور" accessibilityLabel="كلمة المرور" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" editable={!busy} returnKeyType="go" onSubmitEditing={() => void submit()} />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Button label="دخول" loading={busy} onPress={() => void submit()} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 32, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 38, fontWeight: '800', color: Colors.accent },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'right', color: Colors.text },
  subtitle: { fontSize: 15, color: Colors.textSoft, textAlign: 'right' },
  form: { gap: 20, padding: 24 },
  error: { color: Colors.danger, textAlign: 'right' },
});

