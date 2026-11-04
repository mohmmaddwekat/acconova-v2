import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Gradient } from '../../components/ui/Gradient';
import { Input } from '../../components/ui/Input';
import { Colors, Spacing } from '../../constants/theme';
import { useAuth } from '../../lib/AuthContext';
import { t } from '../../lib/i18n';
import { useStyles } from '../../lib/theme';
import { Text } from '../../components/ui/Text';

export default function LoginScreen() {
  const styles = useStyles(createStyles);
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

      Alert.alert(t('تعذر تسجيل الدخول'), t(msg));
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
        <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>AN</Text>
          </View>
          <Text style={styles.brandName}>AccoNova</Text>
          <Text style={styles.tagline}>نظام المحاسبة الذكي</Text>
        </Gradient>

        <View style={styles.formCard}>
          <Text style={styles.welcome}>أهلاً بعودتك</Text>
          <Text style={styles.welcomeSub}>سجّل الدخول لمتابعة أعمالك</Text>
          <Input
            label="البريد الإلكتروني"
            icon="mail"
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
            icon="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            error={errors.password}
          />
          <Button label="تسجيل الدخول" onPress={handleLogin} loading={loading} />
        </View>
        <Text style={styles.footer}>© {new Date().getFullYear()} AccoNova — جميع الحقوق محفوظة</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  container: { flexGrow: 1, paddingBottom: Spacing.lg, gap: Spacing.lg },
  hero: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: 80,
    paddingBottom: 72,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  glowA: { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: '#fff', opacity: 0.1 },
  glowB: { position: 'absolute', bottom: -40, left: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.08 },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  logoText: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  brandName: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  tagline: { fontSize: 14, color: '#fff', opacity: 0.85 },
  formCard: {
    marginHorizontal: Spacing.md,
    marginTop: -40,
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.line,
    shadowColor: Colors.accentStrong,
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  welcome: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  welcomeSub: { fontSize: 14, color: Colors.textMuted, marginTop: -8, textAlign: 'auto' },
  footer: { textAlign: 'center', fontSize: 12, color: Colors.textMuted },
});
