#!/usr/bin/env bash
# Every selector in <Name>/<Name>.css must start with that component's own
# class. This is the structural guarantee against one component silently
# restyling another.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
for f in src/components/*/*.css src/map/*.css; do
  slug=$(basename "$f" .css | sed 's/\([a-z0-9]\)\([A-Z]\)/\1-\2/g' | tr 'A-Z' 'a-z')
  bad=$(grep -oE '^[[:space:]]*\.[a-zA-Z_-]+' "$f" | tr -d ' ' | sort -u | grep -v "^\.$slug" || true)
  if [ -n "$bad" ]; then
    echo "$f should only define .$slug* but also defines:"
    echo "$bad" | sed 's/^/  /'
    fail=1
  fi
done

[ "$fail" = 0 ] && echo "css namespacing ok"
exit $fail
