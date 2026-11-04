import React from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { Colors, Radius } from '../../constants/theme';
import { Icon } from './Icon';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';

interface NumpadProps {
  value: string;
  onChange: (next: string) => void;
  maxDigits?: number;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'del'],
];

export function Numpad({ value, onChange, maxDigits = 9 }: NumpadProps) {
  const styles = useStyles(createStyles);
  // The pad must read 1-2-3 left to right in both layout directions.
  const rowDirection = I18nManager.isRTL ? 'row-reverse' : 'row';

  function press(key: string) {
    if (key === 'del') {
      onChange(value.length > 1 ? value.slice(0, -1) : '0');
      return;
    }
    if (key === '.') {
      if (value.includes('.')) return;
      onChange(value + '.');
      return;
    }
    if (value.replace('.', '').length >= maxDigits) return;
    const [, decimals = ''] = value.split('.');
    if (value.includes('.') && decimals.length >= 2) return;
    onChange(value === '0' ? key : value + key);
  }

  return (
    <View style={styles.pad}>
      {ROWS.map((row, r) => (
        <View key={r} style={[styles.row, { flexDirection: rowDirection }]}>
          {row.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === 'del' ? 'حذف' : key === '.' ? 'فاصلة عشرية' : key}
              onPress={() => press(key)}
              onLongPress={key === 'del' ? () => onChange('0') : undefined}
              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
            >
              {key === 'del' ? (
                <Icon name="backspace" size={22} color={Colors.text} />
              ) : (
                <Text style={styles.keyText}>{key === '.' ? '•' : key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  pad: { gap: 8 },
  row: { gap: 8 },
  key: {
    flex: 1,
    height: 58,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  keyText: { fontSize: 22, fontWeight: '700', color: Colors.text },
});
