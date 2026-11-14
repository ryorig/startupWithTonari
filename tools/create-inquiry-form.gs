/**
 * 隣の高専生｜法人向け 開発相談フォーム 自動作成スクリプト
 *
 * 使い方:
 * 1. https://script.google.com/ で「新しいプロジェクト」を作成
 * 2. このファイルの中身を全部貼り付けて保存
 * 3. 関数「createInquiryForm」を選んで実行（初回のみGoogleアカウントの承認が必要）
 * 4. 実行ログに表示される「回答用URL」をサイトの予約フォーム欄に設定
 */
function createInquiryForm() {
  const form = FormApp.create('【隣の高専生】開発・業務改善のご相談フォーム');
  form.setDescription(
    '隣の高専生（運営：株式会社Ｙｕｕｔｈ）へのご相談フォームです。\n' +
    '要件が固まっていない段階でも大丈夫です。分かる範囲でご記入ください。\n' +
    '内容を確認のうえ、2営業日以内に担当よりご連絡します。\n' +
    '※所要時間：約3分'
  );
  form.setCollectEmail(true);
  form.setProgressBar(true);
  form.setConfirmationMessage(
    'ご相談ありがとうございます。2営業日以内に担当よりご連絡します。\n' +
    'お急ぎの場合は、サイトの予約フォームからオンライン相談の日程をご予約ください。'
  );

  // ── 1. お客様情報 ──
  form.addSectionHeaderItem().setTitle('1. お客様情報');
  form.addTextItem().setTitle('会社名・団体名').setRequired(true);
  form.addTextItem().setTitle('部署・役職');
  form.addTextItem().setTitle('ご担当者名').setRequired(true);
  form.addTextItem().setTitle('電話番号（任意）');
  form.addMultipleChoiceItem().setTitle('業種')
    .setChoiceValues(['製造業', '小売・サービス', 'IT・通信', '自治体・公共団体', '教育機関', '医療・福祉', 'NPO・地域団体'])
    .showOtherOption(true);
  form.addMultipleChoiceItem().setTitle('従業員規模')
    .setChoiceValues(['1〜10名', '11〜50名', '51〜300名', '301名以上']);

  // ── 2. ご相談内容 ──
  form.addPageBreakItem().setTitle('2. ご相談内容');
  form.addCheckboxItem().setTitle('ご相談の種類（複数選択可）').setRequired(true)
    .setChoiceValues([
      '社内向け業務ツールの開発（Excel・紙・手作業の置き換えなど）',
      'MVP・試作品の開発（新規事業の検証）',
      'Webサイト・Webアプリの開発',
      'スマホアプリの開発',
      'AI活用・業務自動化',
      '既存システムの改善・保守',
      '有償技術チャレンジ（課題を出して高専生が提案・試作）',
      '高専生との交流・採用広報（勉強会・ハッカソンなど）',
      'まだ決まっていない・まず話を聞きたい'
    ]);
  form.addParagraphTextItem().setTitle('いま困っていること・実現したいこと').setRequired(true)
    .setHelpText('例：受注管理をExcelで行っており、入力ミスと二重管理が起きている。スマホから入力できる簡単なツールがほしい。');
  form.addParagraphTextItem().setTitle('現在の進め方・使っているツール')
    .setHelpText('例：Excel、紙の台帳、kintone、Googleスプレッドシート など');
  form.addTextItem().setTitle('想定している利用者・人数')
    .setHelpText('例：営業担当10名、店舗スタッフ30名');
  form.addTextItem().setTitle('参考資料のURL（企画書・画面イメージなど・任意）')
    .setHelpText('Googleドライブ等の共有リンクを貼ってください。');

  // ── 3. ご予算・スケジュール ──
  form.addPageBreakItem().setTitle('3. ご予算・スケジュール')
    .setHelpText('未定でも問題ありません。高専生チームならではの進め方で、規模に合わせてご提案します。');
  form.addMultipleChoiceItem().setTitle('ご予算の目安')
    .setChoiceValues(['〜30万円', '30〜100万円', '100〜300万円', '300万円以上', '未定・相談して決めたい']);
  form.addMultipleChoiceItem().setTitle('希望する開始時期')
    .setChoiceValues(['すぐにでも', '1〜3か月以内', '3〜6か月以内', '時期は未定（情報収集中）']);
  form.addMultipleChoiceItem().setTitle('現在の検討状況')
    .setChoiceValues(['発注先を探している', '見積り・概算を知りたい', '社内で検討中（情報収集）', '他社と比較中']);

  // ── 4. その他 ──
  form.addPageBreakItem().setTitle('4. その他');
  form.addMultipleChoiceItem().setTitle('ご希望の連絡方法')
    .setChoiceValues(['メール', 'オンライン面談（Google Meet / Zoom）', '電話']);
  form.addCheckboxItem().setTitle('隣の高専生を知ったきっかけ')
    .setChoiceValues(['Web検索', 'SNS', '新聞・メディア掲載', '知人・取引先の紹介', 'イベント・ピッチ']).showOtherOption(true);
  form.addParagraphTextItem().setTitle('その他・ご質問');
  form.addCheckboxItem().setTitle('個人情報の取り扱い').setRequired(true)
    .setHelpText('ご入力いただいた情報は、ご相談への回答と連絡のためにのみ利用します。')
    .setChoiceValues(['プライバシーポリシーに同意する']);

  Logger.log('編集用URL: ' + form.getEditUrl());
  Logger.log('回答用URL: ' + form.getPublishedUrl());
}
