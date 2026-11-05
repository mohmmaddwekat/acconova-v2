import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PickerSheet, PickerItem } from '../components/ui/PickerSheet';
import { SelectField } from '../components/ui/SelectField';
import { StickyFooter } from '../components/ui/StickyFooter';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius } from '../constants/theme';
import { api } from '../lib/api';
import { apiErrorMessage, todayISO } from '../lib/format';
import { t } from '../lib/i18n';
import { useStyles } from '../lib/theme';

const PRIORITIES: { key: string; label: string }[] = [
  { key: 'low', label: 'منخفضة' },
  { key: 'normal', label: 'عادية' },
  { key: 'high', label: 'عالية' },
  { key: 'urgent', label: 'عاجلة' },
];

export default function NewTaskScreen() {
  const styles = useStyles(createStyles);
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueOn, setDueOn] = useState('');
  const [projects, setProjects] = useState<PickerItem[]>([]);
  const [project, setProject] = useState<PickerItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; project?: string; due?: string }>({});

  useEffect(() => {
    api
      .get('/task-management/projects')
      .then((res) => {
        const body = res.data?.data ?? res.data;
        const list: { id: number; name?: string; title?: string }[] = Array.isArray(body) ? body : body?.projects ?? body?.data ?? [];
        const items = list.map((p) => ({ id: p.id, title: p.name ?? p.title ?? `#${p.id}` }));
        setProjects(items);
        if (items.length === 1) setProject(items[0]);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  async function save() {
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'عنوان المهمة مطلوب';
    if (!project) next.project = 'اختر المشروع';
    if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) next.due = 'اكتب التاريخ بصيغة 2026-12-31';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await api.post('/task-management/tasks', {
        title: title.trim(),
        description: description.trim() || null,
        task_project_id: project!.id,
        priority,
        status: 'todo',
        ...(dueOn ? { due_on: dueOn } : {}),
      });
      toast('تمت إضافة المهمة');
      router.back();
    } catch (err) {
      toast(apiErrorMessage(err, 'تعذّر إضافة المهمة'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: t('مهمة جديدة'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Input label="عنوان المهمة" value={title} onChangeText={setTitle} placeholder="مثال: مراجعة فواتير الموردين" error={errors.title} />
        <SelectField
          label="المشروع"
          value={project?.title}
          placeholder={loadingProjects ? 'جارٍ التحميل…' : projects.length ? 'اختر المشروع' : 'لا توجد مشاريع'}
          onPress={() => setPickerOpen(true)}
          error={errors.project}
        />
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>الأولوية</Text>
          <View style={styles.row}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityState={{ selected: priority === p.key }}
                onPress={() => setPriority(p.key)}
                style={[styles.chip, priority === p.key && styles.chipOn]}
              >
                <Text style={[styles.chipText, priority === p.key && { color: Colors.accent }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Input label="تاريخ الاستحقاق (اختياري)" value={dueOn} onChangeText={setDueOn} placeholder={todayISO()} keyboardType="numbers-and-punctuation" error={errors.due} />
        <Input label="الوصف (اختياري)" value={description} onChangeText={setDescription} multiline placeholder="تفاصيل المهمة" style={{ minHeight: 96, textAlignVertical: 'top' }} />
      </ScrollView>

      <StickyFooter safeBottom>
        <Button label="حفظ المهمة" onPress={save} loading={saving} />
      </StickyFooter>

      <PickerSheet
        visible={pickerOpen}
        title="اختر المشروع"
        items={projects}
        loading={loadingProjects}
        onSelect={(item) => { setProject(item); setPickerOpen(false); setErrors((e) => ({ ...e, project: undefined })); }}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 16, gap: 16 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSoft, textAlign: 'auto' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: Layout.minTouch, paddingHorizontal: 16, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
