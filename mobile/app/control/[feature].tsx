import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { autoRow, extract, formatScalar, humanKey } from '../../components/ResourceScreen';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Gradient } from '../../components/ui/Gradient';
import { Input } from '../../components/ui/Input';
import { PickerItem, PickerSheet } from '../../components/ui/PickerSheet';
import { SelectField } from '../../components/ui/SelectField';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText, Tint } from '../../constants/theme';
import { api } from '../../lib/api';
import { CONTROL_FEATURES, Field, FeatureAction } from '../../lib/controlFeatures';
import { apiErrorMessage } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useBottomInset } from '../../lib/insets';
import { ModuleRow } from '../../lib/modules';
import { useStyles } from '../../lib/theme';

type Obj = Record<string, unknown>;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const initialValues = (fields: Field[], currency: string): Record<string, string> =>
  Object.fromEntries(fields.map((f) => [f.key, f.key === 'currency' ? currency : f.initial ?? '']));

function validate(fields: Field[], values: Record<string, string>): string | null {
  for (const f of fields) {
    const v = (values[f.key] ?? '').trim();
    if (f.required && !v) return `${f.label}: مطلوب`;
    if (!v) continue;
    if (f.type === 'number' && !/^\d+(\.\d+)?$/.test(v)) return `${f.label}: أدخل رقماً صحيحاً`;
    if (f.type === 'date' && !DATE.test(v)) return `${f.label}: بصيغة 2026-12-31`;
    if (f.type === 'month' && !/^\d{4}-\d{2}$/.test(v)) return `${f.label}: بصيغة 2026-12`;
    if (f.key === 'currency' && !/^[A-Za-z]{3}$/.test(v)) return 'العملة من 3 أحرف مثل ILS';
  }
  return null;
}

function body(fields: Field[], values: Record<string, string>): Obj {
  const out: Obj = {};
  for (const f of fields) {
    const v = (values[f.key] ?? '').trim();
    if (!v) continue;
    out[f.key] = f.type === 'department' || f.type === 'party' ? Number(v) : f.key === 'currency' ? v.toUpperCase() : f.key === 'reminder_days' ? Number(v) : v;
  }
  return out;
}

export default function ControlFeatureScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const { feature } = useLocalSearchParams<{ feature: string }>();
  const config = CONTROL_FEATURES[feature];
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [stats, setStats] = useState<{ key: string; value: unknown }[]>([]);
  const [departments, setDepartments] = useState<PickerItem[]>([]);
  const [parties, setParties] = useState<PickerItem[]>([]);
  const [currency, setCurrency] = useState('ILS');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pickerField, setPickerField] = useState<Field | null>(null);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<{ row: ModuleRow; action: FeatureAction } | null>(null);
  const [actionValues, setActionValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const [res, lookups] = await Promise.all([api.get(`/control/${feature}`), api.get('/control-lookups').catch(() => null)]);
      const { list, stats: s } = extract(res.data);
      const mapped: ModuleRow[] = [];
      list.forEach((raw, i) => {
        const row = autoRow(raw, i);
        if (row) mapped.push({ ...row, raw });
      });
      setRows(mapped);
      setStats(s.filter((x) => humanKey(x.key)));
      const lk = (lookups?.data?.data ?? lookups?.data ?? {}) as Obj;
      const toItems = (v: unknown): PickerItem[] => (Array.isArray(v) ? v : []).map((x: Obj) => ({ id: Number(x.id), title: String(x.company_name || x.name || `#${x.id}`) }));
      setDepartments(toItems(lk.departments));
      setParties(toItems(lk.parties));
      const cur = String(lk.currency ?? lk.base_currency ?? '');
      if (/^[A-Za-z]{3}$/.test(cur)) setCurrency(cur.toUpperCase());
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFailed(status === 403 ? 'ليست لديك صلاحية لعرض هذه الصفحة.' : 'تعذّر تحميل البيانات. تحقق من الاتصال.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [feature]);

  useEffect(() => { load(); }, [load]);

  if (!config) return <EmptyState icon="alertCircle" title="الصفحة غير موجودة" />;

  const fields = config.fields ?? [];

  function openForm() {
    setValues(initialValues(fields, currency));
    setAdding(true);
  }

  async function create() {
    const problem = validate(fields, values);
    if (problem) { toast(problem); return; }
    setSaving(true);
    try {
      await api.post(`/control/${feature}`, body(fields, values));
      toast('تمت الإضافة');
      setAdding(false);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر الحفظ'));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(row: ModuleRow, action: FeatureAction, vals: Record<string, string>) {
    if (action.fields) {
      const problem = validate(action.fields, vals);
      if (problem) { toast(problem); return; }
    }
    setSaving(true);
    try {
      const req = action.request(row.raw ?? {}, vals);
      if (req.method === 'patch') await api.patch(req.url, req.body);
      else await api.post(req.url, req.body);
      toast(action.success);
      setActing(null);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر تنفيذ الإجراء'));
    } finally {
      setSaving(false);
    }
  }

  function renderField(f: Field, vals: Record<string, string>, set: (k: string, v: string) => void) {
    if (f.type === 'choice') {
      return (
        <View key={f.key} style={{ gap: 8 }}>
          <Text style={styles.label}>{f.label}</Text>
          <View style={styles.chips}>
            {Object.entries(f.options ?? {}).map(([k, l]) => (
              <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: vals[f.key] === k }} onPress={() => set(f.key, k)} style={[styles.chip, vals[f.key] === k && styles.chipOn]}>
                <Text style={[styles.chipText, vals[f.key] === k && { color: Colors.accent }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }
    if (f.type === 'department' || f.type === 'party') {
      const items = f.type === 'department' ? departments : parties;
      const picked = items.find((i) => String(i.id) === vals[f.key]);
      return <SelectField key={f.key} label={f.label} value={picked?.title} placeholder={items.length ? 'اختر…' : 'لا توجد خيارات'} onPress={() => setPickerField(f)} />;
    }
    return (
      <Input
        key={f.key}
        label={f.label}
        value={vals[f.key] ?? ''}
        onChangeText={(v) => set(f.key, f.key === 'currency' ? v.toUpperCase().slice(0, 3) : v)}
        placeholder={f.placeholder}
        keyboardType={f.type === 'number' ? 'decimal-pad' : f.type === 'date' || f.type === 'month' ? 'numbers-and-punctuation' : 'default'}
        autoCapitalize={f.key === 'currency' ? 'characters' : 'sentences'}
      />
    );
  }

  const [first, ...others] = stats;
  const setValue = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }));
  const setActionValue = (k: string, v: string) => setActionValues((cur) => ({ ...cur, [k]: v }));

  const header = (
    <View style={{ gap: 16 }}>
      <Text style={styles.intro}>{config.intro}</Text>
      {first ? (
        <Gradient colors={[Colors.accent, Colors.accentStrong]} style={styles.hero}>
          <View style={styles.glow} />
          <Text style={styles.heroLabel}>{humanKey(first.key)}</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{formatScalar(first.key, first.value)}</Text>
        </Gradient>
      ) : null}
      {others.length > 0 ? (
        <View style={styles.statGrid}>
          {others.slice(0, 4).map((x) => (
            <View key={x.key} style={styles.stat}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatScalar(x.key, x.value)}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{humanKey(x.key)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {fields.length > 0 ? (
        adding ? (
          <View style={styles.card}>
            <Text style={styles.name}>{config.createLabel}</Text>
            {fields.map((f) => renderField(f, values, setValue))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button label="حفظ" onPress={create} loading={saving} /></View>
              <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setAdding(false)} /></View>
            </View>
          </View>
        ) : (
          <Button label={`+ ${config.createLabel}`} onPress={openForm} />
        )
      ) : null}
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t(config.title), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title={config.title} message={failed} actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => `${r.id}-${i}`}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="file" title="لا توجد بيانات بعد" message={config.intro} compact />}
          renderItem={({ item }) => {
            const tone = item.badge ? { ok: [Tint.successBg, StatusText.success], warn: [Tint.warningBg, StatusText.warning], bad: [Tint.dangerBg, StatusText.danger], info: [Tint.infoBg, Colors.accentStrong] }[item.badge.tone] : null;
            const available = (config.actions ?? []).filter((a) => item.raw && a.visible(item.raw));
            const isActing = acting?.row.id === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name} numberOfLines={2}>{item.title}</Text>
                    {item.subtitle ? <Text style={styles.small} numberOfLines={2}>{item.subtitle}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    {item.value ? <Text style={styles.value}>{item.value}</Text> : null}
                    {item.badge && tone ? <View style={[styles.badge, { backgroundColor: tone[0] }]}><Text style={[styles.badgeText, { color: tone[1] }]}>{item.badge.text}</Text></View> : null}
                  </View>
                </View>
                {isActing && acting ? (
                  <View style={{ gap: 12 }}>
                    {(acting.action.fields ?? []).map((f) => renderField(f, actionValues, setActionValue))}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Button label={acting.action.label} onPress={() => runAction(item, acting.action, actionValues)} loading={saving} /></View>
                      <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setActing(null)} /></View>
                    </View>
                  </View>
                ) : available.length > 0 ? (
                  <View style={styles.actions}>
                    {available.map((a) => (
                      <Pressable
                        key={a.label}
                        accessibilityRole="button"
                        onPress={() => {
                          if (a.fields) { setActionValues(initialValues(a.fields, currency)); setActing({ row: item, action: a }); } else runAction(item, a, {});
                        }}
                        style={[styles.action, a.tone === 'ok' && { backgroundColor: Tint.successBg }, a.tone === 'bad' && { backgroundColor: Tint.dangerBg }]}
                      >
                        <Text style={[styles.actionText, a.tone === 'ok' && { color: StatusText.success }, a.tone === 'bad' && { color: StatusText.danger }]}>{a.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
      <PickerSheet
        visible={!!pickerField}
        title={pickerField?.label ?? ''}
        items={[{ id: 0, title: 'بدون' }, ...(pickerField?.type === 'department' ? departments : parties)]}
        onSelect={(i) => { if (pickerField) setValue(pickerField.key, Number(i.id) ? String(i.id) : ''); setPickerField(null); }}
        onClose={() => setPickerField(null)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  intro: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto', lineHeight: 22 },
  hero: { borderRadius: Radius.lg, padding: 24, gap: 8, shadowColor: Colors.accentStrong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 6 },
  glow: { position: 'absolute', top: -48, right: -48, width: 160, height: 160, borderRadius: 80, backgroundColor: '#fff', opacity: 0.12 },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.85, textAlign: 'auto' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 4, ...Shadow.soft },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  statLabel: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  small: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  value: { fontSize: 16, fontWeight: '800', color: Colors.text },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 16, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1, minHeight: Layout.minTouch, paddingHorizontal: 12, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
});
