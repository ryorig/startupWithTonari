/*
 * SwarmBot 1号機 - XIAO ESP32S3 Sense (カメラ付き) + TB6612FNG
 *
 * Arduino IDE の設定 (ツール):
 *   ボード            : XIAO_ESP32S3
 *   PSRAM             : OPI PSRAM        ← 推奨 (無効でも低解像度で動作)
 *   Partition Scheme  : Huge APP (3MB No OTA/1MB SPIFFS)  ← BLE+WiFi+カメラで容量が大きいため
 *   USB CDC On Boot   : Enabled
 *
 * カメラ映像: Wi-Fi で配信
 *   http://<IP>/          … 動作確認ページ (まずブラウザでここを開く)
 *   http://<IP>/capture   … 静止画1枚
 *   http://<IP>:81/stream … 動画 (MJPEG)
 *   WIFI_SSID を空のままにすると、XIAO 自身が Wi-Fi(アクセスポイント) を作ります
 *     → Mac の Wi-Fi で「SwarmBot-1-CAM」(パスワード swarmbot123) に接続
 *     → 映像URL: http://192.168.4.1:81/stream
 *   家や学校の Wi-Fi に参加させたい場合は WIFI_SSID / WIFI_PASS を設定
 *     (IP はシリアルモニタとアプリに表示されます)
 *
 * BLE名 "SwarmBot-1"  /  アプリへ "IP<アドレス>" を送信 (カメラURLの自動入力用)
 */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#define COUPLER_LEDC_CH 6   // カメラ(ch0)・モーター(ch4/5)と別タイマー
#include "SwarmCoupler.h"
#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"

#define ROBOT_ID 1

// ---- Wi-Fi ----
const char* WIFI_SSID = "";            // 空 = XIAO がアクセスポイントになる
const char* WIFI_PASS = "";
const char* AP_SSID   = "SwarmBot-1-CAM";
const char* AP_PASS   = "swarmbot123";  // 8文字以上

const bool INVERT_A = false;   // モーターA = 左
const bool INVERT_B = false;   // モーターB = 右

// ---- モーターのピン配置 (D8〜D10 は SDカードと共用なので未使用) ----
const int AIN1 = D0;   // GPIO1
const int AIN2 = D1;   // GPIO2
const int PWMA = D2;   // GPIO3
const int BIN1 = D3;   // GPIO4
const int BIN2 = D4;   // GPIO5
const int PWMB = D5;   // GPIO6
const int STBY = D6;   // GPIO43

// ---- カメラ (XIAO ESP32S3 Sense / OV2640 or OV3660) ----
#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  10
#define SIOD_GPIO_NUM  40
#define SIOC_GPIO_NUM  39
#define Y9_GPIO_NUM    48
#define Y8_GPIO_NUM    11
#define Y7_GPIO_NUM    12
#define Y6_GPIO_NUM    14
#define Y5_GPIO_NUM    16
#define Y4_GPIO_NUM    18
#define Y3_GPIO_NUM    17
#define Y2_GPIO_NUM    15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM  47
#define PCLK_GPIO_NUM  13

String camIP = "";
bool camOk = false;
String camErr = "";

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
  if (coupler::handle(line)) return;   // 連結器 K1/K0/KA..
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

// ================= カメラ =================
bool setupCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;   // モーターは ch4/5 を使うので衝突しない
  c.ledc_timer   = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM; c.pin_d1 = Y3_GPIO_NUM; c.pin_d2 = Y4_GPIO_NUM; c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM; c.pin_d5 = Y7_GPIO_NUM; c.pin_d6 = Y8_GPIO_NUM; c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM; c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM; c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;

  // ★ PSRAM が無効でも動くようにする (以前はPSRAM必須で、無効だと初期化失敗→映像が出なかった)
  if (psramFound()) {
    Serial.printf("PSRAM: %u bytes\n", ESP.getPsramSize());
    c.frame_size  = FRAMESIZE_VGA;          // 640x480
    c.jpeg_quality = 12;
    c.fb_count    = 2;
    c.fb_location = CAMERA_FB_IN_PSRAM;
    c.grab_mode   = CAMERA_GRAB_LATEST;     // 遅延を減らす
  } else {
    Serial.println("PSRAM なし → 低解像度で起動 (ツール > PSRAM を OPI PSRAM にすると高画質)");
    c.frame_size  = FRAMESIZE_QVGA;         // 320x240
    c.jpeg_quality = 15;
    c.fb_count    = 1;
    c.fb_location = CAMERA_FB_IN_DRAM;
    c.grab_mode   = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    camErr = "init 0x" + String(err, HEX);
    Serial.printf("★ カメラ初期化失敗 0x%x : カメラ基板(Sense)の差し込み・PSRAM設定を確認\n", err);
    return false;
  }
  sensor_t* s = esp_camera_sensor_get();
  if (s) Serial.printf("カメラセンサー PID=0x%x\n", s->id.PID);   // 0x26=OV2640, 0x3660=OV3660

  // 試し撮り (ここで失敗するなら配線/センサーの問題)
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { camErr = "no frame"; Serial.println("★ 試し撮り失敗"); return false; }
  Serial.printf("試し撮りOK %ux%u %u bytes\n", fb->width, fb->height, fb->len);
  esp_camera_fb_return(fb);
  return true;
}

// ---- 動画 (MJPEG) : ポート81 ----
#define PART_BOUNDARY "swarmframe"
static esp_err_t streamHandler(httpd_req_t* req) {
  if (!camOk) { httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "camera not ready"); return ESP_FAIL; }
  httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=" PART_BOUNDARY);
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  char part[96];
  int fails = 0;
  while (true) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { if (++fails > 50) break; delay(20); continue; }
    fails = 0;
    int hl = snprintf(part, sizeof(part),
        "\r\n--" PART_BOUNDARY "\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
    esp_err_t r = httpd_resp_send_chunk(req, part, hl);
    if (r == ESP_OK) r = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
    esp_camera_fb_return(fb);
    if (r != ESP_OK) break;   // ブラウザが閉じた
  }
  return ESP_OK;
}

// ---- 静止画 / 確認ページ : ポート80 ----
static esp_err_t captureHandler(httpd_req_t* req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  if (!camOk) { httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "camera not ready"); return ESP_FAIL; }
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "no frame"); return ESP_FAIL; }
  httpd_resp_set_type(req, "image/jpeg");
  esp_err_t r = httpd_resp_send(req, (const char*)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return r;
}

static esp_err_t indexHandler(httpd_req_t* req) {
  String h = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>"
             "<body style='font-family:sans-serif;background:#111;color:#eee'>"
             "<h3>SwarmBot-1 カメラ</h3><p>カメラ: ";
  h += camOk ? String("OK") : String("NG (") + camErr + ")";
  h += " / PSRAM: " + String(psramFound() ? "あり" : "なし") + " / IP: " + camIP + "</p>";
  h += "<p>動画: <a style='color:#8cf' href='http://" + camIP + ":81/stream'>http://" + camIP + ":81/stream</a></p>";
  h += "<img style='max-width:100%' src='http://" + camIP + ":81/stream'></body>";
  httpd_resp_set_type(req, "text/html; charset=utf-8");
  return httpd_resp_send(req, h.c_str(), h.length());
}

void startServers() {
  httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();   // ポート80
  cfg.stack_size = 8192;
  httpd_handle_t web = nullptr;
  if (httpd_start(&web, &cfg) == ESP_OK) {
    httpd_uri_t u1 = {}; u1.uri = "/";        u1.method = HTTP_GET; u1.handler = indexHandler;
    httpd_uri_t u2 = {}; u2.uri = "/capture"; u2.method = HTTP_GET; u2.handler = captureHandler;
    httpd_register_uri_handler(web, &u1);
    httpd_register_uri_handler(web, &u2);
  } else Serial.println("★ Webサーバー(80)起動失敗");

  httpd_config_t cfg2 = HTTPD_DEFAULT_CONFIG();  // ポート81 (動画専用)
  cfg2.server_port = 81;
  cfg2.ctrl_port = 32769;
  cfg2.stack_size = 8192;
  httpd_handle_t st = nullptr;
  if (httpd_start(&st, &cfg2) == ESP_OK) {
    httpd_uri_t u = {}; u.uri = "/stream"; u.method = HTTP_GET; u.handler = streamHandler;
    httpd_register_uri_handler(st, &u);
  } else Serial.println("★ 動画サーバー(81)起動失敗");
}

void setupWiFi() {
  if (strlen(WIFI_SSID) > 0) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.print("Wi-Fi 接続中");
    for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) { camIP = WiFi.localIP().toString(); }
    else Serial.println("Wi-Fi 接続失敗 → アクセスポイントで起動");
  }
  if (camIP == "") {   // Wi-Fi未設定 or 接続失敗 → アクセスポイント
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASS);
    delay(200);
    camIP = WiFi.softAPIP().toString();
    Serial.printf("アクセスポイント %s (pass: %s)\n", AP_SSID, AP_PASS);
  }
  WiFi.setSleep(false);
}

void setup() {
  Serial.begin(115200);
  delay(1500);   // USB CDC のシリアルモニタが繋がるのを待つ
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  // カメラが LEDC ch0 を使うので、モーターは ch4/ch5 に固定
  ledcAttachChannel(PWMA, PWM_FREQ, PWM_RES, 4);
  ledcAttachChannel(PWMB, PWM_FREQ, PWM_RES, 5);
  setMotors(0, 0);
  digitalWrite(STBY, HIGH);

  camOk = setupCamera();
  setupWiFi();
  startServers();   // カメラNGでも確認ページは出す
  coupler::begin(D7);   // 連結器サーボ: D7 (GPIO44)
  setupBLE();
  Serial.println("==============================");
  Serial.println(" 確認ページ: http://" + camIP + "/");
  Serial.println(" 動画      : http://" + camIP + ":81/stream");
  Serial.println(String(" カメラ    : ") + (camOk ? String("OK") : String("NG ") + camErr));
  Serial.println("==============================");
}

void loop() {
  static uint32_t lastNotify = 0;
  static uint8_t phase = 0;
  int l = targetL, r = targetR;
  if (!connected || millis() - lastCmdMs > TIMEOUT_MS) { l = 0; r = 0; }
  setMotors(l, r);
  coupler::update();
  if (coupler::dirty) { coupler::dirty = false; notifyText(coupler::status()); }

  if (millis() - lastNotify > 700) {
    lastNotify = millis();
    // ID / IP / カメラ状態 を順番に送る (1パケット20バイト以内)
    if (phase == 0)      notifyText("IP" + camIP);
    else if (phase == 1) notifyText(camOk ? "CAM OK" : "CAM NG");
    else                 notifyText("ID" + String(ROBOT_ID) + " L" + String(l) + " R" + String(r));
    phase = (phase + 1) % 3;
  }
  delay(10);
}
