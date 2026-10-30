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
    headRefName: `issue-${number}`, state, assignees: [{login: author}, ...(number === 11 ? [{login: 'alice'}] : [])],
    milestone: {title: number === 13 ? 'lec07' : 'lec06'}
  });
  const pulls = [
    pr(10, '実装PR', 'alice', '2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z', 'bob', 'MERGED'),
    pr(11, '他学生のPR', 'bob', '2026-10-02T00:00:00Z', '2026-10-04T00:00:00Z', '2026-10-04T00:00:00Z', 'alice', 'MERGED'),
    pr(12, '未完了PR', 'carol', '2026-09-01T00:00:00Z', null, null, null, 'OPEN'),
    pr(13, '別MilestoneのPR', 'alice', '2026-10-02T00:00:00Z', null, null, null, 'OPEN')
  ];
  write('pulls.json', pulls);
  write('pr10.json', {...pulls[0], closingIssuesReferences: [{number: 1}]});
  write('pr11.json', {...pulls[1], closingIssuesReferences: [{number: 5}]});
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
  assert.equal(data.summary.closedPrCount, 1);
  assert.equal(data.summary.mergedByStudentCount, 1);
  assert.equal(data.summary.completedIssueCount, 1);
  assert.equal(data.summary.manuallyClosedIssueCount, 1);
  assert.equal(data.summary.commitCount, 1);
  assert.equal(data.commits[0].message, '実装');
  assert.equal(data.commits[0].html_url, 'https://github.com/example/team/commit/abcdef123456');
  assert.equal(data.summary.githubCommentCount, 1);
  assert.equal(data.summary.troubleshootingCount, 0);
  assert.deepEqual(data.openPullRequests.map(item => item.number), [12]);
  assert.deepEqual(data.openIssues.map(item => item.number), [3]);
  assert.deepEqual(data.dodIssues.map(item => item.number), [1, 2, 5]);
  assert.deepEqual(data.dodPullRequests.map(item => item.number), [10, 11]);
  assert.deepEqual(data.dodCreatedPullRequests.map(item => item.number), [10]);
  assert.equal(data.dodQuestionsVersion, 2);
  assert.equal(data.closedPullRequests[0].durationSeconds, 82800);
  const elements = new Map();
  const document = {querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {innerHTML: '', textContent: '', value: '', handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; }});
    return elements.get(selector);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(source, 'weekly-summary-ui.js'), 'utf8'), {
    report: data, document, location: {}, navigator: {}, fetch: () => Promise.resolve({ok: true}), setInterval() {}
  });
  assert.match(elements.get('#overview-text').value, /DoD自己評価:/);
  const expectedDodQuestions = [
    '自分が担当したすべてのIssueとPRにGitHub上でMilestoneを設定し、対応するIssueとPRのMilestoneが一致していますか？',
    '自分が担当したすべてのIssueに、担当者とACを記録し、必要な場合は変更ファイル・実装計画・依存Issueを記録できましたか？',
    '自身のすべてのコミットについて、mainへ直接コミットせず、Issueごとのブランチで実装できましたか？',
    '自分が担当したすべてのPRの「AC確認結果」について、必要に応じて実際にアプリを動かして確認し、残る懸念があればその内容を記録できましたか？',
    '自分が担当したすべてのPRに「関連Issue」「変更内容」「AC確認結果」を記載していますか？また、Closes／Refsを適切に使えましたか？',
    '自分が作成したすべてのPRが、実装者以外によるAC・差分のレビューを受けてからマージされていますか？'
  ];
  const dodHtml = elements.get('#dod-form-items').innerHTML;
  for (const question of expectedDodQuestions) assert.ok(dodHtml.includes(question), question);
  assert.equal((dodHtml.match(/data-dod=/g) || []).length, 6);
  assert.match(dodHtml, /対象Issue・PR: 5件/);
  assert.match(dodHtml, /自身の全コミットはGit履歴で確認/);
  assert.match(elements.get('#dod-overview').innerHTML, /未選択/);
  assert.match(elements.get('#details').innerHTML, /AI利用（複数選択可）/);
  assert.match(elements.get('#details').innerHTML, /href="https:\/\/github\.com\/example\/team\/commit\/abcdef123456"/);
  assert.match(elements.get('#details').innerHTML, /abcdef12 実装/);
  assert.match(elements.get('#unfinished').innerHTML, /他学生の未完了Issue/);
  const dodSelect = {dataset: {dod: '1'}, value: 'all', disabled: false};
  await elements.get('#dod-form-items').handlers.change({target: {closest: () => dodSelect}});
  assert.match(elements.get('#overview-text').value, /1\. すべてについて実施できた/);
  const htmlPath = path.join(repo, 'docs', 'weekly-summary_alice.html');
  const dataPath = path.join(dataDir, firstFile);
  assert.match(fs.readFileSync(htmlPath, 'utf8'), /DoD自己評価/);
  assert.match(fs.readFileSync(htmlPath, 'utf8'), /\\u003c\/script>/);
  const port = 19000 + Math.floor(Math.random() * 10000);
  const server = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(source, 'server-weekly-summary.ps1'),
    '-HtmlPath', htmlPath, '-DataPath', dataPath, '-Port', String(port)], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  try {
    const base = `http://127.0.0.1:${port}`;
    let response;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { response = await fetch(base); break; }
      catch (_) { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(response, 'report server did not start');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /DoD自己評価/);
    const post = async (route, payload) => fetch(base + route, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload).replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)});
    const dodResponse = await post('/api/dod-assessment', {item: '1', choice: 'all'});
    assert.equal(dodResponse.status, 200, await dodResponse.text());
    assert.equal((await post('/api/dod-assessment', {item: '7', choice: 'all'})).status, 400);
    const aiResponse = await post('/api/ai-usage', {pr: '10', choices: ['debug', 'other'], other: '相談した'});
    assert.equal(aiResponse.status, 200, await aiResponse.text());
    assert.equal((await post('/api/ai-usage', {pr: '10', choices: ['none', 'debug'], other: ''})).status, 400);
    const saved = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.equal(saved.dodAssessment['1'].choice, 'all');
    assert.deepEqual(saved.aiUsage['10'].choices, ['debug', 'other']);
    assert.equal(saved.aiUsage['10'].other, '相談した');
    assert.match(await (await fetch(base)).text(), /相談した/);
  } finally { server.kill(); }
  const secondRun = spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 120000});
  if (secondRun.status !== 0) throw new Error(`second weekly-summary failed:\n${secondRun.stdout}\n${secondRun.stderr}`);
  const backup = fs.readdirSync(dataDir).find(name => /^lec06\.backup-.*\.json\.bak$/.test(name));
  assert.ok(backup, 'previous report must be backed up');
  const backupData = JSON.parse(fs.readFileSync(path.join(dataDir, backup), 'utf8'));
  assert.equal(backupData.dodAssessment['1'].choice, 'all');
  assert.deepEqual(backupData.aiUsage['10'].choices, ['debug', 'other']);
  const secondData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.equal(secondData.dodAssessment['1'].choice, 'all');
  assert.deepEqual(secondData.aiUsage['10'].choices, ['debug', 'other']);
  const htmlBeforeFailure = fs.readFileSync(htmlPath, 'utf8');
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
  assert.deepEqual(bobData.completedIssues.map(item => item.number), [5]);
  assert.deepEqual(bobData.dodIssues.map(item => item.number), [3]);
  assert.deepEqual(bobData.dodPullRequests.map(item => item.number), [11]);
  assert.deepEqual(bobData.dodCreatedPullRequests.map(item => item.number), [11]);
  pulls[3].milestone = null;
  write('pulls.json', pulls);
  const blockedRun = spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 120000});
  assert.notEqual(blockedRun.status, 0);
  assert.match(blockedRun.stderr, /Milestone未割当/);
  assert.match(blockedRun.stderr, /PR #13/);
  assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, 'utf8')), secondData);
  assert.equal(fs.readdirSync(dataDir).filter(name => name.endsWith('.bak')).length, 1);
  pulls[3].milestone = {title: 'lec07'};
  write('pulls.json', pulls);
  const legacyData = {...secondData, dodQuestionsVersion: 1, dodAssessment: {'1': {choice: 'all'}, '7': {choice: 'none_done'}}};
  fs.writeFileSync(dataPath, JSON.stringify(legacyData));
  const migratedRun = spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 120000});
  if (migratedRun.status !== 0) throw new Error(`legacy weekly-summary failed:\n${migratedRun.stdout}\n${migratedRun.stderr}`);
  const migratedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.equal(migratedData.dodQuestionsVersion, 2);
  assert.deepEqual(migratedData.dodAssessment, {});
  assert.deepEqual(migratedData.aiUsage['10'].choices, ['debug', 'other']);
  process.stdout.write('weekly-summary fixture test passed\n');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
}

main().catch(error => { console.error(error); process.exitCode = 1; });
