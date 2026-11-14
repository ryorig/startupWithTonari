# SwarmBot（2台 BLE 群制御プロトタイプ）

## ESP32 側
1. Arduino IDE で `esp32/SwarmBot/SwarmBot.ino` を開く（ボード: ESP32 Dev Module、追加ライブラリ不要）
2. 1台目は `#define ROBOT_ID 1`、2台目は `2` にして書き込み → BLE名 `SwarmBot-1` / `SwarmBot-2`
3. 前進でタイヤが逆回転する側があれば `INVERT_A` / `INVERT_B` を `true` に（モーターA=左, B=右）

## アプリ
- `app/index.html` を **Android / PC の Chrome・Edge** で開く（Web Bluetooth は https か localhost が必要。GitHub Pages なら `/robot-swarm/app/` でOK。iPhone は Bluefy アプリ）
- 「1号機 接続」「2号機 接続」でそれぞれペアリング
- モード: **同時**（1つのスティックで2台）/ **1号機** / **2号機** / **個別**（左右2スティックで別々に操作）
- スティック・十字キー・キーボード（矢印/WASD、Space で停止）

## 通信仕様
`M,<左>,<右>\n`（-255〜255）、`S\n` で停止。アプリは 20Hz 送信、ESP32 は 500ms 無通信または切断で自動停止。
