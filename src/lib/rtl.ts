/**
 * Right-to-left helpers. Native mirrors left/right layout itself, but icons
 * that point a direction (back arrows, chevrons) need flipping by hand, and
 * the web follows the language rather than I18nManager.
 */
import type { ViewStyle } from 'react-native';

import { i18next, isRtlLanguage } from '@/i18n';

export const isRtl = () => isRtlLanguage(i18next.language);

const FLIPPED: ViewStyle = { transform: [{ scaleX: -1 }] };

/** Style for a directional icon: mirrored in right-to-left languages. */
export const rtlFlip = (): ViewStyle | undefined => (isRtl() ? FLIPPED : undefined);
