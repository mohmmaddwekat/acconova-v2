import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { PickerSheet } from '../components/ui/PickerSheet';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

export interface Role { id: number; name: string; base_role: string; is_custom: boolean; permissions: string[] }
interface Member {
  id: number; user_id: number; role: string; workspace_role_id?: number | null; role_name?: string | null;
  user?: { name?: string; email?: string }; permission_count?: number; full_access?: boolean;
}

export const BASE_ROLES: Record<string, string> = { manager: 'مدير', accountant: 'محاسب', employee: 'موظف' };
const MEMBER_ROLE: Record<string, string> = { owner: 'المالك', admin: 'مسؤول', manager: 'مدير', accountant: 'محاسب', employee: 'موظف' };

type Tab = 'roles' | 'members';

export default function RolesScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('roles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Member | null>(null);
  const [pickedRole, setPickedRole] = useState<Role | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/workspace-roles');
      setRoles(Array.isArray(res.data?.roles) ? res.data.roles : []);
      setMembers(Array.isArray(res.data?.members) ? res.data.members : []);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'إدارة الأدوار متاحة لمالك المؤسسة فقط.' : 'تعذّر تحميل الأدوار. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function startAssign(member: Member) {
    setAssigning(member);
    setPickedRole(null);
    setPassword('');
    setPickerOpen(true);
  }

  async function assign() {
    if (!assigning || !pickedRole) return;
    if (!password) {
      toast('اكتب كلمة مرور المالك للتأكيد');
      return;
    }
    setBusy(true);
    try {
      await api.post('/workspace-roles/assign', {
        email: assigning.user?.email,
        confirmed_user_id: assigning.user_id,
        workspace_role_id: pickedRole.id,
        current_password: password,
      });
      toast('تم تغيير الدور');
      setAssigning(null);
      setPickedRole(null);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تغيير الدور'));
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  const header = (
    <View style={{ gap: 16 }}>
      <View style={styles.seg}>
        {([['roles', 'الأدوار'], ['members', 'الأعضاء']] as [Tab, string][]).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segOn]}>
            <Text style={[styles.segText, tab === k && { color: Colors.accentStrong }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'roles' ? <Button label="+ دور جديد من قالب" onPress={() => router.push('/role-new' as never)} /> : <Text style={styles.note}>اضغط «تغيير الدور» لنقل عضو إلى دور آخر. يتطلب تأكيداً بكلمة مرور المالك.</Text>}
    </View>
  );

  const data: (Role | Member)[] = tab === 'roles' ? roles : members;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('الأدوار والصلاحيات'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="lock" title="الأدوار والصلاحيات" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(x) => `${tab}-${x.id}`}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="lock" title="لا توجد عناصر" compact />}
          renderItem={({ item }) => {
            if (tab === 'roles') {
              const r = item as Role;
              const users = members.filter((m) => m.workspace_role_id === r.id || m.role_name === r.name).length;
              return (
                <Pressable accessibilityRole="button" onPress={() => router.push(`/role/${r.id}` as never)} style={({ pressed }) => [styles.card, styles.row, pressed && { backgroundColor: Colors.bgSoft }]}>
                  <View style={styles.icon}><Icon name="lock" size={20} color={Colors.accentStrong} /></View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{r.name}</Text>
                    <Text style={styles.meta}>{[BASE_ROLES[r.base_role], `${r.permissions?.length ?? 0} صلاحية`, users ? `${users} عضو` : null, r.is_custom ? 'مخصص' : 'أساسي'].filter(Boolean).join(' • ')}</Text>
                  </View>
                  <Icon name="chevronLeft" size={20} color={Colors.textFaint} />
                </Pressable>
              );
            }
            const m = item as Member;
            const isOwner = m.role === 'owner';
            return (
              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.icon}><Text style={styles.avatar}>{(m.user?.name ?? '؟').trim().charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{m.user?.name ?? '—'}</Text>
                    <Text style={styles.meta}>{m.user?.email}</Text>
                    <Text style={styles.meta}>{[m.role_name ?? MEMBER_ROLE[m.role] ?? m.role, m.full_access ? 'وصول كامل' : m.permission_count != null ? `${m.permission_count} صلاحية` : null].filter(Boolean).join(' • ')}</Text>
                  </View>
                </View>
                {!isOwner ? (
                  <Pressable accessibilityRole="button" onPress={() => startAssign(m)} style={styles.action}>
                    <Text style={styles.actionText}>تغيير الدور</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}

      <PickerSheet
        visible={pickerOpen}
        title={`دور ${assigning?.user?.name ?? ''}`}
        items={roles.map((r) => ({ id: r.id, title: r.name, subtitle: `${r.permissions?.length ?? 0} صلاحية` }))}
        onSelect={(i) => { setPickedRole(roles.find((r) => r.id === i.id) ?? null); setPickerOpen(false); }}
        onClose={() => { setPickerOpen(false); setAssigning(null); }}
      />

      <ConfirmDialog
        visible={!!assigning && !!pickedRole && !pickerOpen}
        title="تأكيد تغيير الدور"
        description={`سيصبح دور ${assigning?.user?.name ?? ''}: ${pickedRole?.name ?? ''}. قد يمنحه ذلك وصولاً لبيانات حساسة، فأدخل كلمة مرورك للتأكيد.`}
        confirmLabel="تأكيد"
        loading={busy}
        onConfirm={assign}
        onCancel={() => { setAssigning(null); setPickedRole(null); }}
      >
        <Input label="كلمة مرور المالك" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      </ConfirmDialog>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 20 },
  seg: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.bgSoft },
  segBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface },
  segText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatar: { fontSize: 18, fontWeight: '800', color: Colors.accentStrong },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  action: { minHeight: Layout.minTouch, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
});
