#!/bin/sh
set -e

# Populate Wrangler dev vars from container env
cat > /app/.dev.vars <<EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
QUALITY_SCORE_MIN=$QUALITY_SCORE_MIN
EOF

exec npm run dev -- --ip 0.0.0.0 --port 8787
