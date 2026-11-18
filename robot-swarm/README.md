# SwarmBot（3台 BLE 群制御プロトタイプ）

| 号機 | ボード | スケッチ | 備考 |
|---|---|---|---|
| 1号機 | XIAO ESP32S3 Sense | `esp32/SwarmBot_XIAO_Cam/` | カメラ映像 (Wi-Fi MJPEG) |
| 2号機 | ESP32 DevKit | `esp32/SwarmBot_ESP32/` | |
| 3号機 | ESP32 DevKit | `esp32/SwarmBot_ESP32_ToF/` | VL53L1X 距離センサー（PWMA→GPIO32, PWMB→GPIO33 に配線変更） |

## 書き込み設定
- 1号機: ボード `XIAO_ESP32S3` / PSRAM `OPI PSRAM` / Partition `Huge APP` / USB CDC On Boot `Enabled`
- 2・3号機: ボード `ESP32 Dev Module`
- 3号機: ライブラリマネージャで「VL53L1X」(Pololu) をインストール

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
