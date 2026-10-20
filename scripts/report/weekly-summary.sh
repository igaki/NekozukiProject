#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

# 授業用PortableGitではjq.exeが/usr/local/binに置かれている。
[[ -x /usr/local/bin/jq.exe ]] && export PATH="/usr/local/bin:${PATH}"

# 授業用のbash_profileはWindowsのシステムPATHを引き継がないため、
# Windows PowerShellを明示的に探索する。
POWERSHELL_EXE="$(command -v powershell.exe || true)"
if [[ -z "$POWERSHELL_EXE" ]]; then
  for candidate in \
    /c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe \
    /c/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe; do
    if [[ -x "$candidate" ]]; then
      POWERSHELL_EXE="$candidate"
      break
    fi
  done
fi
[[ -n "$POWERSHELL_EXE" ]] || {
  echo 'エラー: Windows PowerShellが見つかりません。Windows上のPortableGit Bashで実行してください。' >&2
  exit 1
}

for command_name in gh jq git date; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "エラー: ${command_name} が見つかりません。PortableGit BashとGitHub CLIを利用できる環境で実行してください。" >&2
    exit 1
  }
done

LOGIN="$(gh api user --jq .login)"
REPOSITORY="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
DATA_DIR="docs/weekly-summary-data/${LOGIN}"
REPORT_FILE="docs/weekly-summary_${LOGIN}.html"
mkdir -p "$DATA_DIR"

NOW="$(date -u -d '+9 hours' '+%Y-%m-%dT%H:%M:%S+09:00')"
FILE_STAMP="$(date -u -d '+9 hours' '+%Y-%m-%d_%H%M-JST')"
DATA_FILE="${DATA_DIR}/${FILE_STAMP}.json"
if [[ -e "$DATA_FILE" ]]; then
  suffix=2
  while [[ -e "${DATA_DIR}/${FILE_STAMP}-${suffix}.json" ]]; do suffix=$((suffix + 1)); done
  DATA_FILE="${DATA_DIR}/${FILE_STAMP}-${suffix}.json"
fi

LATEST_FILE="$(find "$DATA_DIR" -maxdepth 1 -type f -name '*.json' -printf '%f\n' 2>/dev/null | sort | tail -n 1 || true)"
if [[ -n "$LATEST_FILE" ]]; then
  START="$(jq -r '.generatedAt // empty' "${DATA_DIR}/${LATEST_FILE}")"
else
  START='1970-01-01T00:00:00+09:00'
fi
START_UTC="$(date -u -d "$START" '+%Y-%m-%dT%H:%M:%SZ')"
NOW_UTC="$(date -u -d "$NOW" '+%Y-%m-%dT%H:%M:%SZ')"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_DIR"' EXIT

duration_seconds() {
  local start="$1" end="$2"
  local start_seconds end_seconds
  start_seconds="$(date -d "$start" +%s 2>/dev/null)" || return 1
  end_seconds="$(date -d "$end" +%s 2>/dev/null)" || return 1
  (( end_seconds >= start_seconds )) || return 1
  printf '%s' "$((end_seconds - start_seconds))"
}

reflog_branch_start() {
  local branch="$1"
  [[ -n "$branch" ]] || return 1
  git reflog show --date=iso-local "refs/heads/${branch}" 2>/dev/null |
    sed -nE 's/^.*@\{([^}]*)\}: branch: Created from (origin\/main|main)$/\1/p' |
    tail -n 1
}

choose_start() {
  local branch="$1" commits_json="$2" issue_created="$3" pr_created="$4"
  local value
  value="$(reflog_branch_start "$branch" || true)"
  if [[ -n "$value" ]]; then printf '%s\t%s' "$value" reflog; return; fi
  value="$(jq -r '[.[] | .committedAt // .authoredAt // empty] | min // empty' <<<"$commits_json")"
  if [[ -n "$value" ]]; then printf '%s\t%s' "$value" first-commit; return; fi
  if [[ -n "$issue_created" && "$issue_created" != null ]]; then printf '%s\t%s' "$issue_created" issue-created; return; fi
  printf '%s\t%s' "$pr_created" pr-created
}

echo 'PR一覧を取得しています…' >&2
gh pr list --repo "$REPOSITORY" --state all --limit 1000 \
  --json number,state,title,url,body,createdAt,closedAt,mergedAt,headRefName,author > "$TEMP_DIR/all-pulls.json"
gh api --paginate --slurp "repos/${REPOSITORY}/issues?state=all&per_page=100" |
  jq 'add // [] | map(select(.pull_request == null))' > "$TEMP_DIR/all-issues.json"

echo '対象学生のPR詳細を取得しています…' >&2
: > "$TEMP_DIR/target-prs.jsonl"
while IFS= read -r number; do
  rest="$(jq --argjson number "$number" '.[] | select(.number == $number)' "$TEMP_DIR/all-pulls.json")"
  body="$(jq -r '.body // ""' <<<"$rest")"
  if ! detail="$(gh pr view "$number" --repo "$REPOSITORY" --json number,title,url,body,createdAt,closedAt,mergedAt,headRefName,closingIssuesReferences 2>/dev/null)"; then
    echo "警告: #${number} はPull Requestとして取得できないため除外します。" >&2
    continue
  fi
  if ! commits="$(gh api --paginate --slurp "repos/${REPOSITORY}/pulls/${number}/commits?per_page=100" | jq '[add[] | {sha, message: .commit.message, committedAt: .commit.committer.date, authoredAt: .commit.author.date}]')"; then
    echo "警告: PR #${number} のコミットを取得できないため除外します。" >&2
    continue
  fi
  jq -n --argjson detail "$detail" --arg body "$body" --argjson commits "$commits" \
    '$detail + {body: $body, commits: $commits}' >> "$TEMP_DIR/target-prs.jsonl"
done < <(jq -r --arg login "$LOGIN" --arg start "$START_UTC" '
  .[] | select(.author.login == $login) |
  select((.createdAt >= $start) or (.closedAt != null and .closedAt >= $start)) | .number
' "$TEMP_DIR/all-pulls.json" | tr -d '\r')
jq -s '.' "$TEMP_DIR/target-prs.jsonl" > "$TEMP_DIR/target-prs.json"

# 手動Closeを判定するため、全Close済みPRの関連Issueを確認する。
: > "$TEMP_DIR/pr-closed-issues.txt"
while IFS= read -r number; do
  gh pr view "$number" --repo "$REPOSITORY" --json closingIssuesReferences --jq '.closingIssuesReferences[].number' 2>/dev/null >> "$TEMP_DIR/pr-closed-issues.txt" || true
done < <(jq -r '.[] | select(.state == "CLOSED") | .number' "$TEMP_DIR/all-pulls.json" | tr -d '\r')
sort -nu "$TEMP_DIR/pr-closed-issues.txt" > "$TEMP_DIR/pr-closed-issues.sorted"
mv "$TEMP_DIR/pr-closed-issues.sorted" "$TEMP_DIR/pr-closed-issues.txt"

echo 'Issueごとの所要時間を算定しています…' >&2
: > "$TEMP_DIR/completed-issues.jsonl"
: > "$TEMP_DIR/closed-prs-without-issue.jsonl"
while IFS= read -r pr_number; do
  pr="$(jq --argjson number "$pr_number" '.[] | select(.number == $number)' "$TEMP_DIR/target-prs.json")"
  closed_at="$(jq -r '.closedAt // empty' <<<"$pr")"
  [[ -n "$closed_at" ]] || continue
  branch="$(jq -r '.headRefName // empty' <<<"$pr")"
  commits="$(jq -c '.commits' <<<"$pr")"
  pr_created="$(jq -r '.createdAt' <<<"$pr")"
  closing_count="$(jq '.closingIssuesReferences | length' <<<"$pr")"
  if [[ "$closing_count" -eq 0 ]]; then
    IFS=$'\t' read -r start start_source <<< "$(choose_start "$branch" "$commits" '' "$pr_created")"
    seconds="$(duration_seconds "$start" "$closed_at" || printf '')"
    jq -n --argjson pr "$pr" --arg start "$start" --arg end "$closed_at" --arg source "$start_source" --arg seconds "$seconds" '
      {number:$pr.number,title:$pr.title,url:$pr.url,createdAt:$pr.createdAt,closedAt:$end,mergedAt:$pr.mergedAt,
       startAt:$start,startSource:$source,endSource:"pr-closed",durationSeconds:($seconds|tonumber?)}
    ' >> "$TEMP_DIR/closed-prs-without-issue.jsonl"
    continue
  fi
  while IFS= read -r issue_number; do
    if ! issue="$(gh issue view "$issue_number" --repo "$REPOSITORY" --json number,title,url,body,createdAt,closedAt,assignees 2>/dev/null)"; then
      echo "警告: Issue #${issue_number} を取得できないため除外します。" >&2
      continue
    fi
    issue_created="$(jq -r '.createdAt // empty' <<<"$issue")"
    issue_closed="$(jq -r '.closedAt // empty' <<<"$issue")"
    IFS=$'\t' read -r start start_source <<< "$(choose_start "$branch" "$commits" "$issue_created" "$pr_created")"
    if [[ -n "$closed_at" ]]; then end="$closed_at"; end_source=pr-closed; else end="$issue_closed"; end_source=issue-closed; fi
    seconds="$(duration_seconds "$start" "$end" || printf '')"
    jq -n --argjson issue "$issue" --argjson pr "$pr" --arg start "$start" --arg end "$end" --arg startSource "$start_source" --arg endSource "$end_source" --arg seconds "$seconds" '
      {number:$issue.number,title:$issue.title,url:$issue.url,body:$issue.body,assignees:[$issue.assignees[].login],
       pr:{number:$pr.number,title:$pr.title,url:$pr.url},startAt:$start,endAt:$end,startSource:$startSource,endSource:$endSource,durationSeconds:($seconds|tonumber?)}
    ' >> "$TEMP_DIR/completed-issues.jsonl"
  done < <(jq -r '.closingIssuesReferences[].number' <<<"$pr" | tr -d '\r')
done < <(jq -r '.[].number' "$TEMP_DIR/target-prs.json" | tr -d '\r')
jq -s '.' "$TEMP_DIR/completed-issues.jsonl" > "$TEMP_DIR/completed-issues.json"
jq -s '.' "$TEMP_DIR/closed-prs-without-issue.jsonl" > "$TEMP_DIR/closed-prs-without-issue.json"

: > "$TEMP_DIR/manually-closed-issues.jsonl"
while IFS= read -r issue_number; do
  grep -qx "$issue_number" "$TEMP_DIR/pr-closed-issues.txt" && continue
  issue="$(jq --argjson number "$issue_number" '.[] | select(.number == $number)' "$TEMP_DIR/all-issues.json")"
  start="$(jq -r '.created_at' <<<"$issue")"; end="$(jq -r '.closed_at' <<<"$issue")"
  seconds="$(duration_seconds "$start" "$end" || printf '')"
  jq -n --argjson issue "$issue" --arg start "$start" --arg end "$end" --arg seconds "$seconds" '
    {number:$issue.number,title:$issue.title,url:$issue.html_url,body:($issue.body // ""),startAt:$start,endAt:$end,startSource:"issue-created",endSource:"issue-closed",durationSeconds:($seconds|tonumber?)}
  ' >> "$TEMP_DIR/manually-closed-issues.jsonl"
done < <(jq -r --arg login "$LOGIN" --arg start "$START_UTC" '
  .[] | select(.closed_at != null and .closed_at >= $start) |
  select([.assignees[].login] | index($login)) | .number
' "$TEMP_DIR/all-issues.json" | tr -d '\r')
jq -s '.' "$TEMP_DIR/manually-closed-issues.jsonl" > "$TEMP_DIR/manually-closed-issues.json"

gh api --paginate --slurp "repos/${REPOSITORY}/issues/comments?since=${START_UTC}&per_page=100" | jq 'add // []' > "$TEMP_DIR/issue-comments.json"
gh api --paginate --slurp "repos/${REPOSITORY}/pulls/comments?since=${START_UTC}&per_page=100" | jq 'add // []' > "$TEMP_DIR/review-comments.json"
gh api --paginate --slurp "repos/${REPOSITORY}/commits?author=${LOGIN}&since=${START_UTC}&until=${NOW_UTC}&per_page=100" | jq 'add // []' > "$TEMP_DIR/commits.json"
# debug Skill が作成する、Git管理下の個別記録だけを対象にする。
: > "$TEMP_DIR/troubleshooting.jsonl"
TROUBLESHOOTING_START_SECONDS="$(date -d "$START" '+%s')"
TROUBLESHOOTING_END_SECONDS="$(date -d "$NOW" '+%s')"
while IFS= read -r record_file; do
  record_name="${record_file##*/}"
  [[ "$record_name" =~ ^troubleshooting-${LOGIN}-([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}\+0900)(-[0-9]+)?\.md$ ]] || continue
  record_stamp="${BASH_REMATCH[1]}"
  record_at="${record_stamp:0:10}T${record_stamp:11:2}:${record_stamp:13:2}:${record_stamp:15:2}+09:00"
  record_seconds="$(date -d "$record_at" '+%s')"
  (( record_seconds < TROUBLESHOOTING_START_SECONDS || record_seconds > TROUBLESHOOTING_END_SECONDS )) && continue
  record_title="$(sed -nE 's/^# +//p' "$record_file" | head -n 1)"
  jq -n --arg file "$record_file" --arg at "$record_at" --arg subject "${record_title:-debug Skillの記録}" '{file:$file,at:$at,subject:$subject}' >> "$TEMP_DIR/troubleshooting.jsonl"
done < <(find docs/trouble -maxdepth 1 -type f -name 'troubleshooting-*.md' -print 2>/dev/null | sort)
jq -s '.' "$TEMP_DIR/troubleshooting.jsonl" > "$TEMP_DIR/troubleshooting.json"

previous_ai='{}'
if [[ -n "$LATEST_FILE" ]]; then previous_ai="$(jq -c '.aiUsage // {}' "${DATA_DIR}/${LATEST_FILE}")"; fi

jq -n \
  --arg generatedAt "$NOW" --arg start "$START" --arg end "$NOW" --arg student "$LOGIN" \
  --slurpfile completed "$TEMP_DIR/completed-issues.json" \
  --slurpfile withoutIssue "$TEMP_DIR/closed-prs-without-issue.json" \
  --slurpfile manual "$TEMP_DIR/manually-closed-issues.json" \
  --slurpfile targetPrs "$TEMP_DIR/target-prs.json" \
  --slurpfile allIssues "$TEMP_DIR/all-issues.json" \
  --slurpfile commits "$TEMP_DIR/commits.json" \
  --slurpfile issueComments "$TEMP_DIR/issue-comments.json" \
  --slurpfile reviewComments "$TEMP_DIR/review-comments.json" \
  --slurpfile troubleshooting "$TEMP_DIR/troubleshooting.json" \
  --argjson aiUsage "$previous_ai" '
  def completed: $completed[0]; def withoutIssue: $withoutIssue[0]; def manual: $manual[0];
  def targetPrs: $targetPrs[0]; def allIssues: $allIssues[0]; def commits: $commits[0];
  def issueComments: $issueComments[0]; def reviewComments: $reviewComments[0]; def troubleshooting: $troubleshooting[0];
  def openIssues: allIssues | map(select(.state == "open"));
  {
    schemaVersion: 2, generatedAt: $generatedAt, period: {from: $start, to: $end}, student: $student,
    completedIssues: completed, closedPrsWithoutIssue: withoutIssue, manuallyClosedIssues: manual,
    pullRequests: targetPrs,
    openPullRequests: (targetPrs | map(select(.closedAt == null))),
    openAssignedIssues: (openIssues | map(select([.assignees[].login] | index($student)))),
    openUnassignedIssues: (openIssues | map(select((.assignees | length) == 0))),
    commits: commits, githubComments: ((issueComments + reviewComments) | map(select(.user.login == $student))),
    troubleshooting: troubleshooting, aiUsage: $aiUsage
  } |
  .summary = {
    completedIssueCount: (.completedIssues | length),
    averageIssueDurationSeconds: ([.completedIssues[].durationSeconds | select(. != null)] | if length == 0 then null else add / length end),
    createdPrCount: (.pullRequests | map(select(.createdAt >= $start)) | length),
    mergedPrCount: (.pullRequests | map(select(.mergedAt != null and .mergedAt >= $start)) | length),
    openPrCount: (.openPullRequests | length), openAssignedIssueCount: (.openAssignedIssues | length),
    openUnassignedIssueCount: (.openUnassignedIssues | length), commitCount: (.commits | length),
    githubCommentCount: (.githubComments | length), troubleshootingCount: (.troubleshooting | length)
  }
' > "$TEMP_DIR/report.json"
mv "$TEMP_DIR/report.json" "$DATA_FILE"

REPORT_JSON="$(jq -c . "$DATA_FILE")"
cat > "$REPORT_FILE" <<'EOF'
<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>週次開発レビュー @$LOGIN</title><link rel="stylesheet" href="assets/vendor/bulma-1.0.4.min.css"><style>
:root{--text:#f8fafc;--muted:#d7e0ee;--surface:#14213d;--surface-2:#1e3156;--accent:#7dd3fc;--danger:#ff8fa3}body{background:linear-gradient(135deg,#071426,#102a4c 55%,#16142d);min-height:100vh;color:var(--text)}.hero{background:radial-gradient(circle at 85% 15%,#405b96,transparent 38%),linear-gradient(120deg,#0b1e38,#1c3d6b)}.hero .title,.hero .subtitle{color:var(--text)}.summary-card,.detail-card{background:var(--surface);color:var(--text);border:1px solid #6385b6;box-shadow:0 14px 38px rgba(0,0,0,.28)}.summary-card .title,.summary-card p,.summary-card strong,.summary-card .label,.detail-card .content,.detail-card .content strong{color:var(--text)!important}.metric{font-size:1.7rem;font-weight:700;color:var(--accent)!important}.warning{border-left:4px solid var(--danger);background:#4b1f32;color:#fff7f8}.detail-card summary{cursor:pointer;color:#b9e9ff;font-weight:700}.meta,.footer-note{color:var(--muted)!important;font-size:.9rem}.tag.is-source{background:var(--surface-2);color:var(--text)}.section-title{color:var(--text)!important}.ai-select{max-width:15rem}.notification{margin-top:.8rem}.list-item{border-top:1px solid #526b90;padding:.8rem 0}.detail-card a{color:#a5e5ff;text-decoration:underline}</style></head><body>
 <section class="hero is-medium"><div class="hero-body"><div class="container"><p class="title">Weekly Engineering Review</p><p class="subtitle" id="report-meta"></p></div></div></section>
<main class="section"><div class="container"><section class="box summary-card"><label class="label" for="report-select">表示する記録</label><div class="select is-fullwidth"><select id="report-select">__REPORT_OPTIONS__</select></div></section><div id="summary" class="columns is-multiline"></div><section class="box summary-card"><h2 class="title is-4">今週のまとめ</h2><div id="headline"></div></section><div id="details"></div><p class="footer-note">AI利用度は選択時に現在のJSONへ保存されます。ページを閉じると、接続が途切れてから約30秒後にローカルサーバは終了します。</p></div></main><script>document.getElementById('report-select').addEventListener('change',e=>{location.search='?report='+encodeURIComponent(e.target.value)});</script>
 <script>const report=
EOF
printf '%s' "$REPORT_JSON" >> "$REPORT_FILE"
cat >> "$REPORT_FILE" <<'EOF'
;const q=s=>document.querySelector(s);const esc=s=>{const e=document.createElement('span');e.textContent=s??'';return e.innerHTML};const duration=s=>{if(s==null)return'算定不可';s=Math.round(s);const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return(d?d+'日':'')+(h?h+'時間':'')+m+'分'};const card=(label,value)=>`<div class="column is-one-quarter-desktop is-half-tablet"><div class="box summary-card"><p class="meta">${label}</p><p class="metric">${value}</p></div></div>`;q('#report-meta').textContent='@'+report.student+' · '+report.period.from+' 〜 '+report.period.to;const s=report.summary;q('#summary').innerHTML=[card('完了 Issue',s.completedIssueCount),card('平均所要時間',duration(s.averageIssueDurationSeconds)),card('作成 / マージ PR',s.createdPrCount+' / '+s.mergedPrCount),card('未完了 PR / Issue',s.openPrCount+' / '+s.openAssignedIssueCount),card('担当者不明 Issue',s.openUnassignedIssueCount),card('コミット / コメント',s.commitCount+' / '+s.githubCommentCount),card('troubleshooting',s.troubleshootingCount)].join('');q('#headline').innerHTML=`<p>完了 Issue <strong>${s.completedIssueCount}件</strong>、未完了 PR <strong>${s.openPrCount}件</strong>、担当者不明 Issue <strong>${s.openUnassignedIssueCount}件</strong>です。</p>`;
const ai={none:'利用なし',light:'軽度: 相談・レビュー中心',medium:'中程度: 設計または部分実装を支援',high:'高度: 実装の大部分を支援',unanswered:'未回答'};async function saveAi(issue,level){const r=await fetch('/api/ai-usage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({issue:String(issue),level})});if(!r.ok)throw new Error('保存できませんでした');}function issueCard(x,type){const usage=report.aiUsage[String(x.number)]?.level||'unanswered';const warning=type==='manual'?'<div class="notification warning">この Issue は PR と無関係に Close されました。何らかの実装を伴う場合は必ず PR を利用して Close しましょう。</div>':'';const pr=x.pr?`<p>PR: <a href="${esc(x.pr.url)}">#${x.pr.number} ${esc(x.pr.title)}</a></p>`:'';return`<details class="box detail-card" open><summary>#${x.number} ${esc(x.title)} <span class="tag is-source">${duration(x.durationSeconds)}</span></summary><div class="content"><p class="meta">開始: ${esc(x.startAt)} (${esc(x.startSource)}) ／ 終了: ${esc(x.endAt)} (${esc(x.endSource)})</p>${pr}${warning}<label class="label">AI利用度</label><div class="select ai-select"><select data-issue="${x.number}">${Object.entries(ai).map(([k,v])=>`<option value="${k}" ${usage===k?'selected':''}>${v}</option>`).join('')}</select></div></div></details>`}const lazyLists=[];function simpleList(title,items,fmt){const id=lazyLists.length;lazyLists.push({items,fmt});return`<details class="box detail-card" data-list="${id}"><summary>${title} (${items.length})</summary><div class="content"><p class="meta">開くと詳細を読み込みます。</p></div></details>`}function bindAi(root=document){root.querySelectorAll('select[data-issue]').forEach(el=>{if(el.dataset.bound)return;el.dataset.bound='yes';el.addEventListener('change',async()=>{try{await saveAi(el.dataset.issue,el.value);el.classList.add('is-success')}catch(e){alert(e.message);el.value=report.aiUsage[el.dataset.issue]?.level||'unanswered'}})})}q('#details').innerHTML='<h2 class="title is-3 section-title">詳細</h2>'+simpleList('PRでCloseされたIssue',report.completedIssues,x=>issueCard(x,'pr'))+simpleList('PRなしでCloseされたIssue',report.manuallyClosedIssues,x=>issueCard(x,'manual'))+simpleList('IssueをCloseしていないClose済みPR',report.closedPrsWithoutIssue,x=>`<div class="list-item"><a href="${esc(x.url)}">#${x.number} ${esc(x.title)}</a> · ${duration(x.durationSeconds)}<div class="notification warning">この PR は Issue と無関係に Close されました。関連IssueがOpenなら本文またはコメントへ <code>Closes #番号</code>、すでにCloseなら <code>Refs #番号</code> を記載しましょう。</div></div>`)+simpleList('未完了PR',report.openPullRequests,x=>`<div class="list-item"><a href="${esc(x.url)}">#${x.number} ${esc(x.title)}</a></div>`)+simpleList('未完了の担当Issue',report.openAssignedIssues,x=>`<div class="list-item"><a href="${esc(x.html_url)}">#${x.number} ${esc(x.title)}</a></div>`)+simpleList('未完了の未割当Issue',report.openUnassignedIssues,x=>`<div class="list-item"><a href="${esc(x.html_url)}">#${x.number} ${esc(x.title)}</a></div>`)+simpleList('コミット',report.commits,x=>`<div class="list-item">${esc(x.sha?.slice(0,8))} ${esc(x.commit?.message||'')}</div>`)+simpleList('GitHubコメント',report.githubComments,x=>`<div class="list-item"><a href="${esc(x.html_url)}">コメント</a> ${esc(x.created_at||'')}</div>`)+simpleList('troubleshooting',report.troubleshooting,x=>`<div class="list-item">${esc(x.at)} ${esc(x.subject)}</div>`);document.querySelectorAll('details[data-list]').forEach(el=>el.addEventListener('toggle',()=>{if(!el.open||el.dataset.rendered)return;const list=lazyLists[Number(el.dataset.list)];el.querySelector('.content').innerHTML=list.items.length?list.items.map(list.fmt).join(''):'<p>該当なし</p>';el.dataset.rendered='yes';bindAi(el)}));setInterval(()=>fetch('/api/heartbeat',{cache:'no-store'}).catch(()=>{}),5000);fetch('/api/heartbeat').catch(()=>{});</script></body></html>
EOF

PORT="$((18000 + RANDOM % 1000))"
echo "作成しました: $DATA_FILE"
echo "表示します: $REPORT_FILE"
"$POWERSHELL_EXE" -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_DIR}/server-weekly-summary.ps1" -HtmlPath "$(pwd -W)/${REPORT_FILE}" -DataPath "$(pwd -W)/${DATA_FILE}" -Port "$PORT" >/dev/null 2>&1 &
sleep 1
"$POWERSHELL_EXE" -NoProfile -Command "Start-Process 'http://127.0.0.1:${PORT}/'" >/dev/null 2>&1 || true
