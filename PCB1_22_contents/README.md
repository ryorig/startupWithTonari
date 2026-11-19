# PCB1_22.epro2 の中身

EasyEDA Pro のプロジェクトファイル（`.epro2`）は、中身がZIPになっています。
それを展開して、人が読める形に並べ直したものです。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `preview_easyeda.png` | EasyEDA が保存していたプレビュー画像 |
| `layout_top_bottom.png` | 基板データから描き直した表面・裏面の図（パッド、配線、ビア、GNDベタ） |
| `project2.json` | プロジェクト情報（名前 PCB1、EasyEDA 3.2.209） |
| `documents/` | 本体（PCB1.epru）を27個のデータに分けて整形したJSON |

### documents/ の中身
| 番号 | 種類 | 内容 |
|---|---|---|
| 00〜08 | DEVICE | 部品の情報（型番、メーカー、LCSC番号など） |
| 09〜17 | SYMBOL | 回路図記号（ピン名とピン番号） |
| 18〜25 | FOOTPRINT | フットプリント（パッドの位置と大きさ。単位はmil） |
| 26 | PCB | 基板本体（部品の配置、配線、ビア、ベタ、外形、デザインルール） |

※ 回路図（SCH）は、このファイルに含まれていません。

## 部品表（BOM）

| Ref | 型番 | メーカー | LCSC | 値・内容 | パッケージ |
|---|---|---|---|---|---|
| U1 | MAX30102EFD+T | ADI/Maxim | C6454833 | 心拍・SpO2センサー | OESIP-14 |
| U2 | TMP117AIDRVR | TI | C699536 | 高精度温度センサー | WSON-6 |
| U3 | XC6206P182MR | TOREX | C21659 | 1.8V LDO | SOT-23-3 |
| C1, C4, C6 | CL05B104KO5NNNC | Samsung | C1525 | 100nF | 0402 |
| C2, C3 | CL05A105KA5NQNC | Samsung | C52923 | 1uF | 0402 |
| C5 | CL10A106KP8NNNC | Samsung | C19702 | 10uF | 0603 |
| R1, R2, R3 | 0402WGF4701TCE | UNI-ROYAL | C25900 | 4.7kΩ | 0402 |
| CN2 | SM04B-SRSS-TB(LF)(SN) | JST | C160404 | SH 4ピン | SMD |
| P1 | 2.54-1*1P | BOOMELE | C81276 | 1ピンヘッダー (INT) | THT |

## 接続表（ネットリスト）

| ネット | 接続ピン |
|---|---|
| 3V3 | CN2.2, U1.9, U1.10, U2.5, U3.3, C1.1, C2.1, C5.1, C6.1, R1.2, R2.2, R3.2 |
| 1.8V | U3.2, U1.11, C3.1, C4.1 |
| GND | CN2.1, U1.4, U1.12, U2.2, U2.4, U3.1, C1.2〜C6.2 |
| SDA | CN2.3, U1.3, U2.6, R1.1 |
| SCL | CN2.4, U1.2, U2.1, R2.1 |
| INT | P1.1, U1.13, R3.1 |
| 未接続 | U1.1, U1.5〜U1.8, U1.14, U2.3 (ALERT), U2.7 (EP), CN2.5, CN2.6 |

## 基板

- 2層、1.6mm、外形 約10.0 × 20.7mm
- GNDベタ：表面に1つ、裏面に2つ
- I2Cアドレス：MAX30102 = 0x57、TMP117 = 0x48
