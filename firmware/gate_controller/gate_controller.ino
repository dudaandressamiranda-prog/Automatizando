// Controle remoto de portão eletrônico via ESP32 + relé + MQTT.
//
// O relé é ligado em paralelo com o botão do receptor do motor do portão
// (os dois fios que hoje recebem o sinal do controle físico). Ao receber
// o comando "OPEN" via MQTT, o ESP32 fecha o contato do relé por um
// instante, simulando o clique do controle original.
//
// Antes de compilar: copie config.example.h para config.h e preencha
// com sua rede Wi-Fi e dados do broker MQTT.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "config.h"

const int RELAY_PIN = 26;
const unsigned long PULSE_MS = 800;          // duração do "clique" simulado
const unsigned long MIN_INTERVAL_MS = 3000;  // intervalo mínimo entre acionamentos

const String TOPIC_COMMAND = String("gate/") + DEVICE_ID + "/command";
const String TOPIC_STATUS = String("gate/") + DEVICE_ID + "/status";

WiFiClientSecure tlsClient;
PubSubClient mqttClient(tlsClient);

unsigned long lastPulseAt = 0;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void publishStatus(const char *status) {
  mqttClient.publish(TOPIC_STATUS.c_str(), status, true);
}

void pulseRelay() {
  unsigned long now = millis();
  if (now - lastPulseAt < MIN_INTERVAL_MS) {
    publishStatus("ignored_debounce");
    return;
  }
  lastPulseAt = now;

  digitalWrite(RELAY_PIN, HIGH);
  publishStatus("pulsing");
  delay(PULSE_MS);
  digitalWrite(RELAY_PIN, LOW);
  publishStatus("pulsed");
}

void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();

  if (message == "OPEN") {
    pulseRelay();
  }
}

void connectMqtt() {
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);

  String clientId = String("esp32-") + DEVICE_ID;
  String willTopic = TOPIC_STATUS;

  while (!mqttClient.connected()) {
    bool ok = mqttClient.connect(
        clientId.c_str(), MQTT_USER, MQTT_PASSWORD,
        willTopic.c_str(), 1, true, "offline");
    if (ok) {
      mqttClient.subscribe(TOPIC_COMMAND.c_str());
      publishStatus("online");
    } else {
      delay(2000);
    }
  }
}

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  connectWiFi();

  // MVP: não valida o certificado do broker. Para mais segurança,
  // troque por tlsClient.setCACert(ROOT_CA) com o certificado do seu broker.
  tlsClient.setInsecure();

  connectMqtt();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!mqttClient.connected()) {
    connectMqtt();
  }
  mqttClient.loop();
}
