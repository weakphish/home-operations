#!/usr/bin/env bash
# Verify all secret.yaml files under flux/apps/ are SOPS-encrypted.
# A SOPS-encrypted file contains a top-level "sops:" key.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failed=0
count=0

while IFS= read -r -d '' file; do
  count=$((count + 1))
  if ! grep -q "^sops:" "$file"; then
    echo "ERROR: $file is NOT SOPS-encrypted (missing 'sops:' key)"
    failed=1
  fi
done < <(find "$REPO_ROOT/flux/apps" -name "secret.yaml" -print0 2>/dev/null)

if [[ $count -eq 0 ]]; then
  echo "ERROR: No secret.yaml files found under flux/apps — check the script path"
  exit 1
fi

if [[ $failed -eq 0 ]]; then
  echo "All secret.yaml files are SOPS-encrypted. ($count checked)"
fi
exit $failed
