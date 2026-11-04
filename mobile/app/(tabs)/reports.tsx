import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing } from '../../constants/theme';
import { api } from '../../lib/api';

interface CashflowSummary {
  inflows: number;
  outflows: number;
  net: number;
  period: string;
}

interface ForecastItem {
  date: string;
  expected_in: number;
  expected_out: number;
  balance: number;
}

export default function ReportsScreen() {
  const [summary, setSummary] = useState<CashflowSummary | null>(null);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    try {
      setError(null);
      const [cashRes, forecastRes] = await Promise.allSettled([
        api.get('/business-pulse/cashflow', { params: { period } }),
        api.get('/finance/cash-flow-forecast'),
      ]);

      if (cashRes.status === 'fulfilled') {
        const d = cashRes.value.data;
        setSummary(d?.summary ?? d ?? null);
      }
      if (forecastRes.status === 'fulfilled') {
        const d = forecastRes.value.data;
        setForecast(Array.isArray(d?.data ?? d) ? (d?.data ?? d) : []);
      }
    } catch {
      setError('تعذر تحميل التقارير');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchData(); }, [period]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [period]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
      >
        <Text style={styles.title}>التقارير المالية</Text>

        <View style={styles.periodRow}>
          {(['month', 'quarter', 'year'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodChip, period === p && styles.periodChipActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p === 'month' ? 'شهر' : p === 'quarter' ? 'ربع' : 'سنة'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchData} style={styles.retryBtn}>
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {summary && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>التدفق النقدي</Text>
                {summary.period ? (
                  <Text style={styles.cardPeriod}>{summary.period}</Text>
                ) : null}
                <View style={styles.kpiRow}>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiValue}>{Number(summary.inflows).toLocaleString()} ₪</Text>
                    <Text style={[styles.kpiLabel, { color: Colors.success }]}>إيرادات</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.kpi}>
                    <Text style={styles.kpiValue}>{Number(summary.outflows).toLocaleString()} ₪</Text>
                    <Text style={[styles.kpiLabel, { color: Colors.danger }]}>مصروفات</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.kpi}>
                    <Text style={[
                      styles.kpiValue,
                      { color: summary.net >= 0 ? Colors.success : Colors.danger },
                    ]}>
                      {Number(summary.net).toLocaleString()} ₪
                    </Text>
                    <Text style={styles.kpiLabel}>صافي</Text>
                  </View>
                </View>
              </View>
            )}

            {forecast.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>توقعات التدفق النقدي</Text>
                {forecast.slice(0, 7).map((item, i) => (
                  <View key={i} style={styles.forecastRow}>
                    <Text style={styles.forecastDate}>{item.date}</Text>
                    <View style={styles.forecastAmounts}>
                      <Text style={[styles.forecastIn, { color: Colors.success }]}>
                        +{Number(item.expected_in).toLocaleString()}
                      </Text>
                      <Text style={[styles.forecastOut, { color: Colors.danger }]}>
                        -{Number(item.expected_out).toLocaleString()}
                      </Text>
                    </View>
                    <Text style={[
                      styles.forecastBalance,
                      { color: item.balance >= 0 ? Colors.success : Colors.danger },
                    ]}>
                      {Number(item.balance).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {!summary && forecast.length === 0 && (
              <View style={styles.center}>
                <Text style={styles.emptyText}>لا توجد بيانات للفترة المحددة</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  container: { padding: Spacing.lg, gap: Spacing.lg },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text },
  periodRow: { flexDirection: 'row', gap: Spacing.sm },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  periodChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  periodText: { fontSize: 14, fontWeight: '500', color: Colors.textMuted },
  periodTextActive: { color: '#fff' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.soft,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  cardPeriod: { fontSize: 12, color: Colors.textMuted, marginTop: -Spacing.sm },
  kpiRow: { flexDirection: 'row', alignItems: 'center' },
  kpi: { flex: 1, alignItems: 'center', gap: 4 },
  kpiValue: { fontSize: 15, fontWeight: '700', color: Colors.text },
  kpiLabel: { fontSize: 12, color: Colors.textMuted },
  divider: { width: 1, height: 36, backgroundColor: Colors.line },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  forecastDate: { flex: 1, fontSize: 12, color: Colors.textMuted },
  forecastAmounts: { flex: 2, flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
  forecastIn: { fontSize: 12, fontWeight: '500' },
  forecastOut: { fontSize: 12, fontWeight: '500' },
  forecastBalance: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '700' },
  errorBox: { alignItems: 'center', gap: Spacing.md },
  errorText: { fontSize: 15, color: Colors.danger, textAlign: 'center' },
  retryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyText: { fontSize: 15, color: Colors.textMuted },
});
