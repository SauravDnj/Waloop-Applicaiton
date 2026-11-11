/** True on web windows wide enough for the desktop layout (follows resizes). */
import { Platform, useWindowDimensions } from 'react-native';

import { DESKTOP_MIN_WIDTH } from '@/stores/contactPanel';

export const useDesktop = () => {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
};
