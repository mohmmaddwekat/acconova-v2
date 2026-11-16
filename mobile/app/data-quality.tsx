import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Gradient } from '../components/ui/Gradient';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { useStyles } from '../lib/theme';

interface Issue { id?: string; entity_type: 'party' | 'product'; entity_id: number; entity: string; issue: string; severity: string; url?: string }

interface Rule {
  title: string;
  why: string;
  fix: string;
  /** What the quick fix on each row asks for. */
  fixKind: 'contact' | 'cost' | 'open';
  openLabel: string;
}

// The server sends these exact English sentences as the issue name.
const RULES: Record<string, Rule> = {
  'Missing phone and email': {
    title: 'أطراف بدون هاتف ولا بريد',
    why: 'لا تستطيع التواصل مع هذا العميل أو المورد، ولا إرسال كشف حساب أو تذكير بالتحصيل.',
    fix: 'اكتب رقم الهاتف أو البريد تحت كل اسم واضغط حفظ.',
    fixKind: 'contact',
    openLabel: 'فتح الطرف',
  },
  'Physical product has no cost': {
    title: 'منتجات بدون سعر تكلفة',
    why: 'بدون التكلفة لا يعرف النظام ربحك الحقيقي، وتصير قيمة المخزون وتقارير الربحية غير صحيحة.',
    fix: 'اكتب سعر تكلفة الوحدة تحت كل منتج واضغط حفظ.',
    fixKind: 'cost',
    openLabel: 'فتح المخزون',
  },
  'Possible duplicate party name': {
    title: 'أطراف بأسماء متشابهة',
    why: 'قد يكون العميل نفسه مسجلاً مرتين، فتتوزع فواتيره وأرصدته على سجلين وتضيع عليك الصورة الكاملة.',
    fix: 'افتح السجل وتأكد هل هو نفس الطرف. إن كان مكرراً، ادمجه أو احذفه من الموقع.',
    fixKind: 'open',
    openLabel: 'فتح الطرف للمراجعة',
  },
  'Possible duplicate product name': {
    title: 'منتجات بأسماء متشابهة',
    why: 'تسجيل نفس الصنف مرتين يشتّت المخزون والمبيعات بين سجلين.',
    fix: 'افتح المنتج وتأكد هل هو مكرر. إن كان كذلك، اجمع رصيده في سجل واحد من الموقع.',
    fixKind: 'open',
    openLabel: 'فتح المنتج للمراجعة',
  },
};

const FALLBACK: Rule = { title: 'ملاحظة على البيانات', why: 'قد تؤثر على دقة التقارير.', fix: 'افتح السجل وراجعه.', fixKind: 'open', openLabel: 'فتح السجل' };
const PREVIEW = 4;

export default function DataQualityScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, { a?: string; b?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get('/control/data-quality');
      const body = res.data?.data ?? res.data;
      setIssues(Array.isArray(body) ? body : []);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض هذه الصفحة.' : 'تعذّر التحميل. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Issue[]>();
    issues.forEach((i) => map.set(i.issue, [...(map.get(i.issue) ?? []), i]));
    return [...map.entries()]
      .map(([issue, items]) => ({ issue, items, rule: RULES[issue] ?? FALLBACK, high: items.some((i) => i.severity === 'high') }))
      .sort((a, b) => Number(b.high) - Number(a.high) || b.items.length - a.items.length);
  }, [issues]);

  const important = issues.filter((i) => i.severity === 'high').length;
  const key = (i: Issue) => `${i.entity_type}-${i.entity_id}-${i.issue}`;

  function open(i: Issue) {
    router.push((i.entity_type === 'party' ? `/party/${i.entity_id}` : `/stock/${i.entity_id}`) as never);
  }

  async function saveContact(i: Issue) {
    const v = values[key(i)] ?? {};
    if (!v.a?.trim() && !v.b?.trim()) { toast('اكتب رقم هاتف أو بريداً'); return; }
    setBusy(key(i));
    try {
      await api.patch(`/parties/${i.entity_id}`, { ...(v.a?.trim() ? { phone: v.a.trim() } : {}), ...(v.b?.trim() ? { email: v.b.trim() } : {}) });
      toast('تم حفظ بيانات التواصل');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر الحفظ'));
    } finally {
      setBusy(null);
    }
  }

  async function saveCost(i: Issue) {
    const cost = values[key(i)]?.a?.trim() ?? '';
    if (!/^\d+(\.\d+)?$/.test(cost)) { toast('اكتب سعر التكلفة كرقم'); return; }
    setBusy(key(i));
    try {
      const res = await api.get(`/products/${i.entity_id}`);
      const p = (res.data?.data ?? res.data) as Record<string, unknown>;
      await api.patch(`/products/${i.entity_id}`, {
        type: p.type, name: p.name, sku: p.sku ?? null, description: p.description ?? null, unit: p.unit,
        unit_price: p.unit_price, cost_price: cost, tax_rate: p.tax_rate,
      });
      toast('تم حفظ سعر التكلفة');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر الحفظ. افتح المنتج من الموقع'));
    } finally {
      setBusy(null);
    }
  }

  const set = (i: Issue, patch: { a?: string; b?: string }) => setValues((cur) => ({ ...cur, [key(i)]: { ...cur[key(i)], ...patch } }));

  const header = (
    <View style={{ gap: 16 }}>
      <Gradient colors={[issues.length ? (important ? StatusText.warning : Colors.accent) : StatusText.success, Colors.accentStrong]} style={styles.hero}>
        <View style={styles.glow} />
        {issues.length === 0 ? (
          <>
            <Text style={styles.heroLabel}>جودة بياناتك</Text>
            <Text style={styles.heroValue}>ممتازة</Text>
            <Text style={styles.heroSub}>لم يجد النظام أي مشكلة في بياناتك.</Text>
          </>
        ) : (
          <>
            <Text style={styles.heroLabel}>ملاحظات على بياناتك</Text>
            <Text style={styles.heroValue}>{issues.length}</Text>
            <Text style={styles.heroSub}>{important > 0 ? `${important} منها مهمة وتؤثر على أرقامك، والباقي للمراجعة.` : 'كلها للمراجعة ولا تؤثر على أرقامك مباشرة.'}</Text>
          </>
        )}
      </Gradient>
      <View style={styles.explain}>
        <Text style={styles.explainTitle}>ما هذه الصفحة؟</Text>
        <Text style={styles.explainText}>النظام يفحص بياناتك تلقائياً ويبحث عن أخطاء تؤثر على التقارير والأرباح. تحت كل مشكلة تجد: لماذا هي مهمة، وكيف تصلحها.</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('جودة البيانات'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="checkSquare" title="جودة البيانات" message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.issue}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          renderItem={({ item: g }) => {
            const all = !!expanded[g.issue];
            const shown = all ? g.items : g.items.slice(0, PREVIEW);
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <Text style={styles.name}>{g.rule.title}</Text>
                  <View style={[styles.badge, { backgroundColor: g.high ? Tint.dangerBg : Tint.warningBg }]}>
                    <Text style={[styles.badgeText, { color: g.high ? StatusText.danger : StatusText.warning }]}>{g.high ? 'مهم' : 'للمراجعة'} • {g.items.length}</Text>
                  </View>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoLabel}>لماذا هذا مهم؟</Text>
                  <Text style={styles.infoText}>{g.rule.why}</Text>
                  <Text style={styles.infoLabel}>كيف أصلحه؟</Text>
                  <Text style={styles.infoText}>{g.rule.fix}</Text>
                </View>

                {shown.map((i) => {
                  const k = key(i);
                  const v = values[k] ?? {};
                  return (
                    <View key={k} style={styles.row}>
                      <Pressable accessibilityRole="button" onPress={() => open(i)} style={styles.rowTop}>
                        <Text style={styles.entity} numberOfLines={1}>{i.entity}</Text>
                        <Text style={styles.openText}>{g.rule.openLabel}</Text>
                      </Pressable>
                      {g.rule.fixKind === 'contact' ? (
                        <View style={styles.inline}>
                          <View style={{ flex: 1 }}><Input label="الهاتف" value={v.a ?? ''} onChangeText={(x) => set(i, { a: x })} keyboardType="phone-pad" /></View>
                          <View style={{ flex: 1 }}><Input label="البريد" value={v.b ?? ''} onChangeText={(x) => set(i, { b: x })} keyboardType="email-address" autoCapitalize="none" /></View>
                        </View>
                      ) : null}
                      {g.rule.fixKind === 'cost' ? <Input label="سعر تكلفة الوحدة" value={v.a ?? ''} onChangeText={(x) => set(i, { a: x })} keyboardType="decimal-pad" /> : null}
                      {g.rule.fixKind !== 'open' ? (
                        <Button label="حفظ" variant="ghost" loading={busy === k} onPress={() => (g.rule.fixKind === 'contact' ? saveContact(i) : saveCost(i))} />
                      ) : null}
                    </View>
                  );
                })}

                {g.items.length > PREVIEW ? (
                  <Pressable accessibilityRole="button" onPress={() => setExpanded((cur) => ({ ...cur, [g.issue]: !all }))} style={styles.more}>
                    <Text style={styles.moreText}>{all ? 'عرض أقل' : `عرض الكل (${g.items.length})`}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={<EmptyState icon="checkSquare" title="بياناتك سليمة" message="سنخبرك هنا عندما نلاحظ شيئاً يستحق المراجعة." compact />}
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
  heroValue: { fontSize: 36, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.9, textAlign: 'auto', lineHeight: 22 },
  explain: { gap: 6, padding: 16, borderRadius: Radius.md, backgroundColor: Colors.accentSoft },
  explainTitle: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong, textAlign: 'auto' },
  explainText: { fontSize: 14, color: Colors.textSoft, textAlign: 'auto', lineHeight: 22 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  infoBox: { gap: 4, padding: 12, borderRadius: Radius.sm, backgroundColor: Colors.bg },
  infoLabel: { fontSize: 12, fontWeight: '800', color: Colors.accentStrong, textAlign: 'auto', marginTop: 4 },
  infoText: { fontSize: 14, color: Colors.textSoft, textAlign: 'auto', lineHeight: 22 },
  row: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: Layout.minTouch },
  entity: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  openText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  inline: { flexDirection: 'row', gap: 8 },
  more: { minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 14, fontWeight: '800', color: Colors.accent },
});
