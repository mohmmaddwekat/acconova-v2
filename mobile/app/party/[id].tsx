import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { PartyPricingPanel } from '../../components/PartyPricingPanel';
import { EmptyState } from '../../components/ui/EmptyState';
import { Gradient } from '../../components/ui/Gradient';
import { Icon } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Colors, Layout, Radius, Shadow, StatusText } from '../../constants/theme';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useStyles } from '../../lib/theme';
import { useBottomInset } from '../../lib/insets';
import { Text } from '../../components/ui/Text';

interface Transaction {
  id: string;
  type: string;
  date: string;
  reference: string | null;
  description: string | null;
  debit: string;
  credit: string;
  balance: string;
  status: string | null;
}

interface Account {
  party: { id: number; name: string; company_name: string | null; phone: string | null; email: string | null; roles: string[] };
  currency: string;
  summary: { opening_balance: string; invoice_total: string; cash_total: string; closing_balance: string; transaction_count: number };
  positions: { customer: string; supplier: string; net: string };
  aging: { current: string; days_1_30: string; days_31_60: string; days_61_90: string; over_90: string };
  transactions: Transaction[];
}

const TYPE_LABEL: Record<string, string> = {
  invoice: 'فاتورة',
  payment: 'دفعة',
  receipt: 'سند قبض',
  adjustment: 'تسوية',
  settlement: 'مقاصة',
  opening: 'رصيد افتتاحي',
};

export default function PartyDetailScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const { data } = await api.get(`/parties/${id}/account`);
      setAccount(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const name = account ? account.party.company_name || account.party.name : 'الطرف';
  const aging = account?.aging;

  return (
    <View style={styles.flex}>
      <ScreenHeader title={name} />

      {loading ? (
        <SkeletonList rows={4} />
      ) : failed || !account ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل كشف الحساب" message="تحقق من الاتصال ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomInset }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        >
          <Gradient colors={[Colors.accent, '#0570C4']} style={styles.hero}>
            <Text style={styles.heroLabel}>الرصيد الحالي</Text>
            <Text style={styles.heroValue}>{formatMoney(account.summary.closing_balance, true)}</Text>
            <View style={styles.heroRow}>
              <Text style={styles.heroSub}>لنا: {formatMoney(account.positions.customer)}</Text>
              <Text style={styles.heroSub}>علينا: {formatMoney(account.positions.supplier)}</Text>
            </View>
          </Gradient>

          {(account.party.phone || account.party.email) && (
            <View style={styles.contacts}>
              {account.party.phone ? (
                <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${account.party.phone}`)} style={styles.contactBtn}>
                  <Icon name="user" size={18} color={Colors.accentStrong} />
                  <Text style={styles.contactText}>{account.party.phone}</Text>
                </Pressable>
              ) : null}
              {account.party.email ? (
                <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`mailto:${account.party.email}`)} style={styles.contactBtn}>
                  <Icon name="chat" size={18} color={Colors.accentStrong} />
                  <Text style={styles.contactText} numberOfLines={1}>{account.party.email}</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {aging && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>أعمار الذمم</Text>
              <View style={styles.agingGrid}>
                {[
                  ['غير مستحق', aging.current],
                  ['1–30 يوم', aging.days_1_30],
                  ['31–60 يوم', aging.days_31_60],
                  ['61–90 يوم', aging.days_61_90],
                  ['+90 يوم', aging.over_90],
                ].map(([label, value]) => (
                  <View key={label} style={styles.agingCell}>
                    <Text style={[styles.agingValue, Number(value) > 0 && label !== 'غير مستحق' && { color: StatusText.danger }]}>
                      {formatMoney(value, false)}
                    </Text>
                    <Text style={styles.agingLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {account.party.roles?.includes('customer') && <PartyPricingPanel partyId={account.party.id} />}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الحركات ({account.summary.transaction_count})</Text>
            {account.transactions.length === 0 ? (
              <Text style={styles.empty}>لا توجد حركات في هذه الفترة.</Text>
            ) : (
              account.transactions.map((t, i) => (
                <View key={t.id} style={[styles.tx, i === account.transactions.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.txTitle}>{TYPE_LABEL[t.type] ?? t.type} {t.reference ? `· ${t.reference}` : ''}</Text>
                    <Text style={styles.txMeta}>{t.date}{t.description ? ` · ${t.description}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-start' }}>
                    {Number(t.debit) > 0 && <Text style={[styles.txAmount, { color: StatusText.warning }]}>{formatMoney(t.debit)}</Text>}
                    {Number(t.credit) > 0 && <Text style={[styles.txAmount, { color: StatusText.success }]}>{formatMoney(t.credit)}</Text>}
                    <Text style={styles.txMeta}>الرصيد {formatMoney(t.balance, false)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 14, gap: 12 },
  hero: { backgroundColor: Colors.accent, borderRadius: Radius.md, padding: 18, gap: 6 },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '600', textAlign: 'auto' },
  heroValue: { fontSize: 30, fontWeight: '800', color: '#fff', textAlign: 'auto' },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  contacts: { flexDirection: 'row', gap: 8 },
  contactBtn: {
    flex: 1, minHeight: Layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, backgroundColor: Colors.accentSoft, paddingHorizontal: 10,
  },
  contactText: { fontSize: 13, fontWeight: '700', color: Colors.accentStrong, flexShrink: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 8, ...Shadow.soft },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  agingGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  agingCell: { width: '31%', alignItems: 'center', gap: 2 },
  agingValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  agingLabel: { fontSize: 12, color: Colors.textMuted },
  empty: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  txTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'auto' },
  txMeta: { fontSize: 12, color: Colors.textMuted, textAlign: 'auto' },
  txAmount: { fontSize: 14, fontWeight: '800' },
});
