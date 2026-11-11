// Dates must not shift a day west of UTC: every test runs in New York time.
process.env.TZ = 'America/New_York';

/* Native modules have no implementation under Jest; give them in-memory stand-ins. */
jest.mock('react-native-mmkv', () => {
  // One in-memory store per MMKV id, like the real thing (each account has its own).
  const stores = new Map<string, Map<string, string | number | boolean>>();
  const make = (mem: Map<string, string | number | boolean>) => ({
    getString: (k: string) => (typeof mem.get(k) === 'string' ? (mem.get(k) as string) : undefined),
    getNumber: (k: string) => (typeof mem.get(k) === 'number' ? (mem.get(k) as number) : undefined),
    getBoolean: (k: string) => (typeof mem.get(k) === 'boolean' ? (mem.get(k) as boolean) : undefined),
    set: (k: string, v: string | number | boolean) => void mem.set(k, v),
    contains: (k: string) => mem.has(k),
    remove: (k: string) => mem.delete(k),
    clearAll: () => mem.clear(),
    getAllKeys: () => [...mem.keys()],
  });
  return {
    createMMKV: (opts?: { id?: string }) => {
      const id = opts?.id ?? 'default';
      if (!stores.has(id)) stores.set(id, new Map());
      return make(stores.get(id)!);
    },
  };
});

jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => mem.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void mem.set(k, v),
    deleteItemAsync: async (k: string) => void mem.delete(k),
  };
});

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
