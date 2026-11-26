#!/bin/bash
# The nightly timetable run on the dev box (sl-easy-timetable.service): download
# SL's GTFS zip from Trafiklab, cut it into per-station files and publish them to
# S3, where CloudFront serves them as https://sl.korist.se/tt/...
#
# Installed by provision.sh as /opt/sl-easy/run.sh; DATA_BUCKET comes from
# /etc/sl-easy/settings. Safe to run by hand: `systemctl start sl-easy-timetable`.
set -euo pipefail
: "${DATA_BUCKET:?}"
REGION=eu-north-1
WORK=/var/lib/sl-easy
ZIP=$WORK/sl.zip
TODAY=$(TZ=Europe/Stockholm date +%F)

# Trafiklab allows 65 downloads in 30 days: never more than one a day, however
# often this runs. The feed is rebuilt around 02:10 Stockholm time.
if [ ! -f "$ZIP" ] || [ "$(TZ=Europe/Stockholm date -r "$ZIP" +%F)" != "$TODAY" ]; then
  KEY=$(aws ssm get-parameter --region "$REGION" --name /sl-easy/trafiklab-key \
    --with-decryption --query Parameter.Value --output text | tr -d ' \n\r')
  # Through a config on stdin, so the key is never in the process list.
  # --compressed: Trafiklab answers 406 to a request that does not accept gzip.
  curl -fsS --compressed -o "$ZIP.new" -K - <<CONFIG
url = "https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key=$KEY"
CONFIG
  mv "$ZIP.new" "$ZIP"
fi

# SL's own station list says which stop areas make up a station. Its API answers
# 429 in bursts; last night's copy will do if it does not get through.
if curl -fsS --retry 5 --retry-delay 5 --retry-all-errors -o "$WORK/sites.json.new" \
  "https://transport.integration.sl.se/v1/sites?expand=true"; then
  mv "$WORK/sites.json.new" "$WORK/sites.json"
fi
[ -s "$WORK/sites.json" ] || { echo "no station list" >&2; exit 1; }

rm -rf "$WORK/out"
SUMMARY=$(python3 /opt/sl-easy/build_timetable.py --zip "$ZIP" --sites "$WORK/sites.json" \
  --out "$WORK/out" --today "$TODAY")
echo "$SUMMARY"
VERSION=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["version"])' "$SUMMARY")

# The files are gzip already. A version is written once and never changes, so it
# may be cached for good; current.json is what moves, and goes last.
for part in s r; do
  aws s3 cp --recursive --only-show-errors "$WORK/out/$part" \
    "s3://$DATA_BUCKET/tt/v/$VERSION/$part" \
    --content-type application/json --content-encoding gzip \
    --cache-control "public, max-age=604800, immutable"
done
aws s3 cp --only-show-errors "$WORK/out/current.json" "s3://$DATA_BUCKET/tt/current.json" \
  --content-type application/json --content-encoding gzip --cache-control "public, max-age=300"
rm -rf "$WORK/out"
echo "published tt/v/$VERSION"
