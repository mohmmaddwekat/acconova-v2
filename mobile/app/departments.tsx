import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { PickerItem, PickerSheet } from '../components/ui/PickerSheet';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

interface Department { id: number; name: string; manager_id?: number | null }
interface StaffRow { id: number; name: string; department_id: number | null; active: boolean }

export default function DepartmentsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Department | null>(null);
  const [editName, setEditName] = useState('');
  const [pickerFor, setPickerFor] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get('/departments');
      setDepartments(Array.isArray(res.data?.departments) ? res.data.departments : []);
      setStaff(Array.isArray(res.data?.staff) ? res.data.staff : []);
      setCanManage(!!res.data?.can_manage);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(action: () => Promise<unknown>, ok: string, fallback: string) {
    setBusy(true);
    try {
      await action();
      toast(ok);
      await load();
      return true;
    } catch (err) {
      toast(apiErrorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    if (await run(() => api.post('/departments', { name }), 'تمت إضافة القسم', 'تعذّرت إضافة القسم')) setNewName('');
  }

  async function saveName() {
    if (!editing || !editName.trim()) return;
    if (await run(() => api.patch(`/departments/${editing.id}`, { name: editName.trim(), manager_id: editing.manager_id ?? null }), 'تم حفظ الاسم', 'تعذّر حفظ الاسم')) setEditing(null);
  }

  async function setManager(dept: Department, managerId: number | null) {
    setPickerFor(null);
    await run(() => api.patch(`/departments/${dept.id}`, { name: dept.name, manager_id: managerId }), 'تم تحديث المدير', 'تعذّر تحديث المدير');
  }

  const pickerItems: PickerItem[] = pickerFor
    ? [{ id: 0, title: 'بدون مدير' }, ...staff.filter((s) => s.department_id === pickerFor.id && s.active).map((s) => ({ id: s.id, title: s.name }))]
    : [];

  const header = canManage ? (
    <View style={styles.addRow}>
      <TextInput value={newName} onChangeText={setNewName} placeholder="اسم قسم جديد" placeholderTextColor={Colors.textFaint} style={styles.input} onSubmitEditing={add} accessibilityLabel="اسم قسم جديد" />
      <Pressable accessibilityRole="button" disabled={busy || !newName.trim()} onPress={add} style={[styles.addBtn, (busy || !newName.trim()) && { opacity: 0.4 }]}>
        <Icon name="plus" size={20} color="#fff" strokeWidth={2.4} />
        <Text style={styles.addText}>إضافة</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('الأقسام'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل الأقسام" message="تحقق من الاتصال أو الصلاحيات." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={departments}
          keyExtractor={(d) => String(d.id)}
          ListHeaderComponent={header ?? undefined}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="users" title="لا توجد أقسام بعد" message={canManage ? 'أضف أول قسم من الأعلى.' : undefined} compact />}
          renderItem={({ item }) => {
            const members = staff.filter((s) => s.department_id === item.id && s.active);
            const manager = staff.find((s) => s.id === item.manager_id);
            const isEditing = editing?.id === item.id;
            return (
              <View style={styles.card}>
                {isEditing ? (
                  <View style={styles.addRow}>
                    <TextInput value={editName} onChangeText={setEditName} style={styles.input} accessibilityLabel="اسم القسم" />
                    <Pressable accessibilityRole="button" disabled={busy} onPress={saveName} style={styles.addBtn}><Text style={styles.addText}>حفظ</Text></Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.cancel}><Icon name="close" size={20} color={Colors.textMuted} /></Pressable>
                  </View>
                ) : (
                  <View style={styles.top}>
                    <View style={styles.icon}><Icon name="users" size={20} color={Colors.accentStrong} /></View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.meta}>{members.length} موظف{manager ? ` • المدير: ${manager.name}` : ''}</Text>
                    </View>
                  </View>
                )}
                {canManage && !isEditing ? (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" onPress={() => { setEditing(item); setEditName(item.name); }} style={styles.action}><Text style={styles.actionText}>تعديل الاسم</Text></Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setPickerFor(item)} style={styles.action}><Text style={styles.actionText}>تعيين المدير</Text></Pressable>
                  </View>
                ) : null}
                {members.length > 0 ? <Text style={styles.members} numberOfLines={2}>{members.map((m) => m.name).join('، ')}</Text> : null}
              </View>
            );
          }}
        />
      )}
      <PickerSheet
        visible={!!pickerFor}
        title="مدير القسم"
        items={pickerItems}
        onSelect={(i) => pickerFor && setManager(pickerFor, Number(i.id) || null)}
        onClose={() => setPickerFor(null)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 },
  input: { flex: 1, minHeight: 48, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface, paddingHorizontal: 12, fontSize: 16, color: Colors.text, textAlign: 'auto' },
  addBtn: { minHeight: 48, paddingHorizontal: 16, borderRadius: Radius.sm, backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  cancel: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  members: { fontSize: 14, color: Colors.textSoft, textAlign: 'auto' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: Layout.minTouch, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
});
