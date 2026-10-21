#!/usr/bin/env bash
#
# Proves a deployment is actually serving, rather than merely deployed.
#
# Vercel reporting "success" means the build finished and the artefact was
# uploaded. It does not mean the domain points at that project, that the
# database is reachable, or that the capabilities a member needs are
# switched on. Between 19 August and 18 October 2026 this platform had a
# site deploying successfully every push and an API that had not deployed
# for sixty days, and nothing anywhere said so — because nobody was asking
# the running system anything.
#
# Three questions, in the order that matters:
#
#   1. Is the host answering, and with WHICH COMMIT? A stale commit means
#      the domain is not aliased to the project that just deployed, which
#      looks exactly like "my changes did nothing".
#   2. Does it still behave? The full smoke suite, against the live host.
#   3. Is anything switched off? Each module reports the variable it needs.
#      `AUTH_SECRET` is the one that matters most: without it the API
#      answers perfectly and registration and login are unavailable, which
#      from outside is indistinguishable from nobody signing up.
#
# Usage:
#   scripts/verify-live.sh [API_BASE] [EXPECTED_COMMIT]
#   scripts/verify-live.sh https://api.jessmove.com/api 06e3779
#
# Exit codes: 0 all good · 1 a hard failure · 2 serving, but something is
# switched off (worth a human look, not worth failing a deploy over).

set -uo pipefail

API="${1:-https://api.jessmove.com/api}"
EXPECTED="${2:-}"
API="${API%/}"

hard_fail=0
soft_fail=0
off_list=""   # capabilities reporting themselves off, for the RESULT line

say() { printf '%s\n' "$*"; }
hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }

hr
say "verifying $API"
hr

# ── 1 · answering, and which commit ──────────────────────────────────────
health=$(curl -sS --max-time 25 "$API/health" 2>/dev/null)
if [ -z "$health" ]; then
  say "FAIL  no response from $API/health"
  say "      The host is not answering at all. Either the domain does not"
  say "      resolve to this project, or the deployment is not running."
  exit 1
fi

read -r commit status migrations <<EOF
$(printf '%s' "$health" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)["data"]
except Exception:
    print("- - -"); raise SystemExit
b = d.get("build") or {}
db = ((d.get("checks") or {}).get("database") or {}).get("detail") or "-"
import re
m = re.search(r"(\d+) migrations", db)
print(b.get("shortCommit") or "-", d.get("status") or "-", m.group(1) if m else "-")
')
EOF

say "commit      $commit"
say "status      $status"
say "migrations  $migrations"

if [ -n "$EXPECTED" ] && [ "$commit" != "$EXPECTED" ]; then
  say ""
  say "FAIL  serving $commit, expected $EXPECTED."
  say "      The build succeeded and this host is answering with different"
  say "      code, so the domain is not aliased to the deployment that just"
  say "      went out. Check the project's Domains tab."
  hard_fail=1
fi

[ "$status" = "down" ] && { say "FAIL  the API reports itself down"; hard_fail=1; }

# ── 2 · still behaves ────────────────────────────────────────────────────
hr
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke_out=$(bash "$here/smoke.sh" "$API" 2>&1)
printf '%s\n' "$smoke_out" | grep -E "FAIL|^pass=" || true
printf '%s' "$smoke_out" | grep -q "fail=0" || {
  say "FAIL  the smoke suite found failures against the live host"
  hard_fail=1
}

# ── 3 · anything switched off ────────────────────────────────────────────
hr
say "capabilities"
for p in auth/status push/status mail/status stripe/status accounts/storage/status db/status; do
  body=$(curl -sS --max-time 20 "$API/$p" 2>/dev/null)
  line=$(printf '%s' "$body" | python3 -c '
import json, sys

try:
    d = json.load(sys.stdin)["data"]
except Exception as exc:
    print("UNREADABLE|%s" % exc)
    raise SystemExit

# Each module names its own flag rather than sharing one, so take whichever
# it publishes: `configured`, or anything ending in `Configured`.
flags = [k for k in d if k == "configured" or k.endswith("Configured")]
if not flags:
    state = "-"
elif all(bool(d[k]) for k in flags):
    state = "on"
else:
    state = "OFF"

note = d.get("note") or d.get("webhookNote") or ""
print("%s|%s" % (state, note[:110]))
' 2>&1)

  state="${line%%|*}"
  note="${line#*|}"
  printf '  %-28s %-9s %s\n' "$p" "$state" "$note"

  case "$state" in
    OFF)
      soft_fail=1
      # Named in the RESULT line so the caller learns which one without
      # reading the report. `${p%%/*}` is the module, not the path.
      off_list="${off_list:+$off_list,}${p%%/*}"
      ;;
    # A check that could not run is a hard failure, never a pass. A verifier
    # that reports green because its own parsing broke is worse than no
    # verifier, because somebody believes it.
    UNREADABLE|'') say "FAIL  could not read $p"; hard_fail=1 ;;
  esac
done

hr

# One machine-readable line, last, so a caller does not have to parse the
# report above. The exit code says whether something is off; this says
# which, and that distinction is the whole difference between "go and
# look" and "go and set VAPID_PUBLIC_KEY".
say "RESULT commit=$commit off=${off_list:-none}"

if [ "$hard_fail" -ne 0 ]; then
  say "NOT SERVING CORRECTLY — see the failures above"
  exit 1
fi
if [ "$soft_fail" -ne 0 ]; then
  say "SERVING, with capabilities switched off — each line above names the variable"
  exit 2
fi
say "SERVING, everything configured"
