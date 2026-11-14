/*
 * SwarmBot - ESP32 + TB6612FNG BLE 群制御ロボット
 *
 * 2台目に書き込むときは ROBOT_ID を 2 に変えるだけ。
 * BLE名: "SwarmBot-1" / "SwarmBot-2"
 *
 * 受信フォーマット (テキスト, 改行区切り):
 *   "M,<left>,<right>\n"   left/right: -255〜255  (例: M,200,-200)
 *   "S\n"                   即停止
 * 安全機能: 500ms 以上コマンドが来なければ自動停止 / 切断時も停止
 *
 * Arduino-ESP32 core 2.x / 3.x 両対応
 * 対応ボード: ESP32 Dev Module / XIAO_ESP32S3 (Sense 含む)
 */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define ROBOT_ID 1   // ★ 2台目は 2 にする

// ---- 片側のモーターが逆に回る場合は true にする ----
const bool INVERT_A = false;
const bool INVERT_B = false;

// ---- ピン配置 (ボード選択で自動切替) ----
#if defined(ARDUINO_XIAO_ESP32S3)
// Seeed XIAO ESP32S3 / Sense  (D8〜D10 は SDカードと共用なので未使用)
const int AIN1 = D0;   // GPIO1
const int AIN2 = D1;   // GPIO2
const int PWMA = D2;   // GPIO3
const int BIN1 = D3;   // GPIO4
const int BIN2 = D4;   // GPIO5
const int PWMB = D5;   // GPIO6
const int STBY = D6;   // GPIO43
#else
// ESP32 DevKit
const int AIN1 = 18, AIN2 = 19, PWMA = 25;
const int BIN1 = 16, BIN2 = 17, PWMB = 26;
const int STBY = 23;
#endif

const int PWM_FREQ = 20000;   // 20kHz (可聴域外)
const int PWM_RES  = 8;       // 0-255
const uint32_t TIMEOUT_MS = 500;

#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // App -> ESP32
#define TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // ESP32 -> App

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  #define PWM_ATTACH(pin, ch) ledcAttach(pin, PWM_FREQ, PWM_RES)
  #define PWM_WRITE(pin, ch, v) ledcWrite(pin, v)
#else
  #define PWM_ATTACH(pin, ch) do { ledcSetup(ch, PWM_FREQ, PWM_RES); ledcAttachPin(pin, ch); } while (0)
  #define PWM_WRITE(pin, ch, v) ledcWrite(ch, v)
#endif

volatile int targetL = 0, targetR = 0;
volatile uint32_t lastCmdMs = 0;
volatile bool connected = false;
BLEServer* server = nullptr;
BLECharacteristic* txChar = nullptr;

void driveMotor(int in1, int in2, int pwmPin, int ch, int speed, bool invert) {
  if (invert) speed = -speed;
  speed = constrain(speed, -255, 255);
  if (speed > 0)      { digitalWrite(in1, HIGH); digitalWrite(in2, LOW);  }
  else if (speed < 0) { digitalWrite(in1, LOW);  digitalWrite(in2, HIGH); }
  else                { digitalWrite(in1, LOW);  digitalWrite(in2, LOW);  } // 惰性停止
  PWM_WRITE(pwmPin, ch, abs(speed));
}

void setMotors(int l, int r) {
  driveMotor(AIN1, AIN2, PWMA, 0, l, INVERT_A);  // モーターA = 左
  driveMotor(BIN1, BIN2, PWMB, 1, r, INVERT_B);  // モーターB = 右
}

void handleLine(const String& line) {
  if (line.length() == 0) return;
  if (line[0] == 'S') { targetL = targetR = 0; lastCmdMs = millis(); return; }
  if (line[0] == 'M') {
    int c1 = line.indexOf(',');
    int c2 = line.indexOf(',', c1 + 1);
    if (c1 < 0 || c2 < 0) return;
    targetL = constrain(line.substring(c1 + 1, c2).toInt(), -255, 255);
    targetR = constrain(line.substring(c2 + 1).toInt(), -255, 255);
    lastCmdMs = millis();
  }
}

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = String(c->getValue().c_str());   // core 2.x/3.x 両対応
    int start = 0;
    while (start < (int)v.length()) {
      int nl = v.indexOf('\n', start);
      if (nl < 0) nl = v.length();
      String line = v.substring(start, nl);
      line.trim();
      handleLine(line);
      start = nl + 1;
    }
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { connected = true; }
  void onDisconnect(BLEServer* s) override {
    connected = false;
    targetL = targetR = 0;
    delay(100);
    s->getAdvertising()->start();   // 再接続待ち
  }
};

void setup() {
  Serial.begin(115200);
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  PWM_ATTACH(PWMA, 0);
  PWM_ATTACH(PWMB, 1);
  setMotors(0, 0);
  digitalWrite(STBY, HIGH);

  String name = "SwarmBot-" + String(ROBOT_ID);
  BLEDevice::init(name.c_str());
  server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* svc = server->createService(SERVICE_UUID);

  BLECharacteristic* rx = svc->createCharacteristic(
      RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCallbacks());

  txChar = svc->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());

  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println(name + " ready");
}

void loop() {
  static uint32_t lastNotify = 0;
  int l = targetL, r = targetR;
  if (!connected || millis() - lastCmdMs > TIMEOUT_MS) { l = 0; r = 0; }
  setMotors(l, r);

  // 1秒ごとに状態をアプリへ通知 (生存確認用)
  if (connected && millis() - lastNotify > 1000) {
    lastNotify = millis();
    String s = "ID" + String(ROBOT_ID) + " L" + String(l) + " R" + String(r);
    txChar->setValue(s.c_str());
    txChar->notify();
  }
  delay(10);
}
