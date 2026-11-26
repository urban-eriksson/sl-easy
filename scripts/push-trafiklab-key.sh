#!/usr/bin/env bash
# Store the Trafiklab key (GTFS Regional static data) where the nightly job on
# the dev box reads it: SSM parameter /sl-easy/trafiklab-key, encrypted.
# The key is never printed and never goes in the repo.
#
#   scripts/push-trafiklab-key.sh [FILE]   default ~/repos/GTFS_regional_static_data.txt
set -euo pipefail
FILE=${1:-$HOME/repos/GTFS_regional_static_data.txt}
[ -s "$FILE" ] || { echo "no key file at $FILE" >&2; exit 1; }
aws ssm put-parameter --region eu-north-1 --name /sl-easy/trafiklab-key \
  --type SecureString --overwrite --value "file://$FILE" --query Version --output text
