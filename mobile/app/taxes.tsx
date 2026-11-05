import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney, todayISO } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

interface Obligation {
  id: number; authority_name: string; title: string; obligation_type: string; country_code: string;
  due_date: string; amount: string; paid_total: string; balance_due: string; currency: string; status: string;
}

interface TaxRule {
  id: number; name: string; code?: string | null; tax_type: string; country_code: string; region_code?: string | null;
  applies_to: string; rate: string; inclusive: boolean; recoverable: boolean; effective_from?: string | null;
  effective_to?: string | null; active: boolean; notes?: string | null;
}

const TYPES: Record<string, string> = {
  vat: 'ضريبة القيمة المضافة', sales_tax: 'ضريبة المبيعات', gst: 'ضريبة السلع والخدمات', withholding: 'ضريبة الاستقطاع',
  payroll: 'ضريبة الرواتب', corporate: 'ضريبة الشركات', customs: 'جمارك', excise: 'ضريبة انتقائية', property: 'ضريبة الأملاك',
  government_fee: 'رسوم حكومية', other: 'أخرى',
};
const APPLIES: Record<string, string> = { sales: 'المبيعات', purchases: 'المشتريات', both: 'المبيعات والمشتريات' };
const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  open: { label: 'مستحق', fg: StatusText.warning, bg: Tint.warningBg },
  partial: { label: 'مدفوع جزئياً', fg: Colors.accentStrong, bg: Tint.infoBg },
  paid: { label: 'مدفوع', fg: StatusText.success, bg: Tint.successBg },
  overdue: { label: 'متأخر', fg: StatusText.danger, bg: Tint.dangerBg },
  cancelled: { label: 'ملغى', fg: Colors.textMuted, bg: Colors.bgSoft },
};

type Tab = 'obligations' | 'rules';

export default function TaxesScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('obligations');
  const [currency, setCurrency] = useState('ILS');
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authority, setAuthority] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('vat');
  const [due, setDue] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [country, setCountry] = useState('');

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get('/finance/taxes');
      const body = res.data?.data ?? res.data;
      setRules(Array.isArray(body?.rules) ? body.rules : []);
      setObligations(Array.isArray(body?.obligations) ? body.obligations : []);
      if (body?.currency) setCurrency(body.currency);
      const known = (Array.isArray(body?.rules) ? body.rules : [])[0]?.country_code;
      if (known) setCountry((c) => c || known);
    } catch (err: unknown) {
      setFailed(true);
      if ((err as { response?: { status?: number } })?.response?.status === 403) toast('ليست لديك صلاحية لعرض الضرائب');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const open = obligations.filter((o) => o.status !== 'paid' && o.status !== 'cancelled');
  const totalDue = open.reduce((s, o) => s + Number(o.balance_due), 0);
  const overdue = open.filter((o) => o.due_date < todayISO()).length;
  const nextDue = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  async function toggleRule(rule: TaxRule, active: boolean) {
    setRules((cur) => cur.map((r) => (r.id === rule.id ? { ...r, active } : r)));
    try {
      await api.patch(`/finance/tax-rules/${rule.id}`, {
        name: rule.name, code: rule.code, tax_type: rule.tax_type, country_code: rule.country_code, region_code: rule.region_code,
        applies_to: rule.applies_to, rate: rule.rate, inclusive: rule.inclusive, recoverable: rule.recoverable,
        effective_from: rule.effective_from, effective_to: rule.effective_to, active, notes: rule.notes,
      });
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تحديث القاعدة'));
      await load();
    }
  }

  async function addObligation() {
    if (!authority.trim() || !title.trim() || !amount.trim() || country.trim().length !== 2) {
      toast('أكمل الجهة والعنوان والمبلغ ورمز الدولة (حرفان مثل PS)');
      return;
    }
    setSaving(true);
    try {
      await api.post('/finance/government-obligations', {
        authority_name: authority.trim(), title: title.trim(), obligation_type: type, country_code: country.trim().toUpperCase(),
        due_date: due, amount: amount.trim(), currency,
      });
      toast('تمت إضافة الالتزام');
      setAdding(false);
      setAuthority('');
      setTitle('');
      setAmount('');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّرت إضافة الالتزام'));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <View style={{ gap: 16 }}>
      <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
        <View style={styles.glow} />
        <Text style={styles.heroLabel}>مستحق للجهات الحكومية</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totalDue)}</Text>
        <Text style={styles.heroSub}>
          {nextDue ? `أقرب استحقاق: ${nextDue.title} في ${nextDue.due_date}` : 'لا توجد التزامات مفتوحة'}{overdue ? ` • ${overdue} متأخر` : ''}
        </Text>
      </Gradient>

      <View style={styles.seg}>
        {([['obligations', 'الالتزامات'], ['rules', 'قواعد الضريبة']] as [Tab, string][]).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segOn]}>
            <Text style={[styles.segText, tab === k && { color: Colors.accentStrong }]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'obligations' ? (
        adding ? (
          <View style={styles.card}>
            <Input label="الجهة" value={authority} onChangeText={setAuthority} placeholder="مثال: دائرة ضريبة الدخل" />
            <Input label="العنوان" value={title} onChangeText={setTitle} placeholder="مثال: إقرار ضريبة القيمة المضافة" />
            <Text style={styles.label}>النوع</Text>
            <View style={styles.chips}>
              {Object.entries(TYPES).map(([k, l]) => (
                <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: type === k }} onPress={() => setType(k)} style={[styles.chip, type === k && styles.chipOn]}>
                  <Text style={[styles.chipText, type === k && { color: Colors.accent }]}>{l}</Text>
                </Pressable>
              ))}
            </View>
            <Input label="تاريخ الاستحقاق" value={due} onChangeText={setDue} keyboardType="numbers-and-punctuation" />
            <Input label={`المبلغ (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Input label="رمز الدولة (حرفان)" value={country} onChangeText={(v) => setCountry(v.slice(0, 2).toUpperCase())} autoCapitalize="characters" placeholder="PS" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button label="حفظ الالتزام" onPress={addObligation} loading={saving} /></View>
              <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
            </View>
          </View>
        ) : (
          <Button label="+ التزام ضريبي جديد" onPress={() => setAdding(true)} />
        )
      ) : null}
    </View>
  );

  const data: (Obligation | TaxRule)[] = tab === 'obligations' ? obligations : rules;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('الضرائب'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل الضرائب" message="تحقق من الاتصال أو الصلاحيات." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(x) => `${tab}-${x.id}`}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="dollar" title={tab === 'obligations' ? 'لا توجد التزامات ضريبية' : 'لا توجد قواعد ضريبية'} message={tab === 'obligations' ? 'أضف التزاماً لتتابع مواعيده ومبالغه.' : 'تُنشأ قواعد الضريبة من الموقع.'} compact />}
          renderItem={({ item }) => {
            if (tab === 'rules') {
              const r = item as TaxRule;
              return (
                <View style={styles.card}>
                  <View style={styles.top}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.meta}>{[TYPES[r.tax_type], APPLIES[r.applies_to], r.inclusive ? 'شاملة للسعر' : 'غير شاملة', r.recoverable ? 'قابلة للاسترداد' : null].filter(Boolean).join(' • ')}</Text>
                    </View>
                    <Text style={styles.rate}>{Number(r.rate)}%</Text>
                  </View>
                  <View style={styles.top}>
                    <Text style={styles.meta}>{r.active ? 'مفعّلة' : 'متوقفة'}</Text>
                    <Switch value={r.active} onValueChange={(v) => toggleRule(r, v)} trackColor={{ true: Colors.accent, false: Colors.lineStrong }} accessibilityLabel={`تفعيل ${r.name}`} />
                  </View>
                </View>
              );
            }
            const o = item as Obligation;
            const late = o.status !== 'paid' && o.status !== 'cancelled' && o.due_date < todayISO();
            const st = late ? STATUS.overdue : STATUS[o.status] ?? STATUS.open;
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{o.title}</Text>
                    <Text style={styles.meta}>{[o.authority_name, TYPES[o.obligation_type]].filter(Boolean).join(' • ')}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
                </View>
                <View style={styles.amounts}>
                  <View><Text style={styles.small}>الاستحقاق</Text><Text style={styles.val}>{o.due_date}</Text></View>
                  <View><Text style={styles.small}>الإجمالي</Text><Text style={styles.val}>{formatMoney(o.amount)}</Text></View>
                  <View><Text style={styles.small}>المتبقي</Text><Text style={[styles.val, Number(o.balance_due) > 0 && { color: StatusText.warning }]}>{formatMoney(o.balance_due)}</Text></View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.9, textAlign: 'auto' },
  seg: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.bgSoft },
  segBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface },
  segText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  rate: { fontSize: 20, fontWeight: '800', color: Colors.accentStrong },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  amounts: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  val: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 12, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
