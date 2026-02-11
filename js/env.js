// js/env.js
(function () {
  const host = location.hostname;

  // ===== 開発環境（GitHub Pages / localhost）=====
  if (
    host.includes("github.io") ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    window.ENV = {
      ENV_NAME: "DEV",
      LIFF_ID: "2008634162-jVqAPKrD",
      API_URL:"https://prod-13.japaneast.logic.azure.com:443/workflows/7d86cca357d74a499d659ccfddac499c/triggers/When_an_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=qalRj8hNDNVdcAXhZ7cpC6KahERkg5W3NcBcPseEl14"

    };
    return;
  }

  // ===== 本番環境（Azure Static Web Apps）=====
  window.ENV = {
    ENV_NAME: "prod",
    LIFF_ID: "2008xxxxxxxx-prod",
    API_URL: "https://prod-xx.logic.azure.com/..."
  };
})();
