import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Layout, Radius, StatusText, Tint } from '../constants/theme';
import { useStyles } from '../lib/theme';
import { Icon, IconName } from './ui/Icon';
import { Text } from './ui/Text';

interface QuickActionsSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface Action {
  label: string;
  icon: IconName;
  fg: string;
  bg: string;
  go: () => void;
}

interface Section {
  title: string;
  actions: Action[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

const staff = (kind: string) => () => router.push({ pathname: '/staff-action', params: { kind } });

function getSections(): Section[] {
  return [
    {
      title: 'الفواتير',
      actions: [
        { label: 'فاتورة بيع', icon: 'fileUp', fg: Colors.info, bg: Tint.infoBg, go: () => router.push({ pathname: '/new-invoice', params: { kind: 'sale' } }) },
        { label: 'فاتورة شراء', icon: 'fileDown', fg: StatusText.warning, bg: Tint.warningBg, go: () => router.push({ pathname: '/new-invoice', params: { kind: 'purchase' } }) },
      ],
    },
    {
      title: 'الصندوق',
      actions: [
        { label: 'سند قبض', icon: 'banknote', fg: StatusText.success, bg: Tint.successBg, go: () => router.navigate({ pathname: '/(tabs)/quick-entry', params: { type: 'receipt' } }) },
        { label: 'سند دفع', icon: 'dollar', fg: StatusText.danger, bg: Tint.dangerBg, go: () => router.navigate({ pathname: '/(tabs)/quick-entry', params: { type: 'payment' } }) },
      ],
    },
    {
      title: 'الموظفون',
      actions: [
        { label: 'تسجيل حضور', icon: 'calendar', fg: StatusText.success, bg: Tint.successBg, go: staff('attendance') },
        { label: 'صرف راتب', icon: 'banknote', fg: Colors.accentStrong, bg: Tint.infoBg, go: staff('payment') },
        { label: 'سلفة', icon: 'card', fg: StatusText.warning, bg: Tint.warningBg, go: staff('advance') },
        { label: 'مكافأة', icon: 'plus', fg: StatusText.success, bg: Tint.successBg, go: staff('bonus') },
        { label: 'بدل', icon: 'plus', fg: Colors.accentStrong, bg: Tint.infoBg, go: staff('allowance') },
        { label: 'خصم', icon: 'close', fg: StatusText.danger, bg: Tint.dangerBg, go: staff('deduction') },
      ],
    },
  ];
}

export function QuickActionsSheet({ visible, onClose }: QuickActionsSheetProps) {
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <Text style={styles.title}>إضافة سريعة</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {getSections().map((section) => (
              <View key={section.title} style={{ gap: 8 }}>
                <Text style={styles.section}>{section.title}</Text>
                <View style={styles.grid}>
                  {chunk(section.actions, 3).map((row, ri) => (
                    <View key={ri} style={styles.gridRow}>
                  {row.map((a) => (
                    <Pressable
                      key={a.label}
                      accessibilityRole="button"
                      accessibilityLabel={a.label}
                      onPress={() => {
                        onClose();
                        a.go();
                      }}
                      style={({ pressed }) => [styles.tile, pressed && { backgroundColor: Colors.bgSoft }]}
                    >
                      <View style={[styles.icon, { backgroundColor: a.bg }]}>
                        <Icon name={a.icon} size={22} color={a.fg} />
                      </View>
                      <Text style={styles.label}>{a.label}</Text>
                    </Pressable>
                  ))}
                  {Array.from({ length: 3 - row.length }).map((_, i) => <View key={`pad${i}`} style={styles.tilePad} />)}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Tint.overlay, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '85%', backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10, gap: 12,
  },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.line },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  section: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textAlign: 'auto' },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface,
  },
  tilePad: { flex: 1 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textSoft, textAlign: 'center' },
});
