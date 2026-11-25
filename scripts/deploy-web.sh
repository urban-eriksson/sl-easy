#!/usr/bin/env bash
# Build the static app and ship it (plus any infra change) via CDK: S3 upload and
# CloudFront invalidation. The first run also needs the certificate stack:
#   cd infra && npx aws-cdk deploy SlEasyCert SlEasy --require-approval never
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
# Refresh the station list from SL so each release ships the current one.
npm run stations
npm run check
npm test
npm run build
cd ../../infra
npx aws-cdk deploy SlEasy --require-approval never
