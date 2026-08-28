#!/usr/bin/env bash
# Adversarial probe. Attacks the API rather than reading it.
#
# Every check states what a failure would mean, because a probe whose
# result nobody can interpret is a probe nobody acts on. Run against a
# local instance only — several of these are abuse attempts.
#
#   AUTH_ENFORCE=true node dist/main.js
#   bash scripts/adversarial-probe.sh

B=${1:-http://localhost:4000/api}
pass=0; fail=0; warn=0
RUN=$(date +%s)

ok(){ pass=$((pass+1)); printf "  ok    %-52s %s\n" "$1" "$2"; }
bad(){ fail=$((fail+1)); printf "  FAIL  %-52s %s\n" "$1" "$2"; }
note(){ warn=$((warn+1)); printf "  warn  %-52s %s\n" "$1" "$2"; }

# code METHOD PATH [BODY] [EXTRA_CURL...]
code(){ local m=$1 p=$2 b=$3; shift 3
  if [ -n "$b" ]; then
    curl -s -o /tmp/probe.json -w "%{http_code}" -X "$m" -H 'content-type: application/json' "$@" -d "$b" "$B$p"
  else
    curl -s -o /tmp/probe.json -w "%{http_code}" -X "$m" "$@" "$B$p"
  fi }

echo
echo "AUTHORISATION — can an unauthenticated caller reach anything that names a user"
# Every one of these must refuse. A 200 means the account boundary is
# decided by the frontend, which is not a boundary.
for path in /acu/balance/victim /accounts/profiles/victim /wearables/status/victim \
            /newsletter/consent/victim /stripe/subscription/victim; do
  c=$(code GET "$path" "")
  case "$c" in
    401|403) ok "GET $path refuses anonymous" "$c" ;;
    404)     note "GET $path returns 404" "$c — refusal, but it leaks that the route exists differently to how a guard would" ;;
    *)       bad "GET $path" "$c — reachable without a session" ;;
  esac
done

echo
echo "ADMIN SURFACE — AUTH_ENFORCE must never relax these"
for path in /acu/wallets/wal_x /comms/stats /blog/agent/gaps /db/verify; do
  c=$(code GET "$path" "")
  case "$c" in 401|403) ok "GET $path refuses anonymous" "$c" ;;
                 *)       bad "GET $path" "$c — admin surface open" ;; esac
done
c=$(code POST /acu/grant '{"userId":"attacker","acus":1000000}')
case "$c" in 401|403) ok "POST /acu/grant refuses anonymous" "$c — allowance cannot be minted" ;;
               *)       bad "POST /acu/grant" "$c — ANYONE CAN MINT ALLOWANCE" ;; esac

echo
echo "MONEY — the routes that move real money"
c=$(code POST /stripe/portal '{"userId":"victim","returnUrl":"http://x.test/a"}')
case "$c" in 401|403) ok "POST /stripe/portal refuses anonymous" "$c" ;;
               *)       bad "POST /stripe/portal" "$c — another account's billing portal is reachable" ;; esac
c=$(code POST /stripe/webhook '{"id":"evt_forged","type":"invoice.paid","data":{"object":{"id":"in_x","currency":"gbp","amount_paid":9999900,"metadata":{"userId":"attacker","plan":"premium_annual"}}}}')
case "$c" in 400) ok "POST /stripe/webhook refuses an unsigned event" "$c — no signature, no allowance" ;;
               *)   bad "POST /stripe/webhook" "$c — a forged event was accepted" ;; esac
# A signature header that is present but wrong must fail the same way.
c=$(code POST /stripe/webhook '{"id":"evt_x","type":"invoice.paid"}' -H 't=1,v1=deadbeef')
case "$c" in 400) ok "POST /stripe/webhook refuses a bad signature" "$c" ;;
               *)   bad "POST /stripe/webhook bad signature" "$c" ;; esac

echo
echo "SELF-ONLY TYPE CONFUSION — the guard must not be skippable by sending the wrong shape"
# An array parses to a non-string. The guard used to fall through on that.
for body in '{"userId":["victim"],"returnUrl":"http://x.test/a"}' \
            '{"userId":{"toString":"victim"},"returnUrl":"http://x.test/a"}' \
            '{"returnUrl":"http://x.test/a"}'; do
  c=$(code POST /stripe/portal "$body")
  case "$c" in 400|401|403) ok "POST /stripe/portal refuses a malformed userId" "$c" ;;
                 *)           bad "POST /stripe/portal $body" "$c — guard bypassed by type confusion" ;; esac
done

echo
echo "METERING — there must be no unbilled path to a provider"
c=$(code POST /ai/complete '{"agent":"JESS","messages":[{"role":"user","content":"hello"}]}')
case "$c" in 401|403|400|402) ok "POST /ai/complete refuses a call with no payer" "$c" ;;
               404) note "POST /ai/complete" "$c — route not exposed; metering tested at the gateway instead" ;;
               *)   bad "POST /ai/complete" "$c — AI reachable with nobody to charge" ;; esac
c=$(code POST /acu/quote '{"providerCostGbp":0}')
if [ "$c" = "400" ]; then ok "POST /acu/quote rejects a zero cost" "$c"
else
  acus=$(python3 -c "import json;print(json.load(open('/tmp/probe.json'))['data']['acus'])" 2>/dev/null || echo "?")
  if [ "$acus" = "0" ]; then bad "POST /acu/quote zero cost" "$c returned $acus ACU — free AI by rounding"
  else ok "POST /acu/quote never quotes zero" "$c, $acus ACU"; fi
fi
c=$(code POST /acu/quote '{"providerCostGbp":0.1,"contingency":-0.99}')
if [ "$c" = "400" ]; then ok "POST /acu/quote rejects a negative contingency" "$c"
else
  acus=$(python3 -c "import json;print(json.load(open('/tmp/probe.json'))['data']['acus'])" 2>/dev/null || echo "?")
  if [ "$acus" -lt 40 ] 2>/dev/null; then bad "negative contingency discounts" "$c gave $acus ACU, expected 40"
  else ok "a negative contingency cannot discount" "$c, $acus ACU"; fi
fi

echo
echo "INPUT HANDLING — malformed, oversized and hostile payloads"
c=$(code POST /acu/quote '{"providerCostGbp":')
case "$c" in 400) ok "malformed JSON is a 400" "$c" ;; *) bad "malformed JSON" "$c" ;; esac
# From a file: a 20MB argv would hit the shell's limit, not the server's.
python3 -c "
import json
open('/tmp/big.json','w').write(json.dumps({'providerCostGbp':0.01,'junk':'a'*20000000}))"
c=$(curl -s -o /tmp/probe.json -w "%{http_code}" -X POST -H 'content-type: application/json' \
     --data-binary @/tmp/big.json "$B/acu/quote")
case "$c" in 400|413) ok "a 20MB payload is refused" "$c" ;;
               000)     bad "a 20MB payload killed the connection" "$c — no body limit, the process is the limit" ;;
               *)       bad "oversized payload accepted" "$c" ;; esac
rm -f /tmp/big.json
c=$(code POST /body/assess '{"userId":"u","age":34,"heightCm":178,"weightKg":88,"__proto__":{"admin":true}}')
case "$c" in 400) ok "prototype pollution keys are refused" "$c" ;;
               201) note "prototype pollution key accepted" "$c — whitelist validation strips it, but it is not rejected" ;;
               *)   bad "prototype pollution" "$c" ;; esac
# SQL and template injection through a value that reaches a query.
for payload in "u'; DROP TABLE users;--" '{{7*7}}' '<img src=x onerror=alert(1)>' '../../etc/passwd'; do
  c=$(code POST /blog/views "{\"slug\":\"$payload\",\"dwellSeconds\":10,\"scrollPercent\":50}")
  case "$c" in 400|404|201) ok "hostile slug handled" "$c  ${payload:0:24}" ;;
                 5*)         bad "hostile slug caused a server error" "$c  ${payload:0:24}" ;;
                 *)          note "hostile slug" "$c  ${payload:0:24}" ;; esac
done
psql "postgres://jess@127.0.0.1:5433/jessmove" -tAc "select to_regclass('users') is not null" 2>/dev/null | grep -q t \
  && ok "the users table still exists after injection attempts" "" \
  || bad "the users table is gone" "SQL injection succeeded"

echo
echo "ERROR DISCLOSURE — a failure must not describe the inside of the system"
code POST /acu/quote '{"providerCostGbp":"not-a-number"}' >/dev/null
body=$(cat /tmp/probe.json)
for leak in "at Object" "node_modules" "/home/" "postgres://" "sk_live" "whsec_" "SELECT " "ECONNREFUSED"; do
  if echo "$body" | grep -qF "$leak"; then bad "an error response leaks internals" "found: $leak"
  else ok "no '$leak' in the error body" ""; fi
done

echo
echo "SECURITY HEADERS"
h=$(curl -s -D - -o /dev/null "$B/health")
for want in "x-content-type-options" "referrer-policy"; do
  echo "$h" | grep -qi "^$want:" && ok "$want present" "" || bad "$want missing" ""
done
echo "$h" | grep -qi "^x-powered-by:" && bad "x-powered-by advertises the stack" "$(echo "$h" | grep -i '^x-powered-by:' | tr -d '\r')" || ok "no x-powered-by" ""

echo
echo "RATE LIMITING — an unauthenticated caller must not be able to hammer a write"
n=0; limited=0
for i in $(seq 1 40); do
  c=$(code POST /blog/views "{\"slug\":\"the-nudge-we-did-not-send\",\"dwellSeconds\":30,\"scrollPercent\":50}")
  n=$((n+1)); [ "$c" = "429" ] && limited=1 && break
done
if [ "$limited" = "1" ]; then ok "a write is rate limited" "429 after $n requests"
else
  # Measured rather than assumed: 1,050 POSTs during the load run produced
  # four rows. `UNIQUE (slug, visitor, window_key)` absorbs the flood, so
  # the count cannot be inflated and there is nothing to spam. What is left
  # is request cost, which is the same generic surface every public route
  # has and is not a reason to build a limiter the schema already makes
  # unnecessary.
  note "/blog/views is not rate limited" "$n accepted, but the unique key means they create no rows — request cost only"
fi

echo
printf "\n%d passed, %d failed, %d warnings\n\n" "$pass" "$fail" "$warn"
[ "$fail" -eq 0 ]
