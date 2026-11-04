import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Skeleton';
import { Colors, Layout, Radius, Shadow, StatusText } from '../constants/theme';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useStyles } from '../lib/theme';
import { useBottomInset } from '../lib/insets';
import { Text } from '../components/ui/Text';
import { TextInput } from '../components/ui/TextInput';

interface Party {
  id: number;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  roles: string[];
  balance_summary: { owed_to_us: string; we_owe: string } | null;
}

type Filter = 'all' | 'customer' | 'supplier';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'customer', label: 'العملاء' },
  { key: 'supplier', label: 'الموردون' },
];

const ROLE_LABEL: Record<string, string> = { customer: 'عميل', supplier: 'مورد' };

export default function PartiesScreen() {
  const styles = useStyles(createStyles);
  const bottomInset = useBottomInset();
  const router = useRouter();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await api.get('/parties', { params: { per_page: 100 } });
      setParties(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parties.filter((p) => {
      if (filter !== 'all' && !(p.roles ?? []).includes(filter)) return false;
      const label = `${p.company_name ?? ''} ${p.name ?? ''}`.toLowerCase();
      return !q || label.includes(q);
    });
  }, [parties, filter, query]);

  return (
    <View style={styles.flex}>
      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="بحث بالاسم..."
          placeholderTextColor={Colors.textFaint}
          style={styles.search}
          accessibilityLabel="بحث في الأطراف"
        />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => setFilter(f.key)}
            style={[styles.filter, filter === f.key && styles.filterOn]}
          >
            <Text style={[styles.filterText, filter === f.key && { color: Colors.accent }]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <SkeletonList rows={5} />
      ) : failed ? (
        <EmptyState icon="wifiOff" title="تعذّر تحميل الأطراف" message="تحقق من الاتصال ثم حاول مرة أخرى." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
          ListEmptyComponent={<EmptyState icon="users" title="لا يوجد أطراف مطابقة" message="جرّب بحثاً أو تصنيفاً آخر." />}
          renderItem={({ item }) => {
            const owed = Number(item.balance_summary?.owed_to_us ?? 0);
            const owe = Number(item.balance_summary?.we_owe ?? 0);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/party/${item.id}` as any)}
                style={({ pressed }) => [styles.card, pressed && { backgroundColor: Colors.bgSoft }]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.company_name || item.name || '?').charAt(0)}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.company_name || item.name}</Text>
                  <View style={styles.roles}>
                    {(item.roles ?? []).map((r) => (
                      <View key={r} style={styles.roleChip}><Text style={styles.roleText}>{ROLE_LABEL[r] ?? r}</Text></View>
                    ))}
                    {item.phone ? <Text style={styles.phone}>{item.phone}</Text> : null}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  {owed > 0 && <Text style={[styles.balance, { color: StatusText.success }]}>لنا {formatMoney(owed)}</Text>}
                  {owe > 0 && <Text style={[styles.balance, { color: StatusText.danger }]}>علينا {formatMoney(owe)}</Text>}
                  {owed === 0 && owe === 0 && <Text style={styles.zero}>لا رصيد</Text>}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginBottom: 8, paddingHorizontal: 14,
    minHeight: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.line,
  },
  search: { flex: 1, fontSize: 15, color: Colors.text, textAlign: 'auto', minHeight: 44 },
  filters: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.line, paddingHorizontal: 8 },
  filter: { flex: 1, minHeight: Layout.minTouch, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterOn: { borderBottomColor: Colors.accent },
  filterText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  list: { padding: 14, gap: 10, flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 12, borderWidth: 1, borderColor: Colors.line, minHeight: 72, ...Shadow.soft,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'auto' },
  roles: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  roleChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: Colors.accentSoft },
  roleText: { fontSize: 12, fontWeight: '700', color: Colors.accentStrong },
  phone: { fontSize: 12, color: Colors.textMuted },
  balance: { fontSize: 13, fontWeight: '800' },
  zero: { fontSize: 12, color: Colors.textMuted },
});
