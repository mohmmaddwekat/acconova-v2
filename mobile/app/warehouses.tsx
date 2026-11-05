import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Warehouse { id: number; code?: string | null; name: string; is_default: boolean; stocked_products_count?: number; stock_movements_count?: number }

export default function WarehousesScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [items, setItems] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [editName, setEditName] = useState('');
  const [archiving, setArchiving] = useState<Warehouse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/warehouses');
      setItems(listOf<Warehouse>(res.data));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض المستودعات.' : 'تعذّر تحميل المستودعات. تحقق من الاتصال.');
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
    if (await run(() => api.post('/warehouses', { name }), 'تمت إضافة المستودع', 'تعذّرت إضافة المستودع')) setNewName('');
  }

  async function rename() {
    if (!editing || !editName.trim()) return;
    if (await run(() => api.patch(`/warehouses/${editing.id}`, { name: editName.trim() }), 'تم تغيير الاسم', 'تعذّر تغيير الاسم')) setEditing(null);
  }

  async function archive() {
    if (!archiving) return;
    await run(() => api.delete(`/warehouses/${archiving.id}`), 'تم أرشفة المستودع', 'تعذّرت الأرشفة. قد يحتوي على مخزون أو يكون الافتراضي');
    setArchiving(null);
  }

  const header = (
    <View style={styles.addRow}>
      <TextInput value={newName} onChangeText={setNewName} placeholder="اسم مستودع جديد" placeholderTextColor={Colors.textFaint} style={styles.input} onSubmitEditing={add} accessibilityLabel="اسم مستودع جديد" />
      <Pressable accessibilityRole="button" disabled={busy || !newName.trim()} onPress={add} style={[styles.addBtn, (busy || !newName.trim()) && { opacity: 0.4 }]}>
        <Icon name="plus" size={20} color="#fff" strokeWidth={2.4} />
        <Text style={styles.addText}>إضافة</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('المستودعات'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="home" title="المستودعات" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(w) => String(w.id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="home" title="لا توجد مستودعات" message="أضف أول مستودع من الأعلى." compact />}
          renderItem={({ item }) => {
            const isEditing = editing?.id === item.id;
            return (
              <View style={styles.card}>
                {isEditing ? (
                  <View style={styles.addRow}>
                    <TextInput value={editName} onChangeText={setEditName} style={styles.input} accessibilityLabel="اسم المستودع" />
                    <Pressable accessibilityRole="button" disabled={busy} onPress={rename} style={styles.addBtn}><Text style={styles.addText}>حفظ</Text></Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.cancel}><Icon name="close" size={20} color={Colors.textMuted} /></Pressable>
                  </View>
                ) : (
                  <View style={styles.top}>
                    <View style={styles.icon}><Icon name="home" size={20} color={Colors.accentStrong} /></View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.meta}>{[item.code, `${item.stocked_products_count ?? 0} صنف`, `${item.stock_movements_count ?? 0} حركة`].filter(Boolean).join(' • ')}</Text>
                    </View>
                    {item.is_default ? <View style={styles.badge}><Text style={styles.badgeText}>الافتراضي</Text></View> : null}
                  </View>
                )}
                {!isEditing ? (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" onPress={() => { setEditing(item); setEditName(item.name); }} style={styles.action}><Text style={styles.actionText}>تعديل الاسم</Text></Pressable>
                    {!item.is_default ? (
                      <Pressable accessibilityRole="button" onPress={() => run(() => api.post(`/warehouses/${item.id}/default`), 'تم تعيينه كمستودع افتراضي', 'تعذّر التعيين')} style={styles.action}><Text style={styles.actionText}>جعله افتراضياً</Text></Pressable>
                    ) : null}
                    {!item.is_default ? (
                      <Pressable accessibilityRole="button" onPress={() => setArchiving(item)} style={[styles.action, { backgroundColor: 'transparent' }]}><Text style={[styles.actionText, { color: StatusText.danger }]}>أرشفة</Text></Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
      <ConfirmDialog
        visible={!!archiving}
        title="أرشفة المستودع؟"
        description={`سيتم أرشفة «${archiving?.name ?? ''}». لا يمكن أرشفة المستودع الافتراضي أو الذي فيه رصيد.`}
        confirmLabel="أرشفة"
        loading={busy}
        onConfirm={archive}
        onCancel={() => setArchiving(null)}
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
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Tint.successBg },
  badgeText: { fontSize: 12, fontWeight: '700', color: StatusText.success },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: { flexGrow: 1, minHeight: Layout.minTouch, paddingHorizontal: 12, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
});
