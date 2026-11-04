import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';

interface StickyFooterProps {
  children: React.ReactNode;
  totalLabel?: string;
  totalValue?: string;
  /** Pad for the system navigation bar; needed on screens that have no tab bar beneath them. */
  safeBottom?: boolean;
}

export function StickyFooter({ children, totalLabel, totalValue, safeBottom }: StickyFooterProps) {
  const insets = useSafeAreaInsets();
  const styles = useStyles(createStyles);
  return (
    <View style={[styles.footer, { paddingBottom: 12 + (safeBottom ? insets.bottom : 0) }]}>
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

const createStyles = () => StyleSheet.create({
  footer: {
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.line,
    paddingHorizontal: 14, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  total: { minWidth: 92 },
  totalLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', textAlign: 'auto' },
  totalValue: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  actions: { flex: 1, flexDirection: 'row', gap: 10 },
});
