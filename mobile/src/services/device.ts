import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getSecureItem, setSecureItem } from './storage';
import { newDeviceId } from '../utils/id';
import type { DeviceContext } from './api';

const DEVICE_ID_KEY = 'payflow.deviceId';
const APP_VERSION = (Constants.expoConfig?.version ?? '1.0.0') as string;

let cachedDeviceId: string | null = null;

/**
 * Stable per-install device identity, persisted in the secure store. The backend
 * uses it to list and revoke the devices signed in to an account.
 */
export async function primeDeviceContext(): Promise<DeviceContext> {
  if (!cachedDeviceId) {
    const stored = await getSecureItem(DEVICE_ID_KEY);
    cachedDeviceId = stored ?? newDeviceId();
    if (!stored) await setSecureItem(DEVICE_ID_KEY, cachedDeviceId);
  }
  return getDeviceContext();
}

export function getDeviceContext(): DeviceContext {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  return {
    deviceId: cachedDeviceId ?? `pf-device-${platform}-pending`,
    deviceName: (Device.deviceName ?? `${Device.brand ?? 'PayFlow'} ${Device.modelName ?? 'device'}`).slice(0, 80),
    platform,
    appVersion: APP_VERSION,
  };
}
