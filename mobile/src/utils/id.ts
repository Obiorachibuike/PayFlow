/** Collision-resistant enough IDs for idempotency keys and local records. */

function randomHex(length: number): string {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

export function uuid(): string {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
}

/** Stable per-install device identifier used for session tracking. */
export function newDeviceId(): string {
  return `pf-device-${uuid()}`;
}
