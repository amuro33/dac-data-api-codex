// 공통: data-if / data-style-tpl / data-text / data-action 을 상태에 맞춰 갱신한다.
(function () {
  var P = window.PAGE;
  if (!P) return;
  function render() {
    var v = P.values();
    document.querySelectorAll('[data-if]').forEach(function (el) { el.hidden = !v[el.getAttribute('data-if')]; });
    document.querySelectorAll('[data-style-tpl]').forEach(function (el) {
      el.setAttribute('style', el.getAttribute('data-style-tpl').replace(/\{\{(\w+)\}\}/g, function (m, k) { return v[k]; }));
    });
    document.querySelectorAll('[data-text]').forEach(function (el) { el.textContent = v[el.getAttribute('data-text')]; });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (t) { P.actions[t.getAttribute('data-action')](); render(); }
  });
  render();
})();
