#!/usr/bin/env bash
# Why is Stripe failing to reach the webhook?
#
# Stripe's failure email groups by error type, and the distinction
# matters more than it looks:
#
#   "returned an HTTP 4xx/5xx"  the endpoint answered and refused
#   "timed out"                 it answered too slowly
#   "had other errors"          nothing answered at all — DNS, TLS,
#                               or the connection itself
#
# Sixty-one attempts all landing in "other errors" says the request
# never reached the application. So this walks the layers from the
# outside in and stops at the first that fails, because fixing a
# handler that is never called wastes an afternoon.
#
#   bash scripts/check-webhook.sh
#   bash scripts/check-webhook.sh https://api.jessmove.com/api/stripe/webhook

URL=${1:-https://api.jessmove.com/api/stripe/webhook}
SCHEME=$(printf '%s' "$URL" | sed -E 's#://.*##')
HOSTPORT=$(printf '%s' "$URL" | sed -E 's#^https?://##; s#/.*##')
HOST=$(printf '%s' "$HOSTPORT" | sed -E 's#:.*##')
API=$(printf '%s' "$URL" | sed -E 's#/stripe/webhook$##')

step=0
next() { step=$((step + 1)); printf "\n%d. %s\n" "$step" "$1"; }
ok() { printf "   ok    %s\n" "$1"; }
bad() { printf "   FAIL  %s\n      -> %s\n" "$1" "$2"; }


say() { printf "         %s\n" "$1"; }

printf "\nChecking %s\n" "$URL"

if [ "$SCHEME" = "https" ]; then
  next "Does the name resolve?"
  IPS=$(dig +short "$HOST" 2>/dev/null | tr '\n' ' ')
  if [ -z "$IPS" ]; then
    bad "$HOST resolves to nothing" \
      "No DNS record, so Stripe never opens a connection. On Cloud Run the
      domain mapping creates the record — check
      'gcloud beta run domain-mappings describe --domain $HOST --region \$REGION'.
      A live mapping resolves to ghs.googlehosted.com. Nothing below can
      pass until this does."
    exit 1
  fi
  ok "$HOST -> $IPS"

  next "Does TLS complete?"
  if ! echo | timeout 15 openssl s_client -connect "$HOST:443" -servername "$HOST" \
      >/tmp/webhook-tls.txt 2>&1; then
    bad "the TLS handshake failed" \
      "A Cloud Run managed certificate takes up to 24h after the mapping is
      created, and Stripe reports a handshake failure as an 'other error'.
      If the mapping is older than that the certificate is stuck — delete
      and recreate the domain mapping."
    exit 1
  fi
  ok "handshake completed"
  EXP=$(echo | timeout 15 openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  [ -n "$EXP" ] && ok "certificate expires $EXP"
else
  printf "\n   (plain http target — skipping DNS and TLS, which only apply live)\n"
fi

next "Is the application answering?"
CODE=$(curl -sS -o /tmp/webhook-health.json -w "%{http_code}" --max-time 20 "$API/health" 2>/dev/null)
case "$CODE" in
  200)
    ok "GET $API/health -> 200"
    python3 -c "
import json
d = json.load(open('/tmp/webhook-health.json'))['data']
b = d.get('build') or {}
print('         status ', d.get('status'))
print('         commit ', b.get('shortCommit'))
print('         uptime ', d.get('uptimeSeconds'), 's')
" 2>/dev/null
    ;;
  000)
    bad "nothing answered at $API/health" \
      "DNS and TLS work, so something is refusing or dropping the connection.
      On Cloud Run: the service may not be deployed, may not allow
      unauthenticated callers (redeploy with --allow-unauthenticated, because
      Stripe cannot authenticate), or the container may be failing to start.
      Check 'gcloud run services describe jessmove-api --region \$REGION'
      and the Cloud Run logs."
    exit 1
    ;;
  403)
    bad "GET $API/health -> 403" \
      "The service exists but refuses anonymous callers. Stripe has no way to
      authenticate. Redeploy with --allow-unauthenticated."
    exit 1
    ;;
  404)
    bad "GET $API/health -> 404" \
      "Something answered but it is not this API — the domain is mapped to a
      different service, or API_PREFIX is not 'api'."
    exit 1
    ;;
  *)
    bad "GET $API/health -> $CODE" "Body: $(head -c 200 /tmp/webhook-health.json)"
    exit 1
    ;;
esac

next "Is Stripe configured on the deployment?"
if curl -sS --max-time 20 "$API/stripe/status" -o /tmp/webhook-stripe.json 2>/dev/null; then
  python3 -c "
import json
d = json.load(open('/tmp/webhook-stripe.json'))['data']
rows = [
  ('secretKeyConfigured', 'STRIPE_SECRET_KEY', 'checkout and the billing portal cannot work'),
  ('webhookSecretConfigured', 'STRIPE_WEBHOOK_SECRET', 'EVERY event is refused with a 400'),
]
for key, label, why in rows:
    good = bool(d.get(key))
    print(f\"   {'ok   ' if good else 'FAIL '} {label} set: {good}\" + ('' if good else f'  -> {why}'))
print(f\"   ok    mode: {d.get('mode')}\")
print(f\"   ok    the URL this deployment expects: {d.get('webhookUrl')}\")
" 2>/dev/null || say "(could not read /stripe/status)"
else
  say "(could not reach /stripe/status)"
fi

next "Does the webhook endpoint itself respond?"
# An unsigned POST must be refused with 400. That is the endpoint
# working correctly — it proves the request arrived and the signature
# check ran. No answer, or a slow one, is the fault being hunted.
START=$(date +%s%N)
CODE=$(curl -sS -o /tmp/webhook-post.json -w "%{http_code}" --max-time 25 \
  -X POST -H 'content-type: application/json' \
  -d '{"id":"evt_reachability_probe","type":"ping"}' "$URL" 2>/dev/null)
MS=$(( ($(date +%s%N) - START) / 1000000 ))

case "$CODE" in
  400)
    ok "an unsigned POST refused with 400 in ${MS}ms"
    say "The endpoint is reachable and is verifying signatures, which is"
    say "exactly right. If Stripe still reports failures after this passes,"
    say "the signing secret does not match: the whsec_ shown in the Stripe"
    say "dashboard for THIS endpoint must equal STRIPE_WEBHOOK_SECRET on the"
    say "deployment. Editing an endpoint's URL keeps its secret; creating a"
    say "new endpoint issues a new one, and the old value stops working."
    ;;
  000)
    bad "nothing answered in ${MS}ms" \
      "Health answered but the webhook did not. Stripe records a slow or
      dropped POST as a failure the same as a refused one."
    ;;
  *)
    bad "POST -> $CODE in ${MS}ms" "Body: $(head -c 200 /tmp/webhook-post.json)"

    ;;
esac

printf "\n"
