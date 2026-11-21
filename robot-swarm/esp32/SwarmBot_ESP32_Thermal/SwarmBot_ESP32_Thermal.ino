/*
 * SwarmBot 2号機 (熱探知担当) - ESP32 DevKit + TB6612FNG + MLX90640 サーマルカメラ
 * Arduino IDE: ボード「ESP32 Dev Module」
 * ライブラリ : ライブラリマネージャで「Adafruit MLX90640」をインストール (依存も全てインストール)
 * BLE名 "SwarmBot-2"
 *
 * 配線 (MLX90640 モジュール)
 *   VIN(VCC) → 3V3      GND → GND
 *   SDA      → GPIO21   SCL → GPIO22      ※モーター用ピンとは重ならない
 *
 * 受信: "M,<左>,<右>\n" (-255〜255) / "S\n" 停止。500ms無通信 or 切断で自動停止
 * 送信:
 *   "H<方位°>,<最高温度x10>,<画素数>,<確度%>,<画素幅>"  人らしき熱源あり (例 H-12,345,18,80,5)
 *   "H-"                                      熱源なし
 *   熱画像 16x12 (1画素1バイト = (温度-15)*4) を 20バイト以下の分割バイナリで送信
 *     各パケット先頭バイト = 0x80 | 分割番号(0〜9)、続いて最大19バイト
 */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <Adafruit_MLX90640.h>

#define ROBOT_ID 2

// 前進でタイヤが逆回転する側は true に
const bool INVERT_A = true;    // モーターA = 左
const bool INVERT_B = true;    // モーターB = 右

// ---- ピン配置 ----
const int AIN1 = 18, AIN2 = 19, PWMA = 25;
const int BIN1 = 16, BIN2 = 17, PWMB = 26;
const int STBY = 23;
const int I2C_SDA = 21, I2C_SCL = 22;

// ---- 熱源 (人) 判定の設定 ----
const float HUMAN_MIN_C   = 28.0;   // 服の上から見た人の表面温度の下限
const float HUMAN_MAX_C   = 40.0;   // 上限 (これ以上は火・機械などとみなす)
const float ABOVE_AMBIENT = 3.0;    // 周囲(平均)より何度高ければ熱源とするか
const int   MIN_PIXELS    = 4;      // 熱源とみなす最小画素数 (32x24中)
const float FOV_H_DEG     = 110.0;  // D110 モデルの水平視野角 (D55なら55)
const bool  FLIP_X        = false;  // 方位の左右が逆なら true

Adafruit_MLX90640 mlx;
bool mlxOk = false;
float frame[32 * 24];
uint8_t thumb[16 * 12];
volatile bool frameReady = false;
String hotMsg = "H-";
SemaphoreHandle_t frameLock;

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

// ================= サーマル =================
// 人らしき熱源: 温度範囲内 かつ 周囲より高い画素の「最大の塊」を探す
void analyzeFrame() {
  float sum = 0; for (int i = 0; i < 768; i++) sum += frame[i];
  float ambient = sum / 768;
  static uint8_t mask[768], seen[768];
  static int16_t stack[768];
  for (int i = 0; i < 768; i++) {
    float t = frame[i];
    mask[i] = (t >= HUMAN_MIN_C && t <= HUMAN_MAX_C && t >= ambient + ABOVE_AMBIENT) ? 1 : 0;
    seen[i] = 0;
  }
  int bestN = 0, bestMinX = 0, bestMaxX = 0; float bestSx = 0, bestMax = 0;
  for (int s0 = 0; s0 < 768; s0++) {
    if (!mask[s0] || seen[s0]) continue;
    int sp = 0, n = 0, minX = 99, maxX = -1; float sx = 0, mx = 0;
    stack[sp++] = s0; seen[s0] = 1;
    while (sp) {
      int i = stack[--sp], x = i % 32, y = i / 32;
      n++; sx += x; if (frame[i] > mx) mx = frame[i];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      const int nb[4] = { x > 0 ? i - 1 : -1, x < 31 ? i + 1 : -1, y > 0 ? i - 32 : -1, y < 23 ? i + 32 : -1 };
      for (int k = 0; k < 4; k++) if (nb[k] >= 0 && mask[nb[k]] && !seen[nb[k]]) { seen[nb[k]] = 1; stack[sp++] = nb[k]; }
    }
    if (n > bestN) { bestN = n; bestSx = sx; bestMax = mx; bestMinX = minX; bestMaxX = maxX; }
  }
  if (bestN >= MIN_PIXELS) {
    float cx = bestSx / bestN;
    float bearing = (cx - 15.5f) / 32.0f * FOV_H_DEG;    // 右が+
    if (FLIP_X) bearing = -bearing;
    // 確度: 大きさと「体温らしさ」(33℃付近ほど高い)
    int conf = constrain((int)(min(bestN, 40) * 1.5f + 40 - fabs(bestMax - 33.0f) * 6), 5, 99);
    int width = bestMaxX - bestMinX + 1;                  // 画素幅 (距離推定用)
    hotMsg = "H" + String((int)round(bearing)) + "," + String((int)round(bestMax * 10)) + "," + String(bestN) + "," + String(conf) + "," + String(width);
  } else hotMsg = "H-";
}

void makeThumb() {   // 32x24 → 16x12 (2x2平均) を 1バイトに量子化
  for (int y = 0; y < 12; y++) for (int x = 0; x < 16; x++) {
    int i = (y * 2) * 32 + x * 2;
    float t = (frame[i] + frame[i + 1] + frame[i + 32] + frame[i + 33]) / 4;
    int xx = FLIP_X ? 15 - x : x;
    thumb[y * 16 + xx] = (uint8_t)constrain((int)round((t - 15.0f) * 4), 0, 255);
  }
}

// I2Cの読み取りは時間がかかるので別タスクで回す (モーター制御を止めない)
void thermalTask(void*) {
  for (;;) {
    if (mlxOk && mlx.getFrame(frame) == 0) {
      xSemaphoreTake(frameLock, portMAX_DELAY);
      analyzeFrame();
      makeThumb();
      frameReady = true;
      xSemaphoreGive(frameLock);
    } else vTaskDelay(pdMS_TO_TICKS(200));
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void sendThermal() {
  uint8_t pkt[20];
  for (int c = 0; c * 19 < 192; c++) {
    int n = min(19, 192 - c * 19);
    pkt[0] = 0x80 | c;
    memcpy(pkt + 1, thumb + c * 19, n);
    txChar->setValue(pkt, n + 1);
    txChar->notify();
    delay(4);
  }
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
  mlxOk = mlx.begin(MLX90640_I2CADDR_DEFAULT, &Wire);
  if (mlxOk) {
    mlx.setMode(MLX90640_CHESS);
    mlx.setResolution(MLX90640_ADC_18BIT);
    mlx.setRefreshRate(MLX90640_4_HZ);    // 約2フレーム/秒
    Serial.println("MLX90640 OK");
  } else Serial.println("★ MLX90640 が見つかりません (配線 SDA=21 SCL=22 / 電源を確認)");
  frameLock = xSemaphoreCreateMutex();
  xTaskCreatePinnedToCore(thermalTask, "thermal", 8192, nullptr, 1, nullptr, 1);
  setupBLE();
}

void loop() {
  static uint32_t lastNotify = 0;
  int l = targetL, r = targetR;
  if (!connected || millis() - lastCmdMs > TIMEOUT_MS) { l = 0; r = 0; }
  setMotors(l, r);

  if (frameReady && connected) {
    xSemaphoreTake(frameLock, portMAX_DELAY);
    frameReady = false;
    String h = hotMsg;
    xSemaphoreGive(frameLock);
    notifyText(h);
    sendThermal();
  }
  if (millis() - lastNotify > 1000) {
    lastNotify = millis();
    notifyText(mlxOk ? "ID" + String(ROBOT_ID) + " L" + String(l) + " R" + String(r) : String("ID2 THERM NG"));
  }
  delay(10);
}
