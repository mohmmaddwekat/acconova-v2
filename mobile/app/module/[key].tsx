import { Stack, useLocalSearchParams } from 'expo-router';
import { ResourceScreen } from '../../components/ResourceScreen';
import { EmptyState } from '../../components/ui/EmptyState';
import { MODULES } from '../../lib/modules';
import { t } from '../../lib/i18n';

export default function ModuleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const module = MODULES.find((m) => m.key === key);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t(module?.title ?? 'وحدة'), headerTitleAlign: 'center', headerShadowVisible: false }} />
      {module ? <ResourceScreen module={module} /> : <EmptyState icon="alertCircle" title="الوحدة غير موجودة" />}
    </>
  );
}
