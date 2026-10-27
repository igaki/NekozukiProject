---
agent: "agent"
description: "合意した機能案を、登録可能な複数Issueの草案へ分割する"
---

実装はしない。このPromptは、学生との対話を次の2段階で行う。GitHubへの登録、コードの作成、Issueコメントの投稿はしない。

開始前に `docs/project.md` の `PROJECT-CONFIG` にある `app_dir` が設定済みか確認する。未設定なら `/init-project` を実行するよう案内して停止する。

## 入力の確認

最後の入力欄には、次のどちらかを受け取る。

- 開発したい機能の直接の説明
- `/brainstorm` が作成した `docs/temp/brainstorm/<名前>.md` の相対パス

入力が相対パスであり、そのファイルが存在する場合は、最初にファイルを読み、機能名、決まったこと、今回しないこと、未決定事項、今週の最小範囲を短く要約する。その内容を第1段階の入力として使う。ファイルに未決定事項がある場合は、Issue分割の前に必要な質問をする。

入力が機能の直接の説明である場合は、その説明を第1段階の入力として使う。

入力が空欄、意味のある開発内容を含まない、または存在しない Markdown ファイルのパスだけである場合は、Issue分割を始めない。学生に次のどちらかを入力するよう質問して停止する。

1. 開発したい機能の説明
2. `docs/temp/brainstorm/<名前>.md` のような、存在するブレインストーミング結果の相対パス

## 第1段階: Issue分割の相談

学生が入力した機能を、1人が1〜2日で完了できるIssueに分割する。学生の案を別の機能へ置き換えない。各Issueは、利用者が観測できる価値を一つ提供し、可能な限り他の草案Issueへ依存しない単位にする。原則として、テストを除く `src` 以下の新規・変更ファイルが2〜3個程度に収まるよう分割する。4個以上になりそうな場合は、独立して検証可能な縦切りへ再分割できないか検討し、再分割しない場合はその理由を「分割理由」に明記する。テストファイルはこの数に含めないが、各Issueには対応する自動テストの追加・更新を計画する。各Issueについて、`id`、題名、利用者価値、今回しないこと、依存する草案ID、分割理由を表で示す。A1〜A6との関係で不足する情報があれば、質問を最大5個だけ示す。

この段階では `docs/temp/issues.md` を作成・更新しない。最後に「このIssue分割で各Issueの実装計画を作成しますか？」と質問して停止する。

## 第2段階: 実装計画の作成

学生がIssue分割を明示的に承認した場合だけ実行する。`docs/project.md` と関連する既存コード・テストを確認する。現在のプロジェクトだけでは設計または実装方針を判断しにくい場合は、`docs/ref/springboot_samples/` が存在するか確認し、今回の機能に関係するSpring Bootサンプルのファイルだけを読み取り専用で参照する。学生が依頼文に参照の指示を書く必要はない。`docs/ref/springboot_samples/` はローカル参考資料であり、変更、Issueの変更境界への記載、`docs/temp/issues.md` への変更予定ファイルの記載をしてはならない。

参照した場合は、最終報告で「参考にしたファイル」と「採用した考え方」を短く示す。サンプルをそのまま複写せず、`app_dir` で指定されたアプリの構成と対象IssueのACに合わせる。`docs/ref/springboot_samples/` がない場合は、参照なしで続行する。

各Issueについて次を作成する。

1. 変更予定ファイルと変更理由
2. 実装順序
3. 変更しないものとリスク

`docs/temp/` がなければ作成し、下記形式の完全な内容を `docs/temp/issues.md` に作成または上書きする。草案を作成するAIは、すべての `assignee:` と `milestone:` を空欄のままにする。作成後は、Issue数、依存関係、未記入項目、計画上の未解決事項を短く報告する。

作成後、学生に `docs/temp/issues.md` を開いて、各IssueのAC、依存関係、変更境界、実装計画をチームで確認するよう依頼する。確認後は、各Issueの `assignee:` に担当する学生のGitHubログイン名、`milestone:` に既存のlec06～lec14を**学生自身が直接記入**する。AIは担当者やMilestoneを推測して記入してはならない。両方を記入した後に登録スクリプトを実行するよう案内する。どちらかが空欄なら登録スクリプトはIssueを登録せず停止することを注釈する。

作成後は、登録スクリプトを実行する前に、草案の構造が崩れていないかを確認する。これは、Issueブロックや必須見出しが不足した状態で登録すると、登録スクリプトが停止し、学生が修正箇所を探す必要があるためである。

コマンドを示す前に、学生へ次を短く説明する。

- Issueブロック数と各見出し数が同じなら、すべてのIssueに同じ項目がある可能性が高い。
- `Start conditions` は今回の機能に開始条件が含まれる場合だけ、その記述箇所を学生が確認するための検索である。該当しない機能なら「該当なし」と報告してよい。
- `Trailing whitespace` の出力がなければ、行末の不要な空白は見つからなかったことを表す。
- この確認は内容の正しさを保証するものではない。学生はAC、変更範囲、依存関係、実装計画を読んで承認してから登録する。

構造確認には、PortableGitに標準で含まれる `grep` だけを使う。`rg`、`ripgrep`、`git diff --check` は使わず、次を実行して結果を学生に説明してから報告する。`docs/temp/` はGit管理しない一時ファイルなので、`git diff --check` では検査できないためである。

```bash
cd "$(git rev-parse --show-toplevel)"
printf 'ISSUE blocks: '; grep -c '^<!-- ISSUE$' docs/temp/issues.md || true
printf 'AC headings: '; grep -c '^## AC（受け入れ基準）$' docs/temp/issues.md || true
printf 'Plan headings: '; grep -c '^## 実装計画$' docs/temp/issues.md || true
printf 'Start conditions:\n'; grep -n -E '全員が開始ボタン|開始状態' docs/temp/issues.md || true
printf 'Trailing whitespace:\n'; grep -n -E '[[:blank:]]$' docs/temp/issues.md || true
```

`id` は英小文字・数字・ハイフンだけを使う草案内の一意な名前、`title` は他の草案と重複しない題名、`assignee` は担当学生のGitHubログイン名とする。担当者と `milestone` は草案をチームで確認した後に学生自身が直接記入する。`milestone` には既存のlec06～lec14を指定する。`depends-on` は、同じ草案で作るIssueの草案ID、または既にGitHubにあるOpen Issue番号をカンマ区切りで記載できる（例: `database-schema, 12`）。本文にメタデータのコメントを含めない。

```md
# Issue草案

<!-- ISSUE
id: event-page
title: [Feature] イベント詳細画面を表示する
assignee:
milestone:
depends-on:
-->
## 機能の概要

ログイン済み利用者がイベントの詳細を確認できる画面を表示できる。
今回しないこと: 参加登録、定員管理、通知の送信。

## AC（受け入れ基準）

- Given ログイン済み、When `/events/1` を開く、Then イベント詳細が表示される。

## 関連ファイル・変更境界

- 新規: `<アプリフォルダ>/src/main/java/.../EventController.java`
- 新規: `<アプリフォルダ>/src/test/java/.../EventControllerTest.java`

## 実装計画

1. `EventController.java` を追加し、GET `/events/{id}` でイベント詳細を返す。
2. `event.html` を追加し、イベント名と説明を表示する。
3. `EventControllerTest.java` を追加し、ログイン済みと未ログインのACを確認する。

## 変更しないものとリスク

- `SecurityConfig.java` の認証方針は変更しない。
<!-- END ISSUE -->
```

開発内容またはブレインストーミング結果の相対パス:

学生に、チームで内容を確認して各 `assignee:` と `milestone:` を直接記入した後、`bash scripts/issue/register-from-file.sh docs/temp/issues.md` を実行するよう案内して終了する。担当者・Milestoneが未記入、またはMilestoneがGitHub上に存在しない草案では登録しないことを伝える。

${input:featureOrBrainstormFile:開発したい機能を説明するか、docs/temp/brainstorm/ 内のMarkdownファイルの相対パスを入力する。}
