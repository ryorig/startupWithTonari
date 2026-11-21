# SwarmBot（3台 BLE 群制御プロトタイプ）

| 号機 | ボード | スケッチ | 備考 |
|---|---|---|---|
| 1号機 | XIAO ESP32S3 Sense | `esp32/SwarmBot_XIAO_Cam/` | カメラ映像 (Wi-Fi MJPEG) |
| 2号機 | ESP32 DevKit | `esp32/SwarmBot_ESP32_Thermal/` | MLX90640 サーマル (SDA=GPIO21, SCL=GPIO22)・人らしき熱源を検知 |
| 3号機 | ESP32 DevKit | `esp32/SwarmBot_ESP32_ToF/` | VL53L1X 距離センサー（PWMA→GPIO32, PWMB→GPIO33 に配線変更） |

## 書き込み設定
- 1号機: ボード `XIAO_ESP32S3` / PSRAM `OPI PSRAM` / Partition `Huge APP` / USB CDC On Boot `Enabled`
- 2・3号機: ボード `ESP32 Dev Module`
- 3号機: ライブラリマネージャで「Adafruit_VL53L1X」(Adafruit) をインストール

## アプリ起動 (Mac)
```
cd ~/startupWithTonari/robot-swarm/app
git pull
python3 -m http.server 8000
```
Chrome で `http://localhost:8000`（⌘+Shift+R で再読み込み）

- 操作タブ: 手動操作 + 1号機カメラ映像 + 3号機の距離表示
- パスタブ: 隊形を並べて、各区間の移動時間・待機時間を設定 → パス実行（時間制御・センサーなし）

## 通信仕様
App→Robot: `M,<左>,<右>\n`（-255〜255）/ `S\n`
Robot→App: `ID<n> L.. R..` / `IP<アドレス>`（1号機）/ `D<mm>`（3号機）

## 群制御タブ (俯瞰カメラ + AprilTag)
- `apriltags/SwarmBot_AprilTags_A4.pdf` を100%で印刷。ロボットに ID1〜3（上辺=前）、フィールド四隅に ID10(左上)/11(右上)/12(右下)/13(左下)
- Mac のカメラ / iPhone連係カメラ / USBカメラ を真上に設置 → 「カメラ開始」→「コーナータグで校正」
- モード: クリック移動 / 隊形 / リーダー追従 / 円周回 / 集合 / 分散 / パス閉ループ実行（衝突回避・見失い停止つき）
- タグ検出: `app/lib/` の js-aruco2 (MIT) を同梱（小さいタグが読めない不具合を修正済み）

## 🚨 救助ミッションタブ (災害対応デモ)
段階的確認パイプライン: 3号機 (距離センサー) が先行して走査・障害物を地図化 → 2号機 (サーマル) が安全ルートを追従して人らしき熱源を検知 → 1号機 (カメラ) を派遣し AI (COCO-SSD, オフライン同梱) で人か最終判定 → 要救助者を囲んで位置をマーク。
- 🧪 シミュレーション: 仮想の被災現場 (瓦礫・要救助者・おとり熱源) でブラウザだけで検証。配置編集・×8速・一括実験 (段階的確認 vs サーマルだけ)
- 🤖 実機: 群制御タブの俯瞰カメラ (AprilTag) の位置 + BLE のセンサーで同じロジックが動く
- 音声読み上げ・サイレン・捜索レポート (HTML) 出力
- AI モデルは `app/lib/ssd/` に同梱 (http://localhost で開くこと。file:// では読めない)
