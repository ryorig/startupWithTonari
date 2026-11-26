# SwarmBot — 災害対応 群ロボット (引き継ぎメモ)

このフォルダは、ESP32 製の小型ロボット3台を Bluetooth (BLE) で群制御するプロトタイプ。
発表会向けの「災害救助デモ」が目標。ユーザーは日本語で会話する。Mac + Chrome + Arduino IDE を使用。

## 機体と役割
| 号機 | ボード | スケッチ | 役割 / センサー |
|---|---|---|---|
| 1号機 | XIAO ESP32S3 Sense | `esp32/SwarmBot_XIAO_Cam/` | 確認担当。カメラ (Wi-Fi MJPEG)。アプリ側 AI (COCO-SSD) で人物判定 |
| 2号機 | ESP32 DevKit | `esp32/SwarmBot_ESP32_Thermal/` | 熱探知担当。MLX90640 (D110, 110°) で人らしき熱源を検知 |
| 3号機 | ESP32 DevKit | `esp32/SwarmBot_ESP32_ToF/` | 探索担当。VL53L1X 距離センサー。前進中 15cm 以内で自動停止 |

### 配線
- 共通 (DevKit): AIN1=18, AIN2=19, PWMA=25, BIN1=16, BIN2=17, PWMB=26, STBY=23, TB6612 VCC=3V3, GND 共通, モーター電池+ → VM のみ
- 2号機: MLX90640 SDA=GPIO21, SCL=GPIO22, VIN=3V3。モーター方向は INVERT_A/B = true (前後逆だったため)
- 3号機: **PWMA→GPIO32, PWMB→GPIO33 に移動** (25/26 を I2C に使うため)。VL53L1X SDA=25, SCL=26。ライブラリ Adafruit_VL53L1X
- 1号機 (XIAO): AIN1=D0, AIN2=D1, PWMA=D2, BIN1=D3, BIN2=D4, PWMB=D5, STBY=D6 (D8〜D10 は SD と共用なので不使用)。
  モーター PWM は LEDC ch4/5 固定 (カメラが ch0 を使う)。Arduino 設定: XIAO_ESP32S3 / PSRAM=OPI / Partition=Huge APP / USB CDC On Boot=Enabled
- Arduino-ESP32 core 3.3.x を使用 (ledcAttach / ledcAttachChannel)

- 連結器 (`hardware/coupler_v9/`): サーボ信号 DevKit=GPIO27 / XIAO=D7 (LEDC ch6)。サーボは 5V 給電 (3V3 から取らない)。
  BLE: `K1` ロック / `K0` 解除 / `KA<度>` 角度 / `KL<度>` `KU<度>` ロック・解除角 / `K?` 問合せ → 通知 `K1`/`K0`。共通コード `SwarmCoupler.h` は3スケッチに同じものを置く

### BLE プロトコル (Nordic UART 風 UUID 6e400001-…)
- App→Robot: `M,<左>,<右>\n` (-255〜255) / `S\n`。500ms 無通信 or 切断で停止。BLE 名 `SwarmBot-<ID>`
- Robot→App (通知は20バイト以内): `ID<n> L.. R..` / 1号機 `IP<addr>`, `CAM OK|NG` / 2号機 `H<方位>,<温度x10>,<画素数>,<確度>,<幅>` or `H-` と熱画像16x12 (先頭バイト 0x80|分割番号0〜10 のバイナリ11パケット) / 3号機 `D<mm>` or `D-`

## アプリ (`app/`) — 静的 HTML/JS、ビルド不要
起動: `cd app && python3 -m http.server 8000` → Chrome で **http://localhost:8000** (file:// や [::] ではBLE/AIが動かない)
- `index.html`: 🎮操作 (手動・3台同時/個別、1号機カメラ表示、3号機距離) / 🗺パス (隊形の流れを時間制御で実行) / BLE 接続・送信ループ (20Hz)
- `swarm.js`: 🛰群制御。俯瞰カメラ + AprilTag (tag36h11, ロボット=ID1〜3, 四隅=ID10〜13) でホモグラフィー校正 → 閉ループ制御 (隊形/リーダー追従/円周回/集合/分散/パス閉ループ)
- `mission.js`: 🚨救助ミッション。段階的確認パイプライン 3号機走査→2号機熱検知→1号機派遣→AI判定→救助隊形。A*経路計画、行き詰まり検知、別角度から再確認、音声/サイレン、レポート出力。🧪シミュレーション(仮想現場・一括実験)と🤖実機モード
- `lib/`: js-aruco2 (MIT, **小さいタグが読めない不具合を修正済み** — aruco.js の `[SwarmBot patch]`), tf.min.js + coco-ssd + `ssd/` モデル (オフライン用に同梱)
- `apriltags/`: 印刷用 PDF・PNG
- `coupler-core.js` / `coupler.js`: 🔗連結走行。どの号機でも任意の順で連結 (列指定 "2-1-3", "3-1, 2")。
  ヒンジ連結はトラクタ・トレーラの拘束式 (後ろの機体の前ピン速度 = 前の機体の後ピン速度) で各機体の指令を計算、固定連結は剛体として車輪速度を計算。
  折れ角は俯瞰カメラで測れればそれを、無ければ指令から推定。折れすぎ (ジャックナイフ) で自動減速。
  操作タブ「🔗 連結」(仮想プレビュー付き) / 群制御タブ「🔗 連結列で移動」「自動ドッキング」「分離」
  検証: `node app/test/coupler-sim.test.js` (引きずり 29.6→2.3 cm/s、従来方式は 180° 折れる)。ブラウザで自動ドッキング 3/3 成功 (ピン誤差 ≤1.1cm, モーター差 ±12%)
- `gamepad.js`: 🎮 コントローラー (Switch Pro / Xbox / PS, Gamepad API standard mapping)。割り当て表 GP_MAP、画面右上の「🎮」or `?` キーで図付き一覧。
  Lスティック走行 / Rスティック旋回 / 十字キー定速 / ZR最高速 / ZLゆっくり / L・R 機体切替 / B・HOME・キャプチャ 停止 / X ロック / Y 解除 / A 速度段階 / R押込 カメラ / +・− 画面切替
  ※ Switch Pro の実機ボタン番号は未確認 (擬似コントローラーで検証済み)
- UI 配色ルール (ISA-101 HMI 流): 背景グレー #2b2b2b、色は状態だけ (OK #2ecc40 / 警告 #ffb000 / 停止 #e00000 / 選択 #0074d9)、号機色 1=橙 #f58231 2=緑 #3cb44b 3=青 #5a8cff。
  書体: 和文ヒラギノ角ゴ (本文W3/見出しW6)、ボタン・数字・英字は DIN (等幅数字)。絵文字アイコンは UI に使わない (救助シミュの現場の人・人形・火だけ例外)。
  グラデーション・発光・紫系は使わない。STOP は常に右上 (スマホは右下に丸ボタン)
- 検証: Playwright で擬似カメラ/擬似ロボットのシミュレーションを回して確認してきた。一括実験 (20回) では段階的確認が サーマルのみ と同じ発見率で誤報を 22件→1件 に削減

## 未確認・注意
- ESP32 スケッチ3本は Mac の arduino-cli (esp32 core 3.3.12) でコンパイル成功 (2026-11-26)。実機書き込み・サーボ角・連結部寸法 (トレッド/ピン距離/最高速) は未確認
- 1号機カメラが映らない件: PSRAM 無効でも動くよう修正、確認ページ `http://192.168.4.1/` を追加。実機で未確認
- **ESP32 が単体でも発熱して故障** (2回目)。原因候補: USB とモーター電池を両方つないだまま抜き差し / TB6612 故障で VM が VCC に流入 / ジャンパー線のショート。
  ユーザーには「電池にスイッチ、書き込み時は電池OFF、TB6612 の VM-VCC 導通確認」を案内済み。新しいボードを入れる前に原因確認を優先すること

## 開発メモ
- ブランチ `claude/epic-newton-lj3kbu` で作業してきた (このリポジトリ本体は Web サイト。robot-swarm/ 以外は触らない)
- ユーザーはコード全文をチャットに貼ってほしがることが多い (Arduino IDE にコピペするため)
