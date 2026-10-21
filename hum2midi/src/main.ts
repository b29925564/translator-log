// M0：只放應用程式外殼，M3 起才接上錄音與各頁面。
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `<main><h1>hum2midi</h1><p>按空白鍵哼一段，自動轉成音符。</p></main>`;
}
