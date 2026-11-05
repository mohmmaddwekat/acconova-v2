import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { SkeletonList } from '../../components/ui/Skeleton';
import { StickyFooter } from '../../components/ui/StickyFooter';
import { Text } from '../../components/ui/Text';
import { TextInput } from '../../components/ui/TextInput';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, Shadow, StatusText } from '../../constants/theme';
import { api } from '../../lib/api';
import { apiErrorMessage } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useStyles } from '../../lib/theme';
import { BASE_ROLES, Role } from '../roles';

interface Permission { key: string; label_ar: string }
interface Group { key: string; title_ar: string; description_ar?: string; permissions: Permission[] }

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export default function RoleScreen() {
  const styles = useStyles(createStyles);
  const toast = useToast();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [role, setRole] = useState<Role | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [deps, setDeps] = useState<Record<string, string[]>>({});
  const [name, setName] = useState('');
  const [base, setBase] = useState('employee');
  const [granted, setGranted] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/workspace-roles');
      const found: Role | undefined = (res.data?.roles ?? []).find((r: Role) => String(r.id) === String(id));
      if (!found) throw new Error('missing');
      setRole(found);
      setName(found.name);
      setBase(found.base_role);
      setGranted(found.permissions ?? []);
      setSaved(found.permissions ?? []);
      const raw = res.data?.permission_groups ?? [];
      setGroups(Array.isArray(raw) ? raw : Object.values(raw));
      setDeps(res.data?.permission_dependencies ?? {});
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const editable = !!role?.is_custom;
  const total = useMemo(() => groups.reduce((n, g) => n + g.permissions.length, 0), [groups]);
  const dirty = !!role && (name.trim() !== role.name || base !== role.base_role || !sameSet(granted, saved));

  /** Turning a permission on also turns on what it depends on; turning it off removes what depends on it. */
  function setPermission(key: string, on: boolean) {
    setGranted((cur) => {
      const next = new Set(cur);
      if (on) {
        const add = (k: string) => {
          if (next.has(k)) return;
          next.add(k);
          (deps[k] ?? []).forEach(add);
        };
        add(key);
        if (next.size - cur.length > 1) toast('تم تفعيل الصلاحيات المطلوبة معها');
      } else {
        const remove = (k: string) => {
          if (!next.delete(k)) return;
          Object.entries(deps).forEach(([dependent, needs]) => needs.includes(k) && remove(dependent));
        };
        remove(key);
        if (cur.length - next.size > 1) toast('تم إيقاف الصلاحيات التي تعتمد عليها');
      }
      return [...next];
    });
  }

  function setGroup(group: Group, on: boolean) {
    group.permissions.forEach((p) => setPermission(p.key, on));
  }

  async function save() {
    if (!role) return;
    setSaving(true);
    try {
      await api.patch(`/workspace-roles/${role.id}`, { name: name.trim(), is_custom: true, base_role: base, permissions: granted });
      toast('تم حفظ الدور');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر حفظ الدور'));
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!role) return;
    setSaving(true);
    try {
      const res = await api.post('/workspace-roles', { name: `${role.name} (نسخة)`, is_custom: true, base_role: role.base_role, permissions: role.permissions ?? [] });
      toast('تم إنشاء نسخة قابلة للتعديل');
      const newId = res.data?.data?.id;
      router.replace(newId ? (`/role/${newId}` as never) : ('/roles' as never));
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إنشاء النسخة'));
    } finally {
      setSaving(false);
    }
  }

  const header = <Stack.Screen options={{ headerShown: true, title: t('الدور'), headerTitleAlign: 'center', headerShadowVisible: false }} />;

  if (loading) return <View style={styles.flex}>{header}<SkeletonList rows={5} /></View>;
  if (failed || !role) return <View style={styles.flex}>{header}<EmptyState icon="lock" title="تعذّر تحميل الدور" message="إدارة الأدوار متاحة لمالك المؤسسة فقط." /></View>;

  const q = query.trim().toLowerCase();

  return (
    <View style={styles.flex}>
      {header}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Input label="اسم الدور" value={name} onChangeText={setName} editable={editable} />
          <Text style={styles.label}>يبني على</Text>
          <View style={styles.chips}>
            {Object.entries(BASE_ROLES).map(([k, l]) => (
              <Pressable key={k} disabled={!editable} accessibilityRole="button" accessibilityState={{ selected: base === k }} onPress={() => setBase(k)} style={[styles.chip, base === k && styles.chipOn]}>
                <Text style={[styles.chipText, base === k && { color: Colors.accent }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${total ? Math.round((granted.length / total) * 100) : 0}%` }]} /></View>
          <Text style={styles.note}>{granted.length} من {total} صلاحية ممنوحة</Text>
          {!editable ? (
            <>
              <Text style={styles.note}>هذا دور أساسي في النظام ولا يمكن تعديله مباشرة.</Text>
              <Button label="إنشاء نسخة قابلة للتعديل" onPress={duplicate} loading={saving} />
            </>
          ) : null}
        </View>

        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={Colors.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن صلاحية…" placeholderTextColor={Colors.textFaint} style={styles.search} accessibilityLabel="بحث في الصلاحيات" />
        </View>

        {groups.map((g) => {
          const perms = q ? g.permissions.filter((p) => p.label_ar.toLowerCase().includes(q) || g.title_ar.toLowerCase().includes(q)) : g.permissions;
          if (!perms.length) return null;
          const on = g.permissions.filter((p) => granted.includes(p.key)).length;
          const expanded = !!q || open === g.key;
          return (
            <View key={g.key} style={styles.card}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded && !q ? null : g.key)} style={styles.groupHead}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.groupTitle}>{g.title_ar}</Text>
                  <Text style={[styles.note, on > 0 && { color: Colors.accentStrong, fontWeight: '700' }]}>{on} / {g.permissions.length}</Text>
                </View>
                <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={20} color={Colors.textFaint} />
              </Pressable>
              {expanded ? (
                <>
                  {g.description_ar ? <Text style={styles.note}>{g.description_ar}</Text> : null}
                  {editable ? (
                    <View style={styles.permRow}>
                      <Text style={[styles.permLabel, { fontWeight: '800' }]}>تفعيل كل صلاحيات القسم</Text>
                      <Switch value={on === g.permissions.length} onValueChange={(v) => setGroup(g, v)} trackColor={{ true: Colors.accent, false: Colors.lineStrong }} accessibilityLabel={`تفعيل كل ${g.title_ar}`} />
                    </View>
                  ) : null}
                  {perms.map((p) => (
                    <View key={p.key} style={styles.permRow}>
                      <Text style={styles.permLabel}>{p.label_ar}</Text>
                      <Switch value={granted.includes(p.key)} disabled={!editable} onValueChange={(v) => setPermission(p.key, v)} trackColor={{ true: Colors.accent, false: Colors.lineStrong }} accessibilityLabel={p.label_ar} />
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {editable ? (
        <StickyFooter safeBottom totalLabel={dirty ? 'تعديلات غير محفوظة' : 'الصلاحيات الممنوحة'} totalValue={String(granted.length)}>
          <Button label="حفظ الدور" onPress={save} loading={saving} disabled={!dirty} />
        </StickyFooter>
      ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 20 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: Layout.minTouch },
  groupTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 16, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.bgSoft, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: StatusText.success },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line },
  search: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  permRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: Layout.minTouch },
  permLabel: { flex: 1, fontSize: 14, color: Colors.textSoft, textAlign: 'auto' },
});
