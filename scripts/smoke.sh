B=${1:-http://localhost:4000/api}
pass=0; fail=0
t(){ if [ "$1" = GET ]; then c=$(curl -s -o /tmp/r.json -w "%{http_code}" "$B$2");
  else c=$(curl -s -o /tmp/r.json -w "%{http_code}" -X "$1" -H 'content-type: application/json' -d "$4" "$B$2"); fi
  if [ "$c" = "$3" ]; then pass=$((pass+1)); printf "  ok    %-4s %-32s %s  %s\n" "$1" "$2" "$c" "$5";
  else fail=$((fail+1)); printf "  FAIL  %-4s %-32s got %s want %s\n" "$1" "$2" "$c" "$3"; head -c 200 /tmp/r.json; echo; fi }

GOOD='{"userId":"u_1","mode":"momentum","availableSeconds":900,"capabilityNormaliser":1,"permittedVariants":["seated","standing"],"signals":{"userId":"u_1","motionState":"still","locationClass":"office","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":1,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["calendar","motion","device_state"]}}'
DRIVING='{"userId":"u_1","mode":"momentum","availableSeconds":900,"capabilityNormaliser":1,"permittedVariants":["seated"],"signals":{"userId":"u_1","motionState":"driving","locationClass":"transit","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":0,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["motion"]}}'
SHORT='{"userId":"u_1","mode":"momentum","availableSeconds":5,"capabilityNormaliser":1,"permittedVariants":["seated"],"signals":{"userId":"u_1","motionState":"still","locationClass":"office","onCall":false,"doNotDisturb":false,"localHour":14,"snapsDeliveredToday":1,"dailyCap":6,"minutesSinceLastNudge":95,"consentedSignals":["motion"]}}'

echo "reads"
for p in /health /system /ai/providers /movements /movements/gate /body/pathways /body/scorecard /body/agents /acu/policy; do t GET $p 200; done
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
echo "safeguarding"
t POST /body/assess 201 '{"userId":"child","age":12,"heightCm":150,"weightKg":45,"optedIntoBodyMetrics":true}' "child"
python3 -c "import json;d=json.load(open('/tmp/r.json'))['data'];print('    -> pathway',d.get('pathway'),'| metrics',d.get('metrics'))" 2>/dev/null
echo; echo "pass=$pass fail=$fail"
[ "$fail" = 0 ]
