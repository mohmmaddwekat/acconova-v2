import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface PartyRow { party_id: number; name: string; sales_open: number | string; purchases_open: number | string; available: number | string }
interface Pair { sale_number: string; sale_date: string; purchase_number: string; purchase_date: string; amount: string }
interface Plan { pairs: Pair[]; total: number | string; available: number | string; sales_open?: number | string; purchases_open?: number | string }

export default function PartyOffsetsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [rows, setRows] = useState<PartyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [active, setActive] = useState<PartyRow | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/parties/offsets');
      setRows(listOf<PartyRow>(res.data).filter((r) => Number(r.available) > 0));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'المقاصة تحتاج صلاحية القبض والدفع معاً.' : 'تعذّر تحميل الأطراف. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function open(row: PartyRow) {
    setActive(row);
    setAmount('');
    setNotes('');
    setPlan(null);
  }

  const body = () => ({ ...(amount.trim() ? { amount: amount.trim() } : {}) });

  async function preview() {
    if (!active) return;
    setBusy(true);
    try {
      const res = await api.post(`/parties/${active.party_id}/offsets/preview`, body());
      setPlan((res.data?.data ?? res.data) as Plan);
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إنشاء المعاينة'));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!active) return;
    setBusy(true);
    try {
      await api.post(`/parties/${active.party_id}/offsets`, { ...body(), ...(notes.trim() ? { notes: notes.trim() } : {}) });
      toast('تمت المقاصة');
      setConfirm(false);
      setActive(null);
      setPlan(null);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تنفيذ المقاصة'));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View style={{ gap: 12 }}>
      <Text style={styles.intro}>عندما يكون الطرف عميلاً ومورداً معاً، يمكن مقاصة المستحق له بالمستحق عليه بدل الدفع والقبض نقداً.</Text>
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('مقاصة الأطراف'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="refresh" title="مقاصة الأطراف" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.party_id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="refresh" title="لا توجد أطراف قابلة للمقاصة" message="تظهر هنا الأطراف التي لها فواتير بيع وشراء مفتوحة معاً." compact />}
          renderItem={({ item }) => {
            const isActive = active?.party_id === item.party_id;
            return (
              <View style={[styles.card, isActive && styles.cardOn]}>
                <View style={styles.top}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.badge}><Text style={styles.badgeText}>قابل للمقاصة {formatMoney(item.available)}</Text></View>
                </View>
                <View style={styles.split}>
                  <View style={styles.cell}><Text style={styles.small}>مستحق لنا (فواتير بيع)</Text><Text style={[styles.val, { color: StatusText.success }]}>{formatMoney(item.sales_open)}</Text></View>
                  <View style={styles.cell}><Text style={styles.small}>مستحق علينا (فواتير شراء)</Text><Text style={[styles.val, { color: StatusText.warning }]}>{formatMoney(item.purchases_open)}</Text></View>
                </View>

                {isActive ? (
                  <View style={{ gap: 12 }}>
                    <Input label="المبلغ (اتركه فارغاً لمقاصة الأقصى)" value={amount} onChangeText={(v) => { setAmount(v); setPlan(null); }} keyboardType="decimal-pad" placeholder={String(Number(item.available))} />
                    <Input label="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} />
                    <Button label="معاينة المقاصة" onPress={preview} loading={busy && !confirm} />
                    {plan ? (
                      <View style={styles.previewBox}>
                        <Text style={styles.optionTitle}>سيتم مقاصة {formatMoney(plan.total)}</Text>
                        {plan.pairs.map((p, i) => (
                          <View key={i} style={styles.pair}>
                            <Text style={styles.pairText}>بيع {p.sale_number} ⇄ شراء {p.purchase_number}</Text>
                            <Text style={styles.pairAmount}>{formatMoney(p.amount)}</Text>
                          </View>
                        ))}
                        <Button label="تنفيذ المقاصة" onPress={() => setConfirm(true)} />
                      </View>
                    ) : null}
                    <Pressable accessibilityRole="button" onPress={() => { setActive(null); setPlan(null); }} style={styles.cancel}><Text style={styles.cancelText}>إغلاق</Text></Pressable>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => open(item)} style={styles.action}><Text style={styles.actionText}>مقاصة هذا الطرف</Text></Pressable>
                )}
              </View>
            );
          }}
        />
      )}
      <ConfirmDialog
        visible={confirm}
        title="تنفيذ المقاصة؟"
        description={`سيتم تسوية ${formatMoney(plan?.total ?? 0)} بين فواتير البيع والشراء لـ ${active?.name ?? ''}. يمكن إلغاؤها لاحقاً من الموقع.`}
        confirmLabel="تنفيذ"
        loading={busy}
        onConfirm={apply}
        onCancel={() => setConfirm(false)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  intro: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto', lineHeight: 22 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  cardOn: { borderColor: Colors.accent },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Tint.infoBg },
  badgeText: { fontSize: 12, fontWeight: '700', color: Colors.accentStrong },
  split: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, gap: 4 },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  val: { fontSize: 16, fontWeight: '800', textAlign: 'auto' },
  action: { minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  previewBox: { gap: 8, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: 12 },
  optionTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  pair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 36 },
  pairText: { flex: 1, fontSize: 14, color: Colors.textSoft, textAlign: 'auto' },
  pairAmount: { fontSize: 14, fontWeight: '800', color: Colors.text },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
