import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { Icon } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf } from '../lib/tasks';
import { useStyles } from '../lib/theme';

type Kind = 'sale' | 'purchase';

interface Row { id: number; number: string | null; kind: Kind; date: string; party_id: number | null; party: string | null; amount: string; unallocated: string; currency: string }
interface Line { document_id: number; number: string; issue_date: string; balance_before: string; amount: string; full: boolean }
interface PlanItem { movement: Row; lines: Line[]; remaining: string; warning: string | null }

const WARNING: Record<string, string> = {
  no_party: 'الدفعة غير مربوطة بعميل أو مورد، اربطها أولاً.',
  no_open_invoices: 'لا توجد فواتير مفتوحة لهذا الطرف.',
  advance_left: 'يتبقى جزء بعد التخصيص كدفعة مقدمة.',
};

export default function AutoAllocationScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('sale');
  const [continueNewer, setContinueNewer] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/finance/auto-allocation', { params: { kind } });
      setRows(listOf<Row>(res.data));
      setSelected([]);
      setPlan(null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض هذه الصفحة.' : 'تعذّر تحميل الدفعات. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kind]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const payload = () => ({
    kind,
    continue_newer: continueNewer,
    movement_ids: (selected.length ? selected : rows.map((r) => r.id)).slice(0, 500),
  });

  async function preview() {
    setBusy(true);
    try {
      const res = await api.post('/finance/auto-allocation/preview', payload());
      setPlan(listOf<PlanItem>(res.data));
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إنشاء المعاينة'));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const res = await api.post('/finance/auto-allocation/apply', payload());
      const out = (res.data?.data ?? res.data) as { lines?: number; allocated?: string; movements?: number };
      toast(`تم تخصيص ${formatMoney(out.allocated ?? 0)} على ${out.lines ?? 0} فاتورة`);
      setConfirm(false);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تطبيق التخصيص، حدّث المعاينة وحاول مجدداً'));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const totalUnallocated = useMemo(() => rows.reduce((s, r) => s + Number(r.unallocated), 0), [rows]);
  const planLines = plan?.reduce((n, p) => n + p.lines.length, 0) ?? 0;
  const planTotal = plan?.reduce((s, p) => s + p.lines.reduce((a, l) => a + Number(l.amount), 0), 0) ?? 0;

  const header = (
    <View style={{ gap: 16 }}>
      <View style={styles.seg}>
        {([['sale', 'قبض من العملاء'], ['purchase', 'دفع للموردين']] as [Kind, string][]).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={[styles.segBtn, kind === k && styles.segOn]}>
            <Text style={[styles.segText, kind === k && { color: Colors.accentStrong }]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
        <View style={styles.glow} />
        <Text style={styles.heroLabel}>دفعات غير مخصصة لفواتير</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalUnallocated)}</Text>
        <Text style={styles.heroSub}>{rows.length} حركة تنتظر الربط بفواتيرها</Text>
      </Gradient>

      <View style={styles.optionRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionTitle}>إكمال على الفواتير الأحدث</Text>
          <Text style={styles.small}>إذا تبقّى مبلغ بعد الفواتير الأقدم، يُوزّع على الأحدث.</Text>
        </View>
        <Switch value={continueNewer} onValueChange={(v) => { setContinueNewer(v); setPlan(null); }} trackColor={{ true: Colors.accent, false: Colors.lineStrong }} accessibilityLabel="إكمال على الفواتير الأحدث" />
      </View>

      {rows.length > 0 ? (
        <View style={styles.actionRow}>
          <View style={{ flex: 1 }}>
            <Button label={selected.length ? `معاينة المحدد (${selected.length})` : 'معاينة الكل'} onPress={preview} loading={busy && !confirm} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => setSelected(selected.length === rows.length ? [] : rows.map((r) => r.id))} style={styles.selectAll}>
            <Text style={styles.selectAllText}>{selected.length === rows.length ? 'إلغاء التحديد' : 'تحديد الكل'}</Text>
          </Pressable>
        </View>
      ) : null}

      {plan ? (
        <View style={styles.previewBox}>
          <Text style={styles.optionTitle}>المعاينة: {planLines} فاتورة بمبلغ {formatMoney(planTotal)}</Text>
          {plan.map((p) => (
            <View key={p.movement.id} style={styles.planCard}>
              <View style={styles.top}>
                <Text style={styles.name} numberOfLines={1}>{p.movement.party ?? 'بدون طرف'}</Text>
                <Text style={styles.small}>{p.movement.number ?? ''} • {formatMoney(p.movement.unallocated)}</Text>
              </View>
              {p.lines.map((l) => (
                <View key={l.document_id} style={styles.lineRow}>
                  <Text style={styles.lineText}>فاتورة {l.number}</Text>
                  <View style={[styles.badge, { backgroundColor: l.full ? Tint.successBg : Tint.infoBg }]}>
                    <Text style={[styles.badgeText, { color: l.full ? StatusText.success : Colors.accentStrong }]}>{l.full ? 'سداد كامل' : 'سداد جزئي'}</Text>
                  </View>
                  <Text style={styles.lineAmount}>{formatMoney(l.amount)}</Text>
                </View>
              ))}
              {p.warning ? <Text style={styles.warning}>{WARNING[p.warning] ?? p.warning}</Text> : null}
            </View>
          ))}
          {planLines > 0 ? <Button label="تطبيق التخصيص" onPress={() => setConfirm(true)} /> : <Text style={styles.small}>لا يوجد ما يمكن تخصيصه بهذه الإعدادات.</Text>}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('التخصيص التلقائي'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="التخصيص التلقائي" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="checkSquare" title="كل الدفعات مربوطة بفواتيرها" message="لا توجد دفعات تحتاج تخصيصاً." compact />}
          renderItem={({ item }) => {
            const on = selected.includes(item.id);
            return (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setSelected((cur) => (on ? cur.filter((x) => x !== item.id) : [...cur, item.id]))} style={[styles.card, on && styles.cardOn]}>
                <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={16} color="#fff" strokeWidth={3} /> : null}</View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.party ?? 'بدون طرف'}</Text>
                  <Text style={styles.small}>{[item.number, item.date].filter(Boolean).join(' • ')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.amount}>{formatMoney(item.unallocated)}</Text>
                  <Text style={styles.small}>من {formatMoney(item.amount)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <ConfirmDialog
        visible={confirm}
        title="تطبيق التخصيص؟"
        description={`سيتم ربط ${formatMoney(planTotal)} بـ ${planLines} فاتورة. العملية تتم دفعة واحدة، وإذا تغيّر أي شيء تُلغى بالكامل.`}
        confirmLabel="تطبيق"
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
  seg: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.bgSoft },
  segBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface },
  segText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.9, textAlign: 'auto' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16 },
  optionTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  actionRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  selectAll: { minHeight: 52, paddingHorizontal: 16, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  selectAllText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
  previewBox: { gap: 12 },
  planCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  lineText: { flex: 1, fontSize: 14, color: Colors.textSoft, textAlign: 'auto' },
  lineAmount: { fontSize: 14, fontWeight: '800', color: Colors.text },
  warning: { fontSize: 12, color: StatusText.warning, textAlign: 'auto' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, padding: 16, ...Shadow.soft },
  cardOn: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: Colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  amount: { fontSize: 16, fontWeight: '800', color: Colors.text },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
