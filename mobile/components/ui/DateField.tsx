import React, { useMemo, useState } from 'react';
import { I18nManager, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Layout, Radius, Tint } from '../../constants/theme';
import { todayISO } from '../../lib/format';
import { isArabic } from '../../lib/i18n';
import { useStyles } from '../../lib/theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface DateFieldProps {
  label: string;
  /** ISO date (YYYY-MM-DD) or an empty string when no date is chosen. */
  value: string;
  onChange: (iso: string) => void;
  /** Earliest / latest date that can be picked (ISO). */
  min?: string;
  max?: string;
  /** Shows a "clear" action so the date can be left empty. */
  clearable?: boolean;
  placeholder?: string;
  error?: string;
  /** Shows previous / next day buttons beside the field. */
  stepper?: boolean;
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_AR = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
const DAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parse(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

/** Moves an ISO date by a number of days. */
export function shiftISO(iso: string, days: number): string {
  const p = parse(iso) ?? parse(todayISO())!;
  const d = new Date(p.y, p.m, p.d + days);
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Tap-to-pick date field. Opens a full calendar where any month or year can be reached,
 * instead of a fixed date or day-by-day arrows.
 */
export function DateField({ label, value, onChange, min, max, clearable, placeholder = 'اختر التاريخ', error, stepper }: DateFieldProps) {
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const initial = parse(value) ?? parse(todayISO())!;
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  const today = todayISO();
  const arabic = isArabic();
  const months = arabic ? MONTHS_AR : MONTHS_EN;
  const weekdays = arabic ? DAYS_AR : DAYS_EN;

  function openPicker() {
    const p = parse(value) ?? parse(today)!;
    setView({ y: p.y, m: p.m });
    setMode('days');
    setOpen(true);
  }

  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  const cells = useMemo(() => {
    const firstWeekday = new Date(view.y, view.m, 1).getDay();
    const count = new Date(view.y, view.m + 1, 0).getDate();
    const list: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= count; d++) list.push(d);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [view]);

  function moveMonth(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  // In right-to-left layouts "previous" points to the right, so the arrows are mirrored.
  const prevIcon = I18nManager.isRTL ? 'chevronRight' : 'chevronLeft';
  const nextIcon = I18nManager.isRTL ? 'chevronLeft' : 'chevronRight';
  const canStepBack = !stepper || !min || (value ? shiftISO(value, -1) >= min : true);
  const canStepForward = !stepper || !max || (value ? shiftISO(value, 1) <= max : true);

  const field = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value || placeholder}`}
      onPress={openPicker}
      style={[styles.field, stepper && { flex: 1 }, error ? { borderColor: Colors.danger } : null]}
    >
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !value && { color: Colors.textFaint, fontWeight: '500' }]} numberOfLines={1}>
          {value ? `${value}${value === today ? ' · اليوم' : ''}` : placeholder}
        </Text>
      </View>
      <Icon name="calendar" size={20} color={Colors.textMuted} />
    </Pressable>
  );

  return (
    <View style={{ gap: 4 }}>
      {stepper ? (
        <View style={styles.stepRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="اليوم السابق"
            disabled={!canStepBack}
            onPress={() => onChange(shiftISO(value || today, -1))}
            style={[styles.stepBtn, !canStepBack && { opacity: 0.4 }]}
          >
            <Icon name={prevIcon} size={20} color={Colors.text} />
          </Pressable>
          {field}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="اليوم التالي"
            disabled={!canStepForward}
            onPress={() => onChange(shiftISO(value || today, 1))}
            style={[styles.stepBtn, !canStepForward && { opacity: 0.4 }]}
          >
            <Icon name={nextIcon} size={20} color={Colors.text} />
          </Pressable>
        </View>
      ) : (
        field
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="إغلاق" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal>
            <View style={styles.grab} />
            <Text style={styles.title}>{label}</Text>

            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={mode === 'days' ? 'الشهر السابق' : 'السنة السابقة'}
                onPress={() => (mode === 'days' ? moveMonth(-1) : setView((v) => ({ ...v, y: v.y - 1 })))}
                style={styles.navBtn}
              >
                <Icon name={prevIcon} size={20} color={Colors.text} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setMode((m) => (m === 'days' ? 'months' : 'days'))} style={styles.monthTitle}>
                <Text style={styles.monthText}>{mode === 'days' ? `${months[view.m]} ${view.y}` : `${view.y}`}</Text>
                <Icon name={mode === 'days' ? 'chevronDown' : 'chevronUp'} size={16} color={Colors.textMuted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={mode === 'days' ? 'الشهر التالي' : 'السنة التالية'}
                onPress={() => (mode === 'days' ? moveMonth(1) : setView((v) => ({ ...v, y: v.y + 1 })))}
                style={styles.navBtn}
              >
                <Icon name={nextIcon} size={20} color={Colors.text} />
              </Pressable>
            </View>

            {mode === 'months' ? (
              <View style={styles.monthGrid}>
                {months.map((name, i) => {
                  const selected = i === view.m;
                  return (
                    <Pressable
                      key={name}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setView((v) => ({ ...v, m: i }));
                        setMode('days');
                      }}
                      style={[styles.monthCell, selected && styles.cellOn]}
                    >
                      <Text style={[styles.cellText, selected && styles.cellTextOn]}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {weekdays.map((w, i) => (
                    <Text key={i} style={styles.weekday}>{w}</Text>
                  ))}
                </View>
                <View style={styles.grid}>
                  {cells.map((d, i) => {
                    if (d === null) return <View key={i} style={styles.cell} />;
                    const iso = toISO(view.y, view.m, d);
                    const disabled = !allowed(iso);
                    const selected = iso === value;
                    const isToday = iso === today;
                    return (
                      <Pressable
                        key={i}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled }}
                        accessibilityLabel={iso}
                        disabled={disabled}
                        onPress={() => pick(iso)}
                        style={[styles.cell, styles.dayCell, selected && styles.cellOn, !selected && isToday && styles.todayCell, disabled && { opacity: 0.3 }]}
                      >
                        <Text style={[styles.cellText, selected && styles.cellTextOn]}>{d}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.footer}>
              {clearable && value ? (
                <Pressable accessibilityRole="button" onPress={() => pick('')} style={[styles.footBtn, { backgroundColor: Tint.dangerBg }]}>
                  <Text style={[styles.footText, { color: Colors.danger }]}>مسح التاريخ</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={!allowed(today)}
                onPress={() => pick(today)}
                style={[styles.footBtn, !allowed(today) && { opacity: 0.4 }]}
              >
                <Text style={styles.footText}>اليوم</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const CELL = `${100 / 7}%` as const;

const createStyles = () => StyleSheet.create({
  field: {
    minHeight: 58, borderRadius: Radius.xs, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  texts: { flex: 1, gap: 1 },
  label: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', textAlign: 'auto' },
  value: { fontSize: 15, fontWeight: '700', color: Colors.text, textAlign: 'auto' },
  error: { fontSize: 12, color: Colors.danger, textAlign: 'auto' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: Layout.minTouch, height: Layout.minTouch, borderRadius: 12, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: Tint.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.line },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  navBtn: { width: Layout.minTouch, height: Layout.minTouch, borderRadius: 12, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { flex: 1, minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  monthText: { fontSize: 17, fontWeight: '800', color: Colors.text },
  weekRow: { flexDirection: 'row' },
  weekday: { width: CELL, textAlign: 'center', fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, height: 46, alignItems: 'center', justifyContent: 'center' },
  dayCell: { borderRadius: 12 },
  todayCell: { borderWidth: 1.5, borderColor: Colors.accent },
  cellOn: { backgroundColor: Colors.accent },
  cellText: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cellTextOn: { color: '#fff' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: {
    width: '31.5%', minHeight: Layout.minTouch + 8, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  footer: { flexDirection: 'row', gap: 10 },
  footBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 12, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  footText: { fontSize: 14, fontWeight: '800', color: Colors.accentStrong },
});
