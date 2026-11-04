import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing } from '../../constants/theme';
import { useAuth } from '../../lib/AuthContext';

interface MenuItem {
  icon: string;
  label: string;
  subtitle: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: '👥', label: 'العملاء والموردون', subtitle: 'الأطراف والأرصدة', route: '/(tabs)/parties' },
  { icon: '📊', label: 'التقارير', subtitle: 'التدفق النقدي والملخصات', route: '/(tabs)/reports' },
  { icon: '🔔', label: 'المتابعات', subtitle: 'تحصيل الديون والتنبيهات', route: '/(tabs)/notifications' },
  { icon: '🤖', label: 'المساعد الذكي', subtitle: 'تحليل وإجابات فورية', route: '/(tabs)/ai' },
];

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.name ?? '—'}</Text>
          <Text style={styles.email}>{user?.email ?? '—'}</Text>
        </View>

        <View style={styles.section}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.row}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Text style={styles.rowIconText}>{item.icon}</Text>
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowSub}>{item.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: Spacing.lg, gap: Spacing.lg },
  header: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  avatarText: { fontSize: 26, fontWeight: '700', color: '#fff' },
  name: { fontSize: 18, fontWeight: '600', color: Colors.text },
  email: { fontSize: 13, color: Colors.textMuted },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    overflow: 'hidden',
    ...Shadow.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    gap: Spacing.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.xs,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconText: { fontSize: 20 },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 20, color: Colors.textFaint },
  logoutBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger + '40',
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: Colors.danger },
});
