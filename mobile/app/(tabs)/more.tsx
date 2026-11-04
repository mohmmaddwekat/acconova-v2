import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../components/ui/Icon';
import { Colors, Layout, Radius, Shadow, Spacing, StatusText, Tint } from '../../constants/theme';
import { useAuth } from '../../lib/AuthContext';

interface MenuItem {
  icon: IconName;
  fg: string;
  bg: string;
  label: string;
  subtitle: string;
  route: string;
  params?: Record<string, string>;
}

const GROUPS: { title: string; items: MenuItem[] }[] = [
  {
    title: 'الموارد البشرية',
    items: [
      { icon: 'users', fg: Tint.purple, bg: Tint.purpleBg, label: 'الموظفون', subtitle: 'قائمة الموظفين والبيانات', route: '/(tabs)/employees', params: { tab: 'all' } },
      { icon: 'calendar', fg: StatusText.success, bg: Tint.successBg, label: 'الحضور والغياب', subtitle: 'تسجيل حضور اليوم', route: '/(tabs)/employees', params: { tab: 'attend' } },
      { icon: 'banknote', fg: StatusText.warning, bg: Tint.warningBg, label: 'الرواتب', subtitle: 'صرف ومتابعة الرواتب', route: '/(tabs)/employees', params: { tab: 'salary' } },
    ],
  },
  {
    title: 'الأعمال',
    items: [
      { icon: 'users', fg: Colors.accent, bg: Colors.accentSoft, label: 'العملاء والموردون', subtitle: 'الأطراف والأرصدة', route: '/(tabs)/parties' },
      { icon: 'barChart', fg: Colors.accent, bg: Colors.accentSoft, label: 'التقارير', subtitle: 'التدفق النقدي والملخصات', route: '/(tabs)/reports' },
      { icon: 'bell', fg: Colors.info, bg: Tint.infoBg, label: 'المتابعات', subtitle: 'تحصيل الديون والتنبيهات', route: '/(tabs)/notifications' },
      { icon: 'chat', fg: Tint.purple, bg: Tint.purpleBg, label: 'المساعد الذكي', subtitle: 'تحليل وإجابات فورية', route: '/(tabs)/ai' },
    ],
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() ?? 'U'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name ?? '—'}</Text>
            <Text style={styles.email}>{user?.email ?? '—'}</Text>
          </View>
        </View>

        {GROUPS.map((group) => (
          <View key={group.title} style={{ gap: 8 }}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.section}>
              {group.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: item.route as any, params: item.params })}
                  style={({ pressed }) => [
                    styles.row,
                    i === group.items.length - 1 && { borderBottomWidth: 0 },
                    pressed && { backgroundColor: Colors.bgSoft },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: item.bg }]}>
                    <Icon name={item.icon} size={22} color={item.fg} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Text style={styles.rowSub}>{item.subtitle}</Text>
                  </View>
                  <Icon name="chevronLeft" size={20} color={Colors.textFaint} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable accessibilityRole="button" style={styles.logoutBtn} onPress={logout}>
          <Icon name="logout" size={20} color={StatusText.danger} />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 40 },
  profile: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: Radius.md,
    backgroundColor: Colors.accent,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  name: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'right' },
  email: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 2 },
  groupTitle: { fontSize: 14, fontWeight: '800', color: Colors.textMuted, textAlign: 'right' },
  section: { backgroundColor: Colors.surface, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.line, ...Shadow.soft },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.line, gap: Spacing.md, minHeight: 68,
  },
  rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  rowSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2, textAlign: 'right' },
  logoutBtn: {
    minHeight: Layout.minTouch + 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Tint.dangerBg,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: StatusText.danger },
});
