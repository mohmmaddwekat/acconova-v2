import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Colors, Layout, Radius, Tint } from '../../constants/theme';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';
import { TextInput } from './/TextInput';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  description?: string;
  rows?: { label: string; value: string }[];
  confirmLabel?: string;
  loading?: boolean;
  amountInput?: { label: string; initial: string };
  children?: React.ReactNode;
  onConfirm: (amount?: string) => void;
  onCancel: () => void;
}

function Dialog({
  title,
  description,
  rows,
  confirmLabel = 'تأكيد',
  loading = false,
  amountInput,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const styles = useStyles(createStyles);
  const [amount, setAmount] = useState(amountInput?.initial ?? '');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="إغلاق" />
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.desc}>{description}</Text> : null}
          {rows && rows.length > 0 && (
            <View style={styles.rows}>
              {rows.map((r, i) => (
                <View key={r.label} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  <Text style={styles.rowValue}>{r.value}</Text>
                </View>
              ))}
            </View>
          )}
          {amountInput && (
            <View style={{ gap: 6 }}>
              <Text style={styles.rowLabel}>{amountInput.label}</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                accessibilityLabel={amountInput.label}
              />
            </View>
          )}
          {children}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={[styles.btn, styles.cancel]} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelText}>إلغاء</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, styles.ok, (pressed || loading) && { opacity: 0.8 }]}
              onPress={() => onConfirm(amountInput ? amount : undefined)}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.okText}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Mounts the dialog only while open so its input state resets on every use. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return props.visible ? <Dialog {...props} /> : null;
}

const createStyles = () => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Tint.overlay, justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  desc: { fontSize: 14, color: Colors.textMuted, lineHeight: 22, textAlign: 'auto' },
  rows: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  rowLabel: { fontSize: 14, color: Colors.textMuted },
  rowValue: { fontSize: 14, fontWeight: '700', color: Colors.text },
  amountInput: {
    height: 52, borderRadius: Radius.xs, borderWidth: 1.5, borderColor: Colors.line,
    paddingHorizontal: 14, fontSize: 20, fontWeight: '700', color: Colors.text, textAlign: 'auto',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, height: 52, minHeight: Layout.minTouch, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: Colors.bgSoft },
  cancelText: { fontSize: 15, fontWeight: '700', color: Colors.textSoft },
  ok: { backgroundColor: Colors.accent },
  okText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
