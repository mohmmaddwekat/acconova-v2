import { StyleSheet, View } from 'react-native';
import { Colors, StatusText, Tint } from '../constants/theme';
import { formatMoney } from '../lib/format';
import { METHOD_LABEL, Movement, movementTitle, relativeDay } from '../lib/movements';
import { useStyles } from '../lib/theme';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

interface MovementRowProps {
  movement: Movement;
  last?: boolean;
  expanded?: boolean;
}

/** One cash movement as a sentence: direction icon, "who paid whom", how and when, signed amount. */
export function MovementRow({ movement: m, last, expanded }: MovementRowProps) {
  const styles = useStyles(createStyles);
  const incoming = m.direction === 'incoming';
  const color = incoming ? StatusText.success : StatusText.danger;
  const how = [m.method ? METHOD_LABEL[m.method] ?? m.method : null, relativeDay(m.movement_date)].filter(Boolean).join(' • ');

  return (
    <View style={[styles.wrap, last && { borderBottomWidth: 0 }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: incoming ? Tint.successBg : Tint.dangerBg }]}>
          <Icon name={incoming ? 'arrowDownLeft' : 'arrowUpRight'} size={20} color={color} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={1}>{movementTitle(m)}</Text>
          <Text style={styles.sub} numberOfLines={1}>{how}</Text>
        </View>
        <Text style={[styles.amount, { color }]}>
          {incoming ? '+' : '-'}{formatMoney(m.amount)}
        </Text>
      </View>

      {expanded && (
        <View style={styles.details}>
          {m.number ? <Text style={styles.detail}>رقم السند: {m.number}</Text> : null}
          <Text style={styles.detail}>التاريخ: {m.movement_date}</Text>
          {m.reference ? <Text style={styles.detail}>المرجع: {m.reference}</Text> : null}
          {m.notes ? <Text style={styles.detail}>ملاحظات: {m.notes}</Text> : null}
          {(m.applied_to ?? []).map((a, i) => (
            <Text key={i} style={styles.detail}>مسدَّد على الفاتورة {a.number ?? ''} {a.amount ? formatMoney(a.amount) : ''}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  sub: { fontSize: 13, color: Colors.textMuted, textAlign: 'auto' },
  amount: { fontSize: 14, fontWeight: '800' },
  details: { marginTop: 10, gap: 4, paddingStart: 52 },
  detail: { fontSize: 13, color: Colors.textSoft, textAlign: 'auto' },
});
