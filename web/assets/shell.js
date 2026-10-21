// 공통 셸: 탑바 + 아이콘 사이드바. 사용: const main = Shell.mount({ active, title, desc, actions })
window.Shell = (function () {
  var ICONS = {
    home: '<path d="M3 8.5L9 3l6 5.5V15H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    data: '<ellipse cx="9" cy="4.5" rx="5.5" ry="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 4.5v9c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-9M3.5 9c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    ctrl: '<path d="M3 6h9M3 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.5 3.5L13 6l-2.5 2.5M7.5 9.5L5 12l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    wf: '<circle cx="4" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="14" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="14" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 9h2c2 0 2-5 4-5M8 9c2 0 2 5 4 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tool: '<path d="M3 5h12M3 13h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6.5" cy="5" r="1.9" fill="#fff" stroke="currentColor" stroke-width="1.6"/><circle cx="11.5" cy="13" r="1.9" fill="#fff" stroke="currentColor" stroke-width="1.6"/>',
    bot: '<rect x="3.5" y="6.5" width="11" height="8" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="10.5" r="1" fill="currentColor"/><circle cx="11" cy="10.5" r="1" fill="currentColor"/><path d="M9 6.5V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="3.2" r="1" fill="currentColor"/>',
    cog: '<circle cx="9" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 2.5v2M9 13.5v2M2.5 9h2M13.5 9h2M4.4 4.4l1.4 1.4M12.2 12.2l1.4 1.4M4.4 13.6l1.4-1.4M12.2 5.8l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  };
  var NAV = [
    ['home', '홈', '#'], ['data', 'Data API', '#'], ['ctrl', '제어 API', '#'],
    ['wf', 'Data Workflow', 'workflows.html'], ['tool', 'Tool Playground', 'tool-playground.html'], ['bot', 'Agent Playground', 'agent-playground.html']
  ];
  function svg(k) { return '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">' + ICONS[k] + '</svg>'; }
  function mount(o) {
    var nav = NAV.map(function (n) {
      return '<a href="' + n[2] + '" title="' + n[1] + '" class="' + (n[0] === o.active ? 'on' : '') + '">' + svg(n[0]) + '</a>';
    }).join('');
    document.getElementById('app').innerHTML =
      '<div class="app">' +
      '<div class="topbar"><a class="brand" href="index.html" style="color:inherit"><div class="logo">A</div>MES API Platform</a>' +
      '<div class="top-right"><span class="ws-chip">MFG Analytics</span><div class="avatar">강</div></div></div>' +
      '<div class="body"><aside class="sidebar"><nav class="nav">' + nav + '</nav><div class="side-bottom"><a href="#" title="설정">' + svg('cog') + '</a></div></aside>' +
      '<div class="content"><header class="page-head"><div><h1>' + o.title + '</h1><p>' + (o.desc || '') + '</p></div><div id="head-actions"></div></header>' +
      '<main class="main" id="main"></main></div></div></div>';
    return { main: document.getElementById('main'), actions: document.getElementById('head-actions') };
  }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }
  return { mount: mount, toast: toast };
})();

// 작은 DOM 헬퍼
window.h = function (tag, attrs, children) {
  var el = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  [].concat(children || []).forEach(function (c) {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
};
