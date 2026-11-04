import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Colors, Spacing } from '../../constants/theme';
import { useAuth } from '../../lib/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  async function handleLogin() {
    setErrors({});

    if (!email.trim()) {
      setErrors((e) => ({ ...e, email: 'البريد الإلكتروني مطلوب' }));
      return;
    }
    if (!password) {
      setErrors((e) => ({ ...e, password: 'كلمة المرور مطلوبة' }));
      return;
    }

    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // Navigate immediately after successful login
      router.replace('/(tabs)');
    } catch (err: any) {
      const data = err?.response?.data;
      const status = err?.response?.status;

      // Extract the most useful error message
      const msg =
        data?.errors?.email?.[0] ??
        data?.errors?.password?.[0] ??
        data?.message ??
        (status ? `خطأ ${status} — تحقق من بياناتك` : 'تعذر الاتصال بالخادم');

      Alert.alert('تعذر تسجيل الدخول', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>AN</Text>
          </View>
          <Text style={styles.brandName}>AccoNova</Text>
          <Text style={styles.tagline}>نظام المحاسبة الذكي</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="البريد الإلكتروني"
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.email}
          />
          <Input
            label="كلمة المرور"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            error={errors.password}
          />
          <Button label="تسجيل الدخول" onPress={handleLogin} loading={loading} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  header: { alignItems: 'center', gap: Spacing.sm },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  brandName: { fontSize: 26, fontWeight: '700', color: Colors.text, letterSpacing: 0.5 },
  tagline: { fontSize: 14, color: Colors.textMuted },
  form: { gap: Spacing.md },
});
