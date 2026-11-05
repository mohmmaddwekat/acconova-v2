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
import { Colors, Layout, Radius, Shadow, StatusText } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/format';
import { t } from '../lib/i18n';
import { useBottomInset } from '../lib/insets';
import { listOf, TaskItem } from '../lib/tasks';
import { useStyles } from '../lib/theme';

interface Project { id: number; name: string; description?: string | null; color?: string | null; starts_on?: string | null; due_on?: string | null }

const COLORS: { key: string; label: string; hex: string }[] = [
  { key: 'blue', label: 'أزرق', hex: '#068CF0' },
  { key: 'green', label: 'أخضر', hex: '#22a06b' },
  { key: 'purple', label: 'بنفسجي', hex: '#7b5cd6' },
  { key: 'orange', label: 'برتقالي', hex: '#e08a2e' },
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function TaskProjectsScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<Project | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('blue');
  const [starts, setStarts] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get('/task-management');
      const root = (res.data?.data ?? res.data) as Record<string, unknown>;
      setProjects(listOf<Project>(root, 'projects'));
      setTasks(listOf<TaskItem>(root, 'tasks'));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function open(project: Project | 'new') {
    setForm(project);
    if (project === 'new') {
      setName(''); setDescription(''); setColor('blue'); setStarts(''); setDue('');
    } else {
      setName(project.name); setDescription(project.description ?? ''); setColor(project.color ?? 'blue');
      setStarts(project.starts_on?.slice(0, 10) ?? ''); setDue(project.due_on?.slice(0, 10) ?? '');
    }
  }

  async function save() {
    if (!name.trim()) { toast('اكتب اسم المشروع'); return; }
    if ((starts && !DATE.test(starts)) || (due && !DATE.test(due))) { toast('التاريخ بصيغة 2026-12-31'); return; }
    const body = { name: name.trim(), description: description.trim() || null, color, starts_on: starts || null, due_on: due || null };
    setSaving(true);
    try {
      if (form === 'new') await api.post('/task-management/projects', body);
      else if (form) await api.patch(`/task-management/projects/${form.id}`, body);
      toast('تم حفظ المشروع');
      setForm(null);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر حفظ المشروع'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    try {
      await api.delete(`/task-management/projects/${deleting.id}`);
      toast('تم حذف المشروع');
      setDeleting(null);
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'انقل مهام المشروع أو أرشفها قبل حذفه'));
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  }

  const header = form ? (
    <View style={styles.card}>
      <Text style={styles.name}>{form === 'new' ? 'مشروع جديد' : 'تعديل المشروع'}</Text>
      <Input label="اسم المشروع" value={name} onChangeText={setName} />
      <Input label="الوصف (اختياري)" value={description} onChangeText={setDescription} multiline style={{ minHeight: 72, textAlignVertical: 'top' }} />
      <Text style={styles.label}>اللون</Text>
      <View style={styles.chips}>
        {COLORS.map((c) => (
          <Pressable key={c.key} accessibilityRole="button" accessibilityState={{ selected: color === c.key }} onPress={() => setColor(c.key)} style={[styles.chip, color === c.key && styles.chipOn]}>
            <View style={[styles.swatch, { backgroundColor: c.hex }]} />
            <Text style={[styles.chipText, color === c.key && { color: Colors.accent }]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      <Input label="تاريخ البدء (اختياري)" value={starts} onChangeText={setStarts} placeholder="2026-12-01" keyboardType="numbers-and-punctuation" />
      <Input label="تاريخ التسليم (اختياري)" value={due} onChangeText={setDue} placeholder="2026-12-31" keyboardType="numbers-and-punctuation" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button label="حفظ" onPress={save} loading={saving} /></View>
        <View style={{ flex: 1 }}><Button label="إلغاء" variant="ghost" onPress={() => setForm(null)} /></View>
      </View>
    </View>
  ) : (
    <Button label="+ مشروع جديد" onPress={() => open('new')} />
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: t('المشاريع'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {loading ? (
        <SkeletonList rows={4} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل المشاريع" actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => String(p.id)}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="file" title="لا توجد مشاريع بعد" message="كل مهمة تنتمي إلى مشروع، فابدأ بإنشاء مشروع." compact />}
          renderItem={({ item }) => {
            const mine = tasks.filter((x) => x.project_id === item.id);
            const done = mine.filter((x) => x.status === 'completed').length;
            const pct = mine.length ? Math.round((done / mine.length) * 100) : 0;
            const hex = COLORS.find((c) => c.key === (item.color ?? 'blue'))?.hex ?? Colors.accent;
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={[styles.dot, { backgroundColor: hex }]} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>
                      {[`${mine.length} مهمة`, `${done} مكتملة`, item.due_on ? `التسليم ${item.due_on.slice(0, 10)}` : null].filter(Boolean).join(' • ')}
                    </Text>
                  </View>
                  <Text style={styles.pct}>{pct}%</Text>
                </View>
                <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: hex }]} /></View>
                {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" onPress={() => open(item)} style={styles.action}><Text style={styles.actionText}>تعديل</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setDeleting(item)} style={[styles.action, { backgroundColor: 'transparent' }]}><Text style={[styles.actionText, { color: StatusText.danger }]}>حذف</Text></Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
      <ConfirmDialog
        visible={!!deleting}
        title="حذف المشروع؟"
        description={`سيتم حذف «${deleting?.name ?? ''}». لا يمكن حذف مشروع فيه مهام نشطة.`}
        confirmLabel="حذف"
        loading={saving}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 16, gap: 12, ...Shadow.soft },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  meta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  pct: { fontSize: 18, fontWeight: '800', color: Colors.accentStrong },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.bgSoft, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  desc: { fontSize: 14, color: Colors.textSoft, textAlign: 'auto', lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 12, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: Layout.minTouch, borderRadius: Radius.sm, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
});
