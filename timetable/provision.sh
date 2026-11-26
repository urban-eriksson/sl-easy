#!/bin/bash
# Sets up the nightly timetable job on the shared dev box (KoristDev). Runs as
# root through scripts/deploy-timetable.sh on every deploy and is idempotent.
# It touches only its own files: a user, /opt/sl-easy, /var/lib/sl-easy,
# /etc/sl-easy and the sl-easy-timetable service and timer. No port, no Caddy.
#
# Arguments: SOURCE_DIR (holding build_timetable.py and run.sh) DATA_BUCKET
set -euo pipefail
SOURCE=$1
DATA_BUCKET=$2

id sl-easy >/dev/null 2>&1 || useradd -r -m -d /opt/sl-easy sl-easy
install -d -m 755 -o sl-easy -g sl-easy /opt/sl-easy /var/lib/sl-easy
install -d -m 755 /etc/sl-easy
install -m 644 -o root -g root "$SOURCE/build_timetable.py" /opt/sl-easy/build_timetable.py
install -m 755 -o root -g root "$SOURCE/run.sh" /opt/sl-easy/run.sh
echo "DATA_BUCKET=$DATA_BUCKET" > /etc/sl-easy/settings
chmod 644 /etc/sl-easy/settings

# Low priority: the box is a t3.micro and its other tenants serve people.
cat > /etc/systemd/system/sl-easy-timetable.service <<'UNIT'
[Unit]
Description=Publish SL's timetable for SL Eazy
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=sl-easy
EnvironmentFile=/etc/sl-easy/settings
ExecStart=/opt/sl-easy/run.sh
Nice=15
IOSchedulingClass=idle
UNIT

# 03:00 in Stockholm: after Trafiklab's rebuild (about 02:10) and before the
# other apps' nightly jobs, summer and winter. No Persistent=true: a missed
# night costs nothing, last night's files cover a week.
cat > /etc/systemd/system/sl-easy-timetable.timer <<'UNIT'
[Unit]
Description=Nightly SL Eazy timetable run

[Timer]
OnCalendar=*-*-* 03:00:00 Europe/Stockholm
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now sl-easy-timetable.timer
systemctl list-timers sl-easy-timetable.timer --no-pager
