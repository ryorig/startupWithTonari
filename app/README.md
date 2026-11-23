# 隣の高専生 アプリ UI（プロトタイプ）

Figma「改善案（To-Be）」のデザインを、そのまま操作できる形にした Web アプリです。
公開後は `https://tonari.ac/app/` で開けます（`main` に入ると GitHub Pages で配信されます）。

- 画面ごとに URL があります（例: `#home` `#search` `#hiroba` `#project` `#mypage`）。共有リンクから直接開けます。
- データはデモ用です。参加・いいね・送ったメッセージ・通知設定は、その端末のブラウザにだけ保存されます（Firestore とはまだつながっていません）。
- 最初から試すには、ブラウザのサイトデータを消すか、別のブラウザ（シークレットウィンドウ）で開いてください。

## 素材
- アイコン: Phosphor Icons（MIT）
- イラスト: Humaaans / Pablo Stanley（CC0）を元に配色を変更
- 背景の図形: tonari.ac の `assets/lp/hero-shapes.svg`
- フォント: IBM Plex Sans JP（見出し）/ Noto Sans JP（本文）/ Kumbh Sans（数字・英字）— Google Fonts

## 動作確認
すべての画面・ボタンと、利用者ごとの操作の流れを自動で確認するテストがあります。

```bash
cd app/tests
node e2e.js      # 全画面・全ボタン・利用者ごとの操作の流れ（170項目）
node sw.test.js  # オフライン用の仕組み（sw.js）との組み合わせ（11項目）
```

Playwright（Chromium）が必要です。`sw.test.js` はテストの中で一時的にWebサーバーを起動し、終わると止めます。
`fixtures/sw-v79.js` は修正前の sw.js で、以前サイトを開いたことがある人の状態を再現するために使います。
