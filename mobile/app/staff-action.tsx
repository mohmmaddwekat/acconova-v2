import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Icon } from '../components/ui/Icon';
import { PickerSheet } from '../components/ui/PickerSheet';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SelectField } from '../components/ui/SelectField';
import { StickyFooter } from '../components/ui/StickyFooter';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';
import { useToast } from '../components/ui/Toast';
import { Colors, Layout, Radius, StatusText } from '../constants/theme';
import { apiErrorMessage, formatMoney } from '../lib/format';
import { dayISO, ENTRY_KINDS, EntryKind, fetchStaff, recordAttendance, recordEntry, StaffRow } from '../lib/staff';
import { useStyles } from '../lib/theme';

type Kind = 'attendance' | EntryKind;

const KIND_COLOR: Record<Kind, string> = {
  attendance: '#177A52',
  payment: '#045495',
  advance: '#8F6416',
  bonus: '#177A52',
  allowance: '#045495',
  deduction: '#B5444A',
};

function isKind(value: string | undefined): value is Kind {
  return value === 'attendance' || value === 'payment' || value === 'advance' || value === 'bonus' || value === 'allowance' || value === 'deduction';
}

export default function StaffActionScreen() {
  const styles = useStyles(createStyles);
  const params = useLocalSearchParams<{ kind?: string; staffId?: string }>();
  const kind: Kind = isKind(params.kind) ? params.kind : 'payment';
  const toast = useToast();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [employee, setEmployee] = useState<StaffRow | null>(null);
  const [picker, setPicker] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'present' | 'absent'>('present');
  const [overtime, setOvertime] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    fetchStaff()
      .then((rows) => {
        setStaff(rows);
        if (params.staffId) setEmployee(rows.find((r) => String(r.id) === params.staffId) ?? null);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const date = dayISO(dayOffset);
  const balance = Number(employee?.balance ?? 0);
  const title = kind === 'attendance' ? 'تسجيل حضور' : ENTRY_KINDS[kind].label;
  const color = KIND_COLOR[kind];

  const pickerItems = useMemo(
    () =>
      staff
        .filter((s) => s.active)
        .map((s) => ({
          id: s.id,
          title: s.name,
          subtitle: [s.job_title, s.balance != null ? `المستحق ${formatMoney(s.balance)}` : null].filter(Boolean).join(' · '),
        })),
    [staff],
  );

  function validate(): boolean {
    if (!employee) {
      setError('اختر الموظف');
      return false;
    }
    if (kind !== 'attendance' && !(Number(amount) > 0)) {
      toast('أدخل مبلغاً صحيحاً');
      return false;
    }
    return true;
  }

  async function save() {
    if (!employee) return;
    setSaving(true);
    try {
      if (kind === 'attendance') {
        await recordAttendance(employee.id, date, status, Number(overtime) || 0);
        toast(status === 'present' ? 'تم تسجيل الحضور' : 'تم تسجيل الغياب');
      } else {
        await recordEntry(employee.id, kind, Number(amount), date, notes.trim() || undefined);
        toast('تم تسجيل العملية');
      }
      setConfirming(false);
      router.back();
    } catch (err: any) {
      setConfirming(false);
      toast(apiErrorMessage(err, 'تعذّر تنفيذ العملية'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title={title} tone="solid" color={color} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SelectField
            label="الموظف"
            value={employee?.name}
            placeholder={loading ? 'جارٍ التحميل...' : failed ? 'تعذّر تحميل الموظفين' : 'اختر الموظف'}
            onPress={() => setPicker(true)}
            error={error}
          />

          {employee && (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{employee.name}</Text>
                {employee.job_title ? <Text style={styles.sub}>{employee.job_title}</Text> : null}
              </View>
              <View style={styles.row}>
                <Text style={styles.sub}>المستحق للموظف حالياً</Text>
                <Text style={[styles.balance, { color: balance > 0 ? StatusText.warning : balance < 0 ? StatusText.danger : Colors.text }]}>
                  {formatMoney(balance)}
                </Text>
              </View>
              {balance < 0 ? <Text style={styles.hint}>الرصيد بالسالب يعني أن الموظف مدين للشركة (سلفة أو دفع زائد).</Text> : null}
            </View>
          )}

          <View style={styles.dateRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="اليوم السابق" onPress={() => setDayOffset((d) => d - 1)} style={styles.dateBtn}>
              <Icon name="chevronRight" size={20} color={Colors.text} />
            </Pressable>
            <View style={styles.dateBox}>
              <Icon name="calendar" size={18} color={Colors.textMuted} />
              <Text style={styles.dateText}>{date}{dayOffset === 0 ? ' · اليوم' : ''}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="اليوم التالي"
              disabled={dayOffset >= 0}
              onPress={() => setDayOffset((d) => Math.min(0, d + 1))}
              style={[styles.dateBtn, dayOffset >= 0 && { opacity: 0.4 }]}
            >
              <Icon name="chevronLeft" size={20} color={Colors.text} />
            </Pressable>
          </View>

          {kind === 'attendance' ? (
            <>
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>الحالة</Text>
                <View style={styles.chips}>
                  <Chip label="حاضر" selected={status === 'present'} onPress={() => setStatus('present')} />
                  <Chip label="غائب" selected={status === 'absent'} onPress={() => setStatus('absent')} />
                </View>
              </View>
              {status === 'present' && (
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>ساعات إضافية (اختياري)</Text>
                  <TextInput
                    value={overtime}
                    onChangeText={(t) => setOvertime(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    style={styles.field}
                    accessibilityLabel="ساعات إضافية"
                  />
                </View>
              )}
            </>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>المبلغ</Text>
                <TextInput
                  value={amount}
                  onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  style={[styles.field, styles.amountField]}
                  accessibilityLabel="المبلغ"
                />
                {kind === 'payment' && balance > 0 ? (
                  <Pressable accessibilityRole="button" onPress={() => setAmount(String(balance))} style={styles.fullChip}>
                    <Text style={styles.fullChipText}>كامل المستحق {formatMoney(balance)}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.hint}>{ENTRY_KINDS[kind].hint}</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="ملاحظات (اختياري)"
                style={styles.field}
                maxLength={500}
                accessibilityLabel="ملاحظات"
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <StickyFooter safeBottom>
        <Button
          label={kind === 'attendance' ? 'حفظ' : `تسجيل ${ENTRY_KINDS[kind as EntryKind].label}`}
          loading={saving && kind === 'attendance'}
          onPress={() => {
            if (!validate()) return;
            if (kind === 'attendance') void save();
            else setConfirming(true);
          }}
          style={{ flex: 1 }}
        />
      </StickyFooter>

      <PickerSheet
        visible={picker}
        title="اختيار الموظف"
        loading={loading}
        items={pickerItems}
        onSelect={(item) => {
          setEmployee(staff.find((s) => s.id === item.id) ?? null);
          setError(undefined);
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
      />

      <ConfirmDialog
        visible={confirming}
        title="تأكيد العملية"
        description="ستُسجَّل في سجل الموظف وتظهر في الموقع أيضاً."
        rows={[
          { label: 'الموظف', value: employee?.name ?? '—' },
          { label: 'النوع', value: kind === 'attendance' ? '' : ENTRY_KINDS[kind as EntryKind].label },
          { label: 'المبلغ', value: formatMoney(Number(amount) || 0) },
          { label: 'التاريخ', value: date },
        ]}
        confirmLabel="تأكيد"
        loading={saving}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 14, gap: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted },
  balance: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, color: Colors.textMuted, lineHeight: 20, textAlign: 'auto' },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textAlign: 'auto' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtn: { width: Layout.minTouch, height: Layout.minTouch, borderRadius: 12, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  dateBox: {
    flex: 1, minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.xs, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line,
  },
  dateText: { fontSize: 14, fontWeight: '700', color: Colors.textSoft },
  chips: { flexDirection: 'row', gap: 8 },
  field: {
    minHeight: 52, borderRadius: Radius.xs, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface,
    paddingHorizontal: 14, fontSize: 15, color: Colors.text,
  },
  amountField: { fontSize: 26, fontWeight: '800', minHeight: 64 },
  fullChip: { alignSelf: 'flex-start', minHeight: Layout.minTouch, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.accentSoft },
  fullChipText: { fontSize: 13, fontWeight: '800', color: Colors.accentStrong },
});
