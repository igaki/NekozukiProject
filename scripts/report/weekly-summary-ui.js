const q = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeUrl = value => /^https:\/\/github\.com\//.test(value || '') ? esc(value) : '#';
const link = (url, label) => `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
const duration = seconds => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '算定不可';
  const total = Math.max(0, Math.round(Number(seconds)));
  const days = Math.floor(total / 86400), hours = Math.floor(total % 86400 / 3600), minutes = Math.floor(total % 3600 / 60);
  return `${days ? days + '日' : ''}${hours ? hours + '時間' : ''}${minutes}分`;
};
const age = createdAt => duration((Date.parse(report.generatedAt) - Date.parse(createdAt)) / 1000);
const aiOptions = [
  ['none', '全く利用していない'],
  ['brainstorm', '要求分析に利用（brainstorm）'],
  ['plan-issues', 'Issue作成・登録に利用（plan-issues）'],
  ['implement-issue', '実装に利用（implement-issue）'],
  ['prepare-pr', 'PR作成に利用（prepare-pr）'],
  ['debug', 'デバッグに利用（debug）'],
  ['review-pr', 'レビューに利用（review-pr）'],
  ['other', 'その他']
];
const dodChoices = [
  ['no_activity', '該当する活動がなかった'],
  ['all', 'すべてについて実施できた'],
  ['some_not', '実施できなかったものが一部ある'],
  ['most_not', '大半について実施できなかった'],
  ['none_done', '対象はあるが、この項目を全く実施できていない']
];
const dodQuestions = [
  '自分が担当したすべてのIssueとPRにGitHub上でMilestoneを設定し、対応するIssueとPRのMilestoneが一致していますか？',
  '自分が担当したすべてのIssueに、担当者とACを記録し、必要な場合は変更ファイル・実装計画・依存Issueを記録できましたか？',
  '自身のすべてのコミットについて、mainへ直接コミットせず、Issueごとのブランチで実装できましたか？',
  '自分が担当したすべてのPRの「AC確認結果」について、必要に応じて実際にアプリを動かして確認し、残る懸念があればその内容を記録できましたか？',
  '自分が担当したすべてのPRに「関連Issue」「変更内容」「AC確認結果」を記載していますか？また、Closes／Refsを適切に使えましたか？',
  '自分が作成したすべてのPRが、実装者以外によるAC・差分のレビューを受けてからマージされていますか？'
];
if (report.dodQuestionsVersion !== 2) report.dodAssessment = {};
const dodLabel = id => dodChoices.find(([key]) => key === report.dodAssessment?.[id]?.choice)?.[1] || '未選択';
const aiLabel = number => {
  const answer = report.aiUsage?.[String(number)];
  if (!answer?.choices?.length) return '未選択';
  return answer.choices.map(key => key === 'other' ? `その他${answer.other ? '（' + answer.other + '）' : ''}` : aiOptions.find(([option]) => option === key)?.[1] || key).join('、');
};
const entryList = (items, formatter) => items.length ? items.map(formatter).join('') : '<p>該当なし</p>';
const section = (id, title, items, formatter) => `<section class="box detail-card" id="${id}"><h3 class="title is-5">${esc(title)}（${items.length}）</h3>${entryList(items, formatter)}</section>`;

function overviewText() {
  const s = report.summary;
  const lines = [
    `週次開発レビュー @${report.student}`,
    `Milestone: ${report.milestone}`,
    `Close済みPR: ${s.closedPrCount}件（うちマージ済み ${s.mergedPrCount}件）`,
    `自分がマージしたPR: ${s.mergedByStudentCount}件`,
    ...report.closedPullRequests.map(pr => `  PR #${pr.number} ${pr.title}: ${duration(pr.durationSeconds)}（${pr.endSource === 'pr-merged' ? 'マージまで' : 'Closeまで'}）`),
    `PR連動でCloseされたIssue: ${s.completedIssueCount}件`,
    `手動でCloseされたIssue: ${s.manuallyClosedIssueCount}件`,
    `総コミット: ${s.commitCount}件`,
    `総コメント: ${s.githubCommentCount}件`,
    `trouble report: ${s.troubleshootingCount}件`,
    'PRごとのAI利用:',
    ...report.closedPullRequests.map(pr => `  PR #${pr.number}: ${aiLabel(pr.number)}`),
    'DoD自己評価:',
    ...dodQuestions.map((_, index) => `  ${index + 1}. ${dodLabel(String(index + 1))}`)
  ];
  return lines.join('\n');
}

function renderOverview() {
  const s = report.summary;
  q('#report-meta').textContent = `@${report.student} · ${report.milestone}`;
  q('#overview-metrics').innerHTML = [
    ['closed-prs', 'Close済みPR', s.closedPrCount],
    ['merged-by-student', '自分がマージしたPR', s.mergedByStudentCount],
    ['linked-issues', 'PR連動Issue', s.completedIssueCount],
    ['manual-issues', '手動Close Issue', s.manuallyClosedIssueCount],
    ['commits', 'コミット', s.commitCount],
    ['comments', 'コメント', s.githubCommentCount],
    ['trouble', 'trouble report', s.troubleshootingCount]
  ].map(([id, label, count]) => `<a class="metric-card" href="#${id}"><span>${esc(label)}</span><strong>${count}</strong></a>`).join('');
  q('#overview-text').value = overviewText();
  q('#overview-links').innerHTML = [
    ['closed-prs', `Close済みPR ${s.closedPrCount}件`],
    ['merged-by-student', `自分がマージしたPR ${s.mergedByStudentCount}件`],
    ['linked-issues', `PR連動でCloseされたIssue ${s.completedIssueCount}件`],
    ['manual-issues', `手動でCloseされたIssue ${s.manuallyClosedIssueCount}件`],
    ['commits', `コミット ${s.commitCount}件`],
    ['comments', `コメント ${s.githubCommentCount}件`],
    ['trouble', `trouble report ${s.troubleshootingCount}件`],
    ['dod-form', 'DoD自己評価']
  ].map(([id, label]) => `<a class="summary-link" href="#${id}">${esc(label)}</a>`).join('');
  q('#dod-overview').innerHTML = '<h3 class="title is-5">DoD自己評価</h3>' + dodQuestions.map((_, index) => `<p>${index + 1}. ${esc(dodLabel(String(index + 1)))}</p>`).join('');
  q('#ai-overview').innerHTML = '<h3 class="title is-5">PRごとのAI利用</h3>' + entryList(report.closedPullRequests,
    pr => `<p><a href="#pr-${pr.number}">PR #${pr.number}</a>: ${esc(aiLabel(pr.number))}</p>`);
  const unansweredAi = report.closedPullRequests.filter(pr => !report.aiUsage?.[String(pr.number)]?.choices?.length);
  q('#ai-warning').innerHTML = unansweredAi.length ? `<div class="notification warning">AI利用が未選択のClose済みPRが${unansweredAi.length}件あります: ${unansweredAi.map(pr => `<a href="#pr-${pr.number}">#${pr.number}</a>`).join('、')}</div>` : '';
}

function renderDodForm() {
  q('#dod-form-items').innerHTML = dodQuestions.map((question, index) => {
    const id = String(index + 1);
    const targets = index === 0 ? [...report.dodIssues, ...report.dodPullRequests] : index === 1 ? report.dodIssues : index === 5 ? (report.dodCreatedPullRequests || []) : index === 2 ? [] : report.dodPullRequests;
    const kind = index === 0 ? 'Issue・PR' : index === 1 ? 'Issue' : index === 2 ? 'コミット' : 'PR';
    const links = targets.map(item => link(item.url, `#${item.number}`)).join('、') || '対象なし';
    const note = index === 2 ? '<p class="meta">自身の全コミットはGit履歴で確認してください。この画面のコミット一覧にはMilestoneのPR外やmainへの直接コミットは表示されません。</p>' : '';
    const targetInfo = index === 2 ? '' : `<p class="meta">対象${kind}: ${targets.length}件 — ${links}</p>`;
    return `<div class="dod-item"><label class="label" for="dod-${id}">${id}. ${esc(question)}</label>${targetInfo}${note}<div class="select is-fullwidth"><select id="dod-${id}" data-dod="${id}"><option value="">未選択</option>${dodChoices.map(([value, label]) => `<option value="${value}" ${report.dodAssessment?.[id]?.choice === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><p class="save-status" id="dod-status-${id}" aria-live="polite"></p></div>`;
  }).join('');
}

function aiControls(pr) {
  const answer = report.aiUsage?.[String(pr.number)] || {choices: [], other: ''};
  return `<fieldset class="ai-controls" data-pr="${pr.number}"><legend class="label">AI利用（複数選択可）</legend><div class="ai-grid">${aiOptions.map(([value, label]) => `<label class="checkbox"><input type="checkbox" value="${value}" ${answer.choices?.includes(value) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div><label class="label other-label" for="other-${pr.number}">その他の内容</label><input class="input" id="other-${pr.number}" data-other type="text" maxlength="500" value="${esc(answer.other || '')}" ${answer.choices?.includes('other') ? '' : 'disabled'}><p class="save-status" aria-live="polite"></p></fieldset>`;
}

function renderDetails() {
  q('#details').innerHTML = '<h2 class="title is-3 section-title">詳細表示</h2>' +
    section('closed-prs', 'Close済みPR', report.closedPullRequests, pr => {
      const issues = report.completedIssues.filter(issue => issue.pr?.number === pr.number);
      return `<article class="list-item" id="pr-${pr.number}"><h4 class="title is-6">${link(pr.url, `#${pr.number} ${pr.title}`)}</h4><p>所要時間: ${duration(pr.durationSeconds)}（${pr.endSource === 'pr-merged' ? 'マージまで' : 'Closeまで'}）</p><p class="meta">開始: ${esc(pr.startAt)}（${esc(pr.startSource)}）／終了: ${esc(pr.endAt)}（${esc(pr.endSource)}）</p><p>連動してCloseされたIssue: ${issues.length ? issues.map(issue => link(issue.url, `#${issue.number} ${issue.title}`)).join('、') : 'なし'}</p>${pr.closingIssueNumbers?.length === 0 ? '<p class="notification warning">関連する完了対象Issueがありません。</p>' : ''}${aiControls(pr)}</article>`;
    }) +
    section('merged-by-student', '自分がマージしたPR', report.mergedByStudent, pr => `<div class="list-item">${link(pr.url, `#${pr.number} ${pr.title}`)} <span class="meta">${esc(pr.mergedAt)}</span></div>`) +
    section('linked-issues', 'PR連動でCloseされたIssue', report.completedIssues, issue => `<div class="list-item">${link(issue.url, `#${issue.number} ${issue.title}`)} · ${link(issue.pr.url, `PR #${issue.pr.number}`)}</div>`) +
    section('manual-issues', '手動でCloseされたIssue', report.manuallyClosedIssues, issue => `<div class="list-item">${link(issue.url, `#${issue.number} ${issue.title}`)}<p class="description">${esc(issue.body || '')}</p></div>`) +
    section('commits', 'コミット', report.commits, commit => `<div class="list-item">${link(commit.html_url, `${commit.sha?.slice(0, 8)} ${commit.message?.split('\n')[0] || ''}`)}</div>`) +
    section('comments', 'GitHubコメント', report.githubComments, comment => `<div class="list-item">${link(comment.html_url, comment.body?.slice(0, 160) || 'コメント')} <span class="meta">${esc(comment.created_at)}</span></div>`) +
    section('trouble', 'trouble report', report.troubleshooting, item => `<div class="list-item">${link(item.url, item.subject)} <span class="meta">${esc(item.at)}</span></div>`);
  q('#unfinished').innerHTML = '<h2 class="title is-3 section-title">未完了</h2><p class="meta">指定Milestoneに属する全員のOpen項目です。経過時間はレポート生成時点の値です。</p>' +
    section('open-prs', 'Open PR', report.openPullRequests, pr => `<details class="list-item"><summary>${link(pr.url, `#${pr.number} ${pr.title}`)} · 作成から${age(pr.createdAt)}</summary><p class="description">${esc(pr.body || '本文なし')}</p></details>`) +
    section('open-issues', 'Open Issue', report.openIssues, issue => `<details class="list-item"><summary>${link(issue.url, `#${issue.number} ${issue.title}`)} · 作成から${age(issue.createdAt)}</summary><p class="description">${esc(issue.body || '本文なし')}</p></details>`);
}

async function postJson(path, payload) {
  // ローカルサーバはContent-Lengthを文字数として読むため、POST本文をASCIIのJSONにする。
  const body = JSON.stringify(payload).replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
  if (!response.ok) throw new Error('保存できませんでした');
}

q('#report-select').addEventListener('change', event => { location.search = '?report=' + encodeURIComponent(event.target.value); });
q('#copy-button').addEventListener('click', async () => {
  const field = q('#overview-text');
  try { await navigator.clipboard.writeText(field.value); }
  catch (_) { field.select(); document.execCommand('copy'); }
  q('#copy-status').textContent = 'コピーしました。';
});
q('#dod-form-items').addEventListener('change', async event => {
  const select = event.target.closest('select[data-dod]');
  if (!select) return;
  const id = select.dataset.dod, previous = report.dodAssessment?.[id]?.choice || '';
  const status = q(`#dod-status-${id}`);
  select.disabled = true;
  try {
    await postJson('/api/dod-assessment', {item: id, choice: select.value});
    report.dodAssessment[id] = select.value ? {choice: select.value} : undefined;
    status.textContent = '保存しました。';
    renderOverview();
  } catch (_) {
    select.value = previous;
    status.textContent = '保存できませんでした。再試行してください。';
  } finally { select.disabled = false; }
});
async function saveAiControls(fieldset) {
  const number = fieldset.dataset.pr;
  const choices = [...fieldset.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
  const other = choices.includes('other') ? fieldset.querySelector('[data-other]').value.trim() : '';
  const status = fieldset.querySelector('.save-status');
  try {
    await postJson('/api/ai-usage', {pr: number, choices, other});
    report.aiUsage[number] = {choices, other};
    status.textContent = '保存しました。';
    renderOverview();
  } catch (_) { status.textContent = '保存できませんでした。再試行してください。'; }
}
const aiSaveQueues = new Map();
q('#details').addEventListener('change', event => {
  const fieldset = event.target.closest('fieldset[data-pr]');
  if (!fieldset) return;
  if (event.target.type === 'checkbox') {
    const none = fieldset.querySelector('input[value="none"]');
    if (event.target.value === 'none' && none.checked) fieldset.querySelectorAll('input[type="checkbox"]').forEach(input => { if (input !== none) input.checked = false; });
    if (event.target.value !== 'none' && event.target.checked) none.checked = false;
    fieldset.querySelector('[data-other]').disabled = !fieldset.querySelector('input[value="other"]').checked;
  }
  const number = fieldset.dataset.pr;
  const pending = aiSaveQueues.get(number) || Promise.resolve();
  aiSaveQueues.set(number, pending.catch(() => {}).then(() => saveAiControls(fieldset)));
});
renderDodForm();
renderDetails();
renderOverview();
setInterval(() => fetch('/api/heartbeat', {cache: 'no-store'}).catch(() => {}), 5000);
fetch('/api/heartbeat').catch(() => {});
