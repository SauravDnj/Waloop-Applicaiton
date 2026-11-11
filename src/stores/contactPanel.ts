/**
 * Desktop web: the contact that is open in the right-side panel. Phones (and
 * narrow windows) open the full contact page instead; see `openContact`.
 */
import { router } from 'expo-router';
import { Dimensions, Platform } from 'react-native';
import { create } from 'zustand';

export const DESKTOP_MIN_WIDTH = 900;

export const useContactPanel = create<{ id: string | null; close: () => void }>()((set) => ({
  id: null,
  close: () => set({ id: null }),
}));

/** Whether this window gets the desktop layout (sidebar, panels, two panes). */
export const isDesktop = () => Platform.OS === 'web' && Dimensions.get('window').width >= DESKTOP_MIN_WIDTH;

/** Opens a contact: the side panel on desktop, its page everywhere else. */
export const openContact = (id: string) => {
  if (isDesktop()) useContactPanel.setState({ id });
  else router.push({ pathname: '/lead/[id]', params: { id } });
};
