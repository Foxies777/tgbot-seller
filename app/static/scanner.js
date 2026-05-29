const video = document.querySelector("#preview");
const statusEl = document.querySelector("#scan-status");

async function startScanner() {
  if (!("BarcodeDetector" in window)) {
    statusEl.textContent = "BarcodeDetector не поддерживается. Откройте QR обычной камерой телефона.";
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
  video.srcObject = stream;

  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  statusEl.textContent = "Сканирование...";

  const scan = async () => {
    const codes = await detector.detect(video);
    if (codes.length > 0) {
      const value = codes[0].rawValue;
      if (value.startsWith("https://t.me/") || value.startsWith("tg://")) {
        window.location.href = value;
        return;
      }
      statusEl.textContent = `Найден QR: ${value}`;
    }
    requestAnimationFrame(scan);
  };

  requestAnimationFrame(scan);
}

startScanner().catch((error) => {
  statusEl.textContent = `Не удалось открыть камеру: ${error.message}`;
});
