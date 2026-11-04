import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Bottom padding that keeps the last item clear of the system navigation bar. */
export function useBottomInset(extra = 16): number {
  return useSafeAreaInsets().bottom + extra;
}
