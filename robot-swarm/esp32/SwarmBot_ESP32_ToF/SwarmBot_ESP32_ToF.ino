/*
 * SwarmBot 3号機 - ESP32 DevKit + TB6612FNG + VL53L1X 距離センサー
 * Arduino IDE: ボード「ESP32 Dev Module」
 * ライブラリ: ライブラリマネージャで「VL53L1X」(by Pololu) をインストール
 * BLE名 "SwarmBot-3"
 *
 * ★ GPIO25/26 を I2C (SDA/SCL) に使うため、PWMA/PWMB を GPIO32/33 に移動しています
 *    PWMA: GPIO25 → GPIO32 に配線変更
 *    PWMB: GPIO26 → GPIO33 に配線変更
 *    VL53L1X: VIN→3V3, GND→GND, SDA→GPIO25, SCL→GPIO26
 *
 * アプリへ送る距離: "D<mm>"  (測定不可なら "D-")
 * 前進中に障害物が SAFETY_STOP_MM 以内なら自動停止 (0 で無効)
 */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <VL53L1X.h>

#define ROBOT_ID 3

const bool INVERT_A = false;   // モーターA = 左
const bool INVERT_B = false;   // モーターB = 右

// ---- ピン配置 ----
const int AIN1 = 18, AIN2 = 19, PWMA = 32;   // ★ PWMA は GPIO32
const int BIN1 = 16, BIN2 = 17, PWMB = 33;   // ★ PWMB は GPIO33
const int STBY = 23;
const int I2C_SDA = 25, I2C_SCL = 26;

const int SAFETY_STOP_MM = 150;   // 前進中この距離以内で停止 (0で無効)

VL53L1X tof;
bool tofOk = false;
int distMm = -1;

const int PWM_FREQ = 20000;   // 20kHz
const int PWM_RES  = 8;       // 0-255
const uint32_t TIMEOUT_MS = 500;   // これ以上コマンドが来なければ停止

#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // App -> Robot
#define TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // Robot -> App

volatile int targetL = 0, targetR = 0;
volatile uint32_t lastCmdMs = 0;
volatile bool connected = false;
BLECharacteristic* txChar = nullptr;

void driveMotor(int in1, int in2, int pwmPin, int speed, bool invert) {
  if (invert) speed = -speed;
  speed = constrain(speed, -255, 255);
  if (speed > 0)      { digitalWrite(in1, HIGH); digitalWrite(in2, LOW);  }
  else if (speed < 0) { digitalWrite(in1, LOW);  digitalWrite(in2, HIGH); }
  else                { digitalWrite(in1, LOW);  digitalWrite(in2, LOW);  }
  ledcWrite(pwmPin, abs(speed));
}

void setMotors(int l, int r) {
  driveMotor(AIN1, AIN2, PWMA, l, INVERT_A);   // モーターA = 左
  driveMotor(BIN1, BIN2, PWMB, r, INVERT_B);   // モーターB = 右
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
    String v = String(c->getValue().c_str());
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

// アプリへ短いメッセージを送る (BLEの1パケット=20バイト以内に収める)
void notifyText(const String& s) {
  if (!connected || !txChar) return;
  txChar->setValue(s.c_str());
  txChar->notify();
}

void setupBLE() {
  String name = "SwarmBot-" + String(ROBOT_ID);
  BLEDevice::init(name.c_str());
  BLEServer* server = BLEDevice::createServer();
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

void setup() {
  Serial.begin(115200);
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  ledcAttach(PWMA, PWM_FREQ, PWM_RES);
  ledcAttach(PWMB, PWM_FREQ, PWM_RES);
  setMotors(0, 0);
  digitalWrite(STBY, HIGH);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000);
  tof.setTimeout(500);
  tofOk = tof.init();
  if (tofOk) {
    tof.setDistanceMode(VL53L1X::Long);
    tof.setMeasurementTimingBudget(50000);   // 50ms
    tof.startContinuous(50);
    Serial.println("VL53L1X OK");
  } else {
    Serial.println("VL53L1X が見つかりません (配線を確認)");
  }
  setupBLE();
}

void loop() {
  static uint32_t lastNotify = 0, lastDist = 0;

  if (tofOk && tof.dataReady()) {
    int d = tof.read(false);
    distMm = (tof.ranging_data.range_status == VL53L1X::RangeValid) ? d : -1;
  }

  int l = targetL, r = targetR;
  if (!connected || millis() - lastCmdMs > TIMEOUT_MS) { l = 0; r = 0; }
  // 前進中の障害物停止 (後退・旋回はOK)
  if (SAFETY_STOP_MM > 0 && distMm >= 0 && distMm < SAFETY_STOP_MM && l > 0 && r > 0) { l = 0; r = 0; }
  setMotors(l, r);

  if (millis() - lastDist > 100) {          // 距離は 10Hz で送信
    lastDist = millis();
    notifyText(distMm >= 0 ? "D" + String(distMm) : String("D-"));
  }
  if (millis() - lastNotify > 1000) {
    lastNotify = millis();
    notifyText("ID" + String(ROBOT_ID) + " L" + String(l) + " R" + String(r));
  }
  delay(5);
}
