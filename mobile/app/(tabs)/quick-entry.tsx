import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Numpad } from '../../components/ui/Numpad';
import { PickerSheet } from '../../components/ui/PickerSheet';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SelectField } from '../../components/ui/SelectField';
import { StickyFooter } from '../../components/ui/StickyFooter';
import { useToast } from '../../components/ui/Toast';
import { Colors, Layout, Radius, StatusText } from '../../constants/theme';
import { apiErrorMessage, CURRENCY_SYMBOL } from '../../lib/format';
import { PartyOption, partiesFor, useParties } from '../../lib/lookups';
import { submitQuickEntry } from '../../lib/quickEntry';
import { useStyles } from '../../lib/theme';
import { Text } from '../../components/ui/Text';
import { TextInput } from '../../components/ui/TextInput';

type EntryType = 'receipt' | 'payment';
type Method = 'cash' | 'transfer';

const getTypes = (): { key: EntryType; label: string; color: string }[] => [
  { key: 'receipt', label: 'قبض (إيراد)', color: '#0570C4' },
  { key: 'payment', label: 'دفع (مصروف)', color: StatusText.danger },
];

const METHODS: { key: Method; label: string }[] = [
  { key: 'cash', label: 'نقدي' },
  { key: 'transfer', label: 'تحويل' },
];

function formatAmount(value: string): string {
  if (value.endsWith('.')) return Number(value.slice(0, -1)).toLocaleString('en-US') + '.';
  const [int, dec] = value.split('.');
  const intText = Number(int).toLocaleString('en-US');
  return dec != null ? `${intText}.${dec}` : intText;
}

export default function QuickEntryScreen() {
  const styles = useStyles(createStyles);
  const toast = useToast();
  const { items: parties, loading: partiesLoading } = useParties();
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const [type, setType] = useState<EntryType>(typeParam === 'payment' ? 'payment' : 'receipt');

  useEffect(() => {
    if (typeParam === 'payment' || typeParam === 'receipt') setType(typeParam);
  }, [typeParam]);
  const [amount, setAmount] = useState('0');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [method, setMethod] = useState<Method>('cash');
  const [reference, setReference] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partyError, setPartyError] = useState<string | undefined>();

  const types = getTypes();
  const active = types.find((t) => t.key === type)!;
  const wantedPartyType: 'customer' | 'supplier' = type === 'receipt' ? 'customer' : 'supplier';
  const eligibleParties = useMemo(() => partiesFor(parties, wantedPartyType), [parties, wantedPartyType]);

  async function save(another: boolean) {
    if (Number(amount) <= 0) {
      toast('أدخل المبلغ أولاً');
      return;
    }
    if (!party) {
      setPartyError('اختر الطرف');
      return;
    }
    setSaving(true);
    try {
      await submitQuickEntry({
        type,
        party_id: party.id,
        reference: reference.trim() || undefined,
        payment: { amount: Number(amount), method },
      });
      toast('تم حفظ القيد');
      setAmount('0');
      setReference('');
      if (!another) {
        setParty(null);
        router.navigate('/(tabs)');
      }
    } catch (err: any) {
      toast(err?.response ? apiErrorMessage(err, 'تعذّر حفظ القيد') : err?.message ?? 'تعذّر الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="إدخال سريع" tone="solid" color={active.color} showBack={false}>
        <View style={styles.headerBody}>
          <View style={styles.toggle}>
            {types.map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="button"
                accessibilityState={{ selected: type === t.key }}
                onPress={() => {
                  setType(t.key);
                  setParty(null);
                }}
                style={[styles.toggleBtn, type === t.key && styles.toggleBtnOn]}
              >
                <Text style={[styles.toggleText, type === t.key && { color: t.color }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.amountHint}>المبلغ ({CURRENCY_SYMBOL})</Text>
          <Text style={styles.amount} accessibilityLiveRegion="polite" numberOfLines={1} adjustsFontSizeToFit>
            {formatAmount(amount)}
          </Text>
        </View>
      </ScreenHeader>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Numpad value={amount} onChange={setAmount} />

          <View style={styles.divider} />

          {eligibleParties.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={styles.sectionLabel}>الأكثر استخداماً</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
                {eligibleParties.slice(0, 4).map((p) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setParty(p);
                      setPartyError(undefined);
                    }}
                    style={[styles.suggest, party?.id === p.id && styles.suggestOn]}
                  >
                    <Text style={styles.suggestText} numberOfLines={1}>{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <SelectField
            label={type === 'receipt' ? 'العميل' : 'المورد'}
            value={party?.name}
            placeholder={partiesLoading ? 'جارٍ التحميل...' : 'اختر الطرف'}
            onPress={() => setPickerOpen(true)}
            error={partyError}
          />

          <View style={{ gap: 6 }}>
            <Text style={styles.sectionLabel}>طريقة الدفع</Text>
            <View style={styles.methods}>
              {METHODS.map((m) => (
                <Chip key={m.key} label={m.label} selected={method === m.key} onPress={() => setMethod(m.key)} />
              ))}
            </View>
          </View>

          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder="مرجع / ملاحظة (اختياري)"
            placeholderTextColor={Colors.textFaint}
            style={styles.reference}
            maxLength={96}
            accessibilityLabel="مرجع أو ملاحظة"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <StickyFooter>
        <Button label="حفظ وإدخال آخر" variant="ghost" onPress={() => save(true)} disabled={saving} style={styles.another} />
        <Button label="حفظ القيد" onPress={() => save(false)} loading={saving} style={{ flex: 1 }} />
      </StickyFooter>

      <PickerSheet
        visible={pickerOpen}
        title={type === 'receipt' ? 'اختيار العميل' : 'اختيار المورد'}
        loading={partiesLoading}
        items={eligibleParties.map((p) => ({ id: p.id, title: p.name }))}
        onSelect={(item) => {
          setParty(parties.find((p) => p.id === item.id) ?? null);
          setPartyError(undefined);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  headerBody: { gap: 10, paddingBottom: 8 },
  toggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: 3, gap: 3 },
  toggleBtn: { flex: 1, minHeight: Layout.minTouch, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleBtnOn: { backgroundColor: '#fff' },
  toggleText: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  amountHint: { textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  amount: { textAlign: 'center', fontSize: 44, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  body: { padding: 14, gap: 12 },
  divider: { height: 1, backgroundColor: Colors.line },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textAlign: 'auto' },
  suggestRow: { gap: 8, flexDirection: 'row' },
  suggest: {
    minHeight: Layout.minTouch, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.line,
    backgroundColor: Colors.surface, justifyContent: 'center', maxWidth: 200,
  },
  suggestOn: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  suggestText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  methods: { flexDirection: 'row', gap: 8 },
  reference: {
    minHeight: 52, borderRadius: Radius.xs, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface,
    paddingHorizontal: 14, fontSize: 15, color: Colors.text, textAlign: 'auto',
  },
  another: { paddingHorizontal: 14 },
});
