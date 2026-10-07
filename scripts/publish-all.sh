#!/usr/bin/env bash
#
# Single source of truth for publishing @ahtmljs/* to npm, in dependency order,
# with npm provenance. Idempotent: any version already on the registry is skipped,
# so re-running after a partial failure is safe.
#
# Expects NODE_AUTH_TOKEN in the environment (set by the release workflow) and a
# prior `npm run build:packages`.
set -euo pipefail

# Dependency order (same as package.json build:packages). schema first, leaves last.
ORDER=(schema extract kv agent next vite hono astro sveltekit langchain webmcp conformance cli insights index badge)

# ORDER must match the non-private packages/ dirs exactly.
actual=$(for f in packages/*/package.json; do
  node -e 'process.exit(require(process.argv[1]).private ? 1 : 0)' "./$f" || continue
  basename "$(dirname "$f")"
done | sort | tr '\n' ' ')
want=$(printf '%s\n' "${ORDER[@]}" | sort | tr '\n' ' ')
[ "$actual" = "$want" ] || { echo "::error::packages/ [$actual] != ORDER [$want]"; exit 1; }

for name in "${ORDER[@]}"; do
  dir="packages/$name"
  [ -f "$dir/package.json" ] || { echo "::error::$dir missing"; exit 1; }
  pkg=$(node -p "require('./$dir/package.json').name")
  ver=$(node -p "require('./$dir/package.json').version")

  if npm view "$pkg@$ver" version >/dev/null 2>&1; then
    echo "skip   $pkg@$ver (already on registry)"
    continue
  fi

  echo "publish $pkg@$ver"
  (cd "$dir" && npm publish --access public --provenance)
done

echo "done."
