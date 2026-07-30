B=${1:-http://localhost:4000/api}
pass=0; fail=0
t(){ if [ "$1" = GET ] || [ "$1" = DELETE ]; then c=$(curl -s -o /tmp/r.json -w "%{http_code}" -X "$1" "$B$2");
  else c=$(curl -s -o /tmp/r.json -w "%{http_code}" -X "$1" -H 'content-type: application/json' -d "$4" "$B$2"); fi
  if [ "$c" = "$3" ]; then pass=$((pass+1)); printf "  ok    %-4s %-32s %s  %s\n" "$1" "$2" "$c" "$5";
  else fail=$((fail+1)); printf "  FAIL  %-4s %-32s got %s want %s\n" "$1" "$2" "$c" "$3"; head -c 200 /tmp/r.json; echo; fi }

GOOD='{"userId":"u_1","mode":"momentum","availableSeconds":900,"capabilityNormaliser":1,"permittedVariants":["seated","standing"],"signals":{"userId":"u_1","motionState":"still","locationClass":"office","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":1,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["calendar","motion","device_state"]}}'
DRIVING='{"userId":"u_1","mode":"momentum","availableSeconds":900,"capabilityNormaliser":1,"permittedVariants":["seated"],"signals":{"userId":"u_1","motionState":"driving","locationClass":"transit","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":0,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["motion"]}}'
SHORT='{"userId":"u_1","mode":"momentum","availableSeconds":5,"capabilityNormaliser":1,"permittedVariants":["seated"],"signals":{"userId":"u_1","motionState":"still","locationClass":"office","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":1,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["motion"]}}'

echo "reads"
for p in /health /system /ai/providers /movements /movements/gate /body/pathways /body/scorecard /body/agents /acu/policy /blog/policy /blog/posts /blog/agent/gaps /blog/analytics /comms/policy /comms/catalogue /comms/stats /comms/deliveries /growth/programme /growth/ladder /stripe/status /stripe/plans /mail/status /accounts/kinds /accounts/media/rules /accounts/autosave/policy /auth/status /accounts/storage/status; do t GET $p 200; done
echo "writes - valid"
t POST /prescriptions/next 201 "$GOOD" "the core call"
t POST /prescriptions/next 201 "$DRIVING" "driving: expect a hold"
t POST /body/assess 201 '{"userId":"u_1","age":34,"heightCm":178,"weightKg":88,"waistCm":95,"optedIntoBodyMetrics":true}'
t POST /body/plan 201 '{"userId":"u_1","age":34,"heightCm":178,"weightKg":88,"optedIntoBodyMetrics":true}'
t POST /acu/quote 201 '{"providerCostGbp":0.004}'
echo "writes - validation must reject"
t POST /prescriptions/next 400 '{}' "empty body"
t POST /prescriptions/next 400 '{"userId":"u","mode":"nonsense","availableSeconds":900,"capabilityNormaliser":1,"permittedVariants":["seated"],"signals":{}}' "bad mode"
t POST /prescriptions/next 400 "$SHORT" "below Snap floor"
t POST /body/assess 400 '{"userId":"u","age":34,"weightKg":9000}' "impossible weight"
t POST /body/assess 400 '{"userId":"u","age":3}' "under-10"
t POST /acu/quote 400 '{"providerCostGbp":-5}' "negative cost"
t POST /acu/quote 400 '{"providerCostGbp":0.01,"junkField":1}' "unknown field"
echo "editorial gate"
t POST /blog/views 201 '{"slug":"the-nudge-we-did-not-send","dwellSeconds":90,"scrollPercent":80,"device":"desktop"}' "record a view"
t POST /blog/views 400 '{"slug":"x","dwellSeconds":99999,"scrollPercent":80}' "absurd dwell rejected"
t POST /blog/posts/rules-in-postgresql/status 400 '{"to":"published","reviewer":"A Person"}' "published -> published refused"
t POST /blog/posts/rules-in-postgresql/status 400 '{"to":"draft"}' "published -> draft refused"

echo "communication routing"
t POST /comms/preview 201 '{"event":"payment.successful","to":{"userId":"child","age":12,"presence":"full","consentedChannels":["email","in_app","sms","push"],"inQuietHours":false,"contextHeld":false,"coachingSentToday":0,"dailyCap":4,"hasGuardian":true}}' "adult-only event, age 12"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> deliver',d['plan']['deliver'],'| suppressed',d['plan']['suppressed'])" 2>/dev/null
t POST /comms/preview 201 '{"event":"privacy.breach_notification","to":{"userId":"a","age":52,"presence":"off","consentedChannels":[],"inQuietHours":true,"contextHeld":true,"coachingSentToday":9,"dailyCap":6,"hasGuardian":false}}' "breach notice, all opted out, 3am"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> deliver',d['plan']['deliver'])" 2>/dev/null
t POST /comms/send 201 '{"event":"privacy.breach_notification","to":{"userId":"a","age":52,"presence":"off","consentedChannels":[],"inQuietHours":true,"contextHeld":true,"coachingSentToday":9,"dailyCap":6,"hasGuardian":false}}' "send it"
t POST /comms/preview 404 '{"event":"not.a.real.event","to":{"userId":"a","age":30,"presence":"full","consentedChannels":["in_app"],"inQuietHours":false,"contextHeld":false,"coachingSentToday":0,"dailyCap":6,"hasGuardian":false}}' "unknown event"
t POST /comms/preview 400 '{"event":"snap.offered","to":{"userId":"a","age":4,"presence":"full","consentedChannels":["in_app"],"inQuietHours":false,"contextHeld":false,"coachingSentToday":0,"dailyCap":6,"hasGuardian":false}}' "age below 10 rejected"

echo "growth partner programme"
t POST /growth/commission 201 '{"paymentReceivedGbp":2400,"taxGbp":400,"paymentFeesGbp":58.4,"refundsGbp":120,"kind":"approved_influencer","verifiedPaidReferrals":0,"lifetimeAlreadyPaidGbp":0}' "influencer, paid on net"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> net',d['netRevenueGbp'],'| commission',d['commissionGbp'])" 2>/dev/null
t POST /growth/commission 201 '{"paymentReceivedGbp":2400,"kind":"normal","verifiedPaidReferrals":13,"lifetimeAlreadyPaidGbp":0}' "13 referrals: no cash yet"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> commission',d['commissionGbp'],'| eligible',d['eligible'])" 2>/dev/null
t POST /growth/trust 201 '{"signals":["same_payment_card"]}' "shared card is disqualifying"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> verdict',d['verdict'])" 2>/dev/null
t POST /growth/payout 201 '{"balanceGbp":18,"kycComplete":true,"oldestEarningAgeDays":60}' "below the payout floor"
t POST /growth/trust 400 '{"signals":["not_a_signal"]}' "unknown trust signal rejected"
t POST /growth/commission 400 '{"paymentReceivedGbp":-5,"kind":"normal","verifiedPaidReferrals":0,"lifetimeAlreadyPaidGbp":0}' "negative revenue rejected"

echo "accounts, autosave and payments"
t POST /accounts 201 '{"userId":"rb_teen","kind":"minor","age":15,"guardianId":"g1"}' "minor with a guardian"
t POST /accounts 400 '{"userId":"rb_solo","kind":"minor","age":15}' "minor without a guardian refused"
t POST /accounts 400 '{"userId":"rb_x","kind":"adult","age":15}' "under-18 cannot hold an adult account"
t POST /accounts/profiles/rb_teen/autosave 201 '{"age":15,"basedOnVersion":1,"patch":{"displayName":"Robin"}}' "autosave a safe field"
t POST /accounts/profiles/rb_teen/autosave 400 '{"age":15,"basedOnVersion":2,"patch":{"optedIntoBodyMetrics":true}}' "consent will not autosave"
t POST /accounts/profiles/rb_teen/autosave 400 '{"age":15,"basedOnVersion":2,"patch":{"dateOfBirth":"2011-01-01"}}' "date of birth is not editable here"
t POST /accounts/media/check 201 '{"slot":"avatar","age":15,"mimeType":"image/jpeg","bytes":400000,"widthPx":800,"heightPx":800}' "teen photo check"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> ok',d['ok'],'|',d['reasons'][0] if d['reasons'] else '')" 2>/dev/null
t POST /accounts/media/check 400 '{"slot":"avatar","age":9,"mimeType":"image/jpeg","bytes":400000,"widthPx":800,"heightPx":800}' "age below 10 rejected"
t POST /stripe/webhook 400 '{"id":"evt_x","type":"invoice.paid"}' "unsigned webhook refused"
t POST /stripe/checkout 400 '{"userId":"u","plan":"premium_monthly","successUrl":"http://x.test/a","cancelUrl":"http://x.test/b"}' "checkout without a key explains itself"
t POST /mail/preview 201 '{"event":"account.registration.requested","values":{"name":"Sam"}}' "render an email"
t POST /mail/preview 400 '{"event":"not.a.real.event"}' "unknown event refused"
t POST /accounts/seed 201 '{}' "seed one account of every kind"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    ->',len(d['personas']),'personas')" 2>/dev/null
t POST /accounts/seed 201 '{}' "seeding twice adds nothing"
t DELETE /accounts/profiles/demo_child 200 '' "delete one account"
t DELETE /accounts/profiles/nobody 404 '' "deleting a stranger is a 404"

echo "safeguarding"
t POST /body/assess 201 '{"userId":"child","age":12,"heightCm":150,"weightKg":45,"optedIntoBodyMetrics":true}' "child"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> pathway',d.get('pathway'),'| metrics',d.get('metrics'))" 2>/dev/null
echo; echo "pass=$pass fail=$fail"
[ "$fail" = 0 ]
