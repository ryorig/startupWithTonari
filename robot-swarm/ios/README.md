# SwarmBot iPhone アプリ (SwiftUI / CoreBluetooth)

## ビルド手順（Mac + Xcode 15 以降, iOS 16+）
1. Xcode → File > New > Project → iOS **App**（Interface: SwiftUI, 名前: SwarmBot）
2. 自動生成された `ContentView.swift` と `SwarmBotApp.swift` を削除し、このフォルダの3ファイル
   (`SwarmBotApp.swift` `ContentView.swift` `BLEManager.swift`) をドラッグして追加
3. ターゲット → **Info** タブで項目を追加
   - `Privacy - Bluetooth Always Usage Description` = `ロボットと接続するために使用します`
4. Signing & Capabilities で自分の Apple ID の Team を選択
5. iPhone を USB 接続して ▶ 実行（初回は iPhone の 設定 > 一般 > VPNとデバイス管理 で開発者を信頼）

※ 無料Apple IDだと7日ごとに再インストールが必要です。シミュレータではBluetoothは使えません。

## 使い方
- 「1号機」「2号機」をタップすると自動で `SwarmBot-1/2` を探して接続（切断時は自動再接続）
- モード: 同時 / 1号機 / 2号機 / 個別（2組のスティック+十字キー）
- 通信仕様は ESP32 側と同じ（`M,左,右` / `S`、20Hz）
