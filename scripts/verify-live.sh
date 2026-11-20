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

# Resolved up front: the migration check below needs the repository root,
# and `here` is not computed until the smoke section.
here_repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

hard_fail=0
soft_fail=0
off_list=""   # capabilities reporting themselves off, for the RESULT line

say() { printf '%s\n' "$*"; }
hr() { printf '%s\n' "────────────────────────────────────────────────────────"; }

hr
say "verifying $API"
hr

# ── 1 · answering, and which commit ──────────────────────────────────────
#
# When the host does not answer, the wall it hit is named rather than
# guessed at. This used to say "either the domain does not resolve to
# this project, or the deployment is not running", which is two guesses
# and no answer — and on 17 November 2026 Stripe spent nine days
# retrying a live-mode payment webhook against this host while the only
# tool for diagnosing it offered that sentence. curl already knows which
# of these it was; it was simply being thrown away with `2>/dev/null`.
diagnose_unreachable() {
  local url="$1" host rc http err errfile
  host=$(printf '%s' "$url" | sed -E 's#^[a-z]+://##; s#[/:].*##')
  errfile=$(mktemp)
  http=$(curl -sS -o /dev/null --connect-timeout 10 --max-time 25 \
           -w '%{http_code}' "$url" 2>"$errfile")
  rc=$?
  err=$(cat "$errfile"); rm -f "$errfile"

  say ""
  case "$rc" in
    6)
      say "CAUSE  DNS. The name '$host' does not resolve."
      say "       Nothing is listening because nothing is being pointed at."
      say "       Check the DNS record for the API host. The trap already"
      say "       documented in docs/GO-LIVE.md is typing the full name into"
      say "       the host field: '$host.${host#*.}' resolves to nothing and"
      say "       looks perfectly fine in the control panel."
      ;;
    7)
      say "CAUSE  The name resolves, but the connection was refused."
      say "       DNS is pointing somewhere that is not serving this API —"
      say "       a deleted service, a parking record, or the wrong project."
      ;;
    28)
      say "CAUSE  Timed out. The name resolves and something accepted the"
      say "       connection, but no response arrived within 25 seconds."
      ;;
    35|51|58|59|60|77|83)
      say "CAUSE  TLS. The connection was made and the handshake failed."
      say "       On a managed certificate this normally means the"
      say "       certificate has not finished provisioning, or it was"
      say "       issued for a different name than the one being called."
      ;;
    0)
      say "CAUSE  The host answered HTTP $http with an empty body."
      say "       It is reachable, so this is the application or whatever"
      say "       sits in front of it, not DNS and not the certificate."
      [ "$http" = "403" ] && say "       A 403 with no body is what a service that requires" \
        && say "       authentication returns to an anonymous caller."
      ;;
    56|97)
      # The one answer that is not about the host at all.
      say "NOT A VERDICT ON THE HOST. An HTTP proxy between this machine"
      say "       and '$host' refused to open the tunnel, so nothing here"
      say "       ever reached it and this run proves nothing either way."
      say "       Development containers for this project are configured"
      say "       exactly like that and report it for every external host,"
      say "       healthy or not. Run this from a machine with direct"
      say "       outbound access before concluding anything."
      ;;
    *)
      say "CAUSE  curl exit $rc."
      ;;
  esac
  [ -n "$err" ] && say "       $err"
}

health=$(curl -sS --max-time 25 "$API/health" 2>/dev/null)
if [ -z "$health" ]; then
  say "FAIL  no response from $API/health"
  diagnose_unreachable "$API/health"
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

# ── migrations, asserted rather than printed ─────────────────────────────
#
# This number was displayed and never checked, which made it decoration.
# It is the single most useful fact this script can establish, because the
# database migrates itself on boot: if production reports fewer migrations
# than this working copy contains, the deployment serving that domain is
# older than the schema the code expects, and every symptom of that looks
# like a bug somewhere else.
#
# That gap has already cost this platform real time. Migration 0035 fixed
# a confirmed account deletion leaving a child's health data behind, and
# confirming it had applied was a human action on a checklist — the sort
# of thing that gets ticked from memory. Counted from db/migrations rather
# than hard-coded, so adding one cannot leave this check behind.
expected_migrations=$(ls "$here_repo"/db/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
if [ "$migrations" = "-" ]; then
  say ""
  say "FAIL  the API did not report a migration count."
  say "      Either the database is unreachable from the deployment, or"
  say "      health is not reporting its database check. Both mean the"
  say "      schema state is unknown, which is not a pass."
  hard_fail=1
elif [ -n "$expected_migrations" ] && [ "$expected_migrations" -gt 0 ] 2>/dev/null; then
  if [ "$migrations" -lt "$expected_migrations" ] 2>/dev/null; then
    say ""
    say "FAIL  serving $migrations migrations, this working copy has $expected_migrations."
    say "      The deployment is behind the schema the code expects. The"
    say "      database migrates itself on boot, so this means the instance"
    say "      answering has not restarted since those migrations were added,"
    say "      or it cannot reach the database to apply them."
    hard_fail=1
  else
    say "            (expected at least $expected_migrations from db/migrations — ok)"
  fi
fi

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

# Storage publishes neither. It reports `durable`, and that is the one
# flag here whose false state loses member data rather than switching a
# feature off: with no database and no blob token, uploaded avatars and
# meal photographs live in the memory of one instance and go when it
# recycles. Reported as `-`, it was the only capability this checker
# could not see. (No apostrophes in here: this block is inside a
# single-quoted shell string, and one ends it early.)
if "durable" in d:
    flags = flags + ["durable"]

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

# ── 4 · the payment webhook, asked directly ──────────────────────────────
#
# Every check above asks a GET endpoint whether it is well. Stripe does
# not send a GET. It POSTs, to one exact path, and on 17 November 2026 it
# spent nine days failing against this host and threatening to disable
# the endpoint while every check here would have reported the API fine.
#
# An unsigned POST is the safe way to ask. It is refused at signature
# verification before anything is read or written — proven locally, and
# the 400 it earns is itself the proof the route is alive and checking
# signatures. The point is the codes it is NOT allowed to return:
#
#   404/405  the route is not there. The domain is serving something
#            else — the site rather than the API, or a static build.
#   403      something in front is refusing anonymous callers, which is
#            what a service deployed without public access returns.
#   2xx      worse than a failure: the endpoint accepted an UNSIGNED
#            event. Anybody could post a payment event to it.
hr
say "payment webhook"
hook_code=$(curl -sS -o /dev/null --connect-timeout 10 --max-time 20 \
  -X POST -H 'content-type: application/json' \
  --data '{"id":"evt_liveness_probe","type":"ping"}' \
  -w '%{http_code}' "$API/stripe/webhook" 2>/dev/null)
case "$hook_code" in
  400)
    say "ok    POST $API/stripe/webhook -> 400, refused for a missing signature"
    say "      The route is alive and verifying. This is the healthy answer."
    ;;
  2??)
    say "FAIL  POST $API/stripe/webhook -> $hook_code for an UNSIGNED event"
    say "      It accepted a payment event nobody signed. Treat as urgent:"
    say "      STRIPE_WEBHOOK_SECRET is probably unset on the deployment."
    hard_fail=1
    ;;
  404|405)
    say "FAIL  POST $API/stripe/webhook -> $hook_code, no such route here"
    say "      This host is not serving the API. Stripe reports exactly"
    say "      this as a failing endpoint and disables it after a few days."
    hard_fail=1
    ;;
  403)
    say "FAIL  POST $API/stripe/webhook -> 403, anonymous callers refused"
    say "      Stripe is anonymous. Whatever sits in front of this service"
    say "      must allow unauthenticated requests to reach it."
    hard_fail=1
    ;;
  000|"")
    say "FAIL  POST $API/stripe/webhook got no response at all"
    diagnose_unreachable "$API/stripe/webhook"
    hard_fail=1
    ;;
  *)
    say "FAIL  POST $API/stripe/webhook -> $hook_code, which is neither a"
    say "      refusal nor a route. Stripe needs 2xx for a signed event and"
    say "      this endpoint must give 400 for an unsigned one."
    hard_fail=1
    ;;
esac

hr

# One machine-readable line, last, so a caller does not have to parse the
# report above. The exit code says whether something is off; this says
# which, and that distinction is the whole difference between "go and
# look" and "go and set VAPID_PUBLIC_KEY".
say "RESULT commit=$commit off=${off_list:-none} webhook=$hook_code"

if [ "$hard_fail" -ne 0 ]; then
  say "NOT SERVING CORRECTLY — see the failures above"
  exit 1
fi
if [ "$soft_fail" -ne 0 ]; then
  say "SERVING, with capabilities switched off — each line above names the variable"
  exit 2
fi
say "SERVING, everything configured"
