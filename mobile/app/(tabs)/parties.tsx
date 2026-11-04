import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Spacing } from '../../constants/theme';
import { api } from '../../lib/api';

interface Party {
  id: number;
  name: string;
  type: string;
  balance: number;
  phone?: string;
  email?: string;
}

export default function PartiesScreen() {
  const router = useRouter();
  const [parties, setParties] = useState<Party[]>([]);
  const [filtered, setFiltered] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');
  const [error, setError] = useState<string | null>(null);

  async function fetchParties() {
    try {
      setError(null);
      const res = await api.get('/parties', { params: { per_page: 100 } });
      const data = res.data?.data ?? res.data ?? [];
      const list = Array.isArray(data) ? data : [];
      setParties(list);
      setFiltered(list);
    } catch {
      setError('تعذر تحميل الأطراف');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchParties(); }, []);

  useEffect(() => {
    let list = parties;
    if (typeFilter !== 'all') {
      list = list.filter((p) => p.type === typeFilter);
    }
    if (search.trim()) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      );
    }
    setFiltered(list);
  }, [search, typeFilter, parties]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchParties();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>العملاء والموردون</Text>
        <TextInput
          style={styles.search}
          placeholder="بحث..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={Colors.textMuted}
        />
        <View style={styles.filters}>
          {(['all', 'customer', 'supplier'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.filterChip, typeFilter === t && styles.filterChipActive]}
              onPress={() => setTypeFilter(t)}
            >
              <Text style={[styles.filterText, typeFilter === t && styles.filterTextActive]}>
                {t === 'all' ? 'الكل' : t === 'customer' ? 'عملاء' : 'موردون'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchParties} style={styles.retryBtn}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>لا توجد نتائج</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(tabs)/party/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.cardLeft}>
                <View style={[
                  styles.typeIndicator,
                  { backgroundColor: item.type === 'customer' ? Colors.success + '20' : Colors.accentSoft },
                ]}>
                  <Text style={[
                    styles.typeText,
                    { color: item.type === 'customer' ? Colors.success : Colors.accent },
                  ]}>
                    {item.type === 'customer' ? 'عميل' : 'مورد'}
                  </Text>
                </View>
                <Text style={styles.name}>{item.name}</Text>
                {item.phone ? <Text style={styles.sub}>{item.phone}</Text> : null}
              </View>
              <View style={styles.cardRight}>
                <Text style={[
                  styles.balance,
                  { color: item.balance > 0 ? Colors.success : item.balance < 0 ? Colors.danger : Colors.textMuted },
                ]}>
                  {Number(item.balance).toLocaleString()} ₪
                </Text>
                <Text style={styles.balanceLabel}>
                  {item.balance > 0 ? 'له' : item.balance < 0 ? 'عليه' : 'متوازن'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  header: { padding: Spacing.lg, gap: Spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text },
  search: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.line,
    textAlign: 'right',
  },
  filters: { flexDirection: 'row', gap: Spacing.sm },
  filterChip: {
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  filterChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  list: { padding: Spacing.lg, gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Shadow.soft,
  },
  cardLeft: { flex: 1, gap: 4 },
  typeIndicator: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 2,
  },
  typeText: { fontSize: 11, fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '600', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textMuted },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  balance: { fontSize: 16, fontWeight: '700' },
  balanceLabel: { fontSize: 11, color: Colors.textMuted },
  errorText: { fontSize: 15, color: Colors.danger, textAlign: 'center', marginBottom: Spacing.md },
  retryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyText: { fontSize: 15, color: Colors.textMuted },
});
