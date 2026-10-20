# Issue草案

以下は、現在のラウンド機能のIssue（#16、#17）の分け方に沿った草案例である。`assignee`、題名、依存関係は登録前にチームの状況に合わせて変更する。

<!-- ISSUE
id: round-result
title: [Feature] 全員の入力後に共通の犬の手と勝敗を確定する（例）
assignee: student-a
depends-on:
-->
## 機能の概要

同じラウンドの全参加者が手を入力した場合だけ、犬の手を一つ決定して保存し、参加者ごとの勝敗を確定できるようにする。
今回しないこと: 結果画面の操作、リアルタイム通信、予測ボーンなどのアイテム効果。

## AC（受け入れ基準）

- Given 未入力の参加者がいるラウンド、When 結果を確認する、Then 犬の手と勝敗は確定せず入力待ちになる。
- Given 全参加者が入力済みのラウンド、When 結果を確認する、Then 犬の手がグー・チョキ・パーから一つ選ばれて保存される。
- Given 犬の手が決定済みのラウンド、When 結果を再確認する、Then 犬の手は変更されない。
- Given 同じラウンドの複数参加者、When 結果を確認する、Then 全員に同じ犬の手に基づく勝敗が返る。

## 関連ファイル・変更境界

- 更新: `inujanken/src/main/java/inuzuki/is/inujanken/game/GameRoundService.java`
- 更新: `inujanken/src/main/java/inuzuki/is/inujanken/game/GameRoundMapper.java`
- 更新: `inujanken/src/main/resources/templates/game-result.html`
- テスト: `inujanken/src/test/java/inuzuki/is/inujanken/game/` 配下のServiceテスト。

## 実装計画

1. `GameRoundService.java` に全員入力の判定と、結果を一度だけ確定する処理を追加する。
2. `GameRoundMapper.java` に犬の手とラウンド状態の更新・取得を追加する。
3. `game-result.html` に入力待ちと確定した結果を表示する。
4. 固定可能な乱数を使い、未完了、確定、再確認時の不変性をテストする。

## 変更しないものとリスク

- 参加者の手を送信する画面と処理は変更しない。
- 犬の手はラウンドごとに参加者全員で共通とする。
- 同時アクセスに対する高度な排他制御は対象外とする。
<!-- END ISSUE -->

<!-- ISSUE
id: round-result-screen
title: [Feature] ラウンドの入力待ちと結果表示を画面で確認できる（例）
assignee: student-b
depends-on: round-result
-->
## 機能の概要

ラウンドの入力後、入力待ちまたは確定済みの結果を画面から確認できるようにする。
今回しないこと: WebSocket、SSE、途中退出、制限時間、画面の大幅なデザイン変更。

## AC（受け入れ基準）

- Given 対戦中の参加者、When ラウンド画面を開く、Then グー・チョキ・パーを選択できる。
- Given 一部の参加者だけが入力済み、When 結果を確認する、Then 入力待ち状態が表示される。
- Given 全参加者が入力済み、When 結果を確認する、Then 犬の共通の手と自分の勝敗が表示される。
- Given 結果が確定したラウンド、When 画面を再読み込みする、Then 同じ犬の手と勝敗が表示される。
- Given 未認証の利用者、When ラウンド画面を開く、Then 既存の認証処理によりログイン画面へ遷移する。

## 関連ファイル・変更境界

- 更新: `inujanken/src/main/java/inuzuki/is/inujanken/game/GameRoundController.java`
- 更新: `inujanken/src/main/resources/templates/game-round.html`
- 更新: `inujanken/src/main/resources/templates/game-result.html`
- テスト: `inujanken/src/test/java/inuzuki/is/inujanken/game/` 配下のMockMvcテスト。

## 実装計画

1. `GameRoundController.java` に入力待ち・結果表示の画面遷移を追加する。
2. `game-round.html` に手の選択フォームと入力済み状態を追加する。
3. `game-result.html` に犬の手、参加者の手、勝敗または入力待ちを表示する。
4. MockMvcで入力画面、入力待ち画面、結果画面、未認証時の遷移を確認する。

## 変更しないものとリスク

- 既存のルーム参加画面と参加者一覧の仕様は変更しない。
- 結果は全員の入力後に画面更新して取得する。
- 予測ボーン機能は実装しない。
<!-- END ISSUE -->
