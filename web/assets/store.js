window.Store = {
  async request(url, method = "GET", body) {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "요청 실패");
    return data;
  },
  async refresh() {
    const data = await this.request("/api/state");
    window.MOCK = data;
    return data;
  },
};
Store.ready = Store.refresh();
Store.ready.catch((e) => {
  document.body.insertAdjacentHTML("afterbegin", '<p id="load-error"></p>');
  document.getElementById("load-error").textContent =
    "서버 연결 실패: " + e.message + " · node server.js로 실행해주세요.";
});
