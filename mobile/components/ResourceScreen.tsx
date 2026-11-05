import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Colors, Radius, Shadow, StatusText, Tint } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { useBottomInset } from '../lib/insets';
import { ModuleDef, ModuleRow, Tone } from '../lib/modules';
import { useStyles } from '../lib/theme';
import { EmptyState } from './ui/EmptyState';
import { Gradient } from './ui/Gradient';
import { useToast } from './ui/Toast';
import { Icon } from './ui/Icon';
import { SkeletonList } from './ui/Skeleton';
import { Text } from './ui/Text';
import { TextInput } from './ui/TextInput';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const LABELS: Record<string, string> = {
  total: 'الإجمالي', count: 'العدد', balance: 'الرصيد', amount: 'المبلغ', pending: 'معلّق', completed: 'مكتمل',
  overdue: 'متأخر', active: 'نشط', open: 'مفتوح', paid: 'مدفوع', unpaid: 'غير مدفوع', draft: 'مسودة',
  posted: 'مرحّل', approved: 'معتمد', rejected: 'مرفوض', failed: 'فاشل', passed: 'ناجح', high: 'عالٍ', medium: 'متوسط',
  low: 'منخفض', users: 'المستخدمون', members: 'الأعضاء', roles: 'الأدوار', tasks: 'المهام', items: 'العناصر',
  inflow: 'الوارد', outflow: 'الصادر', net: 'الصافي', tax: 'الضريبة', income: 'الإيرادات', expenses: 'المصاريف',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'معلّق', draft: 'مسودة', posted: 'مرحّل', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغى',
  completed: 'مكتمل', done: 'مكتمل', active: 'نشط', inactive: 'غير نشط', open: 'مفتوح', closed: 'مغلق', paid: 'مدفوع',
  overdue: 'متأخر', failed: 'فاشل', passed: 'ناجح', ok: 'سليم', warning: 'تنبيه', critical: 'حرج', high: 'عالٍ',
  medium: 'متوسط', low: 'منخفض', in_progress: 'قيد التنفيذ', matched: 'مطابق', unmatched: 'غير مطابق',
  soon: 'قريباً', danger: 'خطر', info: 'معلومة', valid: 'ساري', expiring: 'ينتهي قريباً', pending_review: 'بانتظار المراجعة', error: 'خطأ', success: 'نجاح', normal: 'عادية', urgent: 'عاجلة', review: 'مراجعة', todo: 'للتنفيذ',
  created: 'إنشاء', updated: 'تعديل', deleted: 'حذف', restored: 'استرجاع', posted_at: 'ترحيل', reversed: 'معكوس',
  login: 'تسجيل دخول', logout: 'تسجيل خروج', sale: 'بيع', purchase: 'شراء', sale_invoice: 'فاتورة بيع',
  purchase_invoice: 'فاتورة شراء', customer: 'عميل', supplier: 'مورد', incoming: 'وارد', outgoing: 'صادر',
  unpaid: 'غير مدفوع', partial: 'جزئي', partially_paid: 'مدفوع جزئياً', trial: 'تجريبي', expired: 'منتهي',
  enabled: 'مفعّل', disabled: 'معطّل', owner: 'مالك', admin: 'مدير', member: 'عضو', viewer: 'مشاهد',
  accountant: 'محاسب', cash: 'نقدي', check: 'شيك', bank_transfer: 'تحويل بنكي', card: 'بطاقة',
};

const KEY_LABELS: Record<string, string> = {
  ...LABELS,
  overdue_count: 'عدد المتأخر', pending_count: 'عدد المعلّق', total_count: 'العدد الكلي', open_count: 'عدد المفتوح',
  total_amount: 'إجمالي المبلغ', outstanding: 'المتبقي', overdue_amount: 'المبلغ المتأخر', receivables: 'المستحقات',
  payables: 'الالتزامات', cash_in: 'الوارد', cash_out: 'الصادر', opening_balance: 'الرصيد الافتتاحي',
  closing_balance: 'الرصيد الختامي', projected_balance: 'الرصيد المتوقع', warehouses: 'المستودعات', products: 'المنتجات',
  parties: 'الأطراف', customers: 'العملاء', suppliers: 'الموردون', departments: 'الأقسام', teams: 'الفرق',
  projects: 'المشاريع', employees: 'الموظفون', staff: 'الموظفون', permissions: 'الصلاحيات', sessions: 'الجلسات',
  events: 'الأحداث', alerts: 'التنبيهات', checks: 'الفحوصات', rules: 'القواعد', plans: 'الخطط', reports: 'التقارير',
  matched: 'المطابق', unmatched: 'غير المطابق', suggested: 'المقترح', failed_count: 'عدد الفاشل', score: 'الدرجة',
  seats: 'المقاعد', used: 'المستخدم', limit: 'الحد', remaining: 'المتبقي',
};

export const humanKey = (key: string) => KEY_LABELS[key.toLowerCase()] ?? null;
const isCode = (s: string) => /^[a-z][a-z0-9_.:-]*$/i.test(s) && !/\s/.test(s);
const hasLatin = (s: string) => /[A-Za-z]/.test(s);

/** Turns enum-like codes into Arabic; returns null for a code with no translation so no English leaks into the UI. */
function humanValue(s: string): string | null {
  if (!isCode(s)) return s;
  return STATUS_LABELS[s.toLowerCase()] ?? KEY_LABELS[s.toLowerCase()] ?? null;
}

const OK = ['completed', 'done', 'paid', 'posted', 'approved', 'active', 'passed', 'ok', 'matched', 'cleared', 'success'];
const BAD = ['overdue', 'failed', 'rejected', 'bounced', 'critical', 'high', 'cancelled', 'unmatched', 'error', 'urgent'];
const WARN = ['pending', 'draft', 'review', 'open', 'warning', 'medium', 'in_progress', 'todo'];

const MONEY_KEY = /amount|total|balance|value|price|cost|revenue|income|expense|tax|due|paid/i;

function tone(status: string): Tone {
  const s = status.toLowerCase();
  if (OK.includes(s)) return 'ok';
  if (BAD.includes(s)) return 'bad';
  if (WARN.includes(s)) return 'warn';
  return 'info';
}

function pick(o: Obj, paths: string[]): string | null {
  for (const path of paths) {
    let cur: unknown = o;
    for (const part of path.split('.')) cur = isObj(cur) ? cur[part] : undefined;
    if ((typeof cur === 'string' && cur.trim()) || typeof cur === 'number') return String(cur);
  }
  return null;
}

/** First candidate whose text is readable (not an untranslated English code). */
function pickHuman(o: Obj, paths: string[]): string | null {
  for (const path of paths) {
    const raw = pick(o, [path]);
    if (!raw) continue;
    const human = humanValue(raw);
    if (human) return human;
  }
  return null;
}

export function formatScalar(key: string, value: unknown): string {
  if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))) {
    return MONEY_KEY.test(key) ? formatMoney(value as number | string) : String(Number(value));
  }
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  return String(value);
}

/** Generic mapping for lists whose shape is not known in advance. */
export function autoRow(raw: Obj, index: number): ModuleRow | null {
  const title = pickHuman(raw, ['title', 'name', 'label', 'number', 'subject', 'reference', 'full_name', 'party.name', 'product.name', 'entity', 'currency', 'code', 'issue', 'description', 'action', 'event', 'type']);
  if (!title) return null;
  const subtitle = [
    pickHuman(raw, ['party.name', 'party_name', 'submitted_by_name', 'custodian', 'department', 'department.name', 'company_name', 'user.name', 'actor.name', 'merchant', 'subject_label', 'issue', 'email']),
    pickHuman(raw, ['due_date', 'due_on', 'next_due_on', 'expires_on', 'ends_on', 'expense_date', 'month', 'date', 'movement_date', 'created_at', 'starts_on']),
  ]
    .filter((x) => x && x !== title)
    .map((x) => String(x).slice(0, 10).length === 10 && /^\d{4}-\d{2}-\d{2}/.test(String(x)) ? String(x).slice(0, 10) : x)
    .join(' • ');
  const dayKey = ['days_until_expiry', 'days_until_due'].find((k) => typeof raw[k] === 'number');
  const days = dayKey ? Number(raw[dayKey]) : null;
  const dayText = days == null ? null : days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : days === 0 ? 'ينتهي اليوم' : `بعد ${days} يوم`;
  const valueKey = ['amount', 'total', 'balance_due', 'balance', 'limit_amount', 'monthly_limit', 'actual', 'spent', 'allocated_cost', 'rate', 'value', 'outstanding', 'quantity', 'count'].find((k) => raw[k] != null && !isObj(raw[k]));
  const status = pick(raw, ['alert_level', 'status', 'state', 'severity', 'priority']);
  const statusText = status ? humanValue(status) : null;
  return {
    id: String(raw.id ?? `${index}`),
    title,
    subtitle: [subtitle, dayText].filter(Boolean).join(' • ') || undefined,
    value: valueKey ? formatScalar(valueKey, raw[valueKey]) : typeof raw.usage_percent === 'number' ? `${raw.usage_percent}%` : undefined,
    badge: status && statusText && !hasLatin(statusText) ? { text: statusText, tone: tone(status) } : undefined,
  };
}

/** Finds the main list plus the top-level numbers in whatever the endpoint returned. */
export function extract(body: unknown): { list: Obj[]; stats: { key: string; value: unknown }[] } {
  const root: unknown = isObj(body) && body.data !== undefined ? body.data : body;
  let list: Obj[] = [];
  const stats: { key: string; value: unknown }[] = [];
  const scanScalars = (o: Obj) => {
    for (const [k, v] of Object.entries(o)) {
      if ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))) && !/(^|_)id$/.test(k) && stats.length < 6) {
        stats.push({ key: k, value: v });
      }
    }
  };
  const arrays = (o: Obj): Obj[][] => Object.values(o).filter((v): v is Obj[] => Array.isArray(v) && v.length > 0 && isObj(v[0]));

  if (Array.isArray(root)) {
    list = root.filter(isObj);
  } else if (isObj(root)) {
    const candidates = arrays(root);
    if (isObj(root.data) || Array.isArray(root.data)) {
      const inner = Array.isArray(root.data) ? root.data : arrays(root.data as Obj)[0] ?? [];
      candidates.push(inner.filter(isObj));
    }
    list = candidates.sort((a, b) => b.length - a.length)[0] ?? [];
    scanScalars(root);
    for (const k of ['summary', 'metrics', 'totals', 'stats', 'overview']) {
      const sub = root[k];
      if (isObj(sub)) scanScalars(sub);
    }
  }
  if (isObj(body)) {
    for (const k of ['summary', 'metrics', 'meta']) {
      const sub = body[k];
      if (isObj(sub) && k !== 'meta') scanScalars(sub);
    }
  }
  return { list, stats };
}

export function ResourceScreen({ module }: { module: ModuleDef }) {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [stats, setStats] = useState<{ key: string; value: unknown }[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const res = await api.get(module.endpoint, { params: module.params });
      const { list, stats: s } = extract(res.data);
      const mapped: ModuleRow[] = [];
      list.forEach((raw, i) => {
        const row = (module.row ? module.row(raw) : null) ?? autoRow(raw, i);
        if (row) mapped.push({ ...row, raw });
      });
      setRows(mapped);
      setStats(s.filter((x) => humanKey(x.key)));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض هذه الوحدة.' : 'تعذّر تحميل البيانات. تحقق من الاتصال ثم حاول مرة أخرى.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [module]);

  useEffect(() => { load(); }, [load]);

  async function runAction(row: ModuleRow) {
    const action = module.rowAction;
    if (!action || !row.raw) return;
    const req = action.request(row.raw);
    setBusyId(row.id);
    try {
      if (req.method === 'patch') await api.patch(req.url, req.body);
      else await api.post(req.url, req.body);
      toast(action.successMessage);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تنفيذ الإجراء'));
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.title} ${r.subtitle ?? ''}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const [first, ...others] = stats;

  const header = (
    <View style={styles.headerWrap}>
      {first ? (
        <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
          <View style={styles.glow} />
          <Text style={styles.heroLabel}>{humanKey(first.key)}</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{formatScalar(first.key, first.value)}</Text>
          <Text style={styles.heroSub}>{module.subtitle}</Text>
        </Gradient>
      ) : null}
      {others.length > 0 ? (
        <View style={styles.statGrid}>
          {others.slice(0, 4).map((s) => (
            <View key={s.key} style={styles.stat}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatScalar(s.key, s.value)}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{humanKey(s.key)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {rows.length > 6 ? (
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="بحث…"
            placeholderTextColor={Colors.textFaint}
            style={styles.search}
            accessibilityLabel={`بحث في ${module.title}`}
          />
        </View>
      ) : null}
    </View>
  );

  if (loading) return <View style={styles.flex}><SkeletonList rows={6} /></View>;

  if (failed) {
    return (
      <View style={styles.flex}>
        <EmptyState icon="wifiOff" title={module.title} message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
    <FlatList
      style={styles.flex}
      data={visible}
      keyExtractor={(r, i) => `${r.id}-${i}`}
      ListHeaderComponent={header}
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      ListEmptyComponent={<EmptyState icon={module.icon} title="لا توجد بيانات بعد" message={module.subtitle} compact />}
      renderItem={({ item }) => {
        const canAct = !!module.rowAction && !!item.raw && module.rowAction.visible(item.raw);
        const bg = item.badge ? { ok: Tint.successBg, warn: Tint.warningBg, bad: Tint.dangerBg, info: Tint.infoBg }[item.badge.tone] : undefined;
        const fg = item.badge ? { ok: StatusText.success, warn: StatusText.warning, bad: StatusText.danger, info: Colors.accentStrong }[item.badge.tone] : undefined;
        return (
          <View style={styles.card}>
            <View style={styles.cardRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              {item.subtitle ? <Text style={styles.sub} numberOfLines={2}>{item.subtitle}</Text> : null}
            </View>
            <View style={styles.side}>
              {item.value ? <Text style={styles.value}>{item.value}</Text> : null}
              {item.badge ? (
                <View style={[styles.badge, { backgroundColor: bg }]}>
                  <Text style={[styles.badgeText, { color: fg }]}>{item.badge.text}</Text>
                </View>
              ) : null}
            </View>
            </View>
            {canAct ? (
              <Pressable
                accessibilityRole="button"
                disabled={busyId === item.id}
                onPress={() => runAction(item)}
                style={[styles.action, { opacity: busyId === item.id ? 0.5 : 1 }]}
              >
                <Text style={styles.actionText}>{module.rowAction?.label}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      }}
    />
    {module.createRoute ? (
      <View style={[styles.createWrap, { paddingBottom: 16 + bottomInset }]}>
        <Pressable accessibilityRole="button" onPress={() => router.push(module.createRoute as never)} style={styles.create}>
          <Icon name="plus" size={20} color="#fff" strokeWidth={2.4} />
          <Text style={styles.createText}>{module.createLabel ?? 'إضافة'}</Text>
        </Pressable>
      </View>
    ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  headerWrap: { gap: 16, marginBottom: 4 },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.85, textAlign: 'auto' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 4, ...Shadow.soft },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  statLabel: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line },
  search: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { minHeight: 44, borderRadius: Radius.sm, backgroundColor: Tint.successBg, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: StatusText.success },
  createWrap: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.line },
  create: { minHeight: 52, borderRadius: Radius.sm, backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  createText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  card: { gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, ...Shadow.soft },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  sub: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  side: { alignItems: 'flex-end', gap: 8, maxWidth: '40%' },
  value: { fontSize: 16, fontWeight: '800', color: Colors.text },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
