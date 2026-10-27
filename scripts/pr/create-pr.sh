#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/milestone.sh"

for command_name in git gh jq; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "エラー: ${command_name} が見つかりません。PortableGit Bashを起動し直してください。" >&2
    exit 1
  }
done

BRANCH="$(git branch --show-current)"
[[ "$BRANCH" != "main" && -n "$BRANCH" ]] || { echo "エラー: mainからはPRを作成できません。" >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "エラー: 先に変更をcommitしてください。" >&2; exit 1; }

if [[ "$BRANCH" =~ ^feat/issue-([0-9]+)- ]]; then
  ISSUE_NUMBER="${BASH_REMATCH[1]}"
else
  echo "エラー: ブランチ名からIssue番号を取得できません。feat/issue-<番号>-<名前> 形式のブランチで再実行してください。" >&2
  exit 1
fi
ISSUE_TITLE="$(gh issue view "$ISSUE_NUMBER" --json title --jq .title)"
ISSUE_MILESTONE="$(gh issue view "$ISSUE_NUMBER" --json milestone --jq '.milestone.title // empty')"
MILESTONE="${1:-}"
[[ "$#" -le 1 ]] || { echo "使い方: $0 lec06～lec14" >&2; exit 2; }
[[ -n "$MILESTONE" ]] || { echo 'エラー: Milestoneが空欄です。lec06～lec14を入力して再実行してください。' >&2; exit 1; }
[[ -n "$ISSUE_MILESTONE" ]] || { echo "エラー: 関連Issue #${ISSUE_NUMBER} にMilestoneがありません。GitHubで設定してから再実行してください。" >&2; exit 1; }
[[ "$MILESTONE" == "$ISSUE_MILESTONE" ]] || { echo "エラー: PRのMilestoneは関連Issue #${ISSUE_NUMBER} と同じ '${ISSUE_MILESTONE}' にしてください。" >&2; exit 1; }
REPOSITORY="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
require_milestone "$MILESTONE" "$REPOSITORY" || exit 1
DEFAULT_BODY="docs/temp/pr-${ISSUE_NUMBER}.md"
BODY_FILE="$DEFAULT_BODY"
[[ -f "$BODY_FILE" ]] || { echo "エラー: PR本文ファイルがありません: $BODY_FILE" >&2; exit 1; }
"${SCRIPT_DIR}/validate-body.sh" "$BODY_FILE" --check-related-issues
mapfile -t RELATED_NUMBERS < <(awk '
  $0 == "## 関連Issue" { in_section = 1; next }
  in_section && /^## / { exit }
  in_section { print }
' "$BODY_FILE" | grep -Eo '#[0-9]+' | tr -d '#' | sort -nu)
for number in "${RELATED_NUMBERS[@]}"; do
  related_milestone="$(gh issue view "$number" --json milestone --jq '.milestone.title // empty')"
  [[ "$related_milestone" == "$MILESTONE" ]] || {
    echo "エラー: 関連Issue #${number} のMilestone '${related_milestone}' とPRのMilestone '${MILESTONE}' が一致しません。" >&2
    exit 1
  }
done
EXISTING_PR="$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')"
[[ -z "$EXISTING_PR" ]] || { echo "エラー: このブランチのOpen Pull Request #${EXISTING_PR} が既にあります。" >&2; exit 1; }

echo "--- 作成するPR ---"
echo "ブランチ: $BRANCH"
echo "関連Issue: #$ISSUE_NUMBER"
echo "Milestone: $MILESTONE"
echo "題名: $ISSUE_TITLE"
echo "本文ファイル: $BODY_FILE"
git push -u origin "$BRANCH"
gh pr create --base main --head "$BRANCH" --title "$ISSUE_TITLE" --body-file "$BODY_FILE" --milestone "$MILESTONE"
echo "次は /review-pr Promptを起動して、作成したPRのレビューを始めてください。"
