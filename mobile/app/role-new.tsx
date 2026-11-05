import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { SkeletonList } from '../components/ui/Skeleton';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Colors, Layout, Radius, Shadow } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useStyles } from '../lib/theme';

interface Preset { key: string; name_ar: string; description_ar?: string; category?: string; permissions?: string[] }

const CATEGORIES: Record<string, string> = {
  all: 'الكل', staff: 'الموظفون', management: 'الإدارة', finance: 'المالية', sales: 'المبيعات', inventory: 'المخزون', production: 'الإنتاج',
};
const BASE_FOR: Record<string, string> = { finance: 'accountant', management: 'manager' };

export default function NewRoleScreen() {
  const styles = useStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Preset | 'blank' | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/workspace-roles')
      .then((res) => {
        const raw = res.data?.presets ?? {};
        setPresets(Object.entries(raw).map(([key, v]) => ({ key, ...(v as Omit<Preset, 'key'>) })));
      })
      .catch(() => setPresets([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return presets
      .filter((p) => category === 'all' || p.category === category)
      .filter((p) => !q || `${p.name_ar} ${p.description_ar ?? ''}`.toLowerCase().includes(q));
  }, [presets, category, query]);

  function choose(p: Preset | 'blank') {
    setPicked(p);
    setName(p === 'blank' ? '' : p.name_ar);
  }

  async function create() {
    if (!name.trim()) {
      toast('اكتب اسم الدور');
      return;
    }
    setSaving(true);
    try {
      const preset = picked && picked !== 'blank' ? picked : null;
      const res = await api.post('/workspace-roles', {
        name: name.trim(),
        is_custom: true,
        base_role: preset?.category ? BASE_FOR[preset.category] ?? 'employee' : 'employee',
        permissions: [],
        ...(preset ? { preset_key: preset.key } : {}),
      });
      const id = res.data?.data?.id;
      toast('تم إنشاء الدور');
      router.replace(id ? (`/role/${id}` as never) : ('/roles' as never));
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إنشاء الدور'));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <View style={{ gap: 12 }}>
      <Text style={styles.intro}>اختر قالباً جاهزاً بصلاحيات مناسبة ثم عدّلها، أو ابدأ من الصفر.</Text>
      <Pressable accessibilityRole="button" onPress={() => choose('blank')} style={[styles.card, picked === 'blank' && styles.cardOn]}>
        <View style={styles.icon}><Icon name="plus" size={20} color={Colors.accentStrong} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>دور فارغ</Text>
          <Text style={styles.meta}>بدون صلاحيات، تحدّدها بنفسك</Text>
        </View>
      </Pressable>
      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن قالب…" placeholderTextColor={Colors.textFaint} style={styles.search} accessibilityLabel="بحث في القوالب" />
      </View>
      <FlatList
        horizontal
        data={Object.entries(CATEGORIES)}
        keyExtractor={([k]) => k}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item: [k, label] }) => (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: category === k }} onPress={() => setCategory(k)} style={[styles.pill, category === k && styles.pillOn]}>
            <Text style={[styles.pillText, category === k && { color: Colors.accent }]}>{label}</Text>
          </Pressable>
        )}
      />
    </View>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('دور جديد'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={6} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.key}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState icon="lock" title="لا توجد قوالب مطابقة" compact />}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => choose(item)} style={[styles.card, picked && picked !== 'blank' && picked.key === item.key && styles.cardOn]}>
              <View style={styles.icon}><Icon name="lock" size={20} color={Colors.accentStrong} /></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.name}>{item.name_ar}</Text>
                {item.description_ar ? <Text style={styles.meta}>{item.description_ar}</Text> : null}
                <Text style={styles.count}>{item.permissions?.length ?? 0} صلاحية</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {picked ? (
        <View style={styles.footer}>
          <Input label="اسم الدور" value={name} onChangeText={setName} />
          <Button label="إنشاء الدور وتعديل صلاحياته" onPress={create} loading={saving} />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  intro: { fontSize: 14, color: Colors.textMuted, textAlign: 'auto', lineHeight: 22 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.line, padding: 16, ...Shadow.soft },
  cardOn: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto', lineHeight: 18 },
  count: { fontSize: 12, fontWeight: '700', color: Colors.accentStrong, textAlign: 'auto' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line },
  search: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  pill: { minHeight: Layout.minTouch, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  pillOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  pillText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  footer: { gap: 12, padding: 16, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.line },
});
