#!/usr/bin/env bash
# Verify all secret.yaml files under flux/apps/ are SOPS-encrypted.
# A SOPS-encrypted file contains a top-level "sops:" key.
set -euo pipefail

failed=0
while IFS= read -r -d '' file; do
  if ! grep -q "^sops:" "$file"; then
    echo "ERROR: $file is NOT SOPS-encrypted (missing 'sops:' key)"
    failed=1
  fi
done < <(find flux/apps -name "secret.yaml" -print0 2>/dev/null)

if [[ $failed -eq 0 ]]; then
  echo "All secret.yaml files are SOPS-encrypted."
fi
exit $failed
