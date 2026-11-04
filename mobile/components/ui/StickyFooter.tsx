import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/theme';

interface StickyFooterProps {
  children: React.ReactNode;
  totalLabel?: string;
  totalValue?: string;
}

export function StickyFooter({ children, totalLabel, totalValue }: StickyFooterProps) {
  return (
    <View style={[styles.footer, { paddingBottom: 12 }]}>
      {totalValue ? (
        <View style={styles.total}>
          <Text style={styles.totalLabel}>{totalLabel}</Text>
          <Text style={styles.totalValue}>{totalValue}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.line,
    paddingHorizontal: 14, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  total: { minWidth: 92 },
  totalLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', textAlign: 'right' },
  totalValue: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  actions: { flex: 1, flexDirection: 'row', gap: 10 },
});
