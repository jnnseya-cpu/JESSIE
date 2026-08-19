B=${1:-http://localhost:4000/api}
pass=0; fail=0
# Unique per run: the profile store refuses a duplicate id, so fixed ids made
# the suite pass once and fail every time after.
RUN=$(date +%s)
JAR=$(mktemp)
AUTHED=no

# ---------------------------------------------------------------------
# Signing in, optionally.
#
# Admin and self-only routes need a session. Without one this suite used to
# call them anyway and expect a 200, so every admin route reported FAIL from
# the day the routes were locked — twenty-four of eighty-three checks, red
# for a fortnight, while the go-live checklist still asked for 83/83. A suite
# that contradicts the security posture teaches people to ignore it.
#
# So: export SMOKE_EMAIL and SMOKE_PASSWORD to exercise those routes properly.
# Without them the suite still runs, and asserts that each one refuses — which
# is the more valuable check of the two, and the one that needs no secrets in
# CI.
# ---------------------------------------------------------------------
if [ -n "$SMOKE_EMAIL" ] && [ -n "$SMOKE_PASSWORD" ]; then
  CH=$(curl -s "$B/auth/challenge" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  sleep 4   # the humanity check refuses a token younger than three seconds
  code=$(curl -s -o /dev/null -w "%{http_code}" -c "$JAR" -X POST "$B/auth/login" \
    -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
    -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\",\"challenge\":\"$CH\"}")
  if [ "$code" = "201" ] || [ "$code" = "200" ]; then AUTHED=yes; echo "signed in as $SMOKE_EMAIL"
  else echo "sign-in failed ($code) — privileged routes will be checked for refusal only"; fi
else
  echo "no SMOKE_EMAIL/SMOKE_PASSWORD — privileged routes checked for refusal only"
fi

t(){ if [ "$1" = GET ] || [ "$1" = DELETE ]; then c=$(curl -s -o /tmp/r.json -w "%{http_code}" -X "$1" "$B$2");
  else c=$(curl -s -o /tmp/r.json -w "%{http_code}" -X "$1" -H 'content-type: application/json' -d "$4" "$B$2"); fi
  if [ "$c" = "$3" ]; then pass=$((pass+1)); printf "  ok    %-4s %-32s %s  %s\n" "$1" "$2" "$c" "$5";
  else fail=$((fail+1)); printf "  FAIL  %-4s %-32s got %s want %s\n" "$1" "$2" "$c" "$3"; head -c 200 /tmp/r.json; echo; fi }

# A route that requires a session: the expected code when signed in, 401 when
# not. Either way it is an assertion, never a skip.
ta(){ want="$3"; [ "$AUTHED" = yes ] || want=401
  if [ "$1" = GET ] || [ "$1" = DELETE ]; then c=$(curl -s -b "$JAR" -o /tmp/r.json -w "%{http_code}" -X "$1" "$B$2");
  else c=$(curl -s -b "$JAR" -o /tmp/r.json -w "%{http_code}" -X "$1" -H 'content-type: application/json' -d "$4" "$B$2"); fi
  if [ "$c" = "$want" ]; then pass=$((pass+1)); printf "  ok    %-4s %-32s %s  %s\n" "$1" "$2" "$c" "${5:-privileged}";
  else fail=$((fail+1)); printf "  FAIL  %-4s %-32s got %s want %s\n" "$1" "$2" "$c" "$want"; head -c 200 /tmp/r.json; echo; fi }

GOOD='{"userId":"u_1","mode":"momentum","availableSeconds":900,"capabilityNormaliser":1,"permittedVariants":["seated","standing"],"signals":{"userId":"u_1","motionState":"still","locationClass":"office","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":1,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["calendar","motion","device_state"]}}'
DRIVING='{"userId":"u_1","mode":"momentum","availableSeconds":900,"capabilityNormaliser":1,"permittedVariants":["seated"],"signals":{"userId":"u_1","motionState":"driving","locationClass":"transit","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":0,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["motion"]}}'
SHORT='{"userId":"u_1","mode":"momentum","availableSeconds":5,"capabilityNormaliser":1,"permittedVariants":["seated"],"signals":{"userId":"u_1","motionState":"still","locationClass":"office","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":1,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["motion"]}}'

echo "reads"
for p in /health /system /movements /movements/gate /body/pathways /body/scorecard /body/agents /acu/policy /blog/policy /blog/posts /blog/analytics /comms/policy /comms/catalogue /growth/programme /growth/ladder /stripe/status /stripe/plans /mail/status /accounts/kinds /accounts/media/rules /accounts/autosave/policy /auth/status /accounts/storage/status /db/status /wearables/providers /foodlens/policy /push/status; do t GET $p 200; done
echo "reads that need a session"
for p in /ai/providers /acu/balance/u_smoke /blog/agent/gaps /comms/stats /comms/deliveries /db/verify; do ta GET $p 200; done
echo "writes - valid"
t POST /prescriptions/next 201 "$GOOD" "the core call"
t POST /prescriptions/next 201 "$DRIVING" "driving: expect a hold"
t POST /body/assess 201 '{"userId":"u_1","age":34,"heightCm":178,"weightKg":88,"waistCm":95,"optedIntoBodyMetrics":true}'
t POST /body/plan 201 '{"userId":"u_1","age":34,"heightCm":178,"weightKg":88,"optedIntoBodyMetrics":true}'
t POST /acu/quote 201 '{"providerCostGbp":0.004}'
t POST /foodlens/analyze 201 '{"age":34,"declaredKcal":690,"declaredItems":[{"name":"chicken","confidencePct":94}],"grams":{"proteinG":41,"carbohydrateG":86,"fatG":27}}' "foodlens sandbox analysis"
t POST /foodlens/analyze 201 '{"age":15,"declaredKcal":690}' "foodlens under-18: kcal withheld"
ta POST /wearables/ingest 201 '{"userId":"u_1","provider":"apple_health","age":34,"samples":[{"scope":"steps","value":4200,"ageMinutes":10}]}' "on-device wearable push"
echo "writes - validation must reject"
t POST /prescriptions/next 400 '{}' "empty body"
t POST /prescriptions/next 400 '{"userId":"u","mode":"nonsense","availableSeconds":900,"capabilityNormaliser":1,"permittedVariants":["seated"],"signals":{}}' "bad mode"
t POST /prescriptions/next 400 "$SHORT" "below Snap floor"
t POST /body/assess 400 '{"userId":"u","age":34,"weightKg":9000}' "impossible weight"
t POST /body/assess 400 '{"userId":"u","age":3}' "under-10"
t POST /acu/quote 400 '{"providerCostGbp":-5}' "negative cost"
t POST /acu/quote 400 '{"providerCostGbp":0.01,"junkField":1}' "unknown field"
ta POST /wearables/ingest 400 '{"userId":"u_1","provider":"apple_health","age":34,"samples":[{"scope":"blood_glucose","value":5.4,"ageMinutes":1}]}' "never-ingested scope refused"
t POST /foodlens/analyze 400 '{"age":34,"mimeType":"image/jpeg","dataBase64":"bm90LWFuLWltYWdl"}' "non-image bytes refused"
echo "editorial gate"
t POST /blog/views 201 '{"slug":"the-nudge-we-did-not-send","dwellSeconds":90,"scrollPercent":80,"device":"desktop"}' "record a view"
t POST /blog/views 400 '{"slug":"x","dwellSeconds":99999,"scrollPercent":80}' "absurd dwell rejected"
ta POST /blog/posts/rules-in-postgresql/status 400 '{"to":"published","reviewer":"A Person"}' "published -> published refused"
ta POST /blog/posts/rules-in-postgresql/status 400 '{"to":"draft"}' "published -> draft refused"

echo "communication routing"
ta POST /comms/preview 201 '{"event":"payment.successful","to":{"userId":"child","age":12,"presence":"full","consentedChannels":["email","in_app","sms","push"],"inQuietHours":false,"contextHeld":false,"coachingSentToday":0,"dailyCap":4,"hasGuardian":true}}' "adult-only event, age 12"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> deliver',d['plan']['deliver'],'| suppressed',d['plan']['suppressed'])" 2>/dev/null
ta POST /comms/preview 201 '{"event":"privacy.breach_notification","to":{"userId":"a","age":52,"presence":"off","consentedChannels":[],"inQuietHours":true,"contextHeld":true,"coachingSentToday":9,"dailyCap":6,"hasGuardian":false}}' "breach notice, all opted out, 3am"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> deliver',d['plan']['deliver'])" 2>/dev/null
ta POST /comms/send 201 '{"event":"privacy.breach_notification","to":{"userId":"a","age":52,"presence":"off","consentedChannels":[],"inQuietHours":true,"contextHeld":true,"coachingSentToday":9,"dailyCap":6,"hasGuardian":false}}' "send it"
ta POST /comms/preview 404 '{"event":"not.a.real.event","to":{"userId":"a","age":30,"presence":"full","consentedChannels":["in_app"],"inQuietHours":false,"contextHeld":false,"coachingSentToday":0,"dailyCap":6,"hasGuardian":false}}' "unknown event"
ta POST /comms/preview 400 '{"event":"snap.offered","to":{"userId":"a","age":4,"presence":"full","consentedChannels":["in_app"],"inQuietHours":false,"contextHeld":false,"coachingSentToday":0,"dailyCap":6,"hasGuardian":false}}' "age below 10 rejected"

echo "growth partner programme"
ta POST /growth/commission 201 '{"paymentReceivedGbp":2400,"taxGbp":400,"paymentFeesGbp":58.4,"refundsGbp":120,"kind":"approved_influencer","verifiedPaidReferrals":0,"lifetimeAlreadyPaidGbp":0}' "influencer, paid on net"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> net',d['netRevenueGbp'],'| commission',d['commissionGbp'])" 2>/dev/null
ta POST /growth/commission 201 '{"paymentReceivedGbp":2400,"kind":"normal","verifiedPaidReferrals":13,"lifetimeAlreadyPaidGbp":0}' "13 referrals: no cash yet"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> commission',d['commissionGbp'],'| eligible',d['eligible'])" 2>/dev/null
ta POST /growth/trust 201 '{"signals":["same_payment_card"]}' "shared card is disqualifying"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> verdict',d['verdict'])" 2>/dev/null
ta POST /growth/payout 201 '{"balanceGbp":18,"kycComplete":true,"oldestEarningAgeDays":60}' "below the payout floor"
ta POST /growth/trust 400 '{"signals":["not_a_signal"]}' "unknown trust signal rejected"
ta POST /growth/commission 400 '{"paymentReceivedGbp":-5,"kind":"normal","verifiedPaidReferrals":0,"lifetimeAlreadyPaidGbp":0}' "negative revenue rejected"

echo "accounts, autosave and payments"
t POST /accounts 201 '{"userId":"rb_teen_'"$RUN"'","kind":"minor","age":15,"guardianId":"g1"}' "minor with a guardian"
t POST /accounts 400 '{"userId":"rb_solo","kind":"minor","age":15}' "minor without a guardian refused"
t POST /accounts 400 '{"userId":"rb_x","kind":"adult","age":15}' "under-18 cannot hold an adult account"
ta POST /accounts/profiles/rb_teen_$RUN/autosave 201 '{"age":15,"basedOnVersion":1,"patch":{"displayName":"Robin"}}' "autosave a safe field"
ta POST /accounts/profiles/rb_teen_$RUN/autosave 400 '{"age":15,"basedOnVersion":2,"patch":{"optedIntoBodyMetrics":true}}' "consent will not autosave"
ta POST /accounts/profiles/rb_teen_$RUN/autosave 400 '{"age":15,"basedOnVersion":2,"patch":{"dateOfBirth":"2011-01-01"}}' "date of birth is not editable here"
t POST /accounts/media/check 201 '{"slot":"avatar","age":15,"mimeType":"image/jpeg","bytes":400000,"widthPx":800,"heightPx":800}' "teen photo check"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> ok',d['ok'],'|',d['reasons'][0] if d['reasons'] else '')" 2>/dev/null
t POST /accounts/media/check 400 '{"slot":"avatar","age":9,"mimeType":"image/jpeg","bytes":400000,"widthPx":800,"heightPx":800}' "age below 10 rejected"
t POST /stripe/webhook 400 '{"id":"evt_x","type":"invoice.paid"}' "unsigned webhook refused"
t POST /stripe/checkout 400 '{"userId":"u","plan":"premium_monthly","successUrl":"http://x.test/a","cancelUrl":"http://x.test/b"}' "checkout without a key explains itself"
ta POST /mail/preview 201 '{"event":"account.registration.requested","values":{"name":"Sam"}}' "render an email"
ta POST /mail/preview 400 '{"event":"not.a.real.event"}' "unknown event refused"
t GET /mail/probe 200 '' "smtp probe explains itself without credentials"
ta POST /accounts/seed 201 '{}' "seed one account of every kind"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    ->',len(d['personas']),'personas')" 2>/dev/null
ta POST /accounts/seed 201 '{}' "seeding twice adds nothing"
ta DELETE /accounts/profiles/demo_child 200 '' "delete one account"
ta DELETE /accounts/profiles/nobody 404 '' "deleting a stranger is a 404"

echo "safeguarding"
t POST /body/assess 201 '{"userId":"child","age":12,"heightCm":150,"weightKg":45,"optedIntoBodyMetrics":true}' "child"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> pathway',d.get('pathway'),'| metrics',d.get('metrics'))" 2>/dev/null
echo; echo "pass=$pass fail=$fail"
[ "$fail" = 0 ]
