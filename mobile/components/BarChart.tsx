import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { Colors } from '../constants/theme';
import { useStyles } from '../lib/theme';
import { Text } from './ui/Text';

export interface MonthBar {
  label: string;
  revenue: number;
  expenses: number;
}

/** Paired bars per month: income in the accent color, spending in the danger color. Labels are native text so Arabic shapes correctly. */
export function BarChart({ bars }: { bars: MonthBar[] }) {
  const styles = useStyles(createStyles);
  const max = Math.max(1, ...bars.flatMap((b) => [b.revenue, b.expenses]));
  const slot = 320 / bars.length;
  const h = (v: number) => Math.max(v > 0 ? 3 : 0, (v / max) * 64);
  return (
    <View>
      <Svg viewBox="0 0 320 84" width="100%" height={96}>
        {[20, 50, 80].map((y) => (
          <Line key={y} x1="0" y1={y} x2="320" y2={y} stroke={Colors.line} strokeWidth={1} />
        ))}
        {bars.map((b, i) => {
          const x = i * slot + slot / 2;
          return (
            <React.Fragment key={b.label + i}>
              <Rect x={x - 12} y={80 - h(b.revenue)} width={11} height={h(b.revenue)} rx={3} fill={Colors.accent} opacity={i === bars.length - 1 ? 1 : 0.8} />
              <Rect x={x + 1} y={80 - h(b.expenses)} width={11} height={h(b.expenses)} rx={3} fill={Colors.danger} opacity={0.6} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.labels}>
        {bars.map((b, i) => (
          <Text key={b.label + i} style={styles.label} numberOfLines={1} adjustsFontSizeToFit>{b.label}</Text>
        ))}
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  labels: { flexDirection: 'row', marginTop: 4 },
  label: { flex: 1, fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
});
