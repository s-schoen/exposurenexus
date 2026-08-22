#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Create or delete a sibling Git worktree by name." >&2
  echo "Creation copies local .env files and installs pnpm dependencies." >&2
  echo "Usage: pnpm worktree <create|delete> <worktree-name>" >&2
  exit 2
}

if [[ $# -ne 2 ]]; then
  usage
fi

action="$1"
worktree_name="$2"

if [[ ! "$worktree_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "Worktree name must contain only letters, numbers, dots, underscores, and hyphens." >&2
  exit 2
fi

if ! git check-ref-format --branch "$worktree_name" >/dev/null 2>&1; then
  echo "Worktree name is not a valid Git branch name: $worktree_name" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
repo_name="$(basename "$repo_root")"
worktrees_root="$(dirname "$repo_root")/${repo_name}-worktrees"
worktree_path="${worktrees_root}/${worktree_name}"

copy_env_files() {
  local env_file relative_path

  find "$repo_root" \
    \( -path "$repo_root/.git" -o -path '*/node_modules' -o -path "$worktree_path" \) -prune -o \
    -type f \( -name '.env' -o -name '.env.*' \) -print0 |
    while IFS= read -r -d '' env_file; do
      relative_path="${env_file#"$repo_root"/}"
      mkdir -p "${worktree_path}/$(dirname "$relative_path")"
      cp -p "$env_file" "${worktree_path}/${relative_path}"
    done
}

case "$action" in
  create)
    if [[ -e "$worktree_path" ]]; then
      echo "Worktree path already exists: $worktree_path" >&2
      exit 1
    fi

    mkdir -p "$worktrees_root"
    created_branch=false

    if git show-ref --verify --quiet "refs/heads/$worktree_name"; then
      git worktree add "$worktree_path" "$worktree_name"
    elif git show-ref --verify --quiet "refs/remotes/origin/$worktree_name"; then
      git worktree add --track -b "$worktree_name" "$worktree_path" "origin/$worktree_name"
      created_branch=true
    else
      git worktree add -b "$worktree_name" "$worktree_path"
      created_branch=true
    fi

    if ! (
      copy_env_files || exit
      cd "$worktree_path" || exit
      pnpm install
    ); then
      echo "Worktree setup failed; removing partial worktree." >&2
      git worktree remove --force "$worktree_path" || true
      if [[ "$created_branch" == true ]]; then
        git branch -D "$worktree_name" || true
      fi
      exit 1
    fi

    echo "Created worktree: $worktree_path"
    ;;
  delete)
    if [[ ! -e "$worktree_path" ]]; then
      echo "Worktree path does not exist: $worktree_path" >&2
      exit 1
    fi

    git worktree remove "$worktree_path"
    echo "Deleted worktree: $worktree_path"
    echo "Branch retained: $worktree_name"
    ;;
  *)
    usage
    ;;
esac
