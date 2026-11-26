# UI リサーチ (2026-11-26, 計 約100件)

Web 検索で集めた実在の操作画面・規格。各項目の URL は検索結果で確認したもの (多くはページ全文ではなく検索結果の要約から)。

## 1. ロボット・ドローン (27件)
Boston Dynamics Spot (E-Stop / Quick stop), DJI Fly, DJI UX SDK 帰還ウィジェット, DJI フォーラム (中央を隠すオーバーレイへの不満), DJI Pilot 2 PFD, DJI RC Pro, Autel Explorer, Skydio, Parrot FreeFlight 7, QGroundControl (スライドで確定 / 準備インジケーター), Mission Planner, FRC Driver Station (Space で停止・有効化は3キー), Foxglove Teleop (中央停止の十字), Formant, Freedom Pilot, OTTO Fleet Dashboard, OTTO ライトストリップ, UR PolyScope, ABB FlexPendant, KUKA smartPAD (安全接続中だけ光る非常停止), Fanuc Tablet TP, ANYbotics ANYmal, Agility Arc, Unitree Go2, Sphero Edu, RoboMaster

## 2. ゲーム・コントローラー (25件)
Xbox Cloud Gaming タッチ (TAK), Xbox 場面別レイアウト, PS Remote Play, Steam Link (パッド接続でタッチを隠す), Better xCloud, Switch OS (操作ごとの音), Switch UI, Switch Pro (マット化), DualSense (ライトバー), DualSense ハプティクス, Xbox Elite 2, DualSense Edge 比較, Steam Deck, Backbone, Razer Nexus, Razer PC Remote Play, CoD Mobile, PUBG Mobile HUD, 原神, Fortnite HUD, Fortnite UEFN, Brawl Stars, Rocket League Sideswipe, Gran Turismo 7 (機械的で控えめ), Teenage Engineering OP-1 / Leica FOTOS / Apple GCVirtualController

## 3. 産業HMI・車載・航空宇宙・高級UI (25件 + 6件)
ISO 13850 配色 (Pilz), Schneider FAQ, Control Design (画面のアイコンは非常停止にならない), ISA-101 Going Gray, ISA-101 色戦略, Tatsoft, Ignition, Emerson, Siemens WinCC Unified, Rockwell Optix, Schneider EcoStruxure, Tesla UI 批評, Porsche Taycan, Mercedes MBUX, Rivian, Lucid, BMW iDrive 8, Polestar, CarPlay 次世代, SpaceX Crew Dragon (物理アボートハンドル), Garmin G1000 警報, Apple HIG ダーク, visionOS マテリアル, Material ダーク, IBM Carbon / Linear, Vercel Geist, Raycast, Teenage Engineering, Leica M11, Nothing (Ndot)

## 4. 群・艦隊・RTS (25件)
StarCraft II, Halo Wars 2, Pikmin 4, Company of Heroes 3, Total War, Age of Empires IV, XCOM 2, Into the Breach, Frostpunk (ラジアル), Mini Motorways, Factorio, Kerbal Space Program (ドッキング), Anduril Lattice, Shield AI Hivemind, Auterion Nemyx, Verge Aero, SPH Drone Show, Locus, MiR Fleet, Formant, InOrbit, OTTO Fleet Manager, Zipline, ROS 2 Nav2 / RViz, FlytBase

## アプリに入れたこと
| 調査からの結論 | 根拠 | 実装 |
|---|---|---|
| 赤+黄は STOP 専用。キャップに文字を入れず台座に書く | ISO 13850 (Pilz, Schneider) | 黄色い台座に赤いキノコ型の STOP |
| 止めるのは一押し、動かし始めるのは慎重な操作 | FRC, QGroundControl, DJI RC Pro, ISO 13850 のリセット規定 | 押した瞬間に停止・ラッチ、再開は 1.2 秒長押し (コントローラーは A 長押し) |
| 画面の STOP は安全装置ではない | Control Design, Foxglove, Dragon | 物理の電池スイッチを本当の非常停止として案内 |
| 準備状態を 緑/黄/赤 + 文字で常に見せる | QGroundControl, OTTO, Spot | ヘッダーに「準備OK 3/3」 |
| 艶なしのマット、奥行きは層の明るさで | Switch 2 Pro, Carbon, Material, Apple | 面を l0〜l4 の5段のグレーに整理、強い艶と影を削除 |
| 色は状態と号機だけ | ISA-101, Emerson | 号機は小さな色の印だけ、選択は白反転 |
| 操作ごとに音で確認 | Switch OS, DualSense | 短いクリック音 / 停止音 |
| パッドをつないだら画面のパッドを控えめに | Steam Link, GCVirtualController | 接続中は画面のスティックを薄く表示 |

## 次の候補 (群制御タブ)
マップを画面いっぱいに、号機カードを端に固定 (Mini Motorways, InOrbit) / 数字キー 1・2・3・4 で選択 (StarCraft II) / 動く前に矢印で予定を表示 (Into the Breach) / ドラッグで目標の向きも指定 (RViz)

## 使用している写真素材
| ファイル | 内容 | 出典・条件 |
|---|---|---|
| `app/img/procon.jpg` | Nintendo Switch Pro コントローラー (割り当て画面) | Evan-Amos / Wikimedia Commons「Nintendo-Switch-Pro-Controller-FL.jpg」パブリックドメイン (API で確認)。製品は任天堂の商標 |
| `app/img/rubble.jpg` | 真上から見た瓦礫 (パス・群制御のフィールド背景) | ぱくたそ (YUKIR20505_38) 無料・商用可。素材単体の再配布は不可 → リポジトリは非公開のまま扱う |
