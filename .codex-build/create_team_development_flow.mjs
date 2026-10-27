import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "file:///C:/Users/Hiroshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const ROOT = "C:/Users/Hiroshi/oithomes/isdev/kadai/isdev26/NekozukiProject";
const SKILL = "C:/Users/Hiroshi/.codex/plugins/cache/openai-primary-runtime/presentations/26.1022.11436/skills/presentations";
const OUT = path.join(ROOT, "docs", "team-development-flow_A-B_final.pptx");
const BUILD = path.join(ROOT, ".codex-build", "ppt-build");
const W = 1280, H = 720;
const FONT = "Yu Gothic";

const C = {
  navy: "#14213D", ink: "#172033", muted: "#536276", bg: "#F6F8FC",
  line: "#CBD5E1", blue: "#2F6BFF", bluePale: "#E8F0FF",
  teal: "#098B8C", tealPale: "#E5F7F5", amber: "#D97706", amberPale: "#FFF4DD",
  red: "#C24150", redPale: "#FDECEE", green: "#238253", greenPale: "#E9F7EF", white: "#FFFFFF"
};

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function text(slide, value, x, y, w, h, size = 18, color = C.ink, opts = {}) {
  const s = slide.shapes.add({
    geometry: "textbox", position: { left: x, top: y, width: w, height: h },
    fill: "none", line: { style: "solid", fill: "none", width: 0 }
  });
  s.text = value;
  s.text.style = { typeface: FONT, fontSize: size, color, bold: !!opts.bold, alignment: opts.align || "left", verticalAlignment: opts.valign || "top" };
  return s;
}

function box(slide, x, y, w, h, fill, line = fill, radius = "rounded-xl") {
  return slide.shapes.add({ geometry: "roundRect", position: { left: x, top: y, width: w, height: h }, fill, line: { style: "solid", fill: line, width: 1 }, borderRadius: radius });
}

function label(slide, value, x, y, w, h, fill, color, size = 15) {
  const s = box(slide, x, y, w, h, fill, fill, "rounded-full");
  s.text = value; s.text.style = { typeface: FONT, fontSize: size, bold: true, color, alignment: "center", verticalAlignment: "middle" };
  return s;
}

function title(slide, value, sub = "") {
  text(slide, value, 64, 38, 930, 52, 32, C.navy, { bold: true });
  if (sub) text(slide, sub, 66, 88, 1040, 28, 16, C.muted);
  const rule = slide.shapes.add({ geometry: "line", position: { left: 64, top: 122, width: 1152, height: 0 }, line: { style: "solid", fill: C.line, width: 1 } });
  return rule;
}

function arrow(slide, from, to, color = C.blue, sides = ["right", "left"]) {
  return slide.shapes.connect(from, to, { kind: "straight", fromSide: sides[0], toSide: sides[1], line: { style: "solid", fill: color, width: 2 }, tail: { type: "arrow", width: "sm", length: "sm" } });
}

function step(slide, n, heading, body, x, y, w, h, who = "A", tone = "blue") {
  const colors = tone === "teal" ? [C.tealPale, C.teal] : tone === "amber" ? [C.amberPale, C.amber] : tone === "red" ? [C.redPale, C.red] : [C.bluePale, C.blue];
  const b = box(slide, x, y, w, h, C.white, C.line);
  label(slide, String(n), x + 14, y + 14, 34, 28, colors[0], colors[1], 15);
  label(slide, who, x + w - 54, y + 14, 38, 28, who === "B" ? C.tealPale : C.bluePale, who === "B" ? C.teal : C.blue, 14);
  text(slide, heading, x + 14, y + 53, w - 28, 26, 18, C.navy, { bold: true });
  text(slide, body, x + 14, y + 83, w - 28, h - 94, 13, C.muted);
  return b;
}

async function build() {
  await fs.mkdir(BUILD, { recursive: true });
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  const p = Presentation.create({ slideSize: { width: W, height: H } });

  // Slide 1
  {
    const s = p.slides.add(); s.background.fill = C.bg;
    label(s, "Spring Boot チーム開発テンプレート", 64, 58, 292, 34, C.bluePale, C.blue, 15);
    text(s, "A と B で進める\nGitHub 開発フロー", 64, 142, 640, 140, 48, C.navy, { bold: true });
    text(s, "初期化からブレーンストーミング、Issue、実装、PR、レビュー、\nデバッグ、マージまで。README に沿って具体的なコマンドと入力例を示します。", 66, 310, 670, 68, 20, C.muted);
    const a = step(s, 1, "開発者 A", "課題を整理し、Issue を実装して PR を作る", 64, 460, 292, 126, "A", "blue");
    const b = step(s, 2, "レビュアー B", "AC・差分・テスト・CI を根拠にレビューする", 388, 460, 292, 126, "B", "teal");
    const c = step(s, 3, "GitHub", "Issue と PR に合意・証跡を残し、main に統合する", 712, 460, 292, 126, "共有", "amber");
    arrow(s, a, b, C.line); arrow(s, b, c, C.line);
    text(s, "対象: NekozukiProject/README.md", 64, 650, 540, 24, 14, C.muted);
    s.speakerNotes.text = "Source: NekozukiProject/README.md";
  }

  // Slide 2
  {
    const s = p.slides.add(); s.background.fill = C.bg;
    title(s, "全体フローと担当", "A と B は、各工程で確認結果を GitHub Issue / PR に残す");
    label(s, "開発者 A", 64, 155, 120, 32, C.bluePale, C.blue, 15);
    label(s, "レビュアー B", 64, 396, 120, 32, C.tealPale, C.teal, 15);
    const xs = [190, 390, 590, 790, 990];
    const headings = ["初期化", "ブレーンストーミング", "Issue 登録", "実装・PR", "レビュー・マージ"];
    const aBodies = ["/init-project\n設定・テスト確認", "/brainstorm\n下書きを保存", "/plan-issues\n担当と AC を登録", "実装・テスト\nPR を作成", "指摘対応\n必要なら debug"];
    const bBodies = ["協働者を確認", "利用者・操作・\n対象外を合意", "AC・担当・依存を\n確認", "PR の根拠を\n読み取れるか確認", "/review-pr\n承認後にマージ"];
    const aBoxes = [], bBoxes = [];
    const cardHeads = ["初期化", "相談", "Issue", "実装・PR", "レビュー"];
    headings.forEach((h, i) => {
      text(s, `${i + 1}. ${h}`, xs[i] - 4, 145, 178, 38, 14, C.navy, { bold: true, align: "center" });
      aBoxes.push(step(s, i + 1, cardHeads[i], aBodies[i], xs[i], 200, 170, 135, "A", i === 4 ? "amber" : "blue"));
      bBoxes.push(step(s, i + 1, cardHeads[i], bBodies[i], xs[i], 440, 170, 135, "B", i === 4 ? "amber" : "teal"));
      arrow(s, aBoxes[i], bBoxes[i], C.line, ["bottom", "top"]);
      if (i > 0) { arrow(s, aBoxes[i - 1], aBoxes[i]); arrow(s, bBoxes[i - 1], bBoxes[i], C.teal); }
    });
    text(s, "点線ではなく矢印が示すもの: 次の工程へ進むために必要な確認。Issue の AC が判断の基準。", 210, 630, 920, 28, 15, C.muted, { align: "center" });
    s.speakerNotes.text = "Source: NekozukiProject/README.md sections 0-7";
  }

  // Slide 3
  {
    const s = p.slides.add(); s.background.fill = C.bg;
    title(s, "A が行う準備、計画、実装、PR 登録", "例は README の「学内イベントに参加登録する機能」を用いる");
    const one = step(s, 1, "初期化", "入力: /init-project\n検査: bash scripts/harness/init-project.sh --check\n確定: bash scripts/harness/init-project.sh --initialize", 64, 150, 350, 190, "A", "blue");
    const two = step(s, 2, "ブレーンストーミング", "入力例:\n/brainstorm 学内イベントで、参加者が同じ企画に参加登録できる機能を追加したいです。\n\n結果を docs/temp/brainstorm/…md に保存", 465, 150, 350, 190, "A", "blue");
    const three = step(s, 3, "Issue 作成・登録", "入力: /plan-issues docs/temp/brainstorm/round-choice.md\n下書き確認後に assignee: を記入\n登録: bash scripts/issue/register-from-file.sh docs/temp/issues.md\n確認: bash scripts/issue/ready.sh", 866, 150, 350, 190, "A", "blue");
    arrow(s, one, two); arrow(s, two, three);
    const four = step(s, 4, "実装とテスト", "git status\nbash scripts/issue/ready.sh\n\n入力: implement-issue Skill を使って、担当する Issue #12 の実装を始めたいです。\n\n./gradlew test / ./gradlew bootRun", 64, 415, 350, 180, "A", "amber");
    const five = step(s, 5, "PR 本文", "入力: /prepare-pr このブランチの PR 本文を作成したいです。\n\ndocs/temp/pr-12.md の AC 確認結果とテスト結果を確認", 465, 415, 350, 180, "A", "amber");
    const six = step(s, 6, "PR 登録", "変更をコミットした後:\ncd \"$(git rev-parse --show-toplevel)\"\nbash scripts/pr/create-pr.sh\n\nPR を B にレビュー依頼", 866, 415, 350, 180, "A", "amber");
    arrow(s, five, six, C.amber); arrow(s, three, four, C.amber, ["bottom", "top"]); arrow(s, four, five, C.amber);
    text(s, "チェックポイント: GitHub Issue の AC が実装開始時の正式な仕様。docs/temp は下書きで Git に登録しない。", 132, 636, 1010, 24, 15, C.red, { align: "center", bold: true });
    s.speakerNotes.text = "Source: NekozukiProject/README.md sections 1-5";
  }

  // Slide 4
  {
    const s = p.slides.add(); s.background.fill = C.bg;
    title(s, "B のレビュー、デバッグの往復、PR マージ", "レビューの根拠は AI の評価ではなく、Issue の AC・差分・テスト・CI");
    const r = step(s, 1, "PR をレビュー", "入力: /review-pr\n\n補助コマンド:\ngh pr list\ngh pr view 12\ngh pr diff 12\ngh pr checks 12", 80, 162, 300, 195, "B", "teal");
    const q = step(s, 2, "根拠つきコメント", "例:\nAC 2 の「満室なら参加できない」について、PR 本文から確認方法と結果を読み取れません。\n確認方法と結果を追記してください。", 490, 162, 300, 195, "B", "teal");
    const fix = step(s, 3, "A が修正・再確認", "通常の指摘: 修正、テスト、PR 本文更新\n\n失敗・原因不明なら debug Skill:\n「期待結果／実際の結果／再現手順／エラー全文」を提示", 900, 162, 300, 195, "A", "red");
    arrow(s, r, q, C.teal); arrow(s, q, fix, C.teal);
    const debug = step(s, 4, "debug Skill で原因を確認", "入力例:\ndebug Skill を使ってください。Issue #12 の AC は「満室なら追加参加できない」ですが、./gradlew test で次の失敗が出ました: (エラー全文)\n\n原因・修正範囲・再発防止テストを確認してから承認", 900, 425, 300, 180, "A", "red");
    const merge = step(s, 5, "B が承認し、PR をマージ", "確認項目:\n• すべての AC に確認結果がある\n• PR 本文の必須項目が埋まっている\n• CI が成功している\n• 著者以外の学生が承認している", 390, 425, 400, 180, "B", "amber");
    arrow(s, fix, debug, C.red, ["bottom", "top"]); arrow(s, debug, merge, C.green);
    text(s, "修正後は B が AC・差分・テスト・CI を再確認し、条件がそろったらマージする。", 160, 642, 960, 24, 15, C.green, { align: "center", bold: true });
    s.speakerNotes.text = "Source: NekozukiProject/README.md sections 6-7";
  }

  // Draft export and previews
  for (const [i, slide] of p.slides.items.entries()) {
    await writeBlob(path.join(BUILD, `slide-${String(i + 1).padStart(2, "0")}.png`), await p.export({ slide, format: "png", scale: 1 }));
  }
  const candidate = path.join(BUILD, "team-development-flow_A-B.candidate.pptx");
  await (await PresentationFile.exportPptx(p)).save(candidate);

  const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL, "container_tools", "artifact_tool_utils.mjs")).href);
  const result = await finalizePresentation({
    explicitTotalSlideCount: 4,
    workspaceDir: ROOT,
    candidatePath: candidate,
    finalPath: OUT,
    pythonExecutable: "C:/Users/Hiroshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
    integrityValidatorPath: path.join(SKILL, "container_tools", "inspect_presentation_package_integrity.py"),
    layoutValidatorPath: path.join(SKILL, "container_tools", "inspect_presentation_layout_geometry.py"),
    layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry", "--validate-heading-fit"],
    fontPolicy: { basis: "design", families: [FONT] },
    verifyArtifactToolImport: true,
    receiptPath: path.join(BUILD, "team-development-flow_A-B_final.validation.json")
  });
  console.log(JSON.stringify({ out: OUT, result }, null, 2));
}

build().catch(err => { console.error(err); process.exitCode = 1; });
