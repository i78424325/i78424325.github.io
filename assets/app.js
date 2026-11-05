/* МегаОпт Электроника: корзина, поиск, сортировка каталога, оформление заказа.
   Сайт работает и без скриптов (все товары и варианты — обычные ссылки); скрипт
   добавляет корзину и удобства. */
(function () {
  'use strict';
  var KEY = 'mo_cart';
  var fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }

  // --- статистика сайта для владельца (анонимно: случайный id браузера, без личных данных) ---
  var vid = (function () {
    try {
      var v = localStorage.getItem('mo_vid');
      if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('mo_vid', v); }
      return v;
    } catch (e) { return 'nostore'; }
  })();
  function ev(t, extra) {
    var body = JSON.stringify(Object.assign({t: t, vid: vid, path: location.pathname}, extra || {}));
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/ev', new Blob([body], {type: 'application/json'}));
      else fetch('/api/ev', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: body, keepalive: true});
    } catch (e) {}
  }
  var utm = new URLSearchParams(location.search).get('utm_source') || '';
  ev('view', {ref: document.referrer, src: utm});
  if (/^\/p\//.test(location.pathname)) {
    var h1 = document.querySelector('h1');
    ev('product', {item: h1 ? h1.textContent.trim() : location.pathname});
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} badge(); }
  function count() { return load().reduce(function (s, i) { return s + i.q; }, 0); }
  function badge() {
    var n = count();
    document.querySelectorAll('[data-cart-n]').forEach(function (b) { b.textContent = n || ''; b.setAttribute('data-n', n); });
  }

  // --- «В корзину» ---
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add]');
    if (!b) return;
    e.preventDefault();
    var it = JSON.parse(b.getAttribute('data-add'));
    ev('cart', {item: it.n || it.a});
    var c = load();
    var ex = c.filter(function (i) { return i.a === it.a; })[0];
    if (ex) ex.q = Math.min(9, ex.q + 1); else { it.q = 1; c.push(it); }
    save(c);
    b.textContent = 'В корзине ✓';
    b.classList.add('ghost');
    b.setAttribute('aria-live', 'polite');
    setTimeout(function () { b.innerHTML = 'Перейти в корзину'; b.removeAttribute('data-add'); b.setAttribute('href', '/cart/'); }, 700);
  });

  // --- меню каталога (компьютер) ---
  var cb = document.querySelector('.catbtn'), mega = document.querySelector('.mega');
  if (cb && mega) {
    cb.addEventListener('click', function () {
      var on = mega.classList.toggle('on');
      cb.setAttribute('aria-expanded', on);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.mega') && !e.target.closest('.catbtn')) { mega.classList.remove('on'); cb.setAttribute('aria-expanded', 'false'); }
    });
  }

  // --- поиск: скрытые теги, раскладка, транслит, опечатки ---
  // search.json: c — карточки [название, ссылка, цена, раздел, фото, теги, новинка],
  //              v — варианты [название, ссылка, цена, № карточки, текст]
  var idx = null, loading = null, vocab = null;
  function index() {
    if (idx) return Promise.resolve(idx);
    if (!loading) loading = fetch('/assets/search.json').then(function (r) { return r.json(); }).then(function (d) { idx = d; return d; });
    return loading;
  }
  // как search.norm() на сервере
  function norm(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е')
      .replace(/(\d)\s*гб(?![а-я])/g, '$1gb').replace(/(\d)\s*тб(?![а-я])/g, '$1tb')
      .replace(/[^a-zа-я0-9+]+/g, ' ')
      .replace(/([a-zа-я])(?=\d)|(\d)(?=[a-zа-я])/g, '$1$2 ')
      .replace(/\s+/g, ' ').trim();
  }
  var EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`", RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  function swap(w) {   // «шзрщту» → «iphone», «ghbdtn» → «привет»
    return w.toLowerCase().split('').map(function (ch) {
      var i = RU.indexOf(ch); if (i >= 0) return EN[i];
      i = EN.indexOf(ch); return i >= 0 ? RU[i] : ch;
    }).join('');
  }
  var TR = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ъ: '', ь: ''};
  function translit(w) { return w.split('').map(function (ch) { return ch in TR ? TR[ch] : ch; }).join(''); }

  function words() {   // все слова каталога с частотой — для исправления опечаток
    if (vocab) return vocab;
    vocab = {};
    var add = function (t) { t.split(' ').forEach(function (w) { if (w.length > 2) vocab[w] = (vocab[w] || 0) + 1; }); };
    idx.c.forEach(function (c) { add(c[5]); });
    idx.v.forEach(function (v) { add(v[4]); });
    return vocab;
  }
  function dist(a, b, max) {   // расстояние Левенштейна с ранним выходом
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var best = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // Слово запроса -> варианты написания (каждый — список токенов).
  function parse(q) {
    var voc = null;
    return q.split(/\s+/).filter(Boolean).map(function (raw) {
      var alts = [norm(raw), norm(swap(raw))];
      alts.push(translit(alts[0]), translit(alts[1]));
      alts = alts.filter(function (a, i) { return a && alts.indexOf(a) === i; });
      var known = alts.some(function (a) {
        return a.split(' ').every(function (t) {
          voc = voc || words();
          if (/^\d+$/.test(t) || t.length < 3) return true;
          for (var w in voc) if (w.indexOf(t) === 0) return true;
          return false;
        });
      });
      if (!known && alts[0].length >= 4 && alts[0].indexOf(' ') < 0) {
        var max = alts[0].length >= 8 ? 2 : 1, best = null, bd = max + 1;
        alts.forEach(function (a) {
          for (var w in voc) {
            var d = dist(a, w.slice(0, a.length + 1), max);
            if (d < bd || (d === bd && best && voc[w] > voc[best])) { bd = d; best = w; }
          }
        });
        if (best) alts.push(best);
      }
      return alts.map(function (a) { return a.split(' ').filter(Boolean); }).filter(function (a) { return a.length; });
    }).filter(function (w) { return w.length; });
  }
  function tok(t, text) {   // 3 — слово целиком, 2 — начало слова, 1 — часть слова
    if (text.indexOf(' ' + t + ' ') >= 0) return 3;
    if (/^\d+$/.test(t)) return 0;
    if (text.indexOf(' ' + t) >= 0) return 2;
    return t.length >= 4 && text.indexOf(t) >= 0 ? 1 : 0;
  }
  function wscore(alts, name, tags) {
    var best = 0;
    alts.forEach(function (toks) {
      var s = Infinity;
      toks.forEach(function (t) { s = Math.min(s, Math.max(tok(t, name), tok(t, tags) - 0.5)); });
      if (s > best) best = s;
    });
    return best;
  }
  function find(q, lim) {
    var ws = parse(q);
    if (!ws.length) return {list: [], loose: false};
    var run = function (miss) {
      var best = {};
      idx.v.forEach(function (v) {
        var c = idx.c[v[3]], name = ' ' + v[4] + ' ', tags = ' ' + c[5] + ' ', total = 0, missed = 0;
        for (var i = 0; i < ws.length; i++) {
          var s = wscore(ws[i], name, tags);
          if (!s && ++missed > miss) return;
          total += s;
        }
        if (c[3] === 'Аксессуары' || c[3] === 'Уценка') total -= 1.5;
        if (v[2]) total += 0.5;
        var b = best[v[3]];
        if (!b || total > b.s) best[v[3]] = {s: total, v: v, c: c, n: v[3]};
      });
      return Object.keys(best).map(function (k) { return best[k]; })
        .sort(function (a, b) { return b.s - a.s || (!a.v[2]) - (!b.v[2]) || b.c[6] - a.c[6] || (b.c[7] || 0) - (a.c[7] || 0) || a.n - b.n; });
    };
    var r = run(0), loose = false;
    if (!r.length && ws.length > 1) { r = run(1); loose = true; }
    return {list: r.slice(0, lim), loose: loose};
  }
  var thumb = function (src, cls) { return src ? '<img src="' + src + '" alt="" loading="lazy" class="' + (cls || '') + '">' : ''; };

  document.querySelectorAll('.search').forEach(function (box) {
    var inp = box.querySelector('input'), sug = box.querySelector('.suggest');
    if (!inp || !sug) return;
    var act = -1;
    inp.addEventListener('focus', index);
    inp.addEventListener('input', function () {
      var q = inp.value;
      if (q.trim().length < 2) { sug.classList.remove('on'); return; }
      index().then(function () {
        if (inp.value !== q) return;
        var r = find(q, 8).list;
        act = -1;
        var all = '/search/?q=' + encodeURIComponent(q);
        sug.innerHTML = r.map(function (x) {
          return '<a href="' + x.v[1] + '">' + (x.c[4] ? thumb(x.c[4], 'th') : '<i class="th"></i>') + '<span>' + esc(x.v[0]) + '</span><b>' + (x.v[2] ? fmt(x.v[2]) : 'ожидаем') + '</b></a>';
        }).join('') + '<a href="' + all + '"><span>' + (r.length ? 'Все результаты' : 'Ничего не нашли — показать похожие') + '</span><b>→</b></a>';
        sug.classList.add('on');
      });
    });
    inp.addEventListener('keydown', function (e) {
      var links = sug.querySelectorAll('a');
      if (!links.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        act = (act + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach(function (l, i) { l.classList.toggle('act', i === act); });
      } else if (e.key === 'Enter' && act >= 0) { e.preventDefault(); location.href = links[act].href; }
      else if (e.key === 'Escape') sug.classList.remove('on');
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) sug.classList.remove('on'); });
  });

  // --- страница поиска ---
  var sr = document.getElementById('search-results');
  if (sr) {
    var q = new URLSearchParams(location.search).get('q') || '';
    document.querySelectorAll('.search input').forEach(function (i) { i.value = q; });
    var h = document.getElementById('search-h');
    if (h) h.textContent = q ? 'Поиск: «' + q + '»' : 'Поиск';
    index().then(function () {
      var res = find(q, 200), r = res.list;
      if (q) ev('search', {q: q, n: r.length});
      if (!r.length) { sr.innerHTML = '<p class="empty">Ничего не нашли. Напишите нам в Телеграм — найдём у поставщиков.</p>'; return; }
      if (h) h.textContent = (res.loose ? 'Похожие товары: «' : 'Поиск: «') + q + '» — ' + r.length;
      sr.innerHTML = r.map(function (x) {
        var v = x.v, c = x.c;
        return '<article class="pc"><a class="pic" href="' + v[1] + '">' + thumb(c[4]) + '</a><a class="nm" href="' + v[1] + '">' + esc(v[0]) + '</a>' +
          '<span class="muted" style="font-size:13px">' + esc(c[3]) + '</span><div>' +
          (v[2] ? '<span class="price">' + fmt(v[2]) + '</span>' : '<span class="ask">Ожидаем поставку</span>') +
          '</div><a class="btn' + (v[2] ? '' : ' ghost') + '" href="' + v[1] + '">' + (v[2] ? 'Купить' : 'Узнать цену') + '</a></article>';
      }).join('');
    });
  }

  // --- каталог: фильтры, сортировка, «только с ценой», «показать ещё» ---
  var grid = document.querySelector('.grid[data-list]');
  if (grid) {
    var PAGE = 40, shown = PAGE;
    var cards = Array.prototype.slice.call(grid.children);
    cards.forEach(function (c, i) { c._i = i; });
    var sortSel = document.getElementById('sort'), onlyPriced = document.getElementById('priced'), more = document.querySelector('.more');
    var ff = document.querySelector('[data-filters]'), nores = document.querySelector('.nores');
    var num = function (v) { return +String(v || '').replace(/\D/g, '') || 0; };
    function wanted() {
      var w = {}, n = 0;
      if (!ff) return {w: w, n: 0, min: 0, max: 0};
      ff.querySelectorAll('input[type=checkbox]:checked').forEach(function (i) { (w[i.name] = w[i.name] || []).push(i.value); n++; });
      var min = ff.pmin ? num(ff.pmin.value) : 0, max = ff.pmax ? num(ff.pmax.value) : 0;
      return {w: w, n: n + (min ? 1 : 0) + (max ? 1 : 0), min: min, max: max};
    }
    function fits(c, f) {
      var p = +c.dataset.p || 0;
      if (onlyPriced && onlyPriced.checked && !p) return false;
      if ((f.min || f.max) && (!p || (f.min && p < f.min) || (f.max && p > f.max))) return false;
      for (var k in f.w) {
        var have = (c.getAttribute('data-' + k) || '').split('|');
        if (!f.w[k].some(function (v) { return have.indexOf(v) >= 0; })) return false;
      }
      return true;
    }
    function apply() {
      var list = cards.slice(), f = wanted();
      var s = sortSel ? sortSel.value : '';
      if (s === 'new') {
        list.sort(function (a, b) { return (b.dataset.new ? 1 : 0) - (a.dataset.new ? 1 : 0) || a._i - b._i; });
      } else if (s === 'az') {
        var nm = function (c) { var x = c.querySelector('.nm'); return x ? x.textContent.trim() : ''; };
        list.sort(function (a, b) { return nm(a).localeCompare(nm(b), 'ru', {numeric: true}); });
      } else if (s === 'asc' || s === 'desc') {
        list.sort(function (a, b) {
          var pa = +a.dataset.p || 0, pb = +b.dataset.p || 0;
          if (!pa) return 1; if (!pb) return -1;
          return s === 'asc' ? pa - pb : pb - pa;
        });
      }
      var n = 0;
      list.forEach(function (c) {
        grid.appendChild(c);
        var ok = fits(c, f);
        c.classList.toggle('hide', !ok || n >= shown);
        if (ok) n++;
      });
      if (more) more.style.display = n > shown ? '' : 'none';
      if (nores) nores.hidden = n > 0;
      document.querySelectorAll('[data-fn]').forEach(function (x) { x.textContent = n; });
      document.querySelectorAll('[data-fcount]').forEach(function (x) { x.textContent = f.n || ''; });
    }
    var again = function () { shown = PAGE; apply(); };
    if (sortSel) sortSel.addEventListener('change', again);
    if (onlyPriced) onlyPriced.addEventListener('change', again);
    if (more) more.addEventListener('click', function () { shown += PAGE * 2; apply(); });
    if (ff) {
      ff.addEventListener('change', again);
      ff.addEventListener('input', function (e) { if (e.target.name === 'pmin' || e.target.name === 'pmax') again(); });
      ff.addEventListener('reset', function () { setTimeout(again, 0); });
      ff.addEventListener('submit', function (e) { e.preventDefault(); });
      var close = function () { ff.classList.remove('on'); document.body.classList.remove('fopen'); };
      document.querySelectorAll('[data-fopen]').forEach(function (b) { b.addEventListener('click', function () { ff.classList.add('on'); document.body.classList.add('fopen'); }); });
      ff.querySelectorAll('[data-fclose]').forEach(function (b) { b.addEventListener('click', close); });
      document.querySelectorAll('[data-freset]').forEach(function (b) { b.addEventListener('click', function () { ff.reset(); if (onlyPriced) onlyPriced.checked = false; }); });
    }
    apply();
  }

  // --- корзина и заказ ---
  var cartBox = document.getElementById('cart');
  if (cartBox) {
    var form = document.getElementById('order');
    var tpl = document.getElementById('row-tpl').innerHTML;
    var CARD_PCT = +cartBox.dataset.cardPct || 10;
    var cardPrice = function (it) { return it.c || Math.ceil(it.p * (1 + CARD_PCT / 100) / 100) * 100 - 10; };
    function render() {
      var c = load(), byCard = form.pay.value === 'card';
      if (!c.length) {
        document.getElementById('cart-full').hidden = true;
        document.getElementById('cart-empty').hidden = false;
        return;
      }
      document.getElementById('cart-items').innerHTML = c.map(function (it, i) {
        var unit = byCard ? cardPrice(it) : it.p;
        return tpl.replace(/{i}/g, i).replace(/{u}/g, esc(it.u)).replace(/{n}/g, esc(it.n))
          .replace('{q}', it.q).replace('{s}', fmt(unit * it.q)).replace('{pic}', it.i ? '<img src="' + esc(it.i) + '" alt="">' : '<span style="width:34px;height:66px;border-radius:9px;border:2px solid #1B1F2A;background:' + esc(it.h || '#C9D6EA') + ';display:block"></span>');
      }).join('');
      var goods = c.reduce(function (s, it) { return s + it.p * it.q; }, 0);
      var tot = c.reduce(function (s, it) { return s + (byCard ? cardPrice(it) : it.p) * it.q; }, 0);
      var n = c.reduce(function (s, it) { return s + it.q; }, 0);
      document.getElementById('s-n').textContent = n;
      document.getElementById('s-goods').textContent = fmt(goods);
      document.getElementById('s-card').hidden = !byCard;
      document.getElementById('s-card-v').textContent = '+' + fmt(tot - goods);
      document.getElementById('s-del').textContent = form.way.value === 'courier' ? 'курьеру отдельно' : 'бесплатно';
      document.getElementById('s-tot').textContent = fmt(tot);
      document.getElementById('submit-tot').textContent = fmt(tot);
      document.getElementById('addr').hidden = form.way.value !== 'courier';
      quote(tot);
    }
    // --- скидки: первая покупка, промокод, бонусы — считает сервер ---
    var qTimer, lastQ = null;
    function quote(tot) {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        var body = {pay: form.pay.value, promo: form.promo.value.trim(), use_bonus: form.use_bonus.checked,
          items: load().map(function (it) { return {a: it.a, q: it.q}; })};
        fetch('/api/quote', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d.ok) return;
            lastQ = d;
            document.getElementById('s-disc').innerHTML = (d.lines || []).map(function (l) {
              return '<div><span class="muted">' + esc(l[0]) + '</span><span class="minus">−' + fmt(l[1]) + '</span></div>';
            }).join('');
            document.getElementById('promo-note').textContent = d.note || '';
            document.getElementById('s-tot').textContent = fmt(d.total);
            document.getElementById('submit-tot').textContent = fmt(d.total);
          }).catch(function () {});
      }, 150);
    }
    if (load().length) ev('checkout', {n: count()});
    fetch('/api/me').then(function (r) { return r.json(); }).then(function (d) {
      var P = (d.user ? d.user.promo : d.promo) || {};
      document.getElementById('promo-welcome').textContent = fmt(P.welcome || 0);
      document.getElementById('promo-login').hidden = !!d.user;
      document.getElementById('promo-in').hidden = !d.user;
      if (d.user) {
        document.getElementById('bonus-row').hidden = !(d.user.balance > 0);
        document.getElementById('bonus-bal').textContent = fmt(d.user.balance);
        if (!form.name.value && d.user.name) form.name.value = d.user.name;
        if (!form.phone.value && d.user.phone) form.phone.value = '+' + d.user.phone;
      }
      render();
    }).catch(function () {});
    document.getElementById('promo-apply').addEventListener('click', render);
    cartBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]');
      if (!b) return;
      var c = load(), i = +b.dataset.i, d = b.dataset.q;
      if (d === 'rm') c.splice(i, 1); else c[i].q = Math.max(1, Math.min(9, c[i].q + (+d)));
      save(c); render();
    });
    form.addEventListener('change', render);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = document.getElementById('err'), btn = form.querySelector('button[type=submit]');
      err.textContent = '';
      var phone = form.phone.value.replace(/[^\d+]/g, '');
      if (!form.name.value.trim()) { err.textContent = 'Напишите, как к вам обращаться'; form.name.focus(); return; }
      if (phone.replace(/\D/g, '').length < 10) { err.textContent = 'Проверьте номер телефона'; form.phone.focus(); return; }
      if (form.way.value === 'courier' && !form.address.value.trim()) { err.textContent = 'Укажите адрес доставки'; form.address.focus(); return; }
      if (!form.agree.checked) { err.textContent = 'Нужно согласие на обработку данных'; return; }
      btn.disabled = true;
      var body = {
        name: form.name.value.trim(), phone: form.phone.value.trim(), way: form.way.value, pay: form.pay.value,
        address: form.address.value.trim(), comment: form.comment.value.trim(), website: form.website.value,
        promo: form.promo.value.trim(), use_bonus: form.use_bonus.checked,
        items: load().map(function (it) { return {a: it.a, q: it.q}; })
      };
      fetch('/api/order', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
        .then(function (r) { return r.json().then(function (d) { return {ok: r.ok, d: d}; }); })
        .then(function (res) {
          if (!res.ok || !res.d.ok) throw new Error(res.d.error || 'Не получилось отправить заказ');
          save([]);
          ev('order', {item: res.d.number});
          document.getElementById('cart-full').hidden = true;
          document.getElementById('done').hidden = false;
          document.getElementById('order-no').textContent = res.d.number;
          window.scrollTo(0, 0);
        })
        .catch(function (x) {
          err.textContent = (x && x.message && x.message !== 'Failed to fetch' ? x.message : 'Нет связи с сайтом') +
            '. Позвоните или напишите нам — оформим вручную.';
          btn.disabled = false;
        });
    });
    render();
  }

  // --- отзыв о товаре: на модерацию владельцу ---
  var rf = document.querySelector('form[data-review]');
  if (rf) {
    rf.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = rf.querySelector('[data-err]'), btn = rf.querySelector('button[type=submit]');
      var r = rf.querySelector('input[name=rating]:checked');
      var body = {article: rf.article.value, rating: r ? +r.value : 0, name: rf.name.value.trim(),
        pros: rf.pros.value.trim(), cons: rf.cons.value.trim(), text: rf.text.value.trim(), order: rf.order.value.trim()};
      err.hidden = true;
      btn.disabled = true;
      fetch('/api/review', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
        .then(function (x) { return x.json().then(function (d) { return {ok: x.ok, d: d}; }); })
        .then(function (res) {
          if (!res.ok || !res.d.ok) throw new Error(res.d.error || 'Не получилось отправить');
          rf.hidden = true;
          rf.parentNode.querySelector('.rv-done').hidden = false;
        })
        .catch(function (x) {
          err.textContent = x && x.message && x.message !== 'Failed to fetch' ? x.message : 'Нет связи с сайтом';
          err.hidden = false;
          btn.disabled = false;
        });
    });
  }

  // --- приглашение: ?ref=КОД запоминаем до регистрации ---
  try {
    var refQ = new URLSearchParams(location.search).get('ref');
    if (refQ) localStorage.setItem('mo_ref', refQ.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
  } catch (e) {}
  var myRef = function () { try { return localStorage.getItem('mo_ref') || ''; } catch (e) { return ''; } };

  // --- личный кабинет ---
  var accBox = document.getElementById('acc');
  if (accBox) {
    var post = function (url, body) {
      return fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body || {})})
        .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || 'Ошибка'); return d; }); });
    };
    var back = function () { location.href = /back=cart/.test(location.search) ? '/cart/' : '/account/'; };
    var fill = function (root, P) {
      root.querySelectorAll('[data-welcome]').forEach(function (x) { x.textContent = fmt(P.welcome); });
      root.querySelectorAll('[data-bonus]').forEach(function (x) { x.textContent = fmt(P.referral_bonus); });
      root.querySelectorAll('[data-min]').forEach(function (x) { x.textContent = fmt(P.min_total); });
    };
    var showLogin = function (d) {
      accBox.innerHTML = document.getElementById('acc-login').innerHTML;
      fill(accBox, d.promo || {});
      var M = d.methods || {}, tabs = accBox.querySelector('.acc-tabs'), f = accBox.querySelector('.acc-form');
      var err = f.querySelector('.err'), btn = f.querySelector('button'), ch = null;
      var labels = {sms: ['Телефон', 'tel', '+7 900 000-00-00'], email: ['Почта', 'email', 'you@mail.ru']};
      var pick = function (c) {
        ch = c; f.dataset.step = 'target'; err.textContent = '';
        tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.ch === c); });
        f.querySelector('[data-label]').textContent = labels[c][0];
        f.target.type = labels[c][1]; f.target.placeholder = labels[c][2]; f.target.value = ''; f.target.readOnly = false;
        f.querySelector('[data-code]').hidden = true; btn.textContent = 'Получить код';
      };
      ['sms', 'email'].filter(function (c) { return M[c]; }).forEach(function (c) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.ch = c; b.setAttribute('role', 'tab');
        b.textContent = c === 'sms' ? 'По телефону' : 'По почте'; b.onclick = function () { pick(c); }; tabs.appendChild(b);
      });
      if (tabs.children.length) pick(tabs.children[0].dataset.ch); else { f.hidden = true; tabs.hidden = true; }
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); err.textContent = ''; btn.disabled = true;
        var step = f.dataset.step === 'target'
          ? post('/api/auth/code', {channel: ch, target: f.target.value}).then(function (r) {
              f.dataset.step = 'code'; f.target.value = r.target; f.target.readOnly = true;
              f.querySelector('[data-code]').hidden = false; f.code.focus(); btn.textContent = 'Войти';
            })
          : post('/api/auth/verify', {channel: ch, target: f.target.value, code: f.code.value, ref: myRef()}).then(back);
        step.catch(function (x) { err.textContent = x.message; }).then(function () { btn.disabled = false; });
      });
      var alt = accBox.querySelector('.acc-alt'), any = false;
      if (M.max) {
        any = true;
        var mb = document.createElement('button'); mb.type = 'button'; mb.className = 'btn ghost wide'; mb.textContent = 'Войти через MAX';
        mb.onclick = function () {
          post('/api/auth/max', {ref: myRef()}).then(function (r) {
            window.open(r.link, '_blank');
            mb.textContent = 'Нажмите «Начать» в MAX — ждём…'; mb.disabled = true;
            var tries = 0, t = setInterval(function () {
              fetch('/api/auth/max?nonce=' + encodeURIComponent(r.nonce)).then(function (x) { return x.json(); }).then(function (d) {
                if (d.ok) { clearInterval(t); back(); }
                else if (++tries > 200) { clearInterval(t); mb.disabled = false; mb.textContent = 'Войти через MAX'; }
              });
            }, 3000);
          }).catch(function (x) { err.textContent = x.message; });
        };
        alt.appendChild(mb);
      }
      if (M.yandex) {
        any = true;
        var ya = document.createElement('a'); ya.className = 'btn ghost wide'; ya.textContent = 'Войти с Яндекс ID';
        ya.href = '/auth/yandex?ref=' + encodeURIComponent(myRef()); alt.appendChild(ya);
      }
      if (!any && !tabs.children.length) alt.innerHTML = '<p class="muted">Вход скоро заработает. Пока оформляйте заказ без регистрации — мы позвоним.</p>';
      if (/err=yandex/.test(location.search)) err.textContent = 'Не получилось войти через Яндекс — попробуйте ещё раз';
    };
    var STATUS = {'новый': 'Принят', '✅ подтверждён': 'Подтверждён', '📦 выдан': 'Выдан', '❌ отменён': 'Отменён'};
    var showHome = function (d) {
      var u = d.user;
      accBox.innerHTML = document.getElementById('acc-home').innerHTML;
      fill(accBox, u.promo);
      accBox.querySelector('[data-hello]').textContent = u.name ? 'Здравствуйте, ' + u.name + '!' : 'Здравствуйте!';
      accBox.querySelector('[data-who]').textContent = [u.phone && '+' + u.phone, u.email, u.max && 'MAX', u.yandex && 'Яндекс ID'].filter(Boolean).join(' · ');
      accBox.querySelector('[data-balance]').textContent = fmt(u.balance);
      accBox.querySelector('[data-friends]').textContent = u.friends;
      accBox.querySelector('[data-first]').hidden = !d.first_order;
      var link = location.origin + '/?ref=' + u.ref_code, inp = accBox.querySelector('[data-ref]');
      inp.value = link;
      accBox.querySelector('[data-share]').onclick = function (ev) {
        var text = 'Техника с Горбушки с доставкой. По моей ссылке — скидка на первую покупку:';
        if (navigator.share) navigator.share({title: document.title, text: text, url: link}).catch(function () {});
        else { inp.select(); try { navigator.clipboard.writeText(link); } catch (e) { document.execCommand('copy'); } ev.target.textContent = 'Скопировано'; }
      };
      accBox.querySelector('[data-orders]').innerHTML = d.orders.length ? d.orders.map(function (o) {
        return '<div class="acc-order"><div><b>' + esc(o.number) + '</b> <span class="muted">от ' + esc(o.created.split('-').reverse().join('.')) +
          '</span></div><div class="st">' + esc(STATUS[o.status] || o.status) + '</div><ul>' + o.items.map(function (i) {
            return '<li>' + (i.url ? '<a href="' + esc(i.url) + '">' + esc(i.name) + '</a>' : esc(i.name)) + (i.qty > 1 ? ' × ' + i.qty : '') + '</li>';
          }).join('') + '</ul><div>Итого <b>' + fmt(o.total) + '</b>' + (o.discount ? ' <span class="muted">(скидка ' + fmt(o.discount) + ')</span>' : '') + '</div></div>';
      }).join('') : '<p class="muted" style="margin:0">Заказов пока нет. <a href="/catalog/">В каталог</a></p>';
      accBox.querySelector('[data-history]').innerHTML = u.history.length ? u.history.map(function (h) {
        return '<div class="acc-bonus"><span>' + esc(h.reason) + '<small class="muted"> · ' + esc(h.created.slice(0, 10).split('-').reverse().join('.')) +
          '</small></span><b class="' + (h.amount > 0 ? 'plus' : 'minus') + '">' + (h.amount > 0 ? '+' : '−') + fmt(Math.abs(h.amount)) + '</b></div>';
      }).join('') : '<p class="muted" style="margin:0">Бонусы появятся, когда друг по вашей ссылке получит первый заказ.</p>';
      accBox.querySelector('[data-logout]').onclick = function () { post('/api/logout').then(function () { location.reload(); }); };
    };
    fetch('/api/me').then(function (r) { return r.json(); })
      .then(function (d) { if (d.user) showHome(d); else showLogin(d); })
      .catch(function () { accBox.innerHTML = '<p class="err">Нет связи с сайтом — обновите страницу.</p>'; });
  }

  // --- заявки: трейд-ин и проверка по IMEI — владельцу в бот ---
  var luhn = function (d) {
    var s = 0; for (var i = 0; i < d.length; i++) { var n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; }
    return s % 10 === 0;
  };
  document.querySelectorAll('form[data-req]').forEach(function (f) {
    var err = f.querySelector('.err'), btn = f.querySelector('button[type=submit]'), res = f.querySelector('[data-res]');
    if (res && f.code) f.code.addEventListener('input', function () {
      var raw = f.code.value.replace(/[\s-]/g, ''), d = raw.replace(/\D/g, '');
      if (!raw) { res.hidden = true; return; }
      res.hidden = false;
      if (/^\d{15}$/.test(raw)) {
        var ok = luhn(d);
        res.className = 'chk-res ' + (ok ? 'ok' : 'bad');
        res.textContent = ok ? 'IMEI записан правильно (контрольная цифра сходится). Расширенную проверку сделаем по базам.'
          : 'Контрольная цифра IMEI не сходится — проверьте, нет ли опечатки. Неверный IMEI бывает у подделок.';
      } else if (/^[A-Za-z0-9]{8,14}$/.test(raw) && /[A-Za-z]/.test(raw)) {
        res.className = 'chk-res ok'; res.textContent = 'Похоже на серийный номер — проверим по нему.';
      } else { res.className = 'chk-res'; res.textContent = 'IMEI — 15 цифр, серийный номер Apple — 10–12 букв и цифр.'; }
    });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); err.textContent = '';
      if (!f.agree.checked) { err.textContent = 'Нужно согласие на обработку данных'; return; }
      var body = {}; Array.prototype.forEach.call(f.elements, function (x) { if (x.name && x.type !== 'checkbox') body[x.name] = x.value.trim(); });
      btn.disabled = true;
      fetch('/api/' + f.dataset.req, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
        .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || 'Ошибка'); }); })
        .then(function () {
          Array.prototype.forEach.call(f.querySelectorAll('label,.err,button,h2'), function (x) { x.hidden = true; });
          f.querySelector('.req-done').hidden = false;
        })
        .catch(function (x) { err.textContent = x && x.message !== 'Failed to fetch' ? x.message : 'Нет связи — позвоните нам'; btn.disabled = false; });
    });
  });

  // --- галерея товара: миниатюры листают, свайп подсвечивает миниатюру ---
  document.querySelectorAll('[data-gal]').forEach(function (track) {
    var thumbs = track.parentNode.querySelectorAll('[data-g]');
    var mark = function (i) { thumbs.forEach(function (t, k) { t.classList.toggle('on', k === i); }); };
    thumbs.forEach(function (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        var i = +t.dataset.g;
        track.scrollTo({left: track.clientWidth * i, behavior: 'smooth'});
        mark(i);
      });
    });
    var tm;
    track.addEventListener('scroll', function () {
      clearTimeout(tm);
      tm = setTimeout(function () { mark(Math.round(track.scrollLeft / Math.max(track.clientWidth, 1))); }, 80);
    });
  });

  badge();
})();
