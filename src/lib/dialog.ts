/**
 * App dialogs: one themed card (see components/ui/DialogHost) instead of the
 * platform's native alert, on Android, iOS and web alike. `showAlert` and
 * `confirmAction` can be called from anywhere, React or not; the host mounted
 * in the root layout draws whatever is queued.
 */
import { create } from 'zustand';

export type DialogButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
export type DialogTone = 'info' | 'success' | 'warning' | 'danger';
export type DialogRequest = { id: number; title: string; message?: string; buttons: DialogButton[]; tone: DialogTone; onDismiss?: () => void };

type DialogState = { queue: DialogRequest[]; push: (d: Omit<DialogRequest, 'id'>) => void; close: (id: number) => void };

let nextId = 1;

export const useDialogStore = create<DialogState>()((set) => ({
  queue: [],
  push: (d) => set((s) => ({ queue: [...s.queue, { ...d, id: nextId++ }] })),
  close: (id) => set((s) => ({ queue: s.queue.filter((d) => d.id !== id) })),
}));

/** A tone from the title's wording, so plain calls still get a fitting icon. */
const guessTone = (title: string): DialogTone =>
  /fail|error|could ?n.t|couldn|not |unable|invalid|denied|refused/i.test(title)
    ? 'danger'
    : /sent|saved|done|added|scheduled|synced|success|cancelled|deleted|created/i.test(title)
      ? 'success'
      : 'info';

export const showAlert = (title: string, message?: string, tone?: DialogTone): void =>
  useDialogStore.getState().push({ title, message, tone: tone ?? guessTone(title), buttons: [{ text: 'OK' }] });

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
};

/** Resolves true when the user confirms. */
export const confirmAction = ({ title, message, confirmText, cancelText, destructive }: ConfirmOptions): Promise<boolean> =>
  new Promise((resolve) => {
    useDialogStore.getState().push({
      title,
      message,
      tone: destructive ? 'danger' : 'warning',
      buttons: [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      onDismiss: () => resolve(false),
    });
  });
