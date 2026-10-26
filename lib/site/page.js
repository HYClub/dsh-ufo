/**
 * 档案馆站点：单文件、零外链、离线可开。
 * 版式目标：像一台档案检索终端，而不是一堆空占位卡片——
 * 没有图就不占版面，信息按「日期 / 地点 / 结论 / 来源」四层排。
 * @module dsh-ufo/lib/site/page
 */

const CSS = `
:root{
  --bg:#06080c; --panel:#0c1017; --panel-2:#0f141d;
  --line:rgba(255,255,255,.07); --line-2:rgba(255,255,255,.13);
  --text:#eef2f8; --dim:#9aa4b6; --faint:#5f6a7d;
  --blue:#4da3ff; --orange:#ff9f0a; --purple:#b06bff; --gold:#ffd24a;
  --ease:cubic-bezier(.2,.8,.2,1);
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{
  background:var(--bg); color:var(--text); min-height:100vh; overflow-x:hidden;
  display:flex; flex-direction:column;
  font:14px/1.6 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  -webkit-font-smoothing:antialiased;
}
main{flex:1;width:100%}
body::before{
  content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
  background:
    radial-gradient(60% 42% at 8% 0%,rgba(77,163,255,.10),transparent 70%),
    radial-gradient(45% 36% at 92% 6%,rgba(176,107,255,.09),transparent 70%),
    linear-gradient(180deg,#06080c,#04060a 70%);
}
body::after{
  content:""; position:fixed; inset:0; z-index:-1; pointer-events:none; opacity:.035; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>");
}
.wrap{max-width:1320px;margin:0 auto;padding:0 32px}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}

/* ---------- 顶栏 ---------- */
header.top{
  position:sticky; top:0; z-index:60; border-bottom:1px solid var(--line);
  background:rgba(6,8,12,.82); backdrop-filter:saturate(160%) blur(18px); -webkit-backdrop-filter:saturate(160%) blur(18px);
}
header.top::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(77,163,255,.55),rgba(176,107,255,.35),transparent)}
.topbar{display:flex;align-items:center;gap:20px;height:66px}
.brand{display:flex;flex-direction:column;gap:3px;min-width:0}
.eyebrow{font-size:9px;letter-spacing:.34em;color:var(--faint);text-transform:uppercase}
.brand h1{font-size:15px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:baseline;gap:8px;white-space:nowrap}
.brand h1 .name{color:var(--blue);max-width:280px;overflow:hidden;text-overflow:ellipsis}
.brand h1 .slash{color:var(--faint);font-weight:400}
.brand h1 .sub{color:var(--dim);font-weight:400;font-size:13px}
.grow{flex:1}
.search{
  display:flex;align-items:center;gap:8px;width:min(300px,32vw);
  background:rgba(255,255,255,.04); border:1px solid var(--line); border-radius:9px; padding:0 11px; height:34px;
  transition:border-color .18s,background .18s;
}
.search svg{flex:none;color:var(--faint)}
.search:focus-within{border-color:rgba(77,163,255,.5);background:rgba(255,255,255,.06)}
.search input{all:unset;flex:1;font-size:13px;color:var(--text);min-width:0}
.search input::placeholder{color:var(--faint)}
.btn.glow{box-shadow:0 0 0 2px rgba(234,179,8,.6),0 0 24px rgba(234,179,8,.35);animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.btn{
  display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:9px;
  border:1px solid var(--line); background:rgba(255,255,255,.045); color:var(--dim);
  font-size:12.5px; cursor:pointer; transition:all .18s; white-space:nowrap;
}
.btn:hover{color:var(--text);border-color:var(--line-2);background:rgba(255,255,255,.08)}
.btn .count{color:var(--gold);font-size:11px}
.btn.icon{width:34px;padding:0;justify-content:center}

/* ---------- 指标条 ---------- */
.metrics{display:flex;align-items:stretch;border-bottom:1px solid var(--line);margin-top:2px}
.metric{flex:1;padding:20px 24px 18px;border-left:1px solid rgba(255,255,255,.055);
  display:flex;flex-direction:column;align-items:flex-start;gap:9px}
.metric:first-child{padding-left:0;border-left:none}
.metric b{font-size:27px;font-weight:600;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.metric span{font-size:10.5px;letter-spacing:0;color:#6b7688;line-height:1}
.metric.hot b{color:var(--orange)}
.metric.rare b{color:var(--purple)}
.metric.gold b{color:var(--gold)}

/* ---------- 过滤条 ---------- */
.bar{display:flex;align-items:center;gap:8px;padding:15px 0 13px;
  border-bottom:1px solid rgba(255,255,255,.045);margin-bottom:14px}
.chip{
  display:inline-flex;align-items:baseline;gap:7px;
  border:1px solid transparent;background:transparent;color:var(--faint);border-radius:7px;
  padding:6px 11px;font-size:12.5px;line-height:1.2;letter-spacing:0;cursor:pointer;transition:all .16s;
}
.chip:hover{color:var(--text);background:rgba(255,255,255,.05)}
.chip.on{color:var(--text);background:rgba(255,255,255,.08);border-color:var(--line-2)}
.chip .n{font-size:10.5px;color:var(--faint);font-variant-numeric:tabular-nums}
.chip.on .n{color:rgba(238,242,248,.55)}
.result{margin-left:auto;font-size:11px;color:var(--faint);letter-spacing:.04em;font-variant-numeric:tabular-nums}

/* ---------- 卡片 ---------- */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(296px,1fr));gap:14px;padding:4px 0 44px}
.card{
  position:relative;background:var(--panel);border:1px solid var(--line);border-radius:11px;
  padding:16px 16px 14px 18px;display:flex;flex-direction:column;gap:9px;cursor:pointer;text-align:left;
  transition:transform .25s var(--ease),border-color .25s,box-shadow .25s,background .25s;
  animation:rise .45s var(--ease) both;
}
.card::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:2px;border-radius:2px;background:var(--line-2);transition:background .25s}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.card:hover{transform:translateY(-2px);border-color:var(--line-2);background:var(--panel-2);box-shadow:0 12px 30px rgba(0,0,0,.45)}
.card:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.card-top{display:flex;align-items:center;gap:10px;padding-right:36px}
.card .date{font-size:11.5px;color:var(--faint);letter-spacing:.02em}
.card .rarity{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:var(--dim);letter-spacing:.04em}
.card .rarity i{width:5px;height:5px;border-radius:50%;background:var(--faint);display:inline-block}
.card h3{font-size:15px;font-weight:600;line-height:1.4;letter-spacing:-.005em;color:#fff;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .sum{font-size:12.5px;line-height:1.62;color:#a9b3c5;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .thumb{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:7px;background:#0a0e14;display:block}
.card-foot{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:10px;border-top:1px solid var(--line);
  font-size:10.5px;color:var(--faint);letter-spacing:0;overflow:hidden;white-space:nowrap}
.card-foot .src{color:#8fb6dd}
.card-foot .demo{margin-left:auto;color:var(--orange);font-size:9px;letter-spacing:.14em;opacity:.75}

.pin{
  position:absolute;top:10px;right:10px;z-index:3;width:24px;height:24px;padding:0;border-radius:6px;
  display:grid;place-items:center;background:transparent;border:1px solid transparent;color:var(--faint);
  cursor:pointer;transition:all .16s;opacity:.5;
}
.card:hover .pin{opacity:1}
.pin:hover{color:var(--text);background:rgba(255,255,255,.08);border-color:var(--line)}
.pin.on{opacity:1;color:var(--gold);background:rgba(255,210,74,.10);border-color:rgba(255,210,74,.28)}

/* 稀有度：左侧竖线 + 圆点，不用整圈发光 */
.r-unexplained::before{background:var(--orange)}
.r-unexplained .rarity i{background:var(--orange);box-shadow:0 0 6px rgba(255,159,10,.7)}
.r-hidden::before{background:var(--purple)}
.r-hidden .rarity i{background:var(--purple);box-shadow:0 0 7px rgba(176,107,255,.8)}
.r-landmark::before{background:var(--gold)}
.r-landmark .rarity i{background:var(--gold);box-shadow:0 0 6px rgba(255,210,74,.6)}
.r-hidden{border-color:rgba(176,107,255,.22)}
.r-landmark{border-color:rgba(255,210,74,.18)}
.r-unexplained{border-color:rgba(255,159,10,.18)}

.empty{grid-column:1/-1;padding:90px 20px;text-align:center;color:var(--faint);font-size:13px;line-height:1.9}
.empty b{display:block;color:var(--dim);font-size:14px;font-weight:500;margin-bottom:6px}
.pager{display:flex;gap:10px;justify-content:center;align-items:center;padding:0 0 46px;color:var(--faint);font-size:12px}

/* ---------- 说明条 ---------- */

/* ---------- 详情 ---------- */
.modal{position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;padding:28px;
  background:rgba(2,3,6,.74);backdrop-filter:blur(10px)}
.modal.on{display:flex}
.sheet{
  position:relative;width:min(820px,100%);max-height:86vh;overflow:auto;background:#0a0e14;
  border:1px solid var(--line-2);border-radius:14px;padding:34px 36px;
  box-shadow:0 30px 80px rgba(0,0,0,.65); animation:pop .28s var(--ease);
}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:none}}
.sheet .close{position:absolute;top:16px;right:16px;width:28px;height:28px;border-radius:7px;border:1px solid var(--line);
  background:transparent;color:var(--faint);font-size:16px;cursor:pointer}
.sheet .close:hover{color:var(--text);border-color:var(--line-2)}
.md img{max-width:100%;border-radius:8px;margin:10px 0;display:block}
.md{font-size:13.5px;line-height:1.8;color:#c5cddb}
.md h1{font-size:19px;color:#fff;margin:2px 0 16px;padding-right:40px;letter-spacing:-.01em}
.md h2{font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.16em;margin:24px 0 8px}
.md p{margin:8px 0}
.md ul{margin:6px 0 6px 16px}
.md li{margin:3px 0}
.md blockquote{border-left:2px solid var(--blue);padding:10px 14px;margin:8px 0;color:#dbe6f5;
  background:rgba(77,163,255,.05);border-radius:0 6px 6px 0}
.md hr{border:none;border-top:1px solid var(--line);margin:20px 0}
.md code{background:rgba(255,255,255,.07);padding:1px 5px;border-radius:4px;font-size:11.5px}
.md a{color:var(--blue);text-decoration:none;border-bottom:1px solid rgba(77,163,255,.28);word-break:break-all}
.md a:hover{border-color:var(--blue)}

/* ---------- 成就 ---------- */
.sheet h1{font-size:19px;color:#fff;margin:2px 0 6px;letter-spacing:-.01em;padding-right:40px}
.ach-note{font-size:11.5px;color:var(--faint);line-height:1.7;margin-bottom:10px}
.ach{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-top:4px}
.ach .item{border:1px solid var(--line);border-radius:9px;padding:13px;background:rgba(255,255,255,.02)}
.ach .item.on{border-color:rgba(255,210,74,.26);background:rgba(255,210,74,.04)}
.ach .item.locked{border-style:dashed;border-color:rgba(255,255,255,.09);background:transparent}
.ach .item.locked.wide{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 18px}
.ach .item.locked h4{color:var(--faint)}
.ach .item.locked .reward{color:#4d5666;margin-top:0}
.ach h4{font-size:12.5px;margin-bottom:4px;font-weight:600}
.ach p{font-size:11px;color:var(--faint);line-height:1.6}
.ach .reward{font-size:10.5px;color:var(--gold);margin-top:7px;opacity:.9}
.progress{height:3px;border-radius:99px;background:rgba(255,255,255,.07);margin-top:9px;overflow:hidden}
.progress i{display:block;height:100%;background:var(--blue);border-radius:99px}
.hidden-block{margin-top:26px;padding-top:20px;border-top:1px solid var(--line)}
.hidden-head{display:flex;align-items:baseline;gap:10px;margin-bottom:6px}
.hidden-head span{font-size:11px;letter-spacing:.18em;color:var(--purple);text-transform:uppercase}
.hidden-head em{font-style:normal;font-size:11px;color:var(--faint)}

/* ---------- 页脚 / 提示 ---------- */
footer{border-top:1px solid var(--line);padding:22px 0 30px;color:var(--faint);font-size:11px;letter-spacing:.06em}
footer .row{display:flex;align-items:center;gap:8px}
footer b{color:#8fb6dd;font-weight:500}
footer .sub{margin-left:auto;opacity:.7;font-size:10px}
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,14px);z-index:300;
  background:#111722;border:1px solid var(--line-2);color:var(--text);padding:9px 16px;border-radius:9px;
  font-size:12px;opacity:0;pointer-events:none;transition:all .25s var(--ease)}
.toast.on{opacity:1;transform:translate(-50%,0)}

@media (max-width:820px){
  .wrap{padding:0 18px}
  .topbar{height:auto;padding:12px 0;flex-wrap:wrap;gap:10px}
  .search{width:100%;order:9}
  .metrics{flex-wrap:wrap}
  .metric{flex:1 1 33%;border-right:none;padding:14px 0}
  .bar{position:static}
  .sheet{padding:24px}
  .grid{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`

const CLIENT = String.raw`
(function(){
  var state = { data: null, filter: 'all', q: '', page: 1, per: 24 };
  var el = {
    grid: document.getElementById('grid'),
    stats: document.getElementById('stats'),
    chips: document.getElementById('chips'),
    search: document.getElementById('search'),
    result: document.getElementById('result'),
    modal: document.getElementById('modal'),
    sheet: document.getElementById('sheet'),
    achModal: document.getElementById('achModal'),
    achSheet: document.getElementById('achSheet'),
    toast: document.getElementById('toast'),
    pager: document.getElementById('pager'),
    name: document.getElementById('name'),
    footerName: document.getElementById('footerName'),
    achCount: document.getElementById('achCount')
  };
  var ICON_PIN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-1 6 3 3H7l3-3-1-6z"/><path d="M12 12v9"/></svg>';

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function toast(msg){
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function(){ el.toast.classList.remove('on'); }, 2000);
  }

  function counts(){
    var r = state.data.records;
    return {
      all: r.length,
      unexplained: r.filter(function(x){ return x.rarity === 'unexplained'; }).length,
      hidden: r.filter(function(x){ return x.rarity === 'hidden'; }).length,
      landmark: r.filter(function(x){ return x.rarity === 'landmark'; }).length,
      image: r.filter(function(x){ return x.hasImage; }).length
    };
  }

  function filtered(){
    var list = state.data.records.slice();
    if (state.filter === 'image') list = list.filter(function(r){ return r.hasImage; });
    else if (state.filter === 'landmark') list = list.filter(function(r){ return r.rarity === 'landmark' || r.landmark; });
    else if (state.filter !== 'all') list = list.filter(function(r){ return r.rarity === state.filter; });
    if (state.q){
      var q = state.q.toLowerCase();
      list = list.filter(function(r){
        return [r.title, r.summary, r.shape, r.date, r.sourceName, r.rarityLabel]
          .join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    return list;
  }

  function renderStats(){
    var c = state.data.counters;
    var items = [
      ['记录', c.total, ''],
      ['未解之谜', c.unexplainedOnly, 'hot'],
      ['隐蔽档案', c.hidden, 'rare'],
      ['覆盖国家', c.countries, ''],
      ['本地图片', c.images, 'gold']
    ];
    el.stats.innerHTML = items.map(function(it){
      return '<div class="metric ' + it[2] + '"><b>' + it[1] + '</b><span>' + it[0] + '</span></div>';
    }).join('');
    var unlocked = (state.data.achievements && state.data.achievements.unlockedCount) || 0;
    var total = (state.data.achievements && state.data.achievements.total) || 0;
    el.achCount.textContent = unlocked + '/' + total;
  }

  function renderChips(){
    var c = counts();
    var defs = [
      ['all', '全部', c.all],
      ['unexplained', '未解之谜', c.unexplained],
      ['hidden', '隐蔽档案', c.hidden],
      ['landmark', '地标事件', c.landmark],
      ['image', '有图', c.image]
    ];
    el.chips.querySelectorAll('.chip').forEach(function(chip){
      var key = chip.getAttribute('data-filter');
      var hit = defs.filter(function(d){ return d[0] === key; })[0];
      if (hit) chip.querySelector('.n').textContent = hit[2];
    });
  }

  function card(r, i){
    var pinned = (state.data.pins || []).indexOf(r.id) >= 0;
    var media = (r.hasImage && r.image)
      ? '<img class="thumb" loading="lazy" src="' + esc(r.image) + '" alt="">'
      : '';
    return '<article class="card r-' + esc(r.rarity) + '" tabindex="0" role="button" data-id="' + esc(r.id) + '" style="animation-delay:' + (i * 30) + 'ms">' +
      '<button class="pin' + (pinned ? ' on' : '') + '" data-pin="' + esc(r.id) + '" aria-label="置顶" title="置顶">' + ICON_PIN + '</button>' +
      '<div class="card-top"><time class="date mono">' + esc(r.date || '日期不详') + '</time>' +
        '<span class="rarity"><i></i>' + esc(r.rarityLabel) + '</span></div>' +
      '<h3>' + esc(r.title) + '</h3>' +
      '<p class="sum">' + esc(r.summary) + '</p>' +
      media +
      '<div class="card-foot"><span class="src">' + esc(r.sourceName) + '</span><span>·</span><span>' + esc(r.recordTypeLabel) + '</span>' +
        (r.demo ? '<span class="demo">DEMO</span>' : '') + '</div>' +
      '</article>';
  }

  function renderCards(){
    var list = filtered();
    var start = (state.page - 1) * state.per;
    var page = list.slice(start, start + state.per);
    el.result.textContent = list.length + ' 条记录';
    if (!list.length){
      el.grid.innerHTML = '<div class="empty"><b>这里还没有档案</b>回到会话里说一句想查的地点或年份，记录会自动归进来。</div>';
      el.pager.innerHTML = '';
      return;
    }
    el.grid.innerHTML = page.map(card).join('');
    var pages = Math.max(1, Math.ceil(list.length / state.per));
    el.pager.innerHTML = pages > 1
      ? '<button class="btn" data-page="prev"' + (state.page <= 1 ? ' disabled' : '') + '>上一页</button><span class="mono">' + state.page + ' / ' + pages + '</span><button class="btn" data-page="next"' + (state.page >= pages ? ' disabled' : '') + '>下一页</button>'
      : '';
  }

  function openDetail(id){
    el.modal.classList.add('on');
    el.sheet.innerHTML = '<button class="close" aria-label="关闭">×</button><div class="md"><p>正在调阅…</p></div>';
    el.sheet.querySelector('.close').onclick = closeModal;
    (window.__UFO_DETAILS__ && window.__UFO_DETAILS__[id] ? Promise.resolve(window.__UFO_DETAILS__[id]) : fetch('records/' + encodeURIComponent(id) + '.json', { cache: 'no-store' })
      .then(function(r){ if (!r.ok) throw new Error('read failed'); return r.json(); }))
      .then(function(detail){
        var link = detail.sourceUrl
          ? '<p><a href="' + esc(detail.sourceUrl) + '" target="_blank" rel="noreferrer noopener">打开原始来源 ↗</a></p>'
          : '';
        el.sheet.innerHTML = '<button class="close" aria-label="关闭">×</button><div class="md">' + detail.html + link + '</div>';
        el.sheet.querySelector('.close').onclick = closeModal;
        el.sheet.scrollTop = 0;
      })
      .catch(function(){
        el.sheet.innerHTML = '<button class="close">×</button><div class="md"><p>读取失败：详情文件可能已被移动。</p></div>';
        el.sheet.querySelector('.close').onclick = closeModal;
      });
  }
  function closeModal(){ el.modal.classList.remove('on'); }

  function openAchievements(){
    var ach = state.data.achievements || {};
    var items = ach.items || [];
    var pub = items.filter(function(i){ return !i.hidden; });
    var hid = items.filter(function(i){ return i.hidden; });
    var hidFound = hid.filter(function(i){ return i.unlocked; }).length;

    function itemHtml(x){
      var on = Boolean(x.unlocked);
      var have = x.have == null ? 0 : x.have;
      var need = x.need == null ? 1 : x.need;
      var pct = on ? 100 : Math.min(100, Math.round((have / need) * 100));
      return '<div class="item ' + (on ? 'on' : '') + '">' +
        '<h4>' + (on ? '🏆 ' : '🔒 ') + esc(x.name) + '</h4>' +
        '<p>' + esc(x.desc) + '</p>' +
        '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
        '<div class="reward">' + (on ? '已解锁 · ' : '进度 ' + Math.min(have, need) + '/' + need + ' · ') + esc(x.reward) + '</div>' +
        '</div>';
    }

    var lockedCount = hid.length - hidFound;
    var hiddenHtml = hid.filter(function(i){ return i.unlocked; }).map(itemHtml).join('');
    if (lockedCount > 0) {
      hiddenHtml += '<div class="item locked wide"><div><h4>🔒 还有 ' + lockedCount + ' 枚尚未发现</h4>' +
        '<p>它们不会提前告诉你名字，也不会告诉你条件。</p></div>' +
        '<div class="reward">继续检索</div></div>';
    }

    el.achSheet.innerHTML =
      '<h1>成就</h1>' +
      '<p class="ach-note">公开成就 ' + pub.filter(function(i){return i.unlocked;}).length + '/' + pub.length +
      ' · 全部由已收录的证据推导，不看运气。</p>' +
      '<div class="ach">' + pub.map(itemHtml).join('') + '</div>' +
      '<div class="hidden-block">' +
        '<div class="hidden-head"><span>隐藏成就</span><em class="mono">' + hidFound + ' / ' + hid.length + '</em></div>' +
        '<p class="ach-note">这些不会显示名字与条件。目前你还没有获得 ' + (hid.length - hidFound) + ' 枚。</p>' +
        '<div class="ach">' + hiddenHtml + '</div>' +
      '</div>';
    el.achModal.classList.add('on');
  }

  function post(url, body){
    return fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
      .then(function(r){ if (!r.ok) throw new Error('request failed'); return r.json(); });
  }

  function bind(){
    el.grid.addEventListener('click', function(e){
      var pin = e.target.closest('[data-pin]');
      if (pin){
        e.stopPropagation();
        var id = pin.getAttribute('data-pin');
        var on = !pin.classList.contains('on');
        post('api/pin', { id: id, pinned: on }).then(function(res){
          state.data.pins = res.pins;
          renderCards();
          toast(on ? '已置顶' : '已取消置顶');
        }).catch(function(){ toast('置顶失败'); });
        return;
      }
      var c = e.target.closest('.card');
      if (c) openDetail(c.getAttribute('data-id'));
    });
    el.grid.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var c = e.target.closest('.card');
      if (c){ e.preventDefault(); openDetail(c.getAttribute('data-id')); }
    });
    el.chips.addEventListener('click', function(e){
      var chip = e.target.closest('[data-filter]');
      if (!chip) return;
      state.filter = chip.getAttribute('data-filter');
      state.page = 1;
      el.chips.querySelectorAll('.chip').forEach(function(c){ c.classList.remove('on'); });
      chip.classList.add('on');
      renderCards();
    });
    el.pager.addEventListener('click', function(e){
      var b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      state.page += b.getAttribute('data-page') === 'next' ? 1 : -1;
      renderCards();
      window.scrollTo({ top:0, behavior:'smooth' });
    });
    var t;
    el.search.addEventListener('input', function(e){
      clearTimeout(t);
      t = setTimeout(function(){ state.q = e.target.value.trim(); state.page = 1; renderCards(); }, 150);
    });
    document.getElementById('openAch').onclick = openAchievements;
    el.achModal.addEventListener('click', function(e){ if (e.target === el.achModal) el.achModal.classList.remove('on'); });
    el.modal.addEventListener('click', function(e){ if (e.target === el.modal) closeModal(); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ closeModal(); el.achModal.classList.remove('on'); } });
    document.getElementById('rename').onclick = function(){
      var next = prompt('你的代号：', state.data.profile.name || '');
      if (!next || !next.trim()) return;
      post('api/name', { name: next.trim() }).then(function(res){
        state.data.profile.name = res.name;
        el.name.textContent = res.name;
        el.footerName.textContent = res.name;
        document.title = res.name + ' 的 UFO 档案馆';
        toast('代号已更新');
      }).catch(function(){ toast('改名失败'); });
    };
  }

  (window.__UFO_DATA__ ? Promise.resolve(window.__UFO_DATA__) : fetch('data.json', { cache:'no-store' })
    .then(function(r){ if (!r.ok) throw new Error('no data'); return r.json(); }))
    .then(function(data){
      state.data = data;
      if (!data.profile.name){
        el.name.textContent = '未登记观测者';
        el.footerName.textContent = '未登记观测者';
      }
      renderStats();
      renderChips();
      renderCards();
      bind();
      try {
        var unlockedMap = (data.achievements && data.achievements.unlocked) || {};
        var latest = null;
        Object.keys(unlockedMap).forEach(function(id){
          var ts = Date.parse(unlockedMap[id]);
          if (Date.now() - ts < 600000 && (!latest || ts > latest.ts)) latest = { id: id, ts: ts };
        });
        if (latest) {
          var items = (data.achievements.items || []);
          var hit = items.filter(function(i){ return i.id === latest.id; })[0];
          if (hit) {
            toast('🏆 解锁：' + hit.name + (hit.reward ? ' —— ' + hit.reward : ''));
            el.openAch.classList.add('glow');
            setTimeout(function(){ el.openAch.classList.remove('glow'); }, 4000);
          }
        }
      } catch (e) {}
      var deep = /^#r-(.+)$/.exec(location.hash || '');
      if (deep) openDetail(decodeURIComponent(deep[1]));
      if (/[?&]ach=1/.test(location.search)) openAchievements();
    })
    .catch(function(err){
      el.grid.innerHTML = '<div class="empty"><b>读不到档案数据</b>请通过 Harness 的 /ufo/ 站点打开本页，或直接打开同目录的 index.html。</div>';
      console.error(err);
    });
})();
`

/**
 * @param {{ name?: string|null, version: string }} options
 */
export function renderIndexHtml(options) {
  const name = options.name?.trim() || '未登记观测者'
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(name)} 的 UFO 档案馆</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div class="wrap topbar">
    <div class="brand">
      <span class="eyebrow">Deep Archive</span>
      <h1><span class="name" id="name">${esc(name)}</span><span class="slash">/</span><span class="sub">UFO 档案馆</span></h1>
    </div>
    <div class="grow"></div>
    <label class="search">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
      <input id="search" type="search" placeholder="地点、形状、年份…" aria-label="搜索档案">
    </label>
    <button class="btn" id="openAch">🏆 成就 <span class="count mono" id="achCount">0/7</span></button>
    <button class="btn" id="rename">代号</button>
  </div>
</header>

<main class="wrap">
  <section class="metrics" id="stats"></section>
  <div class="bar">
    <div id="chips" style="display:flex;gap:2px;flex-wrap:wrap">
      <button class="chip on" data-filter="all">全部<span class="n mono"></span></button>
      <button class="chip" data-filter="unexplained">未解之谜<span class="n mono"></span></button>
      <button class="chip" data-filter="hidden">隐蔽档案<span class="n mono"></span></button>
      <button class="chip" data-filter="landmark">地标事件<span class="n mono"></span></button>
      <button class="chip" data-filter="image">有图<span class="n mono"></span></button>
    </div>
    <span class="result" id="result"></span>
  </div>

  <section class="grid" id="grid">
    <div class="empty"><b>正在读取档案…</b></div>
  </section>
  <div class="pager" id="pager"></div>

</main>

<footer>
  <div class="wrap row">
    <span>由 <b>DSH-UFO</b> 与 <b id="footerName">${esc(name)}</b> 共同创建</span>
    <span class="sub mono">v${esc(options.version)} · 数据保存在本机</span>
  </div>
</footer>

<div class="modal" id="modal"><div class="sheet" id="sheet"></div></div>
<div class="modal" id="achModal"><div class="sheet" id="achSheet"></div></div>
<div class="toast" id="toast"></div>
${options.data ? `<script>window.__UFO_DATA__=${scriptJson(options.data)}</script>` : ''}${options.details ? `<script>window.__UFO_DETAILS__=${scriptJson(options.details)}</script>` : ''}
<script>${CLIENT}</script>
</body>
</html>`
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
