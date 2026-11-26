#!/usr/bin/env bash
# Install the nightly timetable job on the shared dev box via S3 + SSM (no SSH).
# Needs the SlEasy stack (scripts/deploy-web.sh) and scripts/push-trafiklab-key.sh.
#
#   scripts/deploy-timetable.sh         install or update the job
#   scripts/deploy-timetable.sh --run   also run it now and wait (publishes tonight's files)
set -euo pipefail
cd "$(dirname "$0")/.."

RUN=no
[ "${1:-}" = "--run" ] && RUN=yes

python3 -m unittest discover -s timetable -q

out() {
  aws cloudformation describe-stacks --region eu-north-1 --stack-name SlEasy \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(out OutDataBucket)
INSTANCE=$(out OutInstanceId)

for f in build_timetable.py run.sh provision.sh; do
  aws s3 cp --only-show-errors "timetable/$f" "s3://$BUCKET/deploy/$f"
done

START="true"
[ "$RUN" = yes ] && START="systemctl start sl-easy-timetable.service && journalctl -u sl-easy-timetable.service -n 8 --no-pager -o cat"

echo "installing on $INSTANCE (run now: $RUN)"
CMD_ID=$(aws ssm send-command --region eu-north-1 \
  --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --comment "sl-easy timetable deploy" \
  --timeout-seconds 900 \
  --parameters 'commands=[
    "set -eu",
    "rm -rf /tmp/sl-easy-deploy && mkdir -p /tmp/sl-easy-deploy",
    "aws s3 cp --recursive --only-show-errors s3://'"$BUCKET"'/deploy/ /tmp/sl-easy-deploy/",
    "bash /tmp/sl-easy-deploy/provision.sh /tmp/sl-easy-deploy '"$BUCKET"'",
    "rm -rf /tmp/sl-easy-deploy",
    "'"$START"'"
  ]' \
  --query 'Command.CommandId' --output text)

echo "waiting for SSM command $CMD_ID"
for _ in $(seq 1 90); do
  STATUS=$(aws ssm get-command-invocation --region eu-north-1 --command-id "$CMD_ID" \
    --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in Pending | InProgress | Delayed) sleep 10 ;; *) break ;; esac
done
aws ssm get-command-invocation --region eu-north-1 --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json |
  python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d['status']); print(d['stdout'][-3000:]); print(d['stderr'][-3000:], file=sys.stderr); sys.exit(0 if d['status']=='Success' else 1)"
