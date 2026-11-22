// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann

/** An actor as a person reads it: @login for the owner, the token's name, or the CMS itself. */
export function actorName(actor: string) {
  if (actor.startsWith("github:")) return `@${actor.slice("github:".length)}`;
  if (actor.startsWith("token:")) return actor.slice("token:".length);
  return { scheduler: "the scheduler", import: "the import", "cms:token": "the server console" }[actor] ?? actor;
}
