# 配布対象外の作業ファイル

このディレクトリはテンプレートの作成・検証に使うファイルをまとめたものです。学生に配布する前に、ディレクトリごと手動で削除してください。`nekoselect/` は対象外です。

- `tests/test-milestone-registration.js`: Issue・PR登録時とIssue Milestone検査のモックテスト
- `tests/test-weekly-summary.js`: 週次集計と閲覧画面のモックテスト
- `.codex-build/`: チーム開発フロー資料の作成スクリプトと中間生成物

検証時はリポジトリのルートから `node not-for-distribution/tests/test-milestone-registration.js` と `node not-for-distribution/tests/test-weekly-summary.js` を実行します。Windowsでは必要に応じて `PORTABLE_GIT_BASH` に Git Bash の実行ファイルを指定します。
