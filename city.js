// ONE city script for every client page (Service Boosters). The page carries only one line:
//   <script src="<BASE>/city.js" data-client="<client>"></script>
// Everything else lives next to this file and changes without touching any page:
//   clients/<client>.json   the client's settings (below)
//   data/g/<n>.json         Google location ID (city, zip code, neighborhood) -> [city, state, "area codes"]
//   data/m/<n>.json         Microsoft location ID -> Google location ID
//
// 1) Location ID from the ad's final URL suffix: loc_interest (searched-for place) first, then loc_physical
//    (where the visitor is); iloc / loc work too. Microsoft clicks (msclkid, or ms_interest / ms_physical)
//    send Microsoft IDs. ?city=Kent forces a name (tests, manual links). A zip code or neighborhood always
//    comes out as its city.
// 2) Text: each "find" becomes its "replace" with the city ("Your Area" -> "Agawam",
//    "Emergency Locksmith" -> "Agawam Locksmith"). "fit": a long name shrinks that headline instead of adding a line.
// 3) Phone (only if the client has "numbers"): the page's default number becomes the client's number for the
//    city's area code (or its "fallback"), then ONLY that number's GHL pool loads and swaps in a tracking number.
//    The page must not carry pool <script> tags of its own.
// Unknown place, no params, or data slower than 2.5s: text unchanged, default number + default pool.
//
// Client settings (clients/<client>.json), all optional except what you use:
//   "text":     [{"find": "Your Area", "replace": "{city}"}]   ("regex": true = find is a pattern)
//   "states":   ["MA"]                 text changes only for places in these states (none = any US place)
//   "fit":      true                   "max_len": 40  (longer names keep the page text)
//   "numbers":  {"413": "(413) 475-9824"}   "default": "413"   "fallback": {"774": "508"}
//   "extra":    {"Preston": "425"}     city name -> area code     "pools": {"413": "https://.../number_pool.js"}
(function () {
  var me = document.currentScript ||
    [].slice.call(document.querySelectorAll('script[src*="city.js"]')).pop();
  if (!me) return;
  // Home is GitHub Pages (updates in ~10 min). A page still pointing at the old jsDelivr copy hands over to it.
  var HOME = 'https://shahar-design.github.io/city-phone-data/';
  if (me.src.indexOf(HOME) !== 0) {
    var s = document.createElement('script');
    s.src = HOME + 'city.js';
    s.setAttribute('data-client', me.getAttribute('data-client'));
    me.parentNode.insertBefore(s, me.nextSibling);
    return;
  }
  var BASE = me.src.replace(/city\.js(\?.*)?$/, '');
  var CLIENT = me.getAttribute('data-client');
  var VER = (me.src.split('?')[1] || '');
  var params = new URLSearchParams(window.location.search);
  var KEY = 'sb_city';

  function getJSON(path, fresh) {
    // fresh: re-check with the CDN on every visit (settings change; the CDN tells browsers to keep files 7 days).
    return fetch(BASE + path + (VER ? '?' + VER : ''), fresh ? { cache: 'no-cache' } : {}).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function shard(folder, id) {
    return getJSON('data/' + folder + '/' + (+id % 64) + '.json').then(function (s) { return s[id]; });
  }

  // Where to look, in order.
  var isMs = params.has('msclkid') || params.has('ms_interest') || params.has('ms_physical');
  var ids = [];
  ['ms_interest', 'ms_physical', 'loc_interest', 'iloc', 'loc_physical', 'loc'].forEach(function (k) {
    var v = params.get(k);
    if (v && /^\d+$/.test(v)) ids.push([k.indexOf('ms_') === 0 || isMs ? 'm' : 'g', v]);
  });
  var asked = (params.get('city') || '').trim().slice(0, 30);

  // Start both lookups at once: the client's settings and the place.
  var cfgP = getJSON('clients/' + CLIENT + '.json', true);
  var placeP = (function next(i) {
    if (i >= ids.length) return Promise.resolve(null);
    var src = ids[i][0], id = ids[i][1];
    return (src === 'm' ? shard('m', id) : Promise.resolve(+id))
      .then(function (gid) { return gid ? shard('g', gid) : null; })
      .catch(function () { return null; })
      .then(function (row) { return row || next(i + 1); });
  })(0);

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  cfgP.then(function (CFG) {
    var done = false, poolLoaded = false;

    function loadPool(code) {
      var src = CFG.pools && CFG.pools[code];
      if (!src || poolLoaded) return;
      poolLoaded = true;
      [src, 'https://backend.leadconnectorhq.com/appengine/js/user_session.js'].forEach(function (u) {
        var el = document.createElement('script');
        el.src = u; el.async = false;
        document.body.appendChild(el);
      });
    }

    function codeFor(codes, city) {
      if (!CFG.numbers) return null;
      if (CFG.extra && CFG.extra[city]) return CFG.extra[city];
      var list = (codes || '').split(' ');
      for (var i = 0; i < list.length; i++) if (CFG.numbers[list[i]]) return list[i];
      for (i = 0; i < list.length; i++) {
        var f = CFG.fallback && CFG.fallback[list[i]];
        if (f && CFG.numbers[f]) return f;
      }
      return CFG.default;
    }

    function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); }

    function apply(hit, textOnly) {   // hit = {city, code, inStates}
      var rules = (CFG.text || [{ find: 'Your Area', replace: '{city}' }]).map(function (t) {
        return { re: new RegExp(t.regex ? t.find : esc(t.find), 'gi'), to: t.replace.split('{city}').join(hit.city) };
      });
      var useText = hit.inStates && hit.city.length <= (CFG.max_len || 40);
      var from = CFG.numbers && CFG.numbers[CFG.default];
      var to = from && !textOnly ? (CFG.numbers[hit.code] || from) : from;
      var numRe = null, d = '', toDigits = '';
      if (from && to !== from) {
        d = from.replace(/\D/g, '').slice(-10);
        numRe = new RegExp('\\(?' + d.slice(0, 3) + '\\)?[\\s.-]*' + d.slice(3, 6) + '[\\s.-]*' + d.slice(6), 'g');
        toDigits = to.replace(/\D/g, '').slice(-10);
      }
      function swap(text) {
        if (useText) rules.forEach(function (r) {
          text = text.replace(r.re, function (m) {
            // Headline typed in capitals gets the city in capitals too.
            return /[a-z]/i.test(m) && m === m.toUpperCase() ? r.to.toUpperCase() : r.to;
          });
        });
        return numRe ? text.replace(numRe, to) : text;
      }
      var changed = [];
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), node;
      while ((node = walker.nextNode())) {
        var p = node.parentNode && node.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE') continue;
        var next = swap(node.nodeValue);
        if (next !== node.nodeValue) {
          changed.push({ node: node, orig: node.nodeValue, next: next });
          node.nodeValue = next;
        }
      }
      document.title = swap(document.title);
      // Call links: plain tel: links, and the ones Unbounce rewrites for call goals (/clkg/tel/+1...).
      if (numRe) document.querySelectorAll('a[href*="tel"]').forEach(function (a) {
        var href = a.getAttribute('href');
        if (href.indexOf(d) !== -1) a.setAttribute('href', href.split(d).join(toDigits));
      });
      window.cityPhone = { city: hit.city, number: to || null, client: CLIENT };
      if (CFG.fit && useText && changed.length) {
        fit(changed);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fit(changed); });
      }
    }

    // A long city name must not add a line (Unbounce boxes don't push the content below down): shrink that
    // headline's font until it is no taller than the original text; below 65%, keep the original text.
    function fit(changed) {
      changed.forEach(function (c) {
        var block = c.node.parentNode.closest('p,h1,h2,h3,h4,h5,h6,li,div') || c.node.parentNode;
        if (!c.els) c.els = [block].concat([].slice.call(block.querySelectorAll('*'))).map(function (el) {
          return { el: el, size: el.style.getPropertyValue('font-size'), prio: el.style.getPropertyPriority('font-size') };
        });
        function scale(f) {
          c.els.forEach(function (x) { x.el.style.removeProperty('font-size'); if (x.size) x.el.style.setProperty('font-size', x.size, x.prio); });
          if (f === 1) return;
          var px = c.els.map(function (x) { return parseFloat(getComputedStyle(x.el).fontSize); });
          c.els.forEach(function (x, i) { x.el.style.setProperty('font-size', px[i] * f + 'px', 'important'); });
        }
        function tall() { return block.getBoundingClientRect().height > h0 + 1; }
        scale(1);
        var now = c.node.nodeValue;
        c.node.nodeValue = c.orig;
        var h0 = block.getBoundingClientRect().height;
        c.node.nodeValue = now;
        for (var f = 1; tall() && f > 0.65; ) { f *= 0.95; scale(f); }
        if (tall()) { scale(1); c.node.nodeValue = c.orig; }
      });
    }

    function hitFrom(city, state, codes) {
      return { city: city, code: codeFor(codes, city),
               inStates: !CFG.states || !state || CFG.states.indexOf(state) !== -1 };
    }

    function finish(hit) {
      if (done) {            // data came after the timeout: the pool already runs, so text only
        if (hit) ready(function () { apply(hit, true); });
        return;
      }
      done = true;
      try { if (hit) sessionStorage.setItem(KEY, JSON.stringify(hit)); } catch (e) {}
      ready(function () {
        if (hit) apply(hit);
        if (CFG.numbers) loadPool(hit && CFG.numbers[hit.code] ? hit.code : CFG.default);
      });
    }

    if (!ids.length) {
      var saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
      return finish(asked ? hitFrom(asked, null, '') : saved);
    }
    setTimeout(function () { if (!done) finish(null); }, 2500);
    placeP.then(function (row) {
      finish(row ? hitFrom(row[0], row[1], row[2]) : asked ? hitFrom(asked, null, '') : null);
    });
  }).catch(function (e) {
    if (window.console) console.warn('city.js: no settings for client "' + CLIENT + '"', e);
  });
})();
