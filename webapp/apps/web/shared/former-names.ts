// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann

/**
 * Settings were named HUSH_* before clemii's rename. Until every deployment sets the CLEMII_*
 * names, a HUSH_ value stands in for its missing CLEMII_ twin, and the code reads only CLEMII_.
 * Remove this once Coolify and the release files use the new names (docs/reference/former-name.md).
 */
export function withFormerNames(env: Record<string, string | undefined>) {
  const named = { ...env };
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("HUSH_")) named[`CLEMII_${key.slice("HUSH_".length)}`] ??= value;
  }
  return named;
}
