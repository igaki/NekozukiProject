#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

[[ -x /usr/local/bin/jq.exe ]] && export PATH="/usr/local/bin:${PATH}"

for command_name in gh git; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "エラー: ${command_name} が見つかりません。" >&2
    exit 1
  }
done

POWERSHELL_EXE="$(command -v powershell.exe || true)"
if [[ -z "$POWERSHELL_EXE" ]]; then
  for candidate in /c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe /c/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe; do
    [[ -x "$candidate" ]] || continue
    POWERSHELL_EXE="$candidate"
    break
  done
fi
[[ -n "$POWERSHELL_EXE" ]] || { echo 'エラー: Windows PowerShellが見つかりません。' >&2; exit 1; }

LOGIN="$(gh api user --jq .login)"
REPORT_FILE="docs/weekly-summary_${LOGIN}.html"
DATA_DIR="docs/weekly-summary-data/${LOGIN}"
DATA_FILE="${1:-}"

if [[ -z "$DATA_FILE" ]]; then
  latest="$(find "$DATA_DIR" -maxdepth 1 -type f -name '*.json' -printf '%f\n' 2>/dev/null | sort | tail -n 1 || true)"
  [[ -n "$latest" ]] || { echo 'エラー: 表示できる週次JSONがありません。先に weekly-summary.sh を実行してください。' >&2; exit 1; }
  DATA_FILE="${DATA_DIR}/${latest}"
fi
[[ -f "$DATA_FILE" ]] || { echo "エラー: JSONが見つかりません: ${DATA_FILE}" >&2; exit 1; }
[[ -f "$REPORT_FILE" ]] || { echo "エラー: HTMLが見つかりません。先に weekly-summary.sh を実行してください。" >&2; exit 1; }

PORT="$((18000 + RANDOM % 1000))"
"$POWERSHELL_EXE" -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_DIR}/server-weekly-summary.ps1" -HtmlPath "$(pwd -W)/${REPORT_FILE}" -DataPath "$(pwd -W)/${DATA_FILE}" -Port "$PORT" >/dev/null 2>&1 &
sleep 1
echo "表示するJSON: ${DATA_FILE}"
echo "URL: http://127.0.0.1:${PORT}/"
"$POWERSHELL_EXE" -NoProfile -Command "Start-Process 'http://127.0.0.1:${PORT}/'" >/dev/null 2>&1 || true
