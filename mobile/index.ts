import { I18nManager } from 'react-native';
import 'expo-router/entry';

// The app is Arabic-only: force RTL so layouts match on devices with a non-Arabic system language.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}
