# The name hush

clemii was called hush until 26 November 2026. The product, the domain
(clemii.com) and the repository (`decentralfreedom/clemii`) carry the new name.
A few identifiers keep the old one on purpose, because stored data, shipped
builds or published records depend on them. Do not rename these; extend this
table when another one is kept.

| Identifier | Where | Why it stays |
| --- | --- | --- |
| `com.decentralfreedom.hush` | `FormerIdentity` in the Mac app | The bundle the app reads to bring a hush user's settings over once. |
| `Hush` folder of downloaded models | `AIModelStorage` | Gigabytes of models; renaming would download them again. |
| `hush-editor` model ID | Activity history | Written into stored history entries. |
| `hush_history` capture source | Proof manifest, website verifier | Signed into every published Verified Message; the Swift case is `clemiiHistory`. |
| Bucket `hush`, old DMGs and their update feed | Cloudflare R2, `shared/releases.ts` | Buckets cannot be renamed; shipped hush builds read that feed. |
| Database and backup names (`hush-postgres`, `hush-proof-backups`, `hush-cms-backups`) | Coolify, R2 | Restore scripts and retention depend on them; any move needs copy, verify and a restore test. |
| `hush.language`, `hush-cms-appearance`, `hush-editor-settings-open` | Visitors' and the owner's browsers | Read as a fallback for a choice made before the rename; every new choice is written under the `clemii` key and removes the old one. |
| A spoken "hush" before an assistant command | `CoworkerDesktopControl` | Accepted next to "clemii", so the old habit still works. |
| Dated research, benchmarks, PRDs, release notes, the migration record | `docs/`, `macos/docs/` | The record of their time. |

Still to move, each in its own change:

1. `HUSH_*` environment variables to `CLEMII_*`, by parallel change: read the
   new name and fall back to the old one, set the new names in Coolify, SOPS
   and CI, then remove the fallback.
2. The `hush-cms` command line tool, with one new sign-in.
3. Coolify's display names, once no internal hostname depends on them.
