const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn, spawnSync} = require('node:child_process');

const source = path.resolve(__dirname, '..', '..', 'scripts', 'report');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-summary-test-'));
const repo = path.join(root, 'repo');
const reportDir = path.join(repo, 'scripts', 'report');
const mockBin = path.join(root, 'bin');
const fixtureDir = path.join(root, 'fixtures');
const msys = value => value.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
const write = (name, value) => fs.writeFileSync(path.join(fixtureDir, name), JSON.stringify(value));

async function main() {
try {
  fs.mkdirSync(reportDir, {recursive: true});
  fs.mkdirSync(path.join(repo, 'scripts', 'lib'), {recursive: true});
  fs.mkdirSync(mockBin);
  fs.mkdirSync(fixtureDir);
  fs.mkdirSync(path.join(repo, 'docs', 'trouble'), {recursive: true});
  for (const name of ['weekly-summary.sh', 'weekly-summary-ui.js', 'open-weekly-summary.sh']) fs.copyFileSync(path.join(source, name), path.join(reportDir, name));
  fs.copyFileSync(path.join(source, '..', 'lib', 'milestone.sh'), path.join(repo, 'scripts', 'lib', 'milestone.sh'));
  const pr = (number, title, author, createdAt, closedAt, mergedAt, mergedBy, state) => ({
    number, title, url: `https://github.com/example/team/pull/${number}`, body: `${title}の説明`,
    author: {login: author}, createdAt, closedAt, mergedAt, mergedBy: mergedBy ? {login: mergedBy} : null,
    headRefName: `issue-${number}`, state, assignees: [{login: number === 11 ? 'alice' : author}],
    milestone: {title: number === 13 ? 'lec07' : 'lec06'}
  });
  const pulls = [
    pr(10, '実装PR', 'alice', '2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z', 'bob', 'MERGED'),
    pr(11, '他学生のPR', 'bob', '2026-10-02T00:00:00Z', '2026-10-04T00:00:00Z', '2026-10-04T00:00:00Z', 'alice', 'MERGED'),
    pr(12, '未完了PR', 'carol', '2026-09-01T00:00:00Z', null, null, null, 'OPEN'),
    pr(13, '別MilestoneのPR', 'alice', '2026-10-02T00:00:00Z', null, null, null, 'OPEN'),
    {...pr(14, '関連IssueなしPR', 'alice', '2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z', null, null, 'CLOSED'), assignees: []},
    {...pr(15, '他学生が担当するPR', 'alice', '2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z', null, null, 'CLOSED'), assignees: [{login: 'bob'}]}
  ];
  write('pulls.json', pulls);
  pulls[0].body = 'Closes #1\nRefs example/team#2, #3';
  pulls[1].body = 'Refs #5';
  pulls[2].body = 'Refs #4';
  write('pulls.json', pulls);
  write('pr10.json', {...pulls[0], closingIssuesReferences: [{number: 1}]});
  write('pr11.json', {...pulls[1], closingIssuesReferences: [{number: 5}]});
  write('pr14.json', {...pulls[4], closingIssuesReferences: []});
  write('pr15.json', {...pulls[5], closingIssuesReferences: []});
  const issue = (number, title, author, state, closedAt) => ({number, title, user: {login: author}, assignees: [{login: author}], state, milestone: {title: number === 4 ? 'lec07' : 'lec06'},
    created_at: '2026-10-02T00:00:00Z', closed_at: closedAt, html_url: `https://github.com/example/team/issues/${number}`, body: `${title}の説明`});
  const issues = [issue(1, '連動Issue', 'alice', 'closed', '2026-10-03T00:00:00Z'),
    issue(2, '手動Issue', 'bob', 'closed', '2026-10-04T00:00:00Z'),
    issue(3, '他学生の未完了Issue', 'bob', 'open', null),
    issue(4, '別MilestoneのIssue', 'alice', 'open', null),
    issue(5, '他学生のPRでCloseされたIssue', 'alice', 'closed', '2026-10-04T00:00:00Z')];
  issues[1].assignees = [{login: 'alice'}];
  write('issues.json', [issues]);
  write('issue1.json', {number: 1, title: '連動Issue', url: issues[0].html_url, body: issues[0].body,
    createdAt: issues[0].created_at, closedAt: issues[0].closed_at, assignees: [{login: 'alice'}], milestone: {title: 'lec06'}});
  write('issue5.json', {number: 5, title: '他学生のPRでCloseされたIssue', url: issues[4].html_url, body: issues[4].body,
    createdAt: issues[4].created_at, closedAt: issues[4].closed_at, assignees: [{login: 'alice'}], milestone: {title: 'lec06'}});
  write('pr10-commits.json', [[{sha: 'abcdef123456', html_url: 'https://github.com/example/team/commit/abcdef123456', commit: {message: '実装', committer: {date: '2026-10-02T01:00:00Z'}, author: {date: '2026-10-02T01:00:00Z'}}}]]);
  write('pr11-commits.json', [[{sha: '123456abcdef', html_url: 'https://github.com/example/team/commit/123456abcdef', commit: {message: '共同実装', committer: {date: '2026-10-03T01:00:00Z'}, author: {date: '2026-10-03T01:00:00Z'}}}]]);
  write('commits.json', [[{sha: 'abcdef123456', html_url: 'https://github.com/example/team/commit/abcdef123456', commit: {message: '実装'}}]]);
  write('issue-comments.json', [[
    {user: {login: 'alice'}, created_at: '2026-10-03T02:00:00Z', issue_url: 'https://api.github.com/repos/example/team/issues/1', html_url: 'https://github.com/example/team/issues/1#comment-1', body: '確認</script>'},
    {user: {login: 'alice'}, created_at: '2026-10-09T02:00:00Z', issue_url: 'https://api.github.com/repos/example/team/issues/4', html_url: 'https://github.com/example/team/issues/4#comment-2', body: '別Milestone'}
  ]]);
  write('review-comments.json', [[]]);
  fs.writeFileSync(path.join(repo, 'docs', 'trouble', 'troubleshooting-alice-2026-10-03T120000+0900.md'), '# 例外を修正\n');
  fs.writeFileSync(path.join(mockBin, 'gh'), `#!/usr/bin/env bash
case "$1 $2" in
  'api user') echo alice ;;
  'repo view') if [[ "$*" == *defaultBranchRef* ]]; then echo main; else echo example/team; fi ;;
  'pr list') cat "${msys(path.join(fixtureDir, 'pulls.json'))}" ;;
  'pr view')
    if [[ "\${MOCK_FAIL:-}" == pr && "$3" == 10 ]]; then exit 1; fi
    if [[ "$3" == 10 ]]; then
      if [[ "$*" == *--jq* ]]; then echo 1; else cat "${msys(path.join(fixtureDir, 'pr10.json'))}"; fi
    elif [[ "$3" == 11 ]]; then cat "${msys(path.join(fixtureDir, 'pr11.json'))}"
    elif [[ "$3" == 14 ]]; then cat "${msys(path.join(fixtureDir, 'pr14.json'))}"
    elif [[ "$3" == 15 ]]; then cat "${msys(path.join(fixtureDir, 'pr15.json'))}"
    elif [[ "$*" == *--jq* ]]; then :; else echo '{}'; fi ;;
  'issue view')
    if [[ "\${MOCK_FAIL:-}" == issue && "$*" == *'--json number,title'* ]]; then exit 1; fi
    if [[ "\${MOCK_FAIL:-}" == issue_start && "$*" == *'--json createdAt'* ]]; then exit 1; fi
    if [[ "$*" == *--jq* ]]; then echo 2026-10-02T00:00:00Z;
    elif [[ "$3" == 5 ]]; then cat "${msys(path.join(fixtureDir, 'issue5.json'))}";
    else cat "${msys(path.join(fixtureDir, 'issue1.json'))}"; fi ;;
  'api graphql')
    if [[ "$*" == *number=1* ]]; then echo '{"data":{"repository":{"issue":{"timelineItems":{"nodes":[{"closer":{"number":10}}]}}}}}';
    elif [[ "$*" == *number=5* ]]; then echo '{"data":{"repository":{"issue":{"timelineItems":{"nodes":[{"closer":{"number":11}}]}}}}}';
    else echo '{"data":{"repository":{"issue":{"timelineItems":{"nodes":[{"closer":null}]}}}}}'; fi ;;
  'api --paginate')
    case "$*" in
      *'/milestones?state=all'*) echo '[[{"title":"lec06"},{"title":"lec07"}]]' ;;
      *'/issues?state=all'*) cat "${msys(path.join(fixtureDir, 'issues.json'))}" ;;
      *'/pulls/10/commits?'*) if [[ "\${MOCK_FAIL:-}" == commits ]]; then exit 1; fi; cat "${msys(path.join(fixtureDir, 'pr10-commits.json'))}" ;;
      *'/pulls/11/commits?'*) cat "${msys(path.join(fixtureDir, 'pr11-commits.json'))}" ;;
      *'/pulls/14/commits?'*|*'/pulls/15/commits?'*) echo '[[]]' ;;
      *'/issues/comments?'*) cat "${msys(path.join(fixtureDir, 'issue-comments.json'))}" ;;
      *'/pulls/comments?'*) cat "${msys(path.join(fixtureDir, 'review-comments.json'))}" ;;
      *'/commits?author='*) cat "${msys(path.join(fixtureDir, 'commits.json'))}" ;;
      *) echo "unexpected API: $*" >&2; exit 1 ;;
    esac ;;
  *) echo "unexpected gh: $*" >&2; exit 1 ;;
esac
`);
  fs.writeFileSync(path.join(mockBin, 'powershell.exe'), '#!/usr/bin/env bash\nexit 0\n');
  const bash = process.env.PORTABLE_GIT_BASH || 'bash';
  const command = `export PATH='${msys(mockBin)}':"$PATH"; bash '${msys(path.join(reportDir, 'weekly-summary.sh'))}' --student alice --milestone lec06`;
  const run = spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 120000});
  if (run.status !== 0) throw new Error(`weekly-summary failed (${run.status}):\n${run.stdout}\n${run.stderr}`);
  const reopen = spawnSync(bash, ['-lc', `export PATH='${msys(mockBin)}':"$PATH"; bash '${msys(path.join(reportDir, 'open-weekly-summary.sh'))}' --student alice`],
    {cwd: repo, encoding: 'utf8', timeout: 30000});
  if (reopen.status !== 0) throw new Error(`open-weekly-summary failed:\n${reopen.stdout}\n${reopen.stderr}`);
  const dataDir = path.join(repo, 'docs', 'weekly-summary-data', 'alice');
  const unknownMilestone = spawnSync(bash, ['-lc', `export PATH='${msys(mockBin)}':"$PATH"; bash '${msys(path.join(reportDir, 'weekly-summary.sh'))}' --student alice --milestone lec08`],
    {cwd: repo, encoding: 'utf8', timeout: 30000});
  assert.notEqual(unknownMilestone.status, 0);
  assert.match(unknownMilestone.stderr, /GitHub上に存在しません/);
  assert.equal(fs.readdirSync(dataDir).length, 1);
  const firstFile = fs.readdirSync(dataDir)[0];
  assert.equal(firstFile, 'lec06.json');
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, firstFile), 'utf8'));
  assert.equal(data.milestone, 'lec06');
  assert.equal(data.repository, 'example/team');
  assert.equal(data.schemaVersion, 4);
  assert.equal(data.summary.closedPrCount, 3);
  assert.equal(data.summary.mergedPrCount, 2);
  assert.equal(data.summary.mergedByStudentCount, 1);
  assert.equal(data.summary.completedIssueCount, 2);
  assert.equal(data.summary.manuallyClosedIssueCount, 1);
  assert.equal(data.summary.commitCount, 1);
  assert.equal(data.commits[0].message, '実装');
  assert.equal(data.commits[0].html_url, 'https://github.com/example/team/commit/abcdef123456');
  assert.equal(data.summary.githubCommentCount, 1);
  assert.equal(data.summary.troubleshootingCount, 0);
  assert.deepEqual(data.openPullRequests.map(item => item.number), [12, 13]);
  assert.deepEqual(data.openPullRequests[0].relatedIssues.map(item => item.number), [4]);
  assert.deepEqual(data.openIssues.map(item => item.number), [3, 4]);
  assert.deepEqual(data.dodIssues.map(item => item.number), [1, 2, 5]);
  assert.deepEqual(data.dodPullRequests.map(item => item.number), [10, 11, 14]);
  assert.deepEqual(data.dodCreatedPullRequests.map(item => item.number), [10, 14, 15]);
  assert.deepEqual(data.closedPullRequests.map(item => item.number), [10, 11, 14]);
  assert.deepEqual(data.closedPullRequests[0].relatedIssues.map(item => [item.number, item.state]), [[1, 'closed'], [2, 'closed'], [3, 'open']]);
  assert.deepEqual(data.closedPullRequests[1].relatedIssues.map(item => item.number), [5]);
  assert.deepEqual(data.closedPullRequests[2].relatedIssues, []);
  assert.equal(data.closedPullRequests[0].durationSeconds, 82800);
  assert.equal(data.closedPullRequests[1].author, 'bob');
  assert.deepEqual(data.closedPullRequests[1].assignees, ['alice']);
  assert.equal(data.closedPullRequests[0].relatedIssues[1].author, 'bob');
  assert.equal(data.manuallyClosedIssues[0].author, 'bob');
  assert.deepEqual(data.manuallyClosedIssues[0].assignees, ['alice']);
  assert.equal(data.mergedByStudent[0].createdAt, '2026-10-02T00:00:00Z');
  const elements = new Map();
  let copiedText;
  const document = {handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; }, querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {innerHTML: '', textContent: '', value: '', handlers: {}, style: {}, hidden: selector === '#github-preview',
      addEventListener(type, handler) { this.handlers[type] = handler; }});
    return elements.get(selector);
  }};
  const previewItem = {kind: 'issue', number: 1, title: '連動Issue', state: 'open', body: '<script>unsafe</script>',
    url: 'https://github.com/example/team/issues/1', author: 'alice', assignees: ['alice'], milestone: 'lec06', labels: [], comments: [], reviews: []};
  vm.runInNewContext(fs.readFileSync(path.join(source, 'weekly-summary-ui.js'), 'utf8'), {
    report: data, document, location: {}, Blob, window: {innerWidth: 1200, innerHeight: 800}, setTimeout, clearTimeout,
    ClipboardItem: class { constructor(items) { this.items = items; } },
    navigator: {clipboard: {writeText: async value => { copiedText = value; }, write: () => { throw new Error('HTML clipboard must not be used'); }}},
    fetch: url => Promise.resolve(String(url).startsWith('/api/preview') ? {ok: true, json: async () => previewItem} : {ok: true}), setInterval() {}
  });
  await elements.get('#copy-button').handlers.click();
  const copiedRows = copiedText.split('\n').map(line => line.split('\t'));
  assert.ok(copiedRows.every(row => row.length === 14), 'every spreadsheet row must have 14 columns');
  assert.deepEqual(copiedRows[0], ['行種別', 'Milestone', '指標・区分', '件数/番号', 'タイトル・設問', 'GitHub URL',
    '主担当', '作成者', '作成日時', 'Close日時', 'マージ日時', 'マージ者', '関連Issue・PR', 'AI利用結果/DoD回答']);
  const summaryRows = copiedRows.filter(row => row[0] === '集計');
  assert.deepEqual(summaryRows.map(row => [row[2], Number(row[3])]), [
    ['01 Close済み担当PR', 3], ['02 うちマージ済み', 2], ['03 自分がマージしたPR', 1],
    ['04 手動Close Issue', 1], ['05 総コミット', 1], ['06 総コメント', 1],
    ['07 trouble report', 0], ['08 全体のOpen PR', 2], ['09 全体のOpen Issue', 2]
  ]);
  assert.ok(copiedRows.slice(1, 10).every(row => row[0] === '集計'));
  assert.ok(copiedRows.slice(-6).every(row => row[0] === 'DoD'));
  const pr11Row = copiedRows.find(row => row[0] === 'PR' && row[3] === '11');
  assert.equal(pr11Row[2], 'Close済み担当PR・自分がマージしたPR');
  assert.equal(pr11Row[6], 'alice');
  assert.equal(pr11Row[7], 'bob');
  assert.equal(pr11Row[8], '2026/10/02 09:00');
  assert.equal(pr11Row[10], '2026/10/04 09:00');
  assert.equal(pr11Row[11], 'alice');
  assert.equal(pr11Row[12], 'Issue #5');
  assert.equal(pr11Row[13], '未選択');
  const issue2Row = copiedRows.find(row => row[0] === 'Issue' && row[3] === '2');
  assert.equal(issue2Row[2], 'PR関連Issue・手動Close Issue');
  assert.equal(issue2Row[6], 'alice');
  assert.equal(issue2Row[7], 'bob');
  assert.equal(issue2Row[12], 'PR #10');
  assert.equal(copiedRows.filter(row => row[0] === 'Issue' && row[3] === '3').length, 1);
  const issue4Row = copiedRows.find(row => row[0] === 'Issue' && row[3] === '4');
  assert.equal(issue4Row[2], 'PR関連Issue・全体のOpen Issue');
  assert.equal(issue4Row[12], 'PR #12');
  assert.equal(copiedRows.find(row => row[0] === 'PR' && row[3] === '12')[12], 'Issue #4');
  assert.equal(copiedRows.find(row => row[0] === 'PR' && row[3] === '13')[1], 'lec06');
  assert.deepEqual(copiedRows.slice(-6).map(row => row[3]), ['1', '2', '3', '4', '5', '6']);
  assert.equal(copiedRows.at(-1)[13], '未選択');
  data.aiUsage['10'] = {choices: ['plan-issues', 'debug'], other: ''};
  data.dodAssessment['1'] = {choice: 'correct'};
  await elements.get('#copy-button').handlers.click();
  const answeredRows = copiedText.split('\n').map(line => line.split('\t'));
  assert.equal(answeredRows.find(row => row[0] === 'PR' && row[3] === '10')[13], 'plan-issues; debug');
  assert.equal(answeredRows.find(row => row[0] === 'DoD' && row[3] === '1')[13], '正しく設定されている');
  delete data.aiUsage['10'];
  delete data.dodAssessment['1'];
  const originalTitle = data.closedPullRequests[0].title;
  data.closedPullRequests[0].title = '=HYPERLINK("unsafe")\t危険\n続き';
  await elements.get('#copy-button').handlers.click();
  const escapedRows = copiedText.split('\n').map(line => line.split('\t'));
  assert.ok(escapedRows.every(row => row.length === 14));
  assert.match(escapedRows.find(row => row[0] === 'PR' && row[3] === '10')[4], /^'=HYPERLINK\("unsafe"\) 危険 続き$/);
  data.closedPullRequests[0].title = originalTitle;
  assert.match(elements.get('#overview-text').innerHTML, /Close済み担当PR: 3件/);
  assert.match(elements.get('#overview-text').innerHTML, /\[Open\]Issue #3/);
  assert.match(elements.get('#overview-text').innerHTML, /\[NotMerged\]PR #14/);
  assert.match(elements.get('#overview-text').innerHTML, /関連Issueなし/);
  assert.match(elements.get('#overview-text').innerHTML, /PR #11 \[alice\]/);
  assert.match(elements.get('#overview-text').innerHTML, /Open PR: 2件/);
  assert.ok(elements.get('#overview-text').innerHTML.indexOf('trouble report: 0件') < elements.get('#overview-text').innerHTML.indexOf('Open PR: 2件'));
  assert.ok(elements.get('#overview-text').innerHTML.indexOf('Open PR: 2件') < elements.get('#overview-text').innerHTML.indexOf('Open Issue: 2件'));
  const metricHtml = elements.get('#overview-metrics').innerHTML;
  assert.ok(metricHtml.indexOf('href="#trouble"') < metricHtml.indexOf('href="#open-prs"'));
  assert.ok(metricHtml.indexOf('href="#open-prs"') < metricHtml.indexOf('href="#open-issues"'));
  assert.match(elements.get('#overview-text').innerHTML, /milestone: lec07/);
  assert.match(elements.get('#overview-text').innerHTML, /手動でCloseされたIssue: 1件/);
  assert.doesNotMatch(elements.get('#overview-text').innerHTML, /PR連動でCloseされたIssue:/);
  assert.match(elements.get('#overview-text').innerHTML, /href="https:\/\/github\.com\/example\/team\/issues\/3"/);
  const expectedDodQuestions = [
    'すべてのIssueとPRにmilestoneが正しく設定されていますか？現時点で未完了のIssueおよびPRがある場合は今すぐに次のmilestoneを設定しましょう．',
    '自分の担当したすべてのIssueについて、assigneeとACが正しく記録されていますか？',
    'mainブランチに直接コミットしていませんか？',
    'すべてのCloseされた担当PRについて、「変更内容」と「AC確認結果」が適切に記載されていますか？',
    'すべてのCloseされた担当PRについて，「関連Issue」が正しく記載されている',
    'すべてのCloseされた担当PRについて、実装者以外がAC/差分を確認してレビューを行い、マージしていますか？'
  ];
  const dodHtml = elements.get('#dod-form-items').innerHTML;
  for (const question of expectedDodQuestions) assert.ok(dodHtml.includes(question), question);
  assert.equal((dodHtml.match(/data-dod=/g) || []).length, 5);
  assert.match(dodHtml, /data-dod-group="6"/);
  assert.match(dodHtml, /対象Issue・PR: 6件/);
  assert.doesNotMatch(dodHtml, /担当したIssueがなかった/);
  assert.match(dodHtml, /PRの担当者とレビュアーが共通のPRがある/);
  assert.match(dodHtml, /自身の全コミットはGit履歴で確認/);
  assert.match(elements.get('#ai-warning').innerHTML, /AI利用が未選択のClose済み担当PRが3件/);
  assert.match(elements.get('#ai-warning').innerHTML, /href="#pr-10"/);
  assert.match(elements.get('#dod-warning').innerHTML, /DoD自己評価が未選択の項目が6件/);
  assert.match(elements.get('#dod-warning').innerHTML, /href="#dod-item-1"/);
  assert.match(dodHtml, /id="dod-item-6"/);
  assert.match(dodHtml, />Issue#1<.*>PR#10</);
  assert.match(dodHtml, /data-preview-kind="issue" data-preview-number="1"/);
  assert.match(dodHtml, /data-preview-kind="pr" data-preview-number="10"/);
  assert.match(elements.get('#details').innerHTML, /AI利用（複数選択可）/);
  assert.match(elements.get('#details').innerHTML, /href="https:\/\/github\.com\/example\/team\/commit\/abcdef123456"/);
  assert.match(elements.get('#details').innerHTML, /abcdef12 実装/);
  assert.match(elements.get('#unfinished').innerHTML, /他学生の未完了Issue/);
  const detailHtml = elements.get('#details').innerHTML;
  const detailSection = (start, end) => detailHtml.slice(detailHtml.indexOf(`id="${start}"`), detailHtml.indexOf(`id="${end}"`));
  for (const [first, second] of [['closed-prs', 'merged-by-student'], ['merged-by-student', 'manual-issues'],
    ['manual-issues', 'commits'], ['commits', 'comments'], ['comments', 'trouble']]) {
    assert.ok(detailHtml.indexOf(`id="${first}"`) < detailHtml.indexOf(`id="${second}"`));
  }
  assert.doesNotMatch(detailHtml, /id="overview-metrics"|id="dod-item-/);
  const closedDetails = detailSection('closed-prs', 'merged-by-student');
  assert.match(closedDetails, /id="pr-11"/);
  assert.match(closedDetails, /区分<\/dt><dd>Close済み担当PR・自分がマージしたPR<\/dd>/);
  assert.match(closedDetails, /作成日時（日本時間）<\/dt><dd>2026\/10\/02 09:00<\/dd>/);
  assert.match(closedDetails, /マージ日時（日本時間）<\/dt><dd>2026\/10\/04 09:00<\/dd>/);
  assert.match(closedDetails, /AI利用結果: <span data-ai-result="11">未選択<\/span>/);
  const issue2Details = closedDetails.slice(closedDetails.indexOf('https://github.com/example/team/issues/2'));
  assert.match(issue2Details.slice(0, 1200), /主担当<\/dt><dd>alice<\/dd>/);
  assert.match(issue2Details.slice(0, 1200), /作成者<\/dt><dd>bob<\/dd>/);
  assert.match(issue2Details.slice(0, 1200), /作成日時（日本時間）<\/dt><dd>2026\/10\/02 09:00<\/dd>/);
  const mergedDetails = detailSection('merged-by-student', 'manual-issues');
  assert.match(mergedDetails, /id="merged-pr-11"/);
  assert.match(mergedDetails, /主担当<\/dt><dd>alice<\/dd>/);
  assert.match(mergedDetails, /作成者<\/dt><dd>bob<\/dd>/);
  assert.match(mergedDetails, /関連Issue[\s\S]*Issue #5/);
  const manualDetails = detailSection('manual-issues', 'commits');
  assert.match(manualDetails, /id="manual-issue-2"/);
  assert.match(manualDetails, /作成者<\/dt><dd>bob<\/dd>/);
  assert.match(manualDetails, /手動Issueの説明/);
  const unfinishedHtml = elements.get('#unfinished').innerHTML;
  assert.match(unfinishedHtml, /id="open-pr-12"/);
  assert.match(unfinishedHtml, /id="open-issue-4"/);
  assert.match(unfinishedHtml, /作成者<\/dt><dd>alice<\/dd>/);
  assert.match(unfinishedHtml, /作成日時（日本時間）<\/dt><dd>2026\/10\/02 09:00<\/dd>/);
  assert.match(unfinishedHtml, /関連PR<\/dt><dd><a href="https:\/\/github\.com\/example\/team\/pull\/12"/);
  assert.match(unfinishedHtml, /GitHubのMilestone: lec07/);
  const aiResultNode = {textContent: '未選択'};
  elements.get('#details').querySelectorAll = selector => selector === '[data-ai-result="10"]' ? [aiResultNode] : [];
  const aiStatus = {textContent: ''};
  const aiFieldset = {dataset: {pr: '10'}, querySelectorAll: () => [{value: 'debug'}],
    querySelector: selector => selector === '[data-other]' ? {value: ''} : aiStatus};
  elements.get('#details').handlers.change({target: {type: 'text', closest: () => aiFieldset}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(aiStatus.textContent, '保存しました。');
  assert.equal(aiResultNode.textContent, 'debug');
  const anchor = {dataset: {previewKind: 'issue', previewNumber: '1'}, getBoundingClientRect: () => ({right: 100, top: 50}),
    closest: () => anchor, contains: () => false};
  document.handlers.pointerover({target: anchor});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('#github-preview').hidden, false);
  assert.match(elements.get('#github-preview').innerHTML, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  document.handlers.pointerout({target: anchor, relatedTarget: null});
  elements.get('#github-preview').handlers.pointerenter();
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(elements.get('#github-preview').hidden, false);
  elements.get('#github-preview').handlers.pointerleave();
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(elements.get('#github-preview').hidden, true);
  document.handlers.pointerover({target: anchor});
  await new Promise(resolve => setImmediate(resolve));
  document.handlers.keydown({key: 'Escape'});
  assert.equal(elements.get('#github-preview').hidden, true);
  const dodSelect = {dataset: {dod: '1'}, value: 'correct', disabled: false};
  await elements.get('#dod-form-items').handlers.change({target: {type: 'select-one', closest: () => dodSelect}});
  assert.match(elements.get('#overview-text').innerHTML, /1\. 正しく設定されている/);
  assert.match(elements.get('#dod-warning').innerHTML, /未選択の項目が5件/);
  assert.doesNotMatch(elements.get('#dod-warning').innerHTML, /href="#dod-item-1"/);
  const boxes = ['no_merged', 'reviewed', 'same_reviewer', 'no_review_result'].map(value => ({value, checked: false}));
  const group = {dataset: {dodGroup: '6'}, querySelectorAll: () => boxes};
  for (const value of ['same_reviewer', 'no_review_result']) {
    const box = boxes.find(item => item.value === value);
    box.type = 'checkbox'; box.checked = true; box.closest = () => group;
    await elements.get('#dod-form-items').handlers.change({target: box});
  }
  assert.match(elements.get('#overview-text').innerHTML, /6\. PRの担当者とレビュアーが共通のPRがある、PRの担当者とレビュアーは異なるがレビュー結果が記載されていない/);
  assert.match(elements.get('#dod-warning').innerHTML, /未選択の項目が4件/);
  assert.doesNotMatch(elements.get('#dod-warning').innerHTML, /href="#dod-item-6"/);
  const htmlPath = path.join(repo, 'docs', 'weekly-summary_alice.html');
  const dataPath = path.join(dataDir, firstFile);
  const generatedHtml = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(generatedHtml.indexOf('id="overview"') < generatedHtml.indexOf('id="dod-form"'));
  assert.ok(generatedHtml.indexOf('id="dod-form"') < generatedHtml.indexOf('id="details"'));
  assert.ok(generatedHtml.indexOf('id="details"') < generatedHtml.indexOf('id="unfinished"'));
  assert.match(generatedHtml, /id="github-preview"/);
  assert.match(generatedHtml, /id="dod-warning"/);
  assert.match(generatedHtml, /href="#closed-prs">PRごとのAI利用へ/);
  assert.match(generatedHtml, /href="#dod-form">DoD自己評価へ/);
  assert.doesNotMatch(generatedHtml, /id="ai-overview"|id="dod-overview"|id="overview-links"/);
  assert.match(generatedHtml, /\\u003c\/script>/);
  const ghCallsPath = path.join(root, 'preview-gh-calls.txt');
  const ghPreviewPath = path.join(root, 'preview-gh.ps1');
  fs.writeFileSync(ghPreviewPath, `
$endpoint = $args[-1]
Add-Content -LiteralPath '${ghCallsPath.replace(/'/g, "''")}' -Value $endpoint
switch ($endpoint) {
  'repos/example/team/issues/1' { '{"title":"Issue one","state":"open","body":"Issue body","html_url":"https://github.com/example/team/issues/1","user":{"login":"alice"},"assignees":[{"login":"alice"}],"milestone":{"title":"lec06"},"labels":[]}' ; break }
  'repos/example/team/issues/1/comments?per_page=100' { '[[{"user":{"login":"bob"},"body":"Issue comment","created_at":"2026-10-03T00:00:00Z"}]]' ; break }
  'repos/example/team/pulls/10' { '{"title":"PR ten","state":"closed","body":"PR body","html_url":"https://github.com/example/team/pull/10","user":{"login":"alice"},"assignees":[],"milestone":{"title":"lec06"},"labels":[]}' ; break }
  'repos/example/team/issues/10/comments?per_page=100' { '[[{"user":{"login":"bob"},"body":"PR comment","created_at":"2026-10-03T00:00:00Z"}]]' ; break }
  'repos/example/team/pulls/10/reviews?per_page=100' { '[[{"user":{"login":"bob"},"state":"APPROVED","body":"Reviewed","submitted_at":"2026-10-03T01:00:00Z"}]]' ; break }
  default { Write-Error "Unexpected preview API: $endpoint"; exit 1 }
}
`);
  const port = 19000 + Math.floor(Math.random() * 10000);
  const server = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(source, 'server-weekly-summary.ps1'),
    '-HtmlPath', htmlPath, '-DataPath', dataPath, '-GhPath', ghPreviewPath, '-Port', String(port)], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let serverError = '';
  server.stderr.on('data', chunk => { serverError += chunk.toString(); });
  try {
    const base = `http://127.0.0.1:${port}`;
    let response;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { response = await fetch(base); break; }
      catch (_) { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(response, `report server did not start: ${serverError}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /DoD自己評価/);
    const issuePreview = await fetch(`${base}/api/preview?kind=issue&number=1`);
    assert.equal(issuePreview.status, 200);
    assert.equal(issuePreview.headers.get('cache-control'), 'no-store');
    assert.equal((await issuePreview.json()).comments[0].body, 'Issue comment');
    const repeatedPreview = await fetch(`${base}/api/preview?kind=issue&number=1`);
    assert.equal(repeatedPreview.status, 200);
    assert.equal((await fetch(`${base}/api/preview?kind=issue&number=999`)).status, 400);
    const prPreview = await fetch(`${base}/api/preview?kind=pr&number=10`);
    assert.equal(prPreview.status, 200);
    assert.equal((await prPreview.json()).reviews[0].body, 'Reviewed');
    assert.equal(fs.readFileSync(ghCallsPath, 'utf8').split(/\r?\n/).filter(line => line === 'repos/example/team/issues/1').length, 1);
    assert.deepEqual(fs.readdirSync(dataDir), ['lec06.json']);
    const post = async (route, payload) => fetch(base + route, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload).replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)});
    const dodResponse = await post('/api/dod-assessment', {item: '1', choice: 'correct'});
    assert.equal(dodResponse.status, 200, await dodResponse.text());
    assert.equal((await post('/api/dod-assessment', {item: '7', choice: 'all'})).status, 400);
    assert.equal((await post('/api/dod-assessment', {item: '2', choice: 'direct_main'})).status, 400);
    assert.equal((await post('/api/dod-assessment', {item: '6', choices: []})).status, 200);
    assert.equal((await post('/api/dod-assessment', {item: '6', choices: ['same_reviewer', 'no_review_result']})).status, 200);
    assert.equal((await post('/api/dod-assessment', {item: '6', choices: ['reviewed', 'no_review_result']})).status, 400);
    const aiResponse = await post('/api/ai-usage', {pr: '10', choices: ['debug', 'other'], other: '相談した'});
    assert.equal(aiResponse.status, 200, await aiResponse.text());
    assert.equal((await post('/api/ai-usage', {pr: '10', choices: ['none', 'debug'], other: ''})).status, 400);
    const saved = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.equal(saved.dodAssessment['1'].choice, 'correct');
    assert.deepEqual(saved.dodAssessment['6'].choices, ['same_reviewer', 'no_review_result']);
    assert.deepEqual(saved.aiUsage['10'].choices, ['debug', 'other']);
    assert.equal(saved.aiUsage['10'].other, '相談した');
    assert.match(await (await fetch(base)).text(), /相談した/);
  } finally { server.kill(); }
  const secondRun = spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 120000});
  if (secondRun.status !== 0) throw new Error(`second weekly-summary failed:\n${secondRun.stdout}\n${secondRun.stderr}`);
  const backup = fs.readdirSync(dataDir).find(name => /^lec06\.backup-.*\.json\.bak$/.test(name));
  assert.ok(backup, 'previous report must be backed up');
  const backupData = JSON.parse(fs.readFileSync(path.join(dataDir, backup), 'utf8'));
  assert.equal(backupData.dodAssessment['1'].choice, 'correct');
  assert.deepEqual(backupData.aiUsage['10'].choices, ['debug', 'other']);
  const secondData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.equal(secondData.dodAssessment['1'].choice, 'correct');
  assert.deepEqual(secondData.dodAssessment['6'].choices, ['same_reviewer', 'no_review_result']);
  assert.deepEqual(secondData.aiUsage['10'].choices, ['debug', 'other']);
  const htmlBeforeFailure = fs.readFileSync(htmlPath, 'utf8');
  for (const kind of ['PR', 'Issue']) {
    if (kind === 'PR') {
      pulls[3].assignees = [{login: 'alice'}, {login: 'bob'}];
      write('pulls.json', pulls);
    } else {
      issues[3].assignees = [{login: 'alice'}, {login: 'bob'}];
      write('issues.json', [issues]);
    }
    const rejected = spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 120000});
    assert.notEqual(rejected.status, 0, `${kind} with two assignees must stop the report`);
    assert.match(rejected.stderr, new RegExp(`${kind} #(?:13|4) https://github\\.com/example/team/`));
    assert.match(rejected.stderr, /assignees: alice, bob/);
    assert.match(rejected.stderr, /内容を一番よく理解している主担当のみをassigneeに残してください/);
    assert.match(rejected.stderr, /再実行してください/);
    assert.doesNotMatch(rejected.stderr, /対象学生のPR詳細を取得しています/);
    assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, 'utf8')), secondData);
    assert.equal(fs.readFileSync(htmlPath, 'utf8'), htmlBeforeFailure);
    assert.equal(fs.readdirSync(dataDir).filter(name => name.endsWith('.bak')).length, 1);
    if (kind === 'PR') { pulls[3].assignees = [{login: 'alice'}]; write('pulls.json', pulls); }
    else { issues[3].assignees = [{login: 'alice'}]; write('issues.json', [issues]); }
  }
  for (const failure of ['pr', 'commits', 'issue_start', 'issue']) {
    const failed = spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 120000,
      env: {...process.env, MOCK_FAIL: failure}});
    assert.notEqual(failed.status, 0, `${failure} failure must stop the report`);
    assert.match(failed.stderr, /既存のレポートは変更せず終了/);
    assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, 'utf8')), secondData);
    assert.equal(fs.readFileSync(htmlPath, 'utf8'), htmlBeforeFailure);
    assert.equal(fs.readdirSync(dataDir).filter(name => name.endsWith('.bak')).length, 1);
  }
  const bobRun = spawnSync(bash, ['-lc', `export PATH='${msys(mockBin)}':"$PATH"; bash '${msys(path.join(reportDir, 'weekly-summary.sh'))}' --student bob --milestone lec06`],
    {cwd: repo, encoding: 'utf8', timeout: 120000});
  if (bobRun.status !== 0) throw new Error(`bob weekly-summary failed:\n${bobRun.stdout}\n${bobRun.stderr}`);
  const bobData = JSON.parse(fs.readFileSync(path.join(repo, 'docs', 'weekly-summary-data', 'bob', 'lec06.json'), 'utf8'));
  assert.deepEqual(bobData.completedIssues.map(item => item.number), []);
  assert.deepEqual(bobData.dodIssues.map(item => item.number), [3]);
  assert.deepEqual(bobData.dodPullRequests.map(item => item.number), [15]);
  assert.deepEqual(bobData.dodCreatedPullRequests.map(item => item.number), [11]);
  pulls[3].milestone = null;
  write('pulls.json', pulls);
  const warnedRun = spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 120000});
  if (warnedRun.status !== 0) throw new Error(`unassigned milestone report failed:\n${warnedRun.stdout}\n${warnedRun.stderr}`);
  assert.match(warnedRun.stderr, /Milestone未割当/);
  assert.match(warnedRun.stderr, /PR #13/);
  assert.equal(JSON.parse(fs.readFileSync(dataPath, 'utf8')).openPullRequests.find(pr => pr.number === 13).milestone, null);
  process.stdout.write('weekly-summary fixture test passed\n');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
}

main().catch(error => { console.error(error); process.exitCode = 1; });
