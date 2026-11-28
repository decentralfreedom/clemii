# shellcheck shell=bash
# Settings were named HUSH_* before clemii's rename. Until every command and the release settings file
# use the CLEMII_* names, a HUSH_ value stands in for its missing CLEMII_ twin, and the scripts read
# only CLEMII_ (docs/reference/former-name.md). Sourced at the top of each release script, and again
# after a settings file is loaded.
while IFS= read -r former; do
  current="CLEMII_${former#HUSH_}"
  [[ -n "${!current+set}" ]] || export "${current}=${!former}"
done < <(compgen -e | grep '^HUSH_' || true)
