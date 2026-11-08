import * as SecureStore from 'expo-secure-store';

/**
 * Token storage.
 *
 * Refresh and access tokens live in the platform keychain/keystore via
 * `expo-secure-store`. In environments without a secure store (tests, web) we
 * fall back to an in-memory map so the app still runs — tokens are never written
 * to plain AsyncStorage or logged.
 */

const memoryStore = new Map<string, string>();

let secureStoreAvailable: boolean | null = null;

async function canUseSecureStore(): Promise<boolean> {
  if (secureStoreAvailable !== null) return secureStoreAvailable;
  try {
    await SecureStore.setItemAsync('__payflow_probe__', '1');
    await SecureStore.deleteItemAsync('__payflow_probe__');
    secureStoreAvailable = true;
  } catch {
    secureStoreAvailable = false;
  }
  return secureStoreAvailable;
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (await canUseSecureStore()) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }
  return memoryStore.get(key) ?? null;
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (await canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      // fall through to memory
    }
  }
  memoryStore.set(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  memoryStore.delete(key);
  if (await canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // nothing else we can do
    }
  }
}

export const StorageKeys = {
  accessToken: 'payflow.accessToken',
  refreshToken: 'payflow.refreshToken',
  user: 'payflow.user',
  theme: 'payflow.theme',
  pinHintShown: 'payflow.pinHintShown',
} as const;

export async function readJson<T>(key: string): Promise<T | null> {
  const raw = await getSecureItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await setSecureItem(key, JSON.stringify(value));
}

/** Test helper: wipes the in-memory fallback store. */
export function __resetMemoryStore(): void {
  memoryStore.clear();
  secureStoreAvailable = null;
}
