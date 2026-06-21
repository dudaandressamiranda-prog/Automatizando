# Controle de Portão pelo Celular

Substitui o controle físico do motor do portão por um app no celular.
Funciona de dentro de casa (Wi-Fi) e de fora também (dados móveis), sem
precisar abrir portas no roteador.

## Como funciona

```
[Celular - PWA]  --(MQTT via internet)-->  [Broker MQTT na nuvem]  <--(MQTT via Wi-Fi)--  [ESP32 + relé]
                                                                                                |
                                                                                          fios do botão
                                                                                          do receptor
                                                                                          do motor
```

- O app no celular publica o comando `OPEN` num broker MQTT.
- O ESP32, ligado ao Wi-Fi de casa, está sempre conectado a esse mesmo
  broker. Ao receber `OPEN`, ele fecha um relé por ~0,8s, simulando o
  clique do botão do seu controle físico.
- Como os dois lados só fazem conexões de saída para o broker, não é
  preciso configurar nada no roteador.

## ⚠️ Segurança antes de mexer no motor

- **Desligue a energia do motor do portão** antes de abrir a placa ou
  fazer qualquer ligação.
- Se você não tiver familiaridade com eletricidade/automação de portões,
  peça ajuda a um eletricista ou técnico — engano na ligação pode
  danificar a placa do motor.
- Depois de instalado, teste sempre com o portão livre de pessoas/carros
  no trajeto, como faria ao testar um controle novo.

## Lista de peças

- 1x ESP32 (ex.: "ESP32 DevKit V1" / NodeMCU-32S)
- 1x módulo relé 5V de 1 canal (com optoacoplador)
- 1x fonte 5V (pode ser a mesma fonte da placa do motor, se ela tiver
  saída auxiliar de 5V/12V — nesse caso use também um conversor para 5V)
- Jumpers / cabo flexível fino
- Caixa pequena para proteger o ESP32 e o relé

## Ligação (visão geral)

1. Localize, na placa receptora do motor do portão, os dois terminais
   onde hoje chega o sinal do botão (geralmente rotulados como "TX",
   "common"/"NA" ou semelhante — varia por fabricante; o manual do motor
   ajuda a identificar).
2. Ligue esses dois terminais aos contatos **NO (normalmente aberto) e
   COM** do módulo relé — em paralelo com o fio que já existe, sem
   remover nada.
3. Ligue o **IN** do relé ao **GPIO 26** do ESP32, e **VCC/GND** do relé
   à fonte 5V (mesmo GND do ESP32).
4. Alimente o ESP32 (USB ou pino 5V/VIN, conforme a placa).

O relé, ao ser acionado pelo ESP32, fecha o contato por um instante —
exatamente como o clique do botão do controle original.

## Configurar o broker MQTT (gratuito)

1. Crie uma conta em https://www.hivemq.com/mqtt-cloud-broker/ (free tier).
2. Crie um cluster gratuito e, dentro dele, um usuário/senha de acesso
   (Access Management → Credentials).
3. Anote: host do cluster, usuário e senha. As portas padrão são
   `8883` (TLS, usada pelo ESP32) e `8884` (WebSocket/TLS, usada pelo app).
4. Escolha um `DEVICE_ID` único e difícil de adivinhar para o seu
   portão, ex.: `portao-casa-7f3a1`.

## Gravar o firmware no ESP32

1. Instale a [Arduino IDE](https://www.arduino.cc/en/software) e o
   suporte a placas ESP32 (Boards Manager → "esp32").
2. Instale a biblioteca **PubSubClient** (Library Manager).
3. Abra `firmware/gate_controller/gate_controller.ino`.
4. Copie `config.example.h` para `config.h` (mesma pasta) e preencha
   com sua rede Wi-Fi e os dados do broker MQTT.
5. Selecione sua placa ESP32 e a porta serial, e clique em Upload.
6. No Serial Monitor, confirme que apareceu conexão Wi-Fi e MQTT OK.

## Usar o app no celular

A pasta `app/` é um PWA (web app instalável) — não precisa de loja de
aplicativos.

1. Hospede a pasta `app/` em qualquer serviço estático (GitHub Pages,
   Netlify, Vercel) ou abra localmente para testar.
2. No celular, acesse a URL pelo navegador.
3. Na primeira vez, toque em "Configurar conexão" e preencha:
   - Host do broker (porta **8884**, WebSocket/TLS)
   - Usuário e senha do broker
   - O mesmo `DEVICE_ID` usado no firmware
4. Toque em "Salvar e conectar". O indicador deve ficar verde
   ("Conectado").
5. No Safari/Chrome do celular, use "Adicionar à Tela de Início" para
   o app ficar com ícone próprio, como um app nativo.
6. Toque no botão grande para abrir/fechar o portão.

As credenciais ficam salvas apenas no próprio celular (localStorage),
nunca são enviadas a nenhum servidor além do broker MQTT que você
mesmo configurou.

## Limitações desta primeira versão

- Não há sensor de aberto/fechado — o status mostrado é apenas do
  ESP32 (online/offline e último acionamento), não a posição real do
  portão.
- O certificado do broker não é validado no firmware (`setInsecure()`),
  o que é aceitável para uso pessoal, mas pode ser reforçado fixando o
  certificado da CA do broker.
- Um único portão por configuração do app (mas o mesmo app serve para
  vários portões, bastando trocar o `DEVICE_ID` salvo).

Próximos passos sugeridos: sensor magnético de portão aberto/fechado,
histórico de acionamentos, e PIN/senha extra dentro do próprio app.
