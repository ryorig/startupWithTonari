/*
 * SwarmCoupler.h — 連結器 (coupler_v9: フック + フォーク + サーボ駆動ゲート) の共通コード
 * 3機とも同じファイルを使います (各スケッチのフォルダに同じものを置いてある)。
 *
 * コマンド (App → Robot, 改行区切り):
 *   K1        … ロック (ゲートを閉じてピンを保持)
 *   K0        … 解除   (ゲートを開く)
 *   KA<角度>  … 角度を直接指定 (0〜180, 調整用)
 *   KL<角度> / KU<角度> … ロック角 / 解除角を設定 (電源を切るまで有効)
 *   K?        … 状態を問い合わせ
 * 通知 (Robot → App): "K1" / "K0" / "KA<角度>"
 *
 * ★ 配線: サーボ信号 → COUPLER_SERVO_PIN、サーボ電源 → 5V (モーター電池側のレギュレータ等)。
 *   ESP32 の 3V3 からサーボを給電しないこと (電圧降下・発熱の原因)。GND は共通にする。
 *   サーボの電源線の根元に 470µF 程度のコンデンサを入れると BLE が切れにくくなります。
 * ★ 発熱・電流対策のため、動かした後 COUPLER_HOLD_MS で PWM を止めます (ゲートは機構で保持)。
 */
#pragma once
#include <Arduino.h>

#ifndef COUPLER_LEDC_CH
#define COUPLER_LEDC_CH -1          // -1 = 自動割当 (XIAO はカメラと衝突しないよう 6 を指定)
#endif

namespace coupler {

const int   SERVO_HZ  = 50;
const int   SERVO_RES = 14;          // 0..16383
const uint32_t HOLD_MS = 700;        // 動かしてから PWM を切るまで
int pin = -1;
int lockDeg = 90, unlockDeg = 10;    // ★ 実機で KA で確かめて書き換える
int curDeg = -1;
bool locked = false, attached = false;
bool dirty = false;                  // 状態が変わった → loop で通知
uint32_t movedMs = 0;
volatile int pendingDeg = -1;         // BLE タスクから受け取り、loop 側でサーボを動かす

inline void writeDeg(int deg) {
  deg = constrain(deg, 0, 180);
  // 0.5ms〜2.5ms のパルス (SG90 系)
  uint32_t us = 500 + (uint32_t)deg * 2000 / 180;
  uint32_t duty = us * ((1UL << SERVO_RES) - 1) / 20000UL;
  if (!attached) {
#if COUPLER_LEDC_CH >= 0
    ledcAttachChannel(pin, SERVO_HZ, SERVO_RES, COUPLER_LEDC_CH);
#else
    ledcAttach(pin, SERVO_HZ, SERVO_RES);
#endif
    attached = true;
  }
  ledcWrite(pin, duty);
  curDeg = deg; movedMs = millis();
}

inline void begin(int servoPin) {
  pin = servoPin;
  pinMode(pin, OUTPUT); digitalWrite(pin, LOW);
  // 起動時は何もしない (勝手に動いて連結が外れないように)。最初の K コマンドで動く
}

inline void setLocked(bool on) { locked = on; pendingDeg = on ? lockDeg : unlockDeg; }

// handleLine から呼ぶ。K で始まる行を処理したら true
inline bool handle(const String& line) {
  if (line.length() == 0 || line[0] != 'K' || pin < 0) return false;
  if (line == "K?") { /* 状態の問い合わせ */ }
  else if (line == "K1") setLocked(true);
  else if (line == "K0") setLocked(false);
  else if (line.length() > 2 && line[1] == 'A') pendingDeg = constrain(line.substring(2).toInt(), 0, 180);
  else if (line.length() > 2 && line[1] == 'L') lockDeg = constrain(line.substring(2).toInt(), 0, 180);
  else if (line.length() > 2 && line[1] == 'U') unlockDeg = constrain(line.substring(2).toInt(), 0, 180);
  dirty = true;
  return true;
}

// loop から呼ぶ: 一定時間後に PWM を止める
inline void update() {
  int d = pendingDeg;
  if (d >= 0) { pendingDeg = -1; writeDeg(d); }
  if (attached && millis() - movedMs > HOLD_MS) { ledcDetach(pin); pinMode(pin, OUTPUT); digitalWrite(pin, LOW); attached = false; }
}

inline String status() { return locked ? String("K1") : String("K0"); }

}  // namespace coupler
