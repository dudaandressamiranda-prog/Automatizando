const STORAGE_KEY = "gate-app-settings";
const BUTTON_COOLDOWN_MS = 3000;

const els = {
  connDot: document.getElementById("connDot"),
  connText: document.getElementById("connText"),
  gateButton: document.getElementById("gateButton"),
  lastStatus: document.getElementById("lastStatus"),
  settingsToggle: document.getElementById("settingsToggle"),
  settingsForm: document.getElementById("settingsForm"),
  mqttHost: document.getElementById("mqttHost"),
  mqttPort: document.getElementById("mqttPort"),
  mqttUser: document.getElementById("mqttUser"),
  mqttPass: document.getElementById("mqttPass"),
  deviceId: document.getElementById("deviceId"),
};

let client = null;

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function fillForm(settings) {
  if (!settings) return;
  els.mqttHost.value = settings.host || "";
  els.mqttPort.value = settings.port || "";
  els.mqttUser.value = settings.user || "";
  els.mqttPass.value = settings.pass || "";
  els.deviceId.value = settings.deviceId || "";
}

function setConnected(isConnected) {
  els.connDot.classList.toggle("online", isConnected);
  els.connText.textContent = isConnected ? "Conectado" : "Desconectado";
  els.gateButton.disabled = !isConnected;
}

function topics(deviceId) {
  return {
    command: `gate/${deviceId}/command`,
    status: `gate/${deviceId}/status`,
  };
}

function connect(settings) {
  if (client) {
    client.end(true);
    client = null;
  }

  setConnected(false);
  els.lastStatus.textContent = "Conectando...";

  const url = `wss://${settings.host}:${settings.port}/mqtt`;
  client = mqtt.connect(url, {
    username: settings.user,
    password: settings.pass,
    clientId: `app-${settings.deviceId}-${Math.random().toString(16).slice(2)}`,
    reconnectPeriod: 4000,
  });

  const { command, status } = topics(settings.deviceId);

  client.on("connect", () => {
    setConnected(true);
    els.lastStatus.textContent = "Conectado ao portão";
    client.subscribe(status);
  });

  client.on("reconnect", () => setConnected(false));
  client.on("close", () => setConnected(false));
  client.on("error", () => setConnected(false));

  client.on("message", (_topic, payload) => {
    const text = payload.toString();
    els.lastStatus.textContent = `Status: ${text}`;
  });

  client._gateCommandTopic = command;
}

function triggerGate() {
  if (!client || !client.connected) return;
  client.publish(client._gateCommandTopic, "OPEN");
  els.lastStatus.textContent = "Comando enviado...";

  els.gateButton.disabled = true;
  setTimeout(() => {
    if (client && client.connected) {
      els.gateButton.disabled = false;
    }
  }, BUTTON_COOLDOWN_MS);
}

els.gateButton.addEventListener("click", triggerGate);

els.settingsToggle.addEventListener("click", () => {
  els.settingsForm.classList.toggle("hidden");
});

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const settings = {
    host: els.mqttHost.value.trim(),
    port: Number(els.mqttPort.value),
    user: els.mqttUser.value.trim(),
    pass: els.mqttPass.value,
    deviceId: els.deviceId.value.trim(),
  };
  saveSettings(settings);
  els.settingsForm.classList.add("hidden");
  connect(settings);
});

const existingSettings = loadSettings();
if (existingSettings) {
  fillForm(existingSettings);
  connect(existingSettings);
} else {
  els.settingsForm.classList.remove("hidden");
  els.lastStatus.textContent = "Configure a conexão para começar";
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
