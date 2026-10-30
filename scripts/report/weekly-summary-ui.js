const q = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeUrl = value => /^https:\/\/github\.com\//.test(value || '') ? esc(value) : '#';
const previewAttributes = url => {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/([1-9][0-9]*)(?:[?#].*)?$/.exec(url || '');
  if (!match || `${match[1]}/${match[2]}` !== report.repository) return '';
  return ` data-preview-kind="${match[3] === 'issues' ? 'issue' : 'pr'}" data-preview-number="${match[4]}"`;
};
const link = (url, label) => `<a href="${safeUrl(url)}"${previewAttributes(url)} target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
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
const dodQuestions = [
  'すべてのIssueとPRにmilestoneが正しく設定されていますか？現時点で未完了のIssueおよびPRがある場合は今すぐに次のmilestoneを設定しましょう．',
  '自分の担当したすべてのIssueについて、assigneeとACが正しく記録されていますか？',
  'mainブランチに直接コミットしていませんか？',
  'すべてのCloseされた担当PRについて、「変更内容」と「AC確認結果」が適切に記載されていますか？',
  'すべてのCloseされた担当PRについて，「関連Issue」が正しく記載されている',
  'すべてのCloseされた担当PRについて、実装者以外がAC/差分を確認してレビューを行い、マージしていますか？'
];
const dodOptions = [
  [['no_assigned', '自分の担当したPR/Issueが存在しない'], ['correct', '正しく設定されている'], ['incorrect', '正しく設定されていないものがある']],
  [['no_assigned', '自分の担当したIssueが存在しない'], ['correct', '担当したすべてのIssueについて正しく設定されている'], ['incorrect', 'ACあるいは担当者が設定されていない担当Issueがある']],
  [['no_commits', '全くコミットしていない'], ['no_direct_main', '一切mainブランチに直接コミットしていない'], ['direct_main', 'mainブランチに直接コミットしたものがある']],
  [['no_assigned', '担当PRが存在しない'], ['complete', '「変更内容」と「AC確認結果」がすべてのClosedな担当PRに適切に記載されている'], ['missing', '記載が漏れている担当PRがある']],
  [['no_assigned', '担当PRが存在しない'], ['complete', 'すべてのClosedな担当PRについて「関連Issue」が正しく記載されている'], ['missing', '記載が漏れているPRがある']],
  [['no_merged', '担当PRが存在しないかマージが全く行われていない'], ['reviewed', 'すべてのClosedな担当PRについて実装者以外がレビュアーとしてAC/差分を確認して結果を記述している'], ['same_reviewer', 'PRの担当者とレビュアーが共通のPRがある'], ['no_review_result', 'PRの担当者とレビュアーは異なるがレビュー結果が記載されていない']]
];
const dodLabel = id => {
  const options = dodOptions[Number(id) - 1];
  const answer = report.dodAssessment?.[id];
  const keys = id === '6' ? answer?.choices || [] : answer?.choice ? [answer.choice] : [];
  return keys.map(key => options.find(([value]) => value === key)?.[1] || key).join('、') || '未選択';
};
const aiLabel = number => {
  const answer = report.aiUsage?.[String(number)];
  if (!answer?.choices?.length) return '未選択';
  return answer.choices.map(key => key === 'other' ? `その他${answer.other ? '（' + answer.other + '）' : ''}` : aiOptions.find(([option]) => option === key)?.[1] || key).join('、');
};
const entryList = (items, formatter) => items.length ? items.map(formatter).join('') : '<p>該当なし</p>';
const section = (id, title, items, formatter) => `<section class="box detail-card" id="${id}"><h3 class="title is-5">${esc(title)}（${items.length}）</h3>${entryList(items, formatter)}</section>`;

const assigneeNames = item => (item.assignees || []).map(user => typeof user === 'string' ? user : user.login).filter(Boolean);
const ownerNames = pr => assigneeNames(pr).length ? assigneeNames(pr).join('、') : (typeof pr.author === 'string' ? pr.author : pr.author?.login) || '未設定';
const plainLink = (label, url) => `${label} (${url})`;
function overviewRows() {
  const s = report.summary, rows = [];
  const add = (plain, html = esc(plain), depth = 0) => rows.push({plain: `${'  '.repeat(depth)}${plain}`, html, depth});
  add(`週次開発レビュー @${report.student}`);
  add(`Milestone: ${report.milestone}`);
  add(`Close済み担当PR: ${s.closedPrCount}件（うちマージ済み ${s.mergedPrCount}件）`);
  for (const pr of report.closedPullRequests) {
    const status = pr.mergedAt ? '[Merged]' : '[NotMerged]';
    const timing = `${duration(pr.durationSeconds)}（${pr.mergedAt ? 'マージまで' : 'Closeまで'}）`;
    const label = `${status}PR #${pr.number} ${pr.title}`;
    add(`${plainLink(label, pr.url)}: ${timing}`, `${link(pr.url, label)}: ${esc(timing)}`, 1);
    for (const issue of pr.relatedIssues || []) {
      const issueLabel = `[${String(issue.state).toLowerCase() === 'closed' ? 'Closed' : 'Open'}]Issue #${issue.number} ${issue.title}`;
      add(`- ${plainLink(issueLabel, issue.url)}`, `- ${link(issue.url, issueLabel)}`, 2);
    }
    if (!pr.relatedIssues?.length) add('- 関連Issueなし', '- 関連Issueなし', 2);
  }
  add(`自分がマージしたPR: ${s.mergedByStudentCount}件`);
  for (const pr of report.mergedByStudent) {
    const label = `PR #${pr.number} [${ownerNames(pr)}] ${pr.title}`;
    add(plainLink(label, pr.url), link(pr.url, label), 1);
  }
  add(`手動でCloseされたIssue: ${s.manuallyClosedIssueCount}件`);
  for (const issue of report.manuallyClosedIssues) {
    const label = `Issue #${issue.number} ${issue.title}`;
    add(plainLink(label, issue.url), link(issue.url, label), 1);
  }
  add(`総コミット: ${s.commitCount}件`);
  add(`総コメント: ${s.githubCommentCount}件`);
  add(`trouble report: ${s.troubleshootingCount}件`);
  for (const [title, items, kind] of [
    ['Open PR', report.openPullRequests, 'PR'], ['Open Issue', report.openIssues, 'Issue']
  ]) {
    add(`${title}: ${items.length}件`);
    for (const item of items) {
      const suffix = ` [assignee: ${assigneeNames(item).join('、') || '未設定'}] [milestone: ${item.milestone || '未設定'}]`;
      const label = `${kind} #${item.number} ${item.title}`;
      add(`${plainLink(label, item.url)}${suffix}`, `${link(item.url, label)}${esc(suffix)}`, 1);
    }
  }
  add('PRごとのAI利用:');
  for (const pr of report.closedPullRequests) add(`PR #${pr.number}: ${aiLabel(pr.number)}`, `PR #${pr.number}: ${esc(aiLabel(pr.number))}`, 1);
  add('DoD自己評価:');
  dodQuestions.forEach((_, index) => add(`${index + 1}. ${dodLabel(String(index + 1))}`, undefined, 1));
  return rows;
}
const overviewText = () => overviewRows().map(row => row.plain).join('\n');
const overviewHtml = () => `<div class="overview-content">${overviewRows().map(row => `<p class="overview-row overview-depth-${row.depth}" style="margin:2px 0;padding-left:${row.depth * 24}px">${row.html}</p>`).join('')}</div>`;

function renderOverview() {
  const s = report.summary;
  q('#report-meta').textContent = `@${report.student} · ${report.milestone}`;
  q('#overview-metrics').innerHTML = [
    ['closed-prs', 'Close済み担当PR', s.closedPrCount],
    ['merged-by-student', '自分がマージしたPR', s.mergedByStudentCount],
    ['manual-issues', '手動Close Issue', s.manuallyClosedIssueCount],
    ['open-prs', 'Open PR', s.openPrCount],
    ['open-issues', 'Open Issue', s.openIssueCount],
    ['commits', 'コミット', s.commitCount],
    ['comments', 'コメント', s.githubCommentCount],
    ['trouble', 'trouble report', s.troubleshootingCount]
  ].map(([id, label, count]) => `<a class="metric-card" href="#${id}"><span>${esc(label)}</span><strong>${count}</strong></a>`).join('');
  q('#overview-text').innerHTML = overviewHtml();
  const unansweredAi = report.closedPullRequests.filter(pr => !report.aiUsage?.[String(pr.number)]?.choices?.length);
  q('#ai-warning').innerHTML = unansweredAi.length ? `<div class="notification warning">AI利用が未選択のClose済み担当PRが${unansweredAi.length}件あります: ${unansweredAi.map(pr => `<a href="#pr-${pr.number}">PR #${pr.number}</a>`).join('、')}</div>` : '';
  const unansweredDod = dodQuestions.map((_, index) => index + 1).filter(number => dodLabel(String(number)) === '未選択');
  q('#dod-warning').innerHTML = unansweredDod.length ? `<div class="notification warning">DoD自己評価が未選択の項目が${unansweredDod.length}件あります: ${unansweredDod.map(number => `<a href="#dod-item-${number}">${number}番</a>`).join('、')}</div>` : '';
}

function renderDodForm() {
  q('#dod-form-items').innerHTML = dodQuestions.map((question, index) => {
    const id = String(index + 1);
    const targets = index === 0 ? [...report.dodIssues, ...report.dodPullRequests] : index === 1 ? report.dodIssues : index === 2 ? [] : report.closedPullRequests;
    const kind = index === 0 ? 'Issue・PR' : index === 1 ? 'Issue' : index === 2 ? 'コミット' : 'PR';
    const links = targets.map(item => link(item.url, `${item.url?.includes('/pull/') ? 'PR' : 'Issue'}#${item.number}`)).join('、') || '対象なし';
    const note = index === 2 ? '<p class="meta">自身の全コミットはGit履歴で確認してください。この画面のコミット一覧にはMilestoneのPR外やmainへの直接コミットは表示されません。</p>' : '';
    const targetInfo = index === 2 ? '' : `<p class="meta">対象${kind}: ${targets.length}件 — ${links}</p>`;
    const controls = index === 5
      ? `<div class="dod-options" data-dod-group="6">${dodOptions[index].map(([value, label]) => `<label class="checkbox"><input type="checkbox" value="${value}" ${report.dodAssessment?.[id]?.choices?.includes(value) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div>`
      : `<div class="select is-fullwidth"><select id="dod-${id}" data-dod="${id}"><option value="">未選択</option>${dodOptions[index].map(([value, label]) => `<option value="${value}" ${report.dodAssessment?.[id]?.choice === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>`;
    return `<div class="dod-item" id="dod-item-${id}"><p class="label">${id}. ${esc(question)}</p>${targetInfo}${note}${controls}<p class="save-status" id="dod-status-${id}" aria-live="polite"></p></div>`;
  }).join('');
}

function aiControls(pr) {
  const answer = report.aiUsage?.[String(pr.number)] || {choices: [], other: ''};
  return `<fieldset class="ai-controls" data-pr="${pr.number}"><legend class="label">AI利用（複数選択可）</legend><div class="ai-grid">${aiOptions.map(([value, label]) => `<label class="checkbox"><input type="checkbox" value="${value}" ${answer.choices?.includes(value) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div><label class="label other-label" for="other-${pr.number}">その他の内容</label><input class="input" id="other-${pr.number}" data-other type="text" maxlength="500" value="${esc(answer.other || '')}" ${answer.choices?.includes('other') ? '' : 'disabled'}><p class="save-status" aria-live="polite"></p></fieldset>`;
}

function renderDetails() {
  q('#details').innerHTML = '<h2 class="title is-3 section-title">詳細表示</h2>' +
    section('closed-prs', 'Close済み担当PR', report.closedPullRequests, pr => {
      const issues = pr.relatedIssues || [];
      return `<article class="list-item" id="pr-${pr.number}"><h4 class="title is-6">${link(pr.url, `#${pr.number} ${pr.title}`)}</h4><p>所要時間: ${duration(pr.durationSeconds)}（${pr.endSource === 'pr-merged' ? 'マージまで' : 'Closeまで'}）</p><p class="meta">開始: ${esc(pr.startAt)}（${esc(pr.startSource)}）／終了: ${esc(pr.endAt)}（${esc(pr.endSource)}）</p><p>関連Issue: ${issues.length ? issues.map(issue => link(issue.url, `[${String(issue.state).toLowerCase() === 'closed' ? 'Closed' : 'Open'}] #${issue.number} ${issue.title}`)).join('、') : 'なし'}</p>${aiControls(pr)}</article>`;
    }) +
    section('merged-by-student', '自分がマージしたPR', report.mergedByStudent, pr => `<div class="list-item">${link(pr.url, `#${pr.number} [${ownerNames(pr)}] ${pr.title}`)} <span class="meta">${esc(pr.mergedAt)}</span></div>`) +
    section('manual-issues', '手動でCloseされたIssue', report.manuallyClosedIssues, issue => `<div class="list-item">${link(issue.url, `#${issue.number} ${issue.title}`)}<p class="description">${esc(issue.body || '')}</p></div>`) +
    section('commits', 'コミット', report.commits, commit => `<div class="list-item">${link(commit.html_url, `${commit.sha?.slice(0, 8)} ${commit.message?.split('\n')[0] || ''}`)}</div>`) +
    section('comments', 'GitHubコメント', report.githubComments, comment => `<div class="list-item">${link(comment.html_url, comment.body?.slice(0, 160) || 'コメント')} <span class="meta">${esc(comment.created_at)}</span></div>`) +
    section('trouble', 'trouble report', report.troubleshooting, item => `<div class="list-item">${link(item.url, item.subject)} <span class="meta">${esc(item.at)}</span></div>`);
  q('#unfinished').innerHTML = '<h2 class="title is-3 section-title">未完了</h2><p class="meta">全Milestoneに属する全員のOpen項目です。経過時間はレポート生成時点の値です。</p>' +
    section('open-prs', 'Open PR', report.openPullRequests, pr => `<details class="list-item"><summary>${link(pr.url, `#${pr.number} ${pr.title}`)} · assignee: ${esc(assigneeNames(pr).join('、') || '未設定')} · milestone: ${esc(pr.milestone || '未設定')} · 作成から${age(pr.createdAt)}</summary><p class="description">${esc(pr.body || '本文なし')}</p></details>`) +
    section('open-issues', 'Open Issue', report.openIssues, issue => `<details class="list-item"><summary>${link(issue.url, `#${issue.number} ${issue.title}`)} · assignee: ${esc(assigneeNames(issue).join('、') || '未設定')} · milestone: ${esc(issue.milestone || '未設定')} · 作成から${age(issue.createdAt)}</summary><p class="description">${esc(issue.body || '本文なし')}</p></details>`);
}

async function postJson(path, payload) {
  // ローカルサーバはContent-Lengthを文字数として読むため、POST本文をASCIIのJSONにする。
  const body = JSON.stringify(payload).replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
  if (!response.ok) throw new Error('保存できませんでした');
}

const preview = q('#github-preview');
let activePreviewLink = null, previewSequence = 0, previewHideTimer;
const cancelPreviewHide = () => { if (previewHideTimer) clearTimeout(previewHideTimer); previewHideTimer = undefined; };
function hidePreview() {
  cancelPreviewHide();
  activePreviewLink = null;
  previewSequence++;
  preview.hidden = true;
  preview.innerHTML = '';
}
const schedulePreviewHide = () => { cancelPreviewHide(); previewHideTimer = setTimeout(hidePreview, 180); };
function positionPreview(anchor) {
  const bounds = anchor.getBoundingClientRect();
  preview.style.left = `${Math.max(8, Math.min(bounds.right + 12, window.innerWidth - 540))}px`;
  preview.style.top = `${Math.max(8, Math.min(bounds.top, window.innerHeight - 420))}px`;
}
function previewHtml(item) {
  const meta = [`状態: ${item.state || '不明'}`, `作成者: ${item.author || '不明'}`,
    `担当者: ${(item.assignees || []).join('、') || '未設定'}`, `Milestone: ${item.milestone || '未設定'}`,
    `ラベル: ${(item.labels || []).join('、') || 'なし'}`];
  const comments = (item.comments || []).map(comment => `<article class="preview-entry"><strong>${esc(comment.author || '不明')}</strong><small>${esc(comment.createdAt || '')}</small><div class="preview-body">${esc(comment.body || '')}</div></article>`).join('');
  const reviews = (item.reviews || []).map(review => `<article class="preview-entry"><strong>${esc(review.author || '不明')} · ${esc(review.state || '')}</strong><small>${esc(review.submittedAt || '')}</small><div class="preview-body">${esc(review.body || '')}</div></article>`).join('');
  return `<h3>${esc(item.kind === 'pr' ? 'PR' : 'Issue')} #${esc(item.number)} ${esc(item.title || '')}</h3><p>${meta.map(esc).join(' · ')}</p><div class="preview-body">${esc(item.body || '本文なし')}</div>${comments ? `<h4>コメント</h4>${comments}` : ''}${reviews ? `<h4>レビュー</h4>${reviews}` : ''}<p><a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">GitHubで開く</a></p>`;
}
async function showPreview(anchor) {
  cancelPreviewHide();
  if (activePreviewLink === anchor && !preview.hidden) return;
  activePreviewLink = anchor;
  const sequence = ++previewSequence;
  preview.innerHTML = '<p>GitHubの内容を取得しています…</p>';
  preview.hidden = false;
  positionPreview(anchor);
  try {
    const kind = anchor.dataset.previewKind, number = anchor.dataset.previewNumber;
    const response = await fetch(`/api/preview?kind=${kind}&number=${number}`, {cache: 'no-store'});
    if (!response.ok) throw new Error('取得失敗');
    const item = await response.json();
    if (sequence === previewSequence && activePreviewLink === anchor) preview.innerHTML = previewHtml(item);
  } catch (_) {
    if (sequence === previewSequence && activePreviewLink === anchor) preview.innerHTML = '<p>内容を取得できませんでした。リンクからGitHubを開いてください。</p>';
  }
}
document.addEventListener('pointerover', event => {
  const anchor = event.target.closest?.('a[data-preview-kind]');
  if (anchor) showPreview(anchor);
});
document.addEventListener('pointerout', event => {
  const anchor = event.target.closest?.('a[data-preview-kind]');
  if (anchor === activePreviewLink && !anchor.contains(event.relatedTarget)) schedulePreviewHide();
});
document.addEventListener('focusin', event => {
  const anchor = event.target.closest?.('a[data-preview-kind]');
  if (anchor) showPreview(anchor);
});
document.addEventListener('focusout', event => {
  const anchor = event.target.closest?.('a[data-preview-kind]');
  if (anchor === activePreviewLink) schedulePreviewHide();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') hidePreview(); });
preview.addEventListener('pointerenter', cancelPreviewHide);
preview.addEventListener('pointerleave', schedulePreviewHide);

q('#report-select').addEventListener('change', event => { location.search = '?report=' + encodeURIComponent(event.target.value); });
q('#copy-button').addEventListener('click', async () => {
  const plain = overviewText(), html = overviewHtml();
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html], {type: 'text/html'}), 'text/plain': new Blob([plain], {type: 'text/plain'})})]);
    } else {
      await navigator.clipboard.writeText(plain);
    }
    q('#copy-status').textContent = 'コピーしました。';
  } catch (_) {
    try { await navigator.clipboard.writeText(plain); q('#copy-status').textContent = 'URL付きテキストをコピーしました。'; }
    catch (_) { q('#copy-status').textContent = 'コピーできませんでした。ブラウザのクリップボード権限を確認してください。'; }
  }
});
q('#dod-form-items').addEventListener('change', async event => {
  const group = event.target.type === 'checkbox' ? event.target.closest('[data-dod-group]') : null;
  if (group) {
    const id = group.dataset.dodGroup, previous = report.dodAssessment?.[id]?.choices || [];
    const boxes = [...group.querySelectorAll('input[type="checkbox"]')];
    if (event.target.checked) {
      const exclusive = ['no_merged', 'reviewed'];
      for (const box of boxes) if (box !== event.target && (exclusive.includes(event.target.value) || exclusive.includes(box.value))) box.checked = false;
    }
    const choices = boxes.filter(box => box.checked).map(box => box.value);
    const status = q(`#dod-status-${id}`);
    try {
      await postJson('/api/dod-assessment', {item: id, choices});
      report.dodAssessment[id] = choices.length ? {choices} : undefined;
      status.textContent = '保存しました。';
      renderOverview();
    } catch (_) {
      for (const box of boxes) box.checked = previous.includes(box.value);
      status.textContent = '保存できませんでした。再試行してください。';
    }
    return;
  }
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
