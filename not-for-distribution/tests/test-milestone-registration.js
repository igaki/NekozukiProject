const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const source = path.resolve(__dirname, '..', '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'milestone-test-'));
const repo = path.join(temp, 'repo');
const bin = path.join(temp, 'bin');
const log = path.join(temp, 'calls.log');
const prExists = path.join(temp, 'pr-exists');
const prMilestone = path.join(temp, 'pr-milestone');
const bash = process.env.PORTABLE_GIT_BASH || 'bash';
const msys = value => value.replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()).replace(/\\/g, '/');
const run = (script, args = [], milestone = '', prMode = '') => {
  const command = "export PATH='" + msys(bin) + "':\"$PATH\"; bash '" + msys(path.join(source, script)) + "' " + args.map(arg => "'" + arg + "'").join(' ');
  return spawnSync(bash, ['-lc', command], {cwd: repo, encoding: 'utf8', timeout: 30000,
    env: {...process.env, MOCK_LOG: msys(log), MOCK_ISSUE_MILESTONE: milestone, MOCK_PR_MODE: prMode,
      MOCK_PR_EXISTS_FILE: msys(prExists), MOCK_PR_MILESTONE_FILE: msys(prMilestone)}});
};

try {
  fs.mkdirSync(path.join(repo, 'docs', 'temp'), {recursive: true});
  fs.mkdirSync(bin);
  fs.writeFileSync(log, '');
  fs.writeFileSync(prExists, '0');
  fs.writeFileSync(prMilestone, '');
  fs.writeFileSync(path.join(bin, 'gh'), [
    '#!/usr/bin/env bash',
    'case "$1 $2" in',
    "  'repo view') echo example/team ;;",
    "  'api --paginate') echo '[[{\"number\":1,\"title\":\"lec06\"}]]' ;;",
    "  'api repos/example/team/issues/1') if [[ \"$*\" == *'.state'* ]]; then echo open; elif [[ \"$*\" == *'milestone.title'* ]]; then echo \"$MOCK_ISSUE_MILESTONE\"; fi ;;",
    "  'api repos/example/team/pulls?'*) if [[ \"$(cat \"$MOCK_PR_EXISTS_FILE\")\" == 1 ]]; then echo 2; fi ;;",
    "  'api repos/example/team/issues/2') cat \"$MOCK_PR_MILESTONE_FILE\" ;;",
    "  'api -X') echo \"pr milestone patch $*\" >> \"$MOCK_LOG\"; if [[ \"$MOCK_PR_MODE\" == patch_fail ]]; then exit 1; fi; echo lec06 > \"$MOCK_PR_MILESTONE_FILE\"; echo '{}' ;;",
    "  'issue list'|'pr list') : ;;",
    "  'issue view') if [[ \"$*\" == *'--json milestone'* ]]; then echo \"$MOCK_ISSUE_MILESTONE\"; elif [[ \"$*\" == *'--json title'* ]]; then echo 'Example issue'; elif [[ \"$*\" == *'--json state'* ]]; then echo OPEN; else echo '{}'; fi ;;",
    '  \'issue create\') echo "issue create $*" >> "$MOCK_LOG"; echo https://github.com/example/team/issues/1 ;;',
    '  \'pr create\') echo "pr create $*" >> "$MOCK_LOG"; echo 1 > "$MOCK_PR_EXISTS_FILE"; if [[ "$MOCK_PR_MODE" != create_fail && "$MOCK_PR_MODE" != no_url_fail && "$MOCK_PR_MODE" != patch_fail ]]; then echo lec06 > "$MOCK_PR_MILESTONE_FILE"; fi; if [[ "$MOCK_PR_MODE" != no_url_fail ]]; then echo https://github.com/example/team/pull/2; fi; if [[ "$MOCK_PR_MODE" == create_fail || "$MOCK_PR_MODE" == no_url_fail ]]; then echo "pull request update failed: HTTP 502" >&2; exit 1; fi ;;',
    '  *) echo "unexpected gh: $*" >&2; exit 1 ;;',
    'esac', ''
  ].join('\n'));
  fs.writeFileSync(path.join(bin, 'git'), [
    '#!/usr/bin/env bash',
    'case "$1" in',
    '  branch) echo feat/issue-1-test ;;',
    '  diff) exit 0 ;;',
    '  push) echo "git push $*" >> "$MOCK_LOG" ;;',
    '  *) exit 1 ;;',
    'esac', ''
  ].join('\n'));
  const draft = path.join(repo, 'docs', 'temp', 'issues.md');
  const issueDraft = milestone => [
    '<!-- ISSUE', 'id: example', 'title: Example issue', 'assignee: alice',
    'milestone: ' + milestone, 'depends-on:', '-->', '## 機能の概要', 'Example',
    '## AC（受け入れ基準）', 'Given A When B Then C', '## 関連ファイル・変更境界',
    '## 実装計画', '## 変更しないものとリスク', '<!-- END ISSUE -->', ''
  ].join('\n');
  for (const milestone of ['', 'lec08']) {
    fs.writeFileSync(draft, issueDraft(milestone));
    const result = run('scripts/issue/register-from-file.sh', [msys(draft)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Milestone/);
    assert.equal(fs.readFileSync(log, 'utf8'), '');
  }
  fs.writeFileSync(draft, issueDraft('lec06'));
  const validIssue = run('scripts/issue/register-from-file.sh', [msys(draft)]);
  assert.equal(validIssue.status, 0, validIssue.stderr);
  assert.match(fs.readFileSync(log, 'utf8'), /issue create .*--milestone lec06/);
  fs.writeFileSync(path.join(repo, 'docs', 'temp', 'pr-1.md'),
    '## 関連Issue\nCloses #1\n## 変更内容\nExample\n## AC確認結果\nPassed\n## テスト結果\nPassed\n');
  fs.writeFileSync(log, '');
  for (const [args, milestone] of [[[], 'lec06'], [[], ''], [['lec08'], 'lec08']]) {
    const result = run('scripts/pr/create-pr.sh', args, milestone);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Milestone/);
    assert.equal(fs.readFileSync(log, 'utf8'), '');
  }
  const validPr = run('scripts/pr/create-pr.sh', ['lec06'], 'lec06');
  assert.equal(validPr.status, 0, validPr.stderr);
  assert.match(fs.readFileSync(log, 'utf8'), /pr create .*--milestone lec06/);
  assert.match(validPr.stdout, /PR #2 のMilestoneを確認しました: lec06/);
  fs.writeFileSync(log, '');
  fs.writeFileSync(prExists, '0');
  fs.writeFileSync(prMilestone, '');
  const partialPr = run('scripts/pr/create-pr.sh', ['lec06'], 'lec06', 'create_fail');
  assert.equal(partialPr.status, 0, partialPr.stderr);
  assert.match(partialPr.stderr, /後処理が失敗/);
  assert.equal(fs.readFileSync(log, 'utf8').split('\n').filter(line => line.startsWith('pr create ')).length, 1);
  assert.match(fs.readFileSync(log, 'utf8'), /pr milestone patch/);
  assert.equal(fs.readFileSync(prMilestone, 'utf8').trim(), 'lec06');
  fs.writeFileSync(log, '');
  fs.writeFileSync(prMilestone, '');
  const existingPr = run('scripts/pr/create-pr.sh', ['lec06'], 'lec06');
  assert.equal(existingPr.status, 0, existingPr.stderr);
  assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /pr create |git push/);
  assert.match(existingPr.stdout, /Open Pull Request #2/);
  assert.equal(fs.readFileSync(prMilestone, 'utf8').trim(), 'lec06');
  fs.writeFileSync(log, '');
  fs.writeFileSync(prExists, '0');
  fs.writeFileSync(prMilestone, '');
  const noUrlPr = run('scripts/pr/create-pr.sh', ['lec06'], 'lec06', 'no_url_fail');
  assert.equal(noUrlPr.status, 0, noUrlPr.stderr);
  assert.match(noUrlPr.stdout, /作成済みのPRを検出/);
  fs.writeFileSync(log, '');
  fs.writeFileSync(prExists, '0');
  fs.writeFileSync(prMilestone, '');
  const failedRepair = run('scripts/pr/create-pr.sh', ['lec06'], 'lec06', 'patch_fail');
  assert.notEqual(failedRepair.status, 0);
  assert.match(failedRepair.stderr, /PR #2 のMilestone 'lec06' を確認できませんでした/);
  assert.equal(fs.readFileSync(log, 'utf8').split('\n').filter(line => line.startsWith('pr create ')).length, 1);
  for (const milestone of ['', 'lec15']) {
    const result = run('scripts/issue/validate-milestone.sh', ['1'], milestone);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /GitHub上のMilestone/);
  }
  const validValidation = run('scripts/issue/validate-milestone.sh', ['1'], 'lec06');
  assert.equal(validValidation.status, 0, validValidation.stderr);
  process.stdout.write('milestone registration fixture test passed\n');
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
