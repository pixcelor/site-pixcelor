/* Pixcelor : interactions et graphiques du site.
   Aucune dépendance, aucune requête externe tant que le visiteur ne clique pas
   (vidéo YouTube, agenda Calendly). Toutes les données affichées sont fictives :
   celles du parc photovoltaïque viennent de assets/js/data-demo.js. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Mode de contrôle (?rendu=tout) : tout est dessiné d'un coup, sans animation ni défilement.
  var staticMode = /[?&]rendu=tout\b/.test(window.location.search);
  var D = null;
  var M12 = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var M1 = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  /* ---------- Utilitaires ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) { if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(x, y, s, attrs, parent) {
    var t = mk("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }
  function fr(n, d) {
    d = d === undefined ? 1 : d;
    var s = Math.abs(n).toFixed(d).replace(".", ",");
    s = s.replace(/^(\d+)/, function (m) { return m.replace(/\B(?=(\d{3})+$)/g, " "); });
    return (n < 0 && Number(Math.abs(n).toFixed(d)) !== 0 ? "−" : "") + s;
  }
  function sgn(n, d) { return (n > 0 ? "+" : "") + fr(n, d); }
  function pct(n, d) { return sgn(n * 100, d === undefined ? 1 : d) + " %"; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  // Maximum d'axe plus serré que niceMax, choisi pour que ses quarts restent des valeurs rondes.
  function niceMax4(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    var steps = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (m <= steps[i]) return steps[i] * p;
    return 10 * p;
  }
  function fmtAxis(v) { return v >= 10000 ? fr(v / 1000, 0) + " k" : v >= 1000 ? fr(v / 1000, v % 1000 ? 1 : 0) + " k" : fr(v, v % 1 ? 1 : 0); }
  function delay(node, ms) { node.style.setProperty("--d", ms + "ms"); }
  function trace(path, ms) {
    var L = Math.ceil(path.getTotalLength());
    path.style.setProperty("--len", L);
    path.classList.add("trace");
    if (ms !== undefined) delay(path, ms);
  }
  function reveal(svg, animate) {
    if (!animate || reduceMotion || staticMode) { svg.classList.add("is-in"); return; }
    requestAnimationFrame(function () { requestAnimationFrame(function () { svg.classList.add("is-in"); }); });
  }
  function mix(a, b, t) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); });
    var pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return "rgb(" + pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * t); }).join(",") + ")";
  }

  function theme(el) {
    if (el.closest(".dark")) {
      return { dark: true, ink: "#EFE7D8", bar: "#EFE7D8", terra: "#DC6B2F", sage: "#9DB29A", sand: "#CDBEA5", taupe: "#A89886",
               bg: "#26201C", faint: "rgba(239,231,216,0.10)", soft: "rgba(239,231,216,0.45)" };
    }
    return { dark: false, ink: "#1C1815", bar: "#8FA78A", terra: "#DC6B2F", sage: "#8FA78A", sand: "#D2C3A8", taupe: "#7D6E60",
             bg: "#FBF7EF", faint: "rgba(28,24,21,0.08)", soft: "rgba(28,24,21,0.4)" };
  }
  function base(el, h, label) {
    el.replaceChildren();
    var w = Math.max(240, Math.round(el.clientWidth));
    var s = mk("svg", { viewBox: "0 0 " + w + " " + h, width: w, height: h, class: "viz", role: "img", "aria-label": label || "" }, el);
    return { s: s, w: w, h: h, t: theme(el) };
  }

  /* ---------- Libellés d'axe ---------- */
  // Sous un axe de catégories : sur une ligne si tout tient, sinon sur deux lignes, sinon inclinés.
  // labelPlan donne le mode et la marge basse à réserver, drawLabels dessine.
  var CHAR_W = 7.1; // largeur moyenne d'un caractère des petits libellés (12 px)
  function splitTwo(x) {
    var w = x.split(" "), best = null;
    if (w.length < 2) return [x];
    for (var i = 1; i < w.length; i++) {
      var a = w.slice(0, i).join(" "), b = w.slice(i).join(" "), m = Math.max(a.length, b.length);
      if (!best || m < best[2]) best = [a, b, m];
    }
    return [best[0], best[1]];
  }
  function labelPlan(texts, step) {
    var fits = function (x) { return x.length * CHAR_W <= step - 6; };
    if (texts.every(fits)) return { mode: 1, pad: 24 };
    if (texts.every(function (x) { return splitTwo(x).every(fits); })) return { mode: 2, pad: 38 };
    var longest = Math.max.apply(null, texts.map(function (x) { return x.length; }));
    return { mode: 3, pad: Math.round(20 + longest * CHAR_W * 0.62) };
  }
  function drawLabels(s, plan, items, yAxis, h) {
    items.forEach(function (it) {
      var at = { "text-anchor": "middle", class: it.cls || "sm" };
      if (plan.mode === 1) txt(it.x, h - 7, it.text, at, s);
      else if (plan.mode === 2) {
        var p = splitTwo(it.text);
        if (p[1]) { txt(it.x, h - 21, p[0], at, s); txt(it.x, h - 7, p[1], at, s); }
        else txt(it.x, h - 14, p[0], at, s);
      } else {
        var ax = it.x + 4, ay = yAxis + 14;
        txt(ax, ay, it.text, { "text-anchor": "end", class: it.cls || "sm", transform: "rotate(-38 " + ax + " " + ay + ")" }, s);
      }
    });
  }
  // Libellé qui doit tenir dans une largeur donnée : version courte si elle existe, sinon coupé proprement.
  function fitLabel(label, short, width) {
    if (label.length * CHAR_W <= width) return label;
    if (short && short.length * CHAR_W <= width) return short;
    var n = Math.max(3, Math.floor(width / CHAR_W) - 1);
    return (short || label).slice(0, n) + "…";
  }

  /* ---------- Info-bulle ---------- */
  var tip = null;
  function showTip(evt, node, title, lines) {
    tip.replaceChildren();
    tip.classList.toggle("on-dark", !!node.closest(".dark"));
    var s = document.createElement("strong");
    s.textContent = title;
    tip.appendChild(s);
    (lines || []).forEach(function (l) { if (!l) return; var sp = document.createElement("span"); sp.textContent = l; tip.appendChild(sp); });
    tip.classList.add("is-on");
    moveTip(evt);
  }
  function moveTip(evt) {
    // Largeur utile sans la barre de défilement, pour que l'infobulle ne soit jamais coupée à droite.
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var x = evt.clientX + 16, y = evt.clientY + 16, w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > vw - 8) x = Math.max(8, evt.clientX - w - 16);
    if (y + h > vh - 8) y = Math.max(8, evt.clientY - h - 16);
    tip.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function hideTip() { if (tip) tip.classList.remove("is-on"); }
  function hover(node, title, lines) {
    node.addEventListener("pointerenter", function (e) {
      showTip(e, node, typeof title === "function" ? title() : title, typeof lines === "function" ? lines() : lines);
    });
    node.addEventListener("pointermove", moveTip);
    node.addEventListener("pointerleave", hideTip);
  }

  /* ---------- Graphiques ---------- */

  function drawLine(s, pts, color, t, opts) {
    opts = opts || {};
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var p = mk("path", { d: d, fill: "none", stroke: color, "stroke-width": opts.width || 2.6, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": opts.dash || null }, s);
    if (!opts.dash) trace(p, opts.delay === undefined ? 250 : opts.delay);
    if (!opts.noDots) {
      pts.forEach(function (q, i) {
        var c = mk("circle", { cx: q[0], cy: q[1], r: opts.r || 3.6, fill: t.bg, stroke: color, "stroke-width": 2.2, class: "pop" }, s);
        delay(c, 700 + i * 30);
      });
    }
    return p;
  }

  // Barres (simples ou empilées) + courbe, capacité et axe secondaire en option.
  function combo(el, o, animate) {
    var b = base(el, o.h || 220, o.label), s = b.s, w = b.w, h = b.h, t = b.t;
    var padL = o.noAxis ? 2 : 42, padR = o.line2 ? 42 : 6, padT = 12, padB = 24;
    var n = o.labels.length;
    var tot = o.stack ? o.labels.map(function (_, i) { return sum(o.stack.map(function (se) { return se.vals[i]; })); }) : null;
    var max = o.max || niceMax(Math.max.apply(null, [].concat(o.bars || [], o.line || [], tot || [], o.cap || [])) * 1.06);
    var x0 = padL, x1 = w - padR, y0 = h - padB, y1 = padT;
    var step = (x1 - x0) / n, bw = Math.max(5, Math.min(o.barMax || 36, step * 0.62));
    var Y = function (v) { return y0 - (v / max) * (y0 - y1); };
    var X = function (i) { return x0 + step * (i + 0.5); };
    if (!o.noAxis) {
      for (var g = 0; g <= 4; g++) {
        var gv = max * g / 4;
        mk("line", { x1: x0, x2: x1, y1: Y(gv), y2: Y(gv), class: "grid" }, s);
        txt(x0 - 8, Y(gv) + 4, fmtAxis(gv), { "text-anchor": "end", class: "sm" }, s);
      }
    } else {
      mk("line", { x1: x0, x2: x1, y1: y0, y2: y0, class: "grid" }, s);
    }
    var every = step < 30 ? Math.ceil(30 / step) : 1;
    o.labels.forEach(function (l, i) {
      if (o.bars && !o.noBars) {
        var r = mk("rect", { x: X(i) - bw / 2, y: Y(o.bars[i]), width: bw, height: Math.max(1, y0 - Y(o.bars[i])), rx: Math.min(4, bw / 4), fill: o.barColor || t.bar, class: "grow-y" }, s);
        delay(r, i * 40);
      }
      if (o.stack) {
        var acc = 0;
        o.stack.forEach(function (se) {
          var v = se.vals[i];
          var rr = mk("rect", { x: X(i) - bw / 2, y: Y(acc + v), width: bw, height: Math.max(1, Y(acc) - Y(acc + v)), fill: se.color, class: "grow-y" }, s);
          delay(rr, i * 40);
          acc += v;
        });
        if (o.cap && tot[i] > o.cap[i]) {
          var over = mk("rect", { x: X(i) - bw / 2 - 3, y: Y(tot[i]) - 3, width: bw + 6, height: y0 - Y(tot[i]) + 3, rx: 4, fill: "none", stroke: t.terra, "stroke-width": 2.2, class: "pop" }, s);
          delay(over, 900);
        }
      }
      if (i % every === 0) txt(X(i), h - 6, l, { "text-anchor": "middle", class: "sm" }, s);
    });
    if (o.cap) {
      var cp = o.cap.map(function (v, i) { return [X(i) - step / 2, Y(v)]; });
      cp.push([x1, Y(o.cap[n - 1])]);
      mk("path", { d: "M" + cp.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L"), fill: "none", stroke: t.terra, "stroke-width": 2, "stroke-dasharray": "6 5" }, s);
      if (!o.noAxis) txt(x1, Y(o.cap[n - 1]) - 7, "capacité", { "text-anchor": "end", class: "sm", fill: t.terra }, s);
    }
    if (o.line) drawLine(s, o.line.map(function (v, i) { return [X(i), Y(v)]; }), o.lineColor || t.terra, t, { noDots: o.noDots });
    if (o.line2) {
      var max2 = niceMax(Math.max.apply(null, o.line2) * 1.08);
      var Y2 = function (v) { return y0 - (v / max2) * (y0 - y1); };
      for (var g2 = 0; g2 <= 4; g2 += 2) txt(x1 + 8, Y2(max2 * g2 / 4) + 4, fmtAxis(max2 * g2 / 4) + (o.unit2 || ""), { class: "sm" }, s);
      drawLine(s, o.line2.map(function (v, i) { return [X(i), Y2(v)]; }), o.line2Color || t.ink, t, {});
    }
    o.labels.forEach(function (l, i) {
      var hit = mk("rect", { x: X(i) - step / 2, y: y1, width: step, height: y0 - y1, class: "hit" }, s);
      if (o.tip) hover(hit, function () { return o.tip(i)[0]; }, function () { return o.tip(i).slice(1); });
    });
    reveal(s, animate);
  }

  // Cascade : du total de départ au total d'arrivée.
  function waterfall(el, o, animate) {
    var b = base(el, o.h || 220, o.label), s = b.s, w = b.w, h = b.h, t = b.t;
    var n = o.steps.length, x0 = 2, x1 = w - 2;
    // Libellés : complets si possible, sinon les versions courtes (« Perf. »), plutôt qu'inclinés.
    var labs = o.steps.map(function (st) { return st.label; }), plan = labelPlan(labs, (x1 - x0) / n);
    if (plan.mode === 3 && o.steps.some(function (st) { return st.short; })) {
      labs = o.steps.map(function (st) { return st.short || st.label; });
      plan = labelPlan(labs, (x1 - x0) / n);
    }
    var padT = 22, padB = plan.pad - 2, y0 = h - padB, y1 = padT;
    var cum = 0, bars = [];
    o.steps.forEach(function (st) {
      if (st.total) { bars.push({ lo: o.min || 0, hi: st.value, st: st, end: st.value }); cum = st.value; }
      else { var a = cum, c = cum + st.value; bars.push({ lo: Math.min(a, c), hi: Math.max(a, c), st: st, end: c }); cum = c; }
    });
    var top = Math.max.apply(null, bars.map(function (x) { return x.hi; }));
    var min = o.min || 0, max = top + (top - min) * 0.1;
    var Y = function (v) { return y0 - ((v - min) / (max - min)) * (y0 - y1); };
    var step = (x1 - x0) / n, bw = Math.min(64, step * 0.62);
    mk("line", { x1: x0, x2: x1, y1: y0, y2: y0, class: "axis" }, s);
    var colors = o.colors || {};
    bars.forEach(function (bar, i) {
      var cx = x0 + step * (i + 0.5), st = bar.st;
      var fill = st.total ? (i === 0 ? (colors.first || t.sand) : (colors.last || t.ink)) : st.value >= 0 ? (colors.up || t.sage) : t.terra;
      var r = mk("rect", { x: cx - bw / 2, y: Y(bar.hi), width: bw, height: Math.max(2, Y(bar.lo) - Y(bar.hi)), rx: 3, fill: fill,
        "fill-opacity": (!st.total && st.value < 0 && o.hasKey && !st.key) ? 0.55 : 1, class: "grow-y" }, s);
      delay(r, 120 + i * 130);
      var lab = st.total ? fr(st.value, o.dec) : sgn(st.value, o.dec);
      var tv = txt(cx, Y(bar.hi) - 8, lab, { "text-anchor": "middle", class: "val pop", "font-weight": st.key ? 600 : null }, s);
      delay(tv, 400 + i * 130);
      if (i < n - 1) {
        var ln = mk("line", { x1: cx + bw / 2, x2: cx + step - bw / 2, y1: Y(bar.end), y2: Y(bar.end), stroke: t.soft, "stroke-dasharray": "3 3", class: "pop" }, s);
        delay(ln, 500 + i * 130);
      }
      drawLabels(s, plan, [{ x: cx, text: labs[i], cls: st.key ? "sm lbl-strong" : "sm" }], y0, h);
      var hit = mk("rect", { x: cx - step / 2, y: y1, width: step, height: y0 - y1, class: "hit" }, s);
      hover(hit, st.label, [(st.total ? fr(st.value, o.dec) : sgn(st.value, o.dec)) + " " + (o.unit || "")]);
    });
    if (o.min) txt(x0 + 2, 12, "axe à partir de " + fr(o.min, 0), { class: "sm" }, s);
    reveal(s, animate);
  }

  // Anneau avec légende (à droite si la place le permet, sinon dessous).
  function donut(el, o, animate) {
    var W = Math.max(o.noLegend ? 120 : 240, Math.round(el.clientWidth)), n = o.items.length || 1, H0 = o.h || 190;
    var side = !o.noLegend && W >= H0 + (o.legendW || 170);
    var size = o.noLegend ? Math.min(H0 - 4, W) : side ? Math.min(H0 - 8, W * 0.5) : Math.min(170, W * 0.62);
    var b = base(el, o.noLegend ? size + 4 : side ? H0 : size + 18 + n * 24, o.label), s = b.s, w = b.w, h = b.h, t = b.t;
    var R = size / 2 - 2, sw = Math.max(14, R * 0.3), r = R - sw / 2;
    var cx = side ? size / 2 + 2 : w / 2, cy = side ? h / 2 : size / 2 + 2;
    var total = sum(o.items.map(function (x) { return x.value; }));
    mk("circle", { cx: cx, cy: cy, r: r, fill: "none", stroke: t.faint, "stroke-width": sw }, s);
    var acc = 0;
    if (total > 0) {
      o.items.forEach(function (it, i) {
        var p = it.value / total * 100, gap = o.items.length > 1 ? 0.8 : 0, v = Math.max(0.3, p - gap);
        var c = mk("circle", { cx: cx, cy: cy, r: r, fill: "none", stroke: it.color || t.ink, "stroke-width": sw, pathLength: 100,
          transform: "rotate(-90 " + cx + " " + cy + ")", "stroke-dashoffset": -acc, class: "arc" }, s);
        c.style.setProperty("--v", v);
        c.style.setProperty("--g", 100 - v);
        delay(c, 150 + i * 120);
        hover(c, it.label, [fr(it.value, o.dec === undefined ? 1 : o.dec) + (o.unit ? " " + o.unit : "") + " · " + fr(p, 0) + " %"]);
        acc += p;
      });
    }
    if (o.center) {
      txt(cx, cy + (o.center[1] ? 3 : 9), o.center[0], { "text-anchor": "middle", class: "big", "font-size": Math.max(17, Math.min(30, r * 0.6)) }, s);
      if (o.center[1]) txt(cx, cy + 21, o.center[1], { "text-anchor": "middle", class: "sm" }, s);
    }
    var lx = side ? size + 22 : 4, lh = 24, ly = side ? cy - (n * lh) / 2 + 14 : size + 28;
    if (o.noLegend) { reveal(s, animate); return; }
    o.items.forEach(function (it, i) {
      var y = ly + i * lh;
      mk("rect", { x: lx, y: y - 10, width: 12, height: 12, rx: 3, fill: it.color || t.ink }, s);
      txt(lx + 20, y, it.label, {}, s);
      if (total > 0) txt(w - 2, y, fr(it.value / total * 100, 0) + " %", { "text-anchor": "end", class: "val" }, s);
    });
    reveal(s, animate);
  }

  // Barres horizontales, simples ou divergentes autour de zéro.
  function hbars(el, o, animate) {
    var rowH = o.rowH || 28, top = o.top === undefined ? 18 : o.top, h = o.items.length * rowH + top + 6;
    var b = base(el, h, o.label), s = b.s, w = b.w, t = b.t;
    var labW = Math.min(o.labW || 130, w * 0.42), valW = 58, x0 = labW + 10, x1 = w - valW;
    var vals = o.items.map(function (x) { return x.value; });
    var lo = o.min !== undefined ? o.min : Math.min(0, Math.min.apply(null, vals));
    var hi = o.max !== undefined ? o.max : Math.max.apply(null, vals);
    if (o.diverge) { lo = Math.min(lo * 1.15, -0.5); hi = Math.max(hi * 1.1, 0.5); }
    var X = function (v) { return x0 + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (x1 - x0); };
    if (o.diverge) mk("line", { x1: X(0), x2: X(0), y1: top - 6, y2: h - 4, class: "axis" }, s);
    o.items.forEach(function (it, i) {
      var y = top + i * rowH, bh = Math.min(16, rowH - 10);
      var g = mk("g", {}, s);
      txt(labW, y + bh / 2 + 4, fitLabel(it.label, it.short, labW - 4), { "text-anchor": "end", class: it.sel ? "lbl-strong" : null }, g);
      var a = o.diverge ? Math.min(X(0), X(it.value)) : X(lo), wd = o.diverge ? Math.abs(X(it.value) - X(0)) : X(it.value) - X(lo);
      var r = mk("rect", { x: a, y: y + 1, width: Math.max(2, wd), height: bh, rx: 3, fill: it.color || t.ink, class: (o.diverge && it.value < 0) ? "grow-xr" : "grow-x" }, g);
      delay(r, 80 + i * 45);
      txt(w - 2, y + bh / 2 + 4, it.valLabel || fr(it.value, 1), { "text-anchor": "end", class: "val", "font-weight": it.sel ? 600 : null }, g);
      var hit = mk("rect", { x: 0, y: y - 5, width: w, height: rowH, class: "hit" }, g);
      if (it.tip) hover(hit, it.tip[0], it.tip.slice(1));
      if (o.onClick) hit.addEventListener("click", function () { o.onClick(it); });
    });
    [["target", t.terra], ["ref", t.soft]].forEach(function (k) {
      if (o[k[0]] === undefined) return;
      mk("line", { x1: X(o[k[0]]), x2: X(o[k[0]]), y1: top - 10, y2: h - 4, stroke: k[1], "stroke-width": 1.6, "stroke-dasharray": "4 3" }, s);
      txt(X(o[k[0]]) + 5, top - 6, o[k[0] + "Label"] || "", { class: "sm" }, s);
    });
    reveal(s, animate);
  }

  // Barres groupées (plusieurs séries par catégorie), avec ligne de référence et sélection.
  function grouped(el, o, animate) {
    var b = base(el, o.h || 240, o.label), s = b.s, w = b.w, h = b.h, t = b.t;
    // Légende : passe à la ligne quand la largeur ne suffit pas (téléphone).
    var legPos = [], lgx = 40, lgy = 0;
    (o.legend || []).forEach(function (lg) {
      var lw = 32 + lg.name.length * 6.6;
      if (lgx > 40 && lgx + lw - 14 > w - 4) { lgx = 40; lgy += 20; }
      legPos.push([lgx, lgy]); lgx += lw;
    });
    var padL = 40, x0 = padL, x1 = w - 4, ns = o.series.length, n = o.labels.length;
    var plan = labelPlan(o.labels, (x1 - x0) / n);
    // Libellés inclinés : le premier part vers la gauche, on lui laisse la place de ne pas sortir du cadre.
    if (plan.mode === 3) x0 = Math.max(padL, Math.ceil(o.labels[0].length * CHAR_W * 0.79 - (x1 - padL) / n / 2 + 6));
    var padB = plan.pad, padT = o.legend ? 32 + lgy : 12, y0 = h - padB, y1 = padT;
    var all = [].concat.apply([], o.series.map(function (se) { return se.vals; }));
    var max = o.max || niceMax(Math.max.apply(null, all.concat(o.ref ? [o.ref.v] : [])) * 1.08);
    var Y = function (v) { return y0 - v / max * (y0 - y1); };
    var step = (x1 - x0) / n, bw = Math.min(24, (step * 0.72) / ns), gap = 3;
    var axisFmt = o.axisFmt || o.fmt || fmtAxis;
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; mk("line", { x1: x0, x2: x1, y1: Y(gv), y2: Y(gv), class: "grid" }, s); txt(x0 - 8, Y(gv) + 4, axisFmt(gv), { "text-anchor": "end", class: "sm" }, s); }
    if (o.sel !== undefined && o.sel !== null && o.sel >= 0) mk("rect", { x: x0 + step * o.sel + 2, y: y1 - 4, width: step - 4, height: y0 - y1 + 4, rx: 8, fill: t.faint }, s);
    o.labels.forEach(function (l, i) {
      var cx = x0 + step * (i + 0.5), start = cx - (ns * bw + (ns - 1) * gap) / 2;
      o.series.forEach(function (se, j) {
        var v = se.vals[i], col = o.colorFn ? o.colorFn(i, j, v, se.color) : se.color;
        var r = mk("rect", { x: start + j * (bw + gap), y: Y(v), width: bw, height: Math.max(1, y0 - Y(v)), rx: 3, fill: col, class: "grow-y" }, s);
        delay(r, i * 60 + j * 40);
      });
      drawLabels(s, plan, [{ x: cx, text: l, cls: i === o.sel ? "sm lbl-strong" : "sm" }], y0, h);
      var hit = mk("rect", { x: cx - step / 2, y: y1, width: step, height: y0 - y1, class: "hit" }, s);
      hover(hit, o.tipTitle ? o.tipTitle(i) : l, function () { return o.series.map(function (se) { return se.name + " : " + (o.fmt ? o.fmt(se.vals[i]) : fr(se.vals[i], 0)); }).concat(o.tipExtra ? o.tipExtra(i) : []); });
      if (o.onClick) hit.addEventListener("click", function () { o.onClick(i); });
    });
    if (o.ref) {
      mk("line", { x1: x0, x2: x1, y1: Y(o.ref.v), y2: Y(o.ref.v), stroke: t.terra, "stroke-width": 1.6, "stroke-dasharray": "6 4" }, s);
      if (o.ref.label) txt(x1, Y(o.ref.v) - 6, o.ref.label, { "text-anchor": "end", class: "sm" }, s);
    }
    if (o.legend) {
      o.legend.forEach(function (lg, i) {
        var lx = legPos[i][0], ly = legPos[i][1];
        mk("rect", { x: lx, y: 4 + ly, width: 12, height: 12, rx: 3, fill: lg.color }, s);
        txt(lx + 18, 14 + ly, lg.name, { class: "sm" }, s);
      });
    }
    reveal(s, animate);
  }

  // Courbes, avec l'écart entre les deux premières séries ombré, ou l'aire sous la première.
  function lines(el, o, animate) {
    var b = base(el, o.h || 200, o.label), s = b.s, w = b.w, h = b.h, t = b.t;
    var padL = 42, padB = 24, padT = 12, x0 = padL, x1 = w - 6, y0 = h - padB, y1 = padT;
    var all = [].concat.apply([], o.series.map(function (se) { return se.values; }));
    var max = o.max || niceMax(Math.max.apply(null, all) * 1.08), min = o.min || 0;
    var n = o.labels.length, X = function (i) { return x0 + (x1 - x0) * i / (n - 1); }, Y = function (v) { return y0 - (v - min) / (max - min) * (y0 - y1); };
    for (var g = 0; g <= 4; g++) { var gv = min + (max - min) * g / 4; mk("line", { x1: x0, x2: x1, y1: Y(gv), y2: Y(gv), class: "grid" }, s); txt(x0 - 8, Y(gv) + 4, fmtAxis(gv), { "text-anchor": "end", class: "sm" }, s); }
    var A = o.series[0].values;
    if (o.series[1] && o.between) {
      var B = o.series[1].values;
      var area = A.map(function (v, i) { return (i ? "L" : "M") + X(i) + " " + Y(v); }).join(" ") + " " + B.slice().reverse().map(function (v, j) { return "L" + X(n - 1 - j) + " " + Y(v); }).join(" ") + " Z";
      var ar = mk("path", { d: area, fill: t.sand, "fill-opacity": 0.5, class: "pop" }, s);
      delay(ar, 900);
    }
    if (o.fillArea) {
      var fa = mk("path", { d: A.map(function (v, i) { return (i ? "L" : "M") + X(i) + " " + Y(v); }).join(" ") + " L" + X(n - 1) + " " + y0 + " L" + X(0) + " " + y0 + " Z", fill: o.series[0].color || t.ink, "fill-opacity": 0.12, class: "pop" }, s);
      delay(fa, 800);
    }
    o.series.forEach(function (se, k) {
      drawLine(s, se.values.map(function (v, i) { return [X(i), Y(v)]; }), se.color || t.ink, t, { noDots: n > 14, delay: 150 + k * 200 });
    });
    var every = Math.max(1, Math.ceil(n / (w / 70)));
    o.labels.forEach(function (l, i) { if (i % every === 0 || i === n - 1) txt(X(i), h - 6, l, { "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle", class: "sm" }, s); });
    o.labels.forEach(function (l, i) {
      var hit = mk("rect", { x: X(i) - (x1 - x0) / (n - 1) / 2, y: y1, width: (x1 - x0) / (n - 1), height: y0 - y1, class: "hit" }, s);
      hover(hit, o.tipTitle ? o.tipTitle(i) : l, function () { return o.series.map(function (se) { return se.name + " : " + (o.fmt ? o.fmt(se.values[i]) : fr(se.values[i], 0)); }).concat(o.tipExtra ? o.tipExtra(i) : []); });
    });
    // Nom de chaque courbe à son extrémité, sans jamais sortir du cadre par le haut ni par le bas.
    if (o.endLabels) o.series.forEach(function (se, k) {
      var col = !t.dark && se.color === t.terra ? "#9C461F" : se.color; // terracotta assombri pour rester lisible sur Lin
      txt(X(n - 1) - 4, Math.max(14, Math.min(y0 - 4, Y(se.values[n - 1]) + (k ? 18 : -10))), se.name, { "text-anchor": "end", class: "sm lbl-strong" }, s).style.fill = col;
    });
    reveal(s, animate);
  }

  // Carte de contrôle : chaque lot, la moyenne et la limite haute.
  function control(el, o, animate) {
    var b = base(el, o.h || 220, o.label), s = b.s, w = b.w, h = b.h, t = b.t;
    var padL = 34, padB = 24, padT = 12, x0 = padL, x1 = w - 70, y0 = h - padB, y1 = padT, max = 3;
    var n = o.values.length, X = function (i) { return x0 + (x1 - x0) * i / (n - 1); }, Y = function (v) { return y0 - v / max * (y0 - y1); };
    for (var g = 0; g <= 3; g++) { mk("line", { x1: x0, x2: x1, y1: Y(g), y2: Y(g), class: "grid" }, s); txt(x0 - 8, Y(g) + 4, fr(g, 0), { "text-anchor": "end", class: "sm" }, s); }
    mk("rect", { x: x0, y: Y(max), width: x1 - x0, height: Y(o.ucl) - Y(max), fill: t.terra, "fill-opacity": 0.08 }, s);
    mk("line", { x1: x0, x2: x1, y1: Y(o.ucl), y2: Y(o.ucl), stroke: t.terra, "stroke-width": 1.6, "stroke-dasharray": "6 4" }, s);
    txt(x1 + 6, Y(o.ucl) + 4, "limite", { class: "sm" }, s);
    mk("line", { x1: x0, x2: x1, y1: Y(o.mean), y2: Y(o.mean), stroke: t.soft, "stroke-dasharray": "2 3" }, s);
    txt(x1 + 6, Y(o.mean) + 4, "moyenne", { class: "sm" }, s);
    drawLine(s, o.values.map(function (v, i) { return [X(i), Y(v)]; }), t.ink, t, { noDots: true, width: 2 });
    o.values.forEach(function (v, i) {
      var out = v > o.ucl;
      var c = mk("circle", { cx: X(i), cy: Y(v), r: out ? 6 : 3.4, fill: out ? t.terra : t.bg, stroke: out ? t.terra : t.ink, "stroke-width": 2, class: "pop" }, s);
      delay(c, 600 + i * 30);
      var hit = mk("rect", { x: X(i) - (x1 - x0) / (n - 1) / 2, y: y1, width: (x1 - x0) / (n - 1), height: y0 - y1, class: "hit" }, s);
      hover(hit, "Lot " + (1040 + i), ["Défauts " + fr(v, 1) + " %", out ? "Hors limite : à analyser" : "Dans la limite"]);
    });
    txt(x0, h - 6, "lot 1040", { class: "sm" }, s);
    txt(x1, h - 6, "lot " + (1040 + n - 1), { "text-anchor": "end", class: "sm" }, s);
    reveal(s, animate);
  }

  // Planning : une barre par commande, la date du jour en pointillé.
  function planning(el, o, animate) {
    var rowH = 30, top = 22, h = top + o.rows.length * rowH + 6;
    var b = base(el, h, o.label), s = b.s, w = b.w, t = b.t;
    var labW = Math.min(80, w * 0.3), x0 = labW + 8, x1 = w - 6, n = o.weeks.length;
    var X = function (v) { return x0 + (x1 - x0) * v / n; };
    o.weeks.forEach(function (wk, i) { if (i % 2 === 0) txt(X(i + 0.5), 12, wk, { "text-anchor": "middle", class: "sm" }, s); });
    o.rows.forEach(function (r, i) {
      var y = top + i * rowH;
      txt(labW, y + rowH / 2 + 4, r.name, { "text-anchor": "end", class: "sm" }, s);
      var rr = mk("rect", { x: X(r.s), y: y + 7, width: X(r.e) - X(r.s), height: rowH - 14, rx: 4, fill: r.late ? t.terra : t.sage, class: "grow-x" }, s);
      delay(rr, 100 + i * 90);
      var hit = mk("rect", { x: 0, y: y, width: w, height: rowH, class: "hit" }, s);
      hover(hit, r.name, ["Semaines " + o.weeks[r.s] + " à " + o.weeks[Math.min(n - 1, r.e - 1)], r.late ? "Livraison menacée : l'équipe est en surcharge" : "Dans les temps"]);
    });
    mk("line", { x1: X(o.today), x2: X(o.today), y1: top - 4, y2: h - 2, stroke: t.ink, "stroke-width": 1.5, "stroke-dasharray": "4 4" }, s);
    reveal(s, animate);
  }

  // Tableau de chaleur : une ligne par société, une case par mois.
  function heatmap(el, o, animate) {
    var cellH = 28, top = 22, h = top + o.rows.length * (cellH + 3) + 4;
    var b = base(el, h, o.label), s = b.s, w = b.w;
    var labW = Math.min(110, w * 0.22), x0 = labW + 10, cw = (w - x0) / o.cols.length;
    // Mois en toutes lettres si la case est assez large, sinon leur initiale.
    var colLabs = o.colsShort && o.cols.some(function (c) { return c.length * CHAR_W > cw - 4; }) ? o.colsShort : o.cols;
    colLabs.forEach(function (c, j) { txt(x0 + cw * (j + 0.5), 13, c, { "text-anchor": "middle", class: "sm" }, s); });
    o.rows.forEach(function (row, i) {
      var y = top + i * (cellH + 3);
      txt(labW, y + cellH / 2 + 4, row.label, { "text-anchor": "end", class: "sm" }, s);
      row.v.forEach(function (v, j) {
        var k = o.level(v);
        var c = mk("rect", { x: x0 + cw * j + 1.5, y: y, width: cw - 3, height: cellH, rx: 4, fill: o.color(k), class: "cell pop" }, s);
        delay(c, 100 + j * 45 + i * 12);
        if (cw > 46) {
          var tv = txt(x0 + cw * (j + 0.5), y + cellH / 2 + 4, o.fmt(v), { "text-anchor": "middle", class: "sm pop", "font-family": "JetBrains Mono, monospace", fill: k > 0.55 ? "#1C1815" : "rgba(239,231,216,0.78)", "pointer-events": "none" }, s);
          delay(tv, 300 + j * 45);
        }
        hover(c, row.label + " · " + o.cols[j], ["Disponibilité " + o.fmt(v) + " %", row.sub || ""]);
        if (o.onClick) c.addEventListener("click", function () { o.onClick(row); });
      });
    });
    reveal(s, animate);
  }

  // Carte des régions à partir des contours simplifiés de data-demo.js.
  var MAPBOX = null;
  function mapBox(regions) {
    if (MAPBOX) return MAPBOX;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    regions.forEach(function (r) {
      var nums = (r.d.match(/-?\d+(\.\d+)?/g) || []).map(Number), rx0 = 1e9, ry0 = 1e9, rx1 = -1e9, ry1 = -1e9;
      for (var i = 0; i < nums.length; i += 2) {
        var x = nums[i], y = nums[i + 1];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        rx0 = Math.min(rx0, x); rx1 = Math.max(rx1, x); ry0 = Math.min(ry0, y); ry1 = Math.max(ry1, y);
      }
      r.c = [(rx0 + rx1) / 2, (ry0 + ry1) / 2];
    });
    MAPBOX = [x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20];
    return MAPBOX;
  }
  function mapChart(el, o, animate) {
    el.replaceChildren();
    var bx = mapBox(o.regions), t = theme(el), edge = t.dark ? "#221C18" : "#FBF7EF";
    var s = mk("svg", { viewBox: bx.join(" "), class: "viz", role: "img", "aria-label": o.label }, el);
    o.regions.forEach(function (r, i) {
      if (r.s) return;
      mk("path", { d: r.d, fill: t.dark ? t.faint : "#E8DFCC", stroke: edge, "stroke-width": 2, "stroke-linejoin": "round" }, s);
    });
    o.regions.forEach(function (r, i) {
      if (!r.s) return;
      var isSel = o.sel === r.nom, e = r.s.prod / r.s.bud - 1;
      var g = mk("g", { class: "region pop", tabindex: 0, role: "button", "aria-label": r.nom + ", écart " + pct(e) }, s);
      delay(g, 100 + i * 50);
      mk("path", { d: r.d, fill: o.color(r.s), stroke: isSel ? t.terra : edge, "stroke-width": isSel ? 8 : 2.5, "stroke-linejoin": "round", "fill-opacity": o.sel && !isSel ? 0.45 : 1 }, g);
      var lab = txt(r.c[0], r.c[1] + 11, pct(e), { "text-anchor": "middle", "font-family": "JetBrains Mono, monospace", "font-weight": 600, fill: "#1C1815", "pointer-events": "none" }, g);
      lab.style.setProperty("font-size", "30px"); // en unités de la carte : la règle .viz text l'écraserait sinon
      hover(g, r.nom, [r.s.centrales + " centrales · " + fr(r.s.mwc, 1) + " MWc", "Écart au budget " + pct(e), "Disponibilité " + fr(r.s.dispo * 100, 1) + " %"]);
      var pick = function () { o.onPick(r.nom); };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
    });
    reveal(s, animate);
  }

  /* ---------- Ce que coûte le retard ---------- */
  var DELAY = { mode: "trim", rate: 800, onset: 9, weeks: 35, disc: { trim: 27, mens: 18, auto: 10 }, touched: false };
  var DELAY_MOIS = [[1, "janv."], [5, "févr."], [9, "mars"], [14, "avr."], [18, "mai"], [22, "juin"], [27, "juil."], [31, "août"]];
  var uid = 0;
  // Pastille de texte (fond plein, coins ronds), placée à gauche ou à droite d'un point d'ancrage.
  function pill(parent, x, y, label, o) {
    o = o || {};
    var g = mk("g", { class: o.cls || null }, parent), wd = Math.round(label.length * (o.cw || 6.9) + 22), hh = 24;
    var px = o.anchor === "end" ? x - wd : o.anchor === "middle" ? x - wd / 2 : x;
    mk("rect", { x: px, y: y - hh / 2, width: wd, height: hh, rx: hh / 2, fill: o.bg || "#1C1815" }, g);
    // La couleur passe par le style : la règle .viz text écraserait l'attribut fill.
    txt(px + wd / 2, y + 4.5, label, { "text-anchor": "middle", class: "pill-t" }, g).style.fill = o.fg || "#EFE7D8";
    return g;
  }
  function delayChart(el, animate) {
    var w0 = el.clientWidth;
    var b = base(el, w0 < 560 ? 300 : 380, "Coût cumulé d'une dérive selon le moment où elle est vue"), s = b.s, w = b.w, h = b.h, t = b.t;
    var padL = 50, padB = 28, padT = 40, x0 = padL, x1 = w - 12, y0 = h - padB, y1 = padT;
    var disc = DELAY.disc[DELAY.mode], maxW = DELAY.weeks, rate = DELAY.rate;
    var max = Math.ceil(rate * (maxW - DELAY.onset) * 1.02 / 4000) * 4000;
    var X = function (wk) { return x0 + (x1 - x0) * (wk - 1) / (maxW - 1); }, Y = function (v) { return y0 - v / max * (y0 - y1); };
    var cost = function (wk, stop) { return rate * Math.max(0, Math.min(wk, stop) - DELAY.onset); };
    var gid = "dg" + (++uid), defs = mk("defs", {}, s), lg = mk("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    mk("stop", { offset: "0", "stop-color": t.terra, "stop-opacity": 0.34 }, lg);
    mk("stop", { offset: "1", "stop-color": t.terra, "stop-opacity": 0.03 }, lg);
    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4;
      mk("line", { x1: x0, x2: x1, y1: Y(gv), y2: Y(gv), class: g ? "grid" : "axis", "stroke-dasharray": g ? "3 5" : null }, s);
      if (g) txt(x0 - 10, Y(gv) + 4, fmtAxis(gv) + " €", { "text-anchor": "end", class: "sm" }, s);
    }
    DELAY_MOIS.forEach(function (m) { txt(X(m[0]), h - 8, m[1], { class: "sm" }, s); });

    // Ce que coûterait la dérive si personne ne la voyait.
    var ghost = [];
    for (var wk = 1; wk <= maxW; wk++) ghost.push([X(wk), Y(cost(wk, maxW))]);
    drawLine(s, ghost, t.soft, t, { noDots: true, dash: "4 5", width: 1.5 });
    txt(X(maxW), Y(cost(maxW, maxW)) - 10, "si l'écart n'est jamais vu", { "text-anchor": "end", class: "sm" }, s);

    // Ce qui est perdu avant que l'écart soit vu : surface en dégradé sous la courbe.
    var area = "M" + X(DELAY.onset) + " " + y0;
    for (var w2 = DELAY.onset; w2 <= disc; w2++) area += " L" + X(w2).toFixed(1) + " " + Y(cost(w2, disc)).toFixed(1);
    area += " L" + X(disc) + " " + y0 + " Z";
    var ar = mk("path", { d: area, fill: "url(#" + gid + ")", class: "pop" }, s);
    delay(ar, 450);
    var real = [];
    for (var w3 = 1; w3 <= maxW; w3++) real.push([X(w3), Y(cost(w3, disc))]);
    drawLine(s, real, t.terra, t, { noDots: true, width: 2.8, delay: 100 });

    // Début de la dérive.
    mk("circle", { cx: X(DELAY.onset), cy: y0, r: 5, fill: t.ink }, s);
    // À gauche de son point : l'étiquette « écart vu » part vers la droite, les deux ne se croisent jamais.
    // Sur un écran étroit, la place manque à gauche : l'étiquette monte au-dessus du point.
    var roomLeft = X(DELAY.onset) - 10 - ("la dérive commence".length * 6.9 + 22) > 2;
    var p0 = pill(s, X(DELAY.onset) + (roomLeft ? -10 : -6), roomLeft ? y0 - 22 : y0 - 58, "la dérive commence", { anchor: roomLeft ? "end" : "start", bg: "#FBF7EF", fg: "#1C1815", cls: "pop pill-line" });
    delay(p0, 300);

    // Moment où l'écart est vu : repère vertical, halo, pastille avec le montant.
    var vx = X(disc), vy = Y(cost(disc, disc)), lost = cost(disc, disc);
    var gv2 = mk("g", { class: "pop" }, s);
    delay(gv2, 900);
    mk("line", { x1: vx, x2: vx, y1: vy, y2: y0, stroke: t.terra, "stroke-width": 1.5, "stroke-dasharray": "3 4" }, gv2);
    mk("circle", { cx: vx, cy: vy, r: 13, fill: t.terra, "fill-opacity": 0.18 }, gv2);
    mk("circle", { cx: vx, cy: vy, r: 6, fill: t.terra, stroke: t.bg, "stroke-width": 2.5 }, gv2);
    var right = vx > (x0 + x1) * 0.62;
    pill(gv2, vx + (right ? -18 : 18), Math.max(y1 - 12, vy - 26), "écart vu : " + fr(lost, 0) + " €", { anchor: right ? "end" : "start" });

    for (var w4 = 1; w4 <= maxW; w4++) {
      (function (k) {
        var hit = mk("rect", { x: X(k) - (x1 - x0) / (maxW - 1) / 2, y: y1, width: (x1 - x0) / (maxW - 1), height: y0 - y1, class: "hit" }, s);
        hover(hit, "Semaine " + k, ["Perdu à cette date : " + fr(cost(k, disc), 0) + " €", k >= disc ? "L'écart est vu et traité" : k >= DELAY.onset ? "L'écart court sans que personne le voie" : "Tout va bien"]);
      })(w4);
    }
    var kpi = $("[data-delay-kpi]"), seen = $("[data-delay-seen]"), n = disc - DELAY.onset;
    if (kpi) kpi.textContent = fr(lost, 0) + " €";
    if (seen) seen.textContent = n + (n > 1 ? " semaines" : " semaine");
    reveal(s, animate);
  }
  function setDelay(mode, byUser) {
    if (byUser) DELAY.touched = true;
    DELAY.mode = mode;
    $$("[data-delay]").forEach(function (bt) { bt.setAttribute("aria-pressed", String(bt.dataset.delay === mode)); });
    var el = $("[data-chart='delay']");
    if (el) renderChart(el, true);
  }

  /* ---------- Avant / après (planning du reporting) ---------- */
  var GANTT = {
    rows: ["Exporter les données", "Consolider les fichiers", "Vérifier et corriger", "Mettre en forme", "Analyser et commenter", "Diffuser"],
    short: ["Exporter", "Consolider", "Vérifier", "Mettre en forme", "Analyser", "Diffuser"],
    avant: [[0, 2, "m", "2 j à la main"], [2, 5.5, "m", "3,5 j à la main"], [5.5, 7.5, "m", "2 j à la main"], [7.5, 9.5, "m", "2 j à la main"], [9.5, 10.5, "a", "1 j"], [10.5, 11, "d", "0,5 j"]],
    apres: [[0, 0.1, "auto", "automatique"], [0.1, 0.2, "auto", "automatique"], [0.2, 0.3, "auto", "automatique"], [0.3, 0.4, "auto", "automatique"], [0.4, 0.9, "a", "0,5 j"], [0.9, 1, "d", "0,1 j"]],
    kpi: { avant: ["J+11", "11 jours"], apres: ["J+1", "0,6 jour"] },
    mode: "avant", nodes: null, touched: false
  };
  function ganttColors(t) { return { m: t.dark ? "#A89886" : "#7D6E60", auto: "#B5C7AF", a: "#DC6B2F", d: t.ink }; }
  function ganttPill(n, end) {
    var label = (n.narrow ? "disponible J+" : "reporting disponible, J+") + String(Math.ceil(end)).replace(".", ",");
    n.pillT.textContent = label;
    var wd = Math.round(label.length * 6.9 + 22);
    n.pillR.setAttribute("width", wd);
    var left = n.X(end) + wd + 8 > n.w;
    n.pillR.setAttribute("x", left ? -wd : 0);
    n.pillT.setAttribute("x", left ? -wd / 2 : wd / 2);
  }
  function gantt(el, animate) {
    // La pastille « reporting disponible » a sa propre bande en haut, au-dessus des jours : elle ne masque aucun libellé.
    var rowH = 52, top = 78, nR = GANTT.rows.length, h = top + nR * rowH + 6;
    var b = base(el, h, "Exemple de répartition du temps d'un reporting mensuel"), s = b.s, w = b.w, t = b.t, GC = ganttColors(t);
    var narrow = w < 560, labW = narrow ? Math.round(w * 0.42) : Math.min(250, Math.round(w * 0.26)), x0 = labW + 10, x1 = w - 6;
    var X = function (d) { return x0 + d / 12 * (x1 - x0); };
    // Une bande claire un jour sur deux, pour lire les durées d'un coup d'œil.
    for (var d = 0; d < 12; d += 2) mk("rect", { x: X(d), y: top - 8, width: X(d + 1) - X(d), height: nR * rowH + 8, fill: t.faint, "fill-opacity": 0.5 }, s);
    var dayStep = narrow ? 3 : (x1 - x0) / 12 < 46 ? 2 : 1;
    for (var d2 = 0; d2 <= 12; d2 += dayStep) txt(X(d2), top - 18, "J+" + d2, { "text-anchor": d2 === 12 ? "end" : "middle", class: "gl-day" }, s);
    var data = GANTT[GANTT.mode], nodes = { bars: [], labels: [], dots: [], X: X, w: w, narrow: narrow, colors: GC };
    GANTT.rows.forEach(function (row, i) {
      var y = top + i * rowH, seg = data[i], bh = rowH - 28;
      if (i) mk("line", { x1: 0, x2: w, y1: y, y2: y, class: "grid" }, s);
      var dot = mk("circle", { cx: 6, cy: y + rowH / 2 - 7, r: 5 }, s);
      dot.style.fill = GC[seg[2]];
      txt(20, y + rowH / 2 - 2, narrow ? GANTT.short[i] : row, { class: "gl-name" }, s);
      var dur = txt(20, y + rowH / 2 + 15, seg[3], { class: "gl-dur" }, s);
      var r = mk("rect", { x: X(seg[0]), y: y + 14, width: Math.max(10, X(seg[1]) - X(seg[0])), height: bh, rx: bh / 2, class: "gb" + (animate ? " grow-x" : ""),
        stroke: "rgba(28,24,21,0.3)", "stroke-width": seg[2] === "auto" ? 1 : 0 }, s);
      r.style.fill = GC[seg[2]];
      delay(r, i * 110);
      nodes.bars.push(r); nodes.labels.push(dur); nodes.dots.push(dot);
    });
    // Repère « reporting disponible » : trait vertical et pastille qui glissent ensemble.
    var end = data[data.length - 1][1], mkG = mk("g", { class: "pop" }, s), inner = mk("g", {}, mkG);
    delay(mkG, 900);
    // Trait interrompu à la hauteur des libellés de jours, pour ne pas barrer « J+11 ».
    mk("line", { x1: 0, x2: 0, y1: 30, y2: top - 32, stroke: "#DC6B2F", "stroke-width": 2 }, inner);
    mk("line", { x1: 0, x2: 0, y1: top - 10, y2: h - 4, stroke: "#DC6B2F", "stroke-width": 2 }, inner);
    nodes.pillR = mk("rect", { x: 0, y: 6, width: 10, height: 24, rx: 12, fill: "#DC6B2F" }, inner);
    nodes.pillT = txt(0, 22.5, "", { "text-anchor": "middle", class: "pill-t" }, inner);
    nodes.pillT.style.fill = "#1C1815";
    nodes.marker = inner;
    inner.setAttribute("transform", "translate(" + X(end).toFixed(2) + " 0)");
    ganttPill(nodes, end);
    GANTT.nodes = nodes;
    reveal(s, animate);
  }
  function ease(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function setGantt(mode, byUser) {
    if (byUser) GANTT.touched = true;
    if (mode === GANTT.mode) return;
    GANTT.mode = mode;
    $$("[data-mode]").forEach(function (bt) { bt.setAttribute("aria-pressed", String(bt.dataset.mode === mode)); });
    var k = GANTT.kpi[mode];
    ["dispo", "temps"].forEach(function (key, i) {
      var dd = $("[data-kpi='" + key + "']");
      if (!dd) return;
      dd.textContent = k[i];
      dd.classList.toggle("is-good", mode === "apres");
    });
    var n = GANTT.nodes;
    if (!n) return;
    var data = GANTT[mode], X = n.X, endTo = data[data.length - 1][1];
    var from = n.bars.map(function (r) { return [parseFloat(r.getAttribute("x")), parseFloat(r.getAttribute("width"))]; });
    var to = data.map(function (seg) { return [X(seg[0]), Math.max(10, X(seg[1]) - X(seg[0]))]; });
    var mFrom = parseFloat(n.marker.getAttribute("transform").replace("translate(", "")), mTo = X(endTo);
    data.forEach(function (seg, i) {
      n.bars[i].style.fill = n.colors[seg[2]];
      n.bars[i].setAttribute("stroke-width", seg[2] === "auto" ? 1 : 0);
      n.dots[i].style.fill = n.colors[seg[2]];
      n.labels[i].textContent = seg[3];
    });
    ganttPill(n, endTo);
    var t0 = null, dur = reduceMotion ? 1 : 1100;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), e = ease(p);
      n.bars.forEach(function (r, i) {
        r.setAttribute("x", (from[i][0] + (to[i][0] - from[i][0]) * e).toFixed(2));
        r.setAttribute("width", (from[i][1] + (to[i][1] - from[i][1]) * e).toFixed(2));
      });
      n.marker.setAttribute("transform", "translate(" + (mFrom + (mTo - mFrom) * e).toFixed(2) + " 0)");
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Parc photovoltaïque : exploitation ---------- */
  // Hauteur à donner à un graphique pour que sa carte finisse en même temps que la carte voisine la plus haute
  // de la même ligne de grille. Renvoie null s'il n'y a pas de voisine (téléphone, carte seule sur sa ligne).
  function rowFill(el) {
    var card = el.closest(".pv-card");
    if (!card || !card.parentNode) return null;
    var top = card.getBoundingClientRect().top, best = 0;
    Array.prototype.forEach.call(card.parentNode.children, function (c) {
      if (c === card || !c.lastElementChild || Math.abs(c.getBoundingClientRect().top - top) > 1) return;
      var r = c.getBoundingClientRect(), last = c.lastElementChild.getBoundingClientRect();
      best = Math.max(best, last.bottom - r.top + parseFloat(getComputedStyle(c).paddingBottom));
    });
    if (!best) return null;
    var cs = getComputedStyle(card), other = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 6;
    Array.prototype.forEach.call(card.children, function (c) {
      if (c === el) return;
      var m = getComputedStyle(c);
      other += c.getBoundingClientRect().height + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
    });
    return Math.floor(best - other);
  }
  var PV = { region: null, view: "exploit", soc: null };
  function pvStats() {
    var P = D.parc;
    if (!PV.region) return { prod: P.prod, bud: P.bud, prhi: P.prhi, dispo: P.dispo, pertes: P.pertes, eur: P.pertesEur, centrales: P.centrales, mwc: P.mwc };
    var r = D.regions.filter(function (x) { return x.nom === PV.region; })[0].s;
    return { prod: r.prod, bud: r.bud, prhi: r.prhi, dispo: r.dispo, pertes: r.pertes, eur: Math.round(r.pertes * P.valeurMWh), centrales: r.centrales, mwc: r.mwc };
  }
  function regionColor(s) {
    var e = s.prod / s.bud - 1;
    return e <= -0.05 ? "#DC6B2F" : e <= -0.02 ? "#D99A6C" : "#CDBEA5";
  }
  function setText(sel, parts) {
    var el = $(sel);
    if (!el) return;
    el.replaceChildren();
    parts.forEach(function (x) {
      if (typeof x === "string") el.appendChild(document.createTextNode(x));
      else { var sm = document.createElement("small"); sm.textContent = x.small; el.appendChild(sm); }
    });
  }
  function pvKpis() {
    var st = pvStats();
    setText("[data-pv='prod']", [fr(st.prod, 0), { small: "MWh" }]);
    setText("[data-pv='ecart']", [pct(st.prod / st.bud - 1)]);
    setText("[data-pv='pr']", [fr(st.prhi * 100, 1) + " %"]);
    setText("[data-pv='dispo']", [fr(st.dispo * 100, 1) + " %"]);
    setText("[data-pv='pertes']", [fr(st.eur, 0) + " €"]);
    var sel = $("[data-pv='region']"), reset = $("[data-region-reset]");
    if (!sel || !reset) return;
    if (PV.region) { sel.hidden = false; sel.textContent = PV.region + " · " + st.centrales + " centrales"; reset.setAttribute("aria-pressed", "false"); reset.textContent = "Tout le parc"; }
    else { sel.hidden = true; reset.setAttribute("aria-pressed", "true"); reset.textContent = "Tout le parc · " + D.parc.centrales + " centrales"; }
  }
  function pvCascade() {
    var st = pvStats(), P = D.parc;
    if (!PV.region) return { bud: P.cascade[0], meteo: P.cascade[1], arrets: P.cascade[2], perf: P.cascade[3], prod: P.cascade[4] };
    var perf = r1(st.bud * 0.001), arrets = -st.pertes, meteo = r1(st.prod - st.bud - arrets - perf);
    return { bud: st.bud, meteo: meteo, arrets: arrets, perf: perf, prod: st.prod };
  }
  var CHARTS_PV = {
    "pv-map": function (el, a) {
      mapChart(el, { regions: D.regions, sel: PV.region, color: regionColor, label: "Écart au budget par région",
        onPick: function (nom) { pvSetRegion(PV.region === nom ? null : nom); } }, a);
      // La carte fixe la hauteur de sa ligne : si le graphique voisin est déjà dessiné, il se recale dessus.
      var cb = $("[data-chart='pv-combo']");
      if (cb && cb.dataset.rendered) renderChart(cb, false);
    },
    "pv-combo": function (el, a) {
      var st = pvStats(), sp = st.prod / D.parc.prod, sb = st.bud / D.parc.bud;
      var bars = D.mois.prod.map(function (v) { return Math.round(v * sp); }), line = D.mois.bud.map(function (v) { return Math.round(v * sb); });
      var fill = rowFill(el);
      combo(el, { h: fill ? Math.max(270, Math.min(560, fill)) : 270, labels: M12, bars: bars, line: line, lineColor: "#CDBEA5", label: "Production et budget mois par mois",
        tip: function (i) { return [M12[i] + " 2025", "Production " + fr(bars[i], 0) + " MWh", "Budget P50 " + fr(line[i], 0) + " MWh", "Écart " + pct(bars[i] / line[i] - 1)]; } }, a);
    },
    "pv-fall": function (el, a) {
      var c = pvCascade(), st = pvStats(), who = PV.region || "Le parc";
      var steps = [{ label: "Budget P50", short: "Budget", value: c.bud, total: true }, { label: "Météo", value: c.meteo }, { label: "Arrêts", value: c.arrets, key: true },
        { label: "Performance", short: "Perf.", value: c.perf }, { label: "Production", short: "Prod.", value: c.prod, total: true }];
      var lo = Math.min(c.bud, c.prod, c.bud + c.meteo), range = Math.max(c.bud, c.bud + c.meteo) - lo;
      var unit = Math.pow(10, Math.floor(Math.log10(Math.max(1, range))));
      var min = Math.max(0, Math.floor((lo - range * 0.9) / unit) * unit);
      $("[data-pv='fall-title']").textContent = who + " : du budget à la production, en MWh";
      $("[data-pv='reading']").textContent = who + (PV.region ? " : " : " est ") + fr(Math.abs((st.prod / st.bud - 1) * 100), 1) + " % " + (st.prod < st.bud ? "sous" : "au-dessus de") + " son budget. La météo pèse " + sgn(c.meteo, 0) + " MWh, les arrêts " + sgn(c.arrets, 0) + " MWh, soit " + fr(st.eur, 0) + " € au prix des contrats.";
      waterfall(el, { h: 260, steps: steps, min: min, unit: "MWh", dec: 0, colors: { first: "#CDBEA5", last: "#EFE7D8", up: "#CDBEA5" }, label: "Cascade du budget à la production" }, a);
    },
    "pv-causes": function (el, a) {
      var k = pvStats().pertes / D.parc.pertes, t = theme(el), cols = [t.terra, "#D99A6C", "#CDBEA5", "#8C7B6B"];
      // À côté de la cascade, les barres s'espacent pour finir à la même hauteur qu'elle.
      var rowH = Number(el.dataset.rowh) || 40, fill = rowFill(el);
      if (fill) rowH = Math.max(40, Math.min(92, Math.floor((fill - 16) / D.causes.length)));
      hbars(el, { labW: 170, rowH: rowH, top: 10, min: 0, label: "Arrêts par cause",
        items: D.causes.map(function (c, i) {
          var v = r1(c.mwh * k), court = { "Panne onduleur": "Onduleur", "Maintenance préventive": "Maintenance", "Coupure ou travaux du réseau": "Réseau" }[c.cause];
          return { label: c.cause.replace("Coupure ou travaux du réseau", "Réseau (coupures, travaux)"), short: court, value: v, valLabel: fr(v, 1), color: cols[i], tip: [c.cause, fr(v, 1) + " MWh perdus", "≈ " + fr(v * D.parc.valeurMWh, 0) + " €"] }; }) }, a);
    },
    "pv-heat": function (el, a) {
      var rows = D.chaleur.filter(function (r) { return !PV.region || r.region === PV.region; }).map(function (r) {
        return { label: r.spv, v: r.v, region: r.region, sub: r.region + " · " + r.centrales + " centrales", mean: sum(r.v) / r.v.length };
      }).sort(function (x, y) { return x.mean - y.mean; });
      // Parc entier : seulement les 8 sociétés les moins disponibles, pour rester lisible.
      if (!PV.region) rows = rows.slice(0, 8);
      var ht = $("[data-pv='heat-title']");
      if (ht) ht.textContent = PV.region ? "Disponibilité mois par mois, sociétés de projet de la région " + PV.region : "Disponibilité mois par mois : les 8 sociétés de projet les moins disponibles";
      heatmap(el, { rows: rows, cols: M12, colsShort: M1, label: "Disponibilité mensuelle par société de projet",
        level: function (v) { return Math.max(0, Math.min(1, (0.998 - v) / 0.05)); },
        color: function (k) { return k < 0.5 ? mix("#3A322C", "#8A5A3C", k * 2) : mix("#8A5A3C", "#DC6B2F", (k - 0.5) * 2); },
        fmt: function (v) { return fr(Math.min(v, 1) * 100, 1); },
        onClick: function (row) { pvSetRegion(row.region); } }, a);
    }
  };
  function pvTodo() {
    var ol = $("[data-pv='todo']");
    if (!ol) return;
    ol.replaceChildren();
    D.ouverts.slice(0, 6).forEach(function (o) {
      var li = document.createElement("li");
      var add = function (cls, text) { var sp = document.createElement("span"); sp.className = cls; sp.textContent = text; li.appendChild(sp); };
      add("t-name", o.nom);
      add("t-prio " + (o.statut === "En cours" ? "haute" : "basse"), o.statut);
      add("t-txt", o.cause + " · " + o.origine.toLowerCase() + " · depuis le " + o.debut.split("-").reverse().join("/"));
      add("t-val", "−" + fr(o.mwh, 1) + " MWh · ≈ " + fr(Math.round(o.mwh * D.parc.valeurMWh / 10) * 10, 0) + " €");
      ol.appendChild(li);
    });
  }
  function pvSetRegion(nom) {
    PV.region = nom;
    hideTip();
    pvKpis();
    ["pv-map", "pv-combo", "pv-fall", "pv-causes", "pv-heat"].forEach(function (k) { var el = $("[data-chart='" + k + "']"); if (el) renderChart(el, k !== "pv-map"); });
  }

  /* ---------- Parc photovoltaïque : finance ---------- */
  // Périmètre : tout le portefeuille (PV.soc vide) ou la société de projet cliquée sur le graphique du DSCR.
  function finSel() { var S = D.finance.societes; return PV.soc ? S.filter(function (s) { return s.code === PV.soc; }) : S; }
  function finSum(key, n) {
    var S = finSel(), out = [];
    for (var i = 0; i < n; i++) out.push(r1(sum(S.map(function (s) { return s[key][i] || 0; }))));
    return out;
  }
  function finWho() { var s = PV.soc && D.finance.societes.filter(function (x) { return x.code === PV.soc; })[0]; return s ? s.nom : null; }
  function finMonth(i, withYear) { var m = D.finance.mois[i], mm = Number(m.slice(5)); return M12[mm - 1] + (withYear || mm === 1 ? " " + m.slice(0, 4) : ""); }
  // Trésorerie : réel jusqu'au dernier mois clos ; trajectoire du business plan depuis le même point de départ ;
  // ensuite, projections P50 et P90 = dernier solde réel + flux du business plan (CFADS moins service de la dette).
  function finPaths() {
    var F = D.finance, n = F.mois.length, R = F.reel, solde = finSum("solde", R), f50 = finSum("flux50", n), f90 = finSum("flux90", n);
    var bp = [solde[0]], p50 = [], p90 = [];
    for (var i = 1; i < n; i++) bp.push(bp[i - 1] + f50[i]);
    p50[R - 1] = p90[R - 1] = solde[R - 1];
    for (var j = R; j < n; j++) { p50[j] = p50[j - 1] + f50[j]; p90[j] = p90[j - 1] + f90[j]; }
    return { solde: solde, bp: bp, p50: p50, p90: p90, R: R, n: n };
  }
  function finKpis() {
    var F = D.finance, P = finPaths(), R = P.R, fin26 = F.mois.indexOf("2026-12"), S = finSel(), who = finWho();
    var low = S.slice().sort(function (x, y) { return x.dscr.p26 - y.dscr.p26; })[0];
    setText("[data-fin='treso']", [fr(P.solde[R - 1], 0), { small: "k€" }]);
    setText("[data-fin='ecartbp']", [sgn(P.solde[R - 1] - P.bp[R - 1], 0), { small: "k€" }]);
    setText("[data-fin='proj']", [fr(P.p50[fin26], 0), { small: "k€" }]);
    setText("[data-fin='dscrmin']", [fr(low.dscr.p26, 2), { small: who ? "" : low.nom.replace("SPV ", "") }]);
    setText("[data-fin='sous']", [S.filter(function (s) { return s.dscr.d25 < 1; }).length + " sur " + S.length]);
    var sel = $("[data-fin='soc']"), reset = $("[data-soc-reset]");
    if (!sel || !reset) return;
    sel.hidden = !who;
    if (who) sel.textContent = who;
    reset.setAttribute("aria-pressed", String(!who));
    reset.textContent = who ? "Tout le portefeuille" : "Tout le portefeuille · " + F.societes.length + " sociétés";
  }
  function finRefresh() {
    hideTip();
    finKpis();
    ["fin-treso", "fin-dscr", "fin-enc"].forEach(function (k) { var el = $("[data-chart='" + k + "']"); if (el) renderChart(el, k !== "fin-dscr"); });
  }
  // Étiquettes de fin de courbe : écartées verticalement si elles se chevauchent.
  function endLabels(s, x, items) {
    items.sort(function (p, q) { return p.y - q.y; });
    for (var i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 17) items[i].y = items[i - 1].y + 17;
    items.forEach(function (it) {
      mk("line", { x1: x + 4, x2: x + 14, y1: it.y - 4, y2: it.y - 4, stroke: it.color, "stroke-width": 2.5, "stroke-dasharray": it.dash || null }, s);
      txt(x + 20, it.y, it.label, { class: "val" }, s);
    });
  }
  var CHARTS_FIN = {
    "fin-treso": function (el, a) {
      var P = finPaths(), who = finWho(), n = P.n, R = P.R;
      var tt = $("[data-fin='treso-title']");
      if (tt) tt.textContent = (who || "Tout le portefeuille") + " : trésorerie réelle, projetée et business plan, en k€";
      var b = base(el, 300, "Trésorerie réelle, projections P50 et P90, et trajectoire du business plan"), s = b.s, w = b.w, h = b.h, t = b.t;
      var narrow = w < 560, padL = 50, padR = narrow ? 8 : 104, x0 = padL, x1 = w - padR, y0 = h - 28, y1 = 40;
      var all = P.solde.concat(P.bp, P.p50.slice(R - 1), P.p90.slice(R - 1));
      var lo = Math.min(0, Math.min.apply(null, all)), hi = niceMax4(Math.max.apply(null, all) * 1.04);
      var X = function (i) { return x0 + (x1 - x0) * i / (n - 1); }, Y = function (v) { return y0 - (v - lo) / (hi - lo) * (y0 - y1); };
      var pts = function (arr, from, to) { var o = []; for (var i = from; i <= to; i++) o.push([X(i), Y(arr[i])]); return o; };
      // Zone projetée : fond légèrement plus clair après le dernier mois réel.
      mk("rect", { x: X(R - 1), y: y1 - 14, width: x1 - X(R - 1), height: y0 - y1 + 14, fill: t.faint }, s);
      for (var g = 0; g <= 4; g++) {
        var gv = lo + (hi - lo) * g / 4;
        mk("line", { x1: x0, x2: x1, y1: Y(gv), y2: Y(gv), class: g ? "grid" : "axis", "stroke-dasharray": g ? "3 5" : null }, s);
        txt(x0 - 10, Y(gv) + 4, fmtAxis(gv), { "text-anchor": "end", class: "sm" }, s);
      }
      // Mois tous les trimestres si la place le permet, sinon tous les semestres, sinon seulement les années.
      var perMonth = (x1 - x0) / (n - 1), every = perMonth * 3 >= 72 ? 3 : perMonth * 6 >= 72 ? 6 : 12;
      for (var i = 0; i < n; i += every) {
        var mm = Number(D.finance.mois[i].slice(5)), yy = D.finance.mois[i].slice(0, 4);
        txt(X(i), h - 8, every === 12 ? yy : M12[mm - 1] + (mm === 1 ? " " + yy.slice(2) : ""), { "text-anchor": i === 0 ? "start" : "middle", class: "sm" }, s);
      }
      // Fourchette P50 à P90.
      var band = "M" + pts(P.p50, R - 1, n - 1).map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L");
      band += " L" + pts(P.p90, R - 1, n - 1).reverse().map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + " Z";
      var bd = mk("path", { d: band, fill: t.terra, "fill-opacity": 0.16, class: "pop" }, s);
      delay(bd, 700);
      drawLine(s, pts(P.bp, 0, n - 1), t.sand, t, { noDots: true, dash: "6 5", width: 1.8 });
      drawLine(s, pts(P.p90, R - 1, n - 1), t.terra, t, { noDots: true, dash: "2 4", width: 1.6 });
      drawLine(s, pts(P.p50, R - 1, n - 1), t.terra, t, { noDots: true, dash: "7 5", width: 2.4 });
      drawLine(s, pts(P.solde, 0, R - 1), t.ink, t, { noDots: true, width: 2.8, delay: 100 });
      // Repère du dernier mois réel.
      var gm = mk("g", { class: "pop" }, s);
      delay(gm, 900);
      mk("line", { x1: X(R - 1), x2: X(R - 1), y1: y1 - 14, y2: y0, stroke: t.soft, "stroke-width": 1.2, "stroke-dasharray": "3 4" }, gm);
      mk("circle", { cx: X(R - 1), cy: Y(P.solde[R - 1]), r: 5.5, fill: t.ink, stroke: t.bg, "stroke-width": 2 }, gm);
      pill(gm, X(R - 1), y1 - 22, "aujourd'hui : " + finMonth(R - 1, true), { anchor: "middle", bg: "#EFE7D8", fg: "#1C1815" });
      if (!narrow) endLabels(s, x1, [
        { y: Y(P.p50[n - 1]) + 4, label: "P50 " + fr(P.p50[n - 1], 0), color: t.terra, dash: "5 3" },
        { y: Y(P.p90[n - 1]) + 4, label: "P90 " + fr(P.p90[n - 1], 0), color: t.terra, dash: "2 3" },
        { y: Y(P.bp[n - 1]) + 4, label: "BP " + fr(P.bp[n - 1], 0), color: t.sand, dash: "5 3" }
      ]);
      for (var k = 0; k < n; k++) {
        (function (m) {
          var hit = mk("rect", { x: X(m) - (x1 - x0) / (n - 1) / 2, y: y1 - 14, width: (x1 - x0) / (n - 1), height: y0 - y1 + 14, class: "hit" }, s);
          hover(hit, finMonth(m, true), m < R ? ["Trésorerie réelle : " + fr(P.solde[m], 0) + " k€", "Business plan : " + fr(P.bp[m], 0) + " k€"]
            : ["Projection P50 : " + fr(P.p50[m], 0) + " k€", "Projection P90 : " + fr(P.p90[m], 0) + " k€", "Business plan : " + fr(P.bp[m], 0) + " k€"]);
        })(k);
      }
      reveal(s, a);
    },
    "fin-dscr": function (el, a) {
      var S = D.finance.societes, t = theme(el), selIdx = S.map(function (s) { return s.code; }).indexOf(PV.soc), fill = rowFill(el);
      grouped(el, { h: fill ? Math.max(260, Math.min(360, fill)) : 280, labels: S.map(function (s) { return s.nom.replace("SPV ", ""); }), sel: selIdx, max: 4,
        series: [{ name: "2025, réel", vals: S.map(function (s) { return s.dscr.d25; }), color: "#B9A88C" }, { name: "Juin 2026, réel", vals: S.map(function (s) { return s.dscr.j26; }), color: t.ink }, { name: "Fin 2026, projeté", vals: S.map(function (s) { return s.dscr.p26; }), color: t.terra }],
        colorFn: function (i, j, v, c) { return v < 1 ? "#F0B08C" : c; },
        ref: { v: 1, label: "" }, fmt: function (v) { return fr(v, 2); }, axisFmt: function (v) { return fr(v, 0); },
        tipTitle: function (i) { return S[i].nom; },
        tipExtra: function (i) { return S[i].dscr.d25 < 1 ? ["En 2025, la dette n'était pas couverte par ce que la société a encaissé"] : []; },
        onClick: function (i) { PV.soc = PV.soc === S[i].code ? null : S[i].code; finRefresh(); },
        label: "DSCR par société de projet" }, a);
    },
    "fin-enc": function (el, a) {
      var F = D.finance, i0 = F.mois.indexOf("2026-01"), R = F.reel, who = finWho();
      var enc = finSum("enc", R), bpm = finSum("encBP", F.mois.length), real = [], bp = [], proj = [], cr = 0, cb = 0, k;
      for (k = 0; k < 12; k++) { cb += bpm[i0 + k]; bp.push(cb); if (i0 + k < R) { cr += enc[i0 + k]; real.push(cr); } }
      var kr = real.length - 1, pv = real[kr];
      proj[kr] = pv;
      for (k = kr + 1; k < 12; k++) { pv += bpm[i0 + k]; proj[k] = pv; }
      var tt = $("[data-fin='enc-title']"), rd = $("[data-fin='enc-reading']"), ecart = proj[11] / bp[11] - 1;
      if (tt) tt.textContent = (who || "Tout le portefeuille") + " : encaissements cumulés 2026, en k€";
      if (rd) rd.textContent = "À fin août, " + fr(real[kr], 0) + " k€ encaissés contre " + fr(bp[kr], 0) + " k€ au business plan. Si les mois restants suivent le plan, l'année finit à " + fr(proj[11], 0) + " k€, soit " + pct(ecart) + ".";
      var fill = rowFill(el), b = base(el, fill ? Math.max(240, Math.min(360, fill)) : 260, "Encaissements cumulés 2026 face au business plan"), s = b.s, w = b.w, h = b.h, t = b.t;
      var x0 = 50, x1 = w - 12, y0 = h - 28, y1 = 30, hi = niceMax4(Math.max(bp[11], proj[11]) * 1.04);
      var X = function (m) { return x0 + (x1 - x0) * m / 11; }, Y = function (v) { return y0 - v / hi * (y0 - y1); };
      for (var g = 0; g <= 4; g++) {
        var gv = hi * g / 4;
        mk("line", { x1: x0, x2: x1, y1: Y(gv), y2: Y(gv), class: g ? "grid" : "axis", "stroke-dasharray": g ? "3 5" : null }, s);
        txt(x0 - 10, Y(gv) + 4, fmtAxis(gv), { "text-anchor": "end", class: "sm" }, s);
      }
      var mStep = (x1 - x0) / 11 * 2 >= 50 ? 2 : 3;
      for (k = 0; k < 12; k += mStep) txt(X(k), h - 8, M12[k], { "text-anchor": k === 0 ? "start" : "middle", class: "sm" }, s);
      var area = "M" + X(0) + " " + y0 + real.map(function (v, m) { return " L" + X(m).toFixed(1) + " " + Y(v).toFixed(1); }).join("") + " L" + X(kr) + " " + y0 + " Z";
      var ar = mk("path", { d: area, fill: t.ink, "fill-opacity": 0.08, class: "pop" }, s);
      delay(ar, 400);
      drawLine(s, bp.map(function (v, m) { return [X(m), Y(v)]; }), t.sand, t, { noDots: true, dash: "6 5", width: 1.8 });
      var pp = [];
      for (k = kr; k < 12; k++) pp.push([X(k), Y(proj[k])]);
      drawLine(s, pp, t.terra, t, { noDots: true, dash: "7 5", width: 2.4 });
      drawLine(s, real.map(function (v, m) { return [X(m), Y(v)]; }), t.ink, t, { noDots: true, width: 2.8, delay: 100 });
      var gp = mk("g", { class: "pop" }, s);
      delay(gp, 900);
      mk("circle", { cx: X(11), cy: Y(proj[11]), r: 5, fill: t.terra, stroke: t.bg, "stroke-width": 2 }, gp);
      pill(gp, X(11), Math.min(Y(proj[11]) + 26, y0 - 16), pct(ecart) + " à fin d'année", { anchor: "end", bg: "#DC6B2F", fg: "#1C1815" });
      for (k = 0; k < 12; k++) {
        (function (m) {
          var hit = mk("rect", { x: X(m) - (x1 - x0) / 22, y: y1, width: (x1 - x0) / 11, height: y0 - y1, class: "hit" }, s);
          hover(hit, M12[m] + " 2026", [m <= kr ? "Encaissé cumulé : " + fr(real[m], 0) + " k€" : "Projeté : " + fr(proj[m], 0) + " k€", "Business plan : " + fr(bp[m], 0) + " k€"]);
        })(k);
      }
      reveal(s, a);
      // Le DSCR, voisin de ligne, se recale sur la hauteur de cette carte.
      var dz = $("[data-chart='fin-dscr']");
      if (dz && dz.dataset.rendered) renderChart(dz, false);
    }
  };
  function setView(v) {
    PV.view = v;
    $$("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
    $$("[data-pv-view]").forEach(function (p) { p.hidden = p.dataset.pvView !== v; });
    $$("[data-pv-view='" + v + "'] .chart").forEach(function (c) { renderChart(c, true); });
    $("[data-pv='periode']").textContent = v === "fin" ? "janv. 2025 à août 2026" : "2025";
  }

  /* ---------- Couches de ce qui est livré ---------- */
  var LAYERS = { active: 0, names: ["Données", "Automatisations", "Tableaux de bord", "Équipes"] };
  function layersViz(el) {
    el.replaceChildren();
    var s = mk("svg", { viewBox: "0 0 680 600" }, el), slabs = [];
    for (var i = 0; i < 4; i++) {
      var Y = 452 - i * 100, g = mk("g", { class: "slab" + (i === LAYERS.active ? " is-active" : "") }, s);
      mk("polygon", { points: "40," + Y + " 260," + (Y + 110) + " 260," + (Y + 128) + " 40," + (Y + 18), class: "side-l" }, g);
      mk("polygon", { points: "260," + (Y + 110) + " 480," + Y + " 480," + (Y + 18) + " 260," + (Y + 128), class: "side-r" }, g);
      mk("polygon", { points: "40," + Y + " 260," + (Y - 110) + " 480," + Y + " 260," + (Y + 110), class: "top" }, g);
      var p = mk("g", { transform: "matrix(2.2,-1.1,2.2,1.1,40," + Y + ")" }, g), ns = { "vector-effect": "non-scaling-stroke" };
      if (i === 0) {
        for (var a = 18; a <= 82; a += 16) { mk("line", Object.assign({ x1: a, y1: 14, x2: a, y2: 86, class: "pat", "stroke-width": 1 }, ns), p); mk("line", Object.assign({ x1: 14, y1: a, x2: 86, y2: a, class: "pat", "stroke-width": 1 }, ns), p); }
        mk("rect", { x: 34, y: 34, width: 16, height: 16, class: "pat acc" }, p);
        mk("rect", { x: 66, y: 50, width: 16, height: 16, class: "pat" }, p);
      } else if (i === 1) {
        [26, 50, 74].forEach(function (v, j) { mk("line", Object.assign({ x1: 14, y1: v, x2: 86, y2: v, class: "pat", "stroke-width": 1.5, "stroke-dasharray": "4 4" }, ns), p); mk("circle", { cx: 30 + j * 20, cy: v, r: 4, class: "pat" + (j === 1 ? " acc" : "") }, p); });
      } else if (i === 2) {
        [[18, 30], [32, 48], [46, 38], [60, 62], [74, 54]].forEach(function (bar, j) { mk("rect", { x: bar[0], y: 86 - bar[1], width: 9, height: bar[1], class: "pat" + (j === 3 ? " acc" : "") }, p); });
      } else {
        [[30, 30], [50, 30], [70, 30], [40, 62], [60, 62]].forEach(function (c, j) { mk("circle", { cx: c[0], cy: c[1], r: 7, class: "pat" + (j === 0 ? " acc" : "") }, p); });
      }
      mk("line", { x1: 486, y1: Y, x2: 508, y2: Y, stroke: "#1C1815", "stroke-opacity": 0.4 }, s);
      var lab = txt(516, Y + 5, LAYERS.names[i], { class: "slab-label" + (i === LAYERS.active ? " is-active" : "") }, s);
      slabs.push({ g: g, lab: lab });
      (function (idx) { g.addEventListener("pointerenter", function () { setLayer(idx); }); g.addEventListener("click", function () { setLayer(idx); }); })(i);
    }
    LAYERS.slabs = slabs;
  }
  function setLayer(i) {
    LAYERS.active = i;
    (LAYERS.slabs || []).forEach(function (sl, j) { sl.g.classList.toggle("is-active", j === i); sl.lab.classList.toggle("is-active", j === i); });
    $$(".layers-list button").forEach(function (bt) { bt.setAttribute("aria-pressed", String(Number(bt.dataset.layer) === i)); });
  }

  /* ---------- Des logiciels au rapport ---------- */
  // Chaque source dit quelles sorties elle alimente (to : indices dans out).
  var FLOW = {
    sector: "enr", pinned: null,
    data: {
      enr: {
        dims: ["Centrales", "Calendrier", "Budgets", "Contrats"],
        src: [
          { n: "Portails des onduleurs", f: "API", i: "api", to: [0, 2], r: "la production et les alarmes de chaque onduleur, récupérées chaque jour." },
          { n: "Supervision", f: "export", i: "gauge", to: [0, 2], r: "les arrêts et leurs causes, rapprochés de l'énergie perdue." },
          { n: "Compteurs", f: "fichiers", i: "meter", to: [0, 1], r: "l'énergie réellement injectée, celle qui sert à la facturation." },
          { n: "Comptabilité", f: "FEC", i: "ledger", to: [1], r: "les charges et les encaissements de chaque société de projet." },
          { n: "Contrats et business plan", f: "Excel", i: "sheet", to: [0, 1, 2], r: "les budgets P50 et les prix de vente, pour chiffrer chaque écart en euros." }
        ],
        out: [["Tableau de bord", "production et pertes par centrale"], ["Rapport mensuel", "par société de projet"], ["Alertes", "centrales à traiter en priorité"]]
      },
      btp: {
        dims: ["Chantiers", "Calendrier", "Budgets", "Fournisseurs"],
        src: [
          { n: "Logiciel de devis", f: "export", i: "doc", to: [0, 1], r: "le budget prévu de chaque chantier, poste par poste." },
          { n: "Suivi de chantier", f: "Excel des équipes", i: "sheet", to: [0, 1], r: "l'avancement déclaré par les conducteurs de travaux." },
          { n: "Heures et pointages", f: "export", i: "clock", to: [0, 2], r: "les heures passées, valorisées au coût réel." },
          { n: "Factures fournisseurs", f: "PDF", i: "pdf", to: [0, 2], r: "les achats engagés, lus par l'IA appliquée puis contrôlés." },
          { n: "Comptabilité", f: "FEC", i: "ledger", to: [1], r: "le réalisé comptable, rapproché de chaque chantier." }
        ],
        out: [["Tableau de bord", "budget et marge par chantier"], ["Rapport mensuel", "avancement et facturation"], ["Alertes", "chantiers qui dérivent"]]
      },
      mnt: {
        dims: ["Sites", "Calendrier", "Contrats", "Techniciens"],
        src: [
          { n: "Interventions", f: "GMAO, export", i: "wrench", to: [0, 1], r: "chaque intervention, avec ses dates et son technicien." },
          { n: "Demandes clients", f: "mails", i: "mail", to: [0, 2], r: "l'heure de chaque demande, point de départ du délai d'intervention." },
          { n: "Contrats de maintenance", f: "PDF", i: "pdf", to: [0, 2], r: "les délais promis à chaque client, lus par l'IA appliquée." },
          { n: "Planning des techniciens", f: "Excel", i: "sheet", to: [1], r: "le préventif prévu, comparé au réalisé." },
          { n: "Comptabilité", f: "FEC", i: "ledger", to: [1], r: "les coûts, pour obtenir le coût de maintenance de chaque site." }
        ],
        out: [["Tableau de bord", "délais et engagements par client"], ["Rapport mensuel", "préventif réalisé, coût par site"], ["Alertes", "engagements en retard"]]
      },
      ind: {
        dims: ["Lignes", "Calendrier", "Lots", "Clients"],
        src: [
          { n: "Production des lignes", f: "export", i: "gauge", to: [0, 1], r: "les quantités produites et les arrêts de chaque ligne." },
          { n: "Contrôles qualité", f: "Excel", i: "sheet", to: [0, 2], r: "les mesures de chaque lot, comparées à leurs limites." },
          { n: "Maintenance", f: "GMAO, export", i: "wrench", to: [0], r: "les interventions, pour expliquer les arrêts." },
          { n: "ERP", f: "commandes et stocks", i: "db", to: [1], r: "les commandes et les lots livrés, pour relier chaque défaut à un client." },
          { n: "Réclamations clients", f: "mails", i: "mail", to: [1, 2], r: "les retours clients, rattachés au lot concerné." }
        ],
        out: [["Tableau de bord", "rendement et arrêts par ligne"], ["Rapport mensuel", "qualité, lot par lot"], ["Alertes", "lots hors limite"]]
      }
    }
  };
  var FLOW_ICONS = {
    api: "M12 8v5M20 8v5M10 13h12v3a6 6 0 0 1-12 0zM16 22v3",
    gauge: "M8 21a8 8 0 0 1 16 0M16 21l4-5",
    meter: "M9 7h14v18H9zM12 10h8v5h-8zM12 19h3M17 19h3",
    ledger: "M9 7h14v18H9zM12 11h8M12 15h8M12 19h5",
    sheet: "M8 8h16v16H8zM8 13h16M8 18h16M13 8v16",
    doc: "M10 7h9l4 4v14H10zM19 7v4h4M13 15h7M13 19h7",
    clock: "M16 9a7 7 0 1 0 0.01 0M16 12v4l3 2",
    pdf: "M10 7h9l4 4v14H10zM19 7v4h4M13 16h7M13 20h4",
    wrench: "M20 8a4 4 0 0 0-5 5l-6 6 2 2 6-6a4 4 0 0 0 5-5l-2 2-2-2z",
    mail: "M8 10h16v12H8zM8 10l8 6 8-6",
    db: "M9 10c0-2 14-2 14 0v12c0 2-14 2-14 0zM9 10c0 2 14 2 14 0M9 16c0 2 14 2 14 0"
  };
  // Petites illustrations des trois sorties : tableau de bord, rapport, alertes.
  function flowMini(g, j, x, y, w, h, t) {
    if (j === 0) {
      [0.35, 0.55, 0.45, 0.7, 0.6, 0.85].forEach(function (v, k) {
        var bw = (w * 0.62) / 6 - 4;
        mk("rect", { x: x + k * (bw + 4), y: y + h - v * h, width: bw, height: v * h, rx: 2, fill: k === 5 ? t.terra : t.sage }, g);
      });
      mk("polyline", { points: [0, 0.5, 1, 0.3, 2, 0.4, 3, 0.15, 4, 0.25, 5, 0.05].reduce(function (a, v, k, arr) { if (k % 2 === 0) a.push((x + w * 0.66 + arr[k] * (w * 0.33) / 5).toFixed(1) + "," + (y + arr[k + 1] * h + 4).toFixed(1)); return a; }, []).join(" "), fill: "none", stroke: t.ink, "stroke-width": 1.8, "stroke-linejoin": "round" }, g);
    } else if (j === 1) {
      mk("rect", { x: x, y: y, width: 30, height: h, rx: 3, fill: "none", stroke: t.ink, "stroke-width": 1.4 }, g);
      [0.25, 0.45, 0.65].forEach(function (v) { mk("line", { x1: x + 6, x2: x + 24, y1: y + v * h, y2: y + v * h, stroke: t.soft, "stroke-width": 1.4 }, g); });
      [0.9, 0.7, 0.5].forEach(function (v, k) { mk("rect", { x: x + 42, y: y + 4 + k * 12, width: (w - 50) * v, height: 7, rx: 2, fill: k === 0 ? t.ink : t.sand }, g); });
    } else {
      [[t.terra, 0.8], [t.terra, 0.55], [t.sand, 0.7]].forEach(function (r, k) {
        var yy = y + 6 + k * 13;
        mk("circle", { cx: x + 5, cy: yy, r: 4, fill: r[0] }, g);
        mk("rect", { x: x + 16, y: yy - 3, width: (w - 20) * r[1], height: 6, rx: 3, fill: t.faint }, g);
      });
    }
  }
  function flowRead(i) {
    var box = $("[data-flow-read]");
    if (!box) return;
    box.replaceChildren();
    var F = FLOW.data[FLOW.sector];
    if (i === null || i === undefined) {
      box.textContent = "Passez sur un logiciel, ou touchez-le, pour suivre ses données jusqu'au rapport.";
      return;
    }
    var sr = F.src[i], st = document.createElement("strong");
    st.textContent = sr.n;
    box.appendChild(st);
    box.appendChild(document.createTextNode(" : " + sr.r + " Alimente : " + sr.to.map(function (k) { return F.out[k][0].toLowerCase(); }).join(", ") + "."));
  }
  function flowChart(el, animate) {
    var F = FLOW.data[FLOW.sector], srcs = F.src, outs = F.out;
    var W = Math.max(300, Math.round(el.clientWidth)), wide = W >= 960, t = theme(el);
    var H, S = [], O = [], hub, chip, links = [], ns = srcs.length, no = outs.length;
    if (wide) {
      H = 452;
      // Largeurs minimales : les noms les plus longs doivent tenir dans leur carte.
      var sw = Math.max(252, Math.min(262, Math.round(W * 0.23))), ch = 58, sgap = (H - 24 - ch) / (ns - 1);
      srcs.forEach(function (s, i) { S.push({ x: 0, y: 12 + i * sgap, w: sw, h: ch }); });
      var ow = Math.max(252, Math.min(272, Math.round(W * 0.23))), oh = 116, ogap = (H - 24 - oh) / (no - 1);
      var hw = Math.min(300, W - sw - ow - 160);
      hub = { x: Math.round(sw + (W - sw - ow) / 2 - hw / 2), y: 50, w: hw, h: 300 };
      chip = { x: hub.x + hub.w / 2, y: hub.y + hub.h + 18, center: true };
      outs.forEach(function (o, j) { O.push({ x: W - ow, y: 12 + j * ogap, w: ow, h: oh }); });
      srcs.forEach(function (s, i) {
        var a = S[i], x0 = a.x + a.w, y0 = a.y + a.h / 2, x1 = hub.x, y1 = hub.y + 60 + i * (hub.h - 120) / (ns - 1), dx = (x1 - x0) * 0.55;
        links.push({ src: i, d: "M" + x0 + " " + y0.toFixed(1) + " C" + (x0 + dx).toFixed(1) + " " + y0.toFixed(1) + " " + (x1 - dx).toFixed(1) + " " + y1.toFixed(1) + " " + x1 + " " + y1.toFixed(1) });
      });
      outs.forEach(function (o, j) {
        var b = O[j], x0 = hub.x + hub.w, y0 = hub.y + 90 + j * (hub.h - 180) / (no - 1), x1 = b.x, y1 = b.y + b.h / 2, dx = (x1 - x0) * 0.55;
        links.push({ out: j, d: "M" + x0 + " " + y0.toFixed(1) + " C" + (x0 + dx).toFixed(1) + " " + y0.toFixed(1) + " " + (x1 - dx).toFixed(1) + " " + y1.toFixed(1) + " " + x1 + " " + y1.toFixed(1) });
      });
    } else {
      // Téléphone : les logiciels en colonne, un tronc à droite qui descend vers le modèle puis vers les sorties.
      var tx = W - 12, cw = W - 40, y = 0;
      srcs.forEach(function () { S.push({ x: 0, y: y, w: cw, h: 50 }); y += 60; });
      y += 20;
      hub = { x: 0, y: y, w: W, h: 180 };
      y += 180;
      chip = { x: 0, y: y + 14, center: false };
      y += 64;
      outs.forEach(function () { O.push({ x: 0, y: y, w: cw, h: 62 }); y += 72; });
      H = y;
      srcs.forEach(function (s, i) {
        var a = S[i], yc = a.y + a.h / 2;
        links.push({ src: i, d: "M" + (a.x + a.w) + " " + yc + " H" + (tx - 8) + " Q" + tx + " " + yc + " " + tx + " " + (yc + 8) + " V" + hub.y });
      });
      outs.forEach(function (o, j) {
        var b = O[j], yc = b.y + b.h / 2;
        links.push({ out: j, d: "M" + tx + " " + (hub.y + hub.h) + " V" + (yc - 8) + " Q" + tx + " " + yc + " " + (tx - 8) + " " + yc + " H" + (b.x + b.w) });
      });
    }
    var b = base(el, H, "Schéma : les logiciels du métier alimentent un modèle de données, qui alimente les rapports"), s = b.s;
    s.classList.add("flow-viz");

    // Liens : une ligne fixe, et un trait lumineux qui la parcourt en boucle.
    var gl = mk("g", {}, s);
    links.forEach(function (l, k) {
      l.g = mk("g", { class: "fl-link" }, gl);
      var p = mk("path", { d: l.d, fill: "none", "stroke-width": 1.5, class: "fl-line" }, l.g);
      trace(p, 150 + k * 50);
      var L = Math.ceil(p.getTotalLength()), bm = mk("path", { d: l.d, fill: "none", class: "fl-beam" }, l.g);
      bm.style.setProperty("--seg", 34);
      bm.style.setProperty("--gap", L + 40);
      bm.style.setProperty("--end", -L);
      bm.style.setProperty("--bd", (l.src !== undefined ? l.src * 0.55 : 1.5 + l.out * 0.6) + "s");
    });

    // Modèle de données.
    var gh = mk("g", { class: "pop" }, s);
    delay(gh, 450);
    mk("rect", { x: hub.x, y: hub.y, width: hub.w, height: hub.h, rx: 20, class: "fl-hub-bg" }, gh);
    txt(hub.x + 22, hub.y + 34, "Modèle de données", { class: "fl-hub-t" }, gh);
    var cx = hub.x + hub.w / 2, cy = hub.y + hub.h / 2 + (wide ? 0 : 8), ox = wide ? 88 : Math.min(118, hub.w * 0.3), oy = wide ? 64 : 36, dw = 84, dh = 24;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q, k) {
      var x = cx + q[0] * ox, yy = cy + q[1] * oy;
      mk("line", { x1: cx, y1: cy, x2: x, y2: yy, class: "fl-rel" }, gh);
      mk("rect", { x: x - dw / 2, y: yy - dh / 2, width: dw, height: dh, rx: 5, class: "fl-dim" }, gh);
      txt(x, yy + 4, F.dims[k], { class: "fl-dim-t", "text-anchor": "middle" }, gh);
    });
    mk("rect", { x: cx - 30, y: cy - 16, width: 60, height: 32, rx: 6, class: "fl-fact" }, gh);
    txt(hub.x + 22, hub.y + hub.h - 20, "collecte · contrôles · calculs", { class: "fl-hub-s" }, gh);

    // L'IA appliquée, pour ce qui arrive en PDF ou en mail.
    var gc = mk("g", { class: "pop" }, s), label = "IA appliquée : PDF et mails", cwid = Math.round(label.length * 7.1 + 30);
    delay(gc, 700);
    var chx = chip.center ? chip.x - cwid / 2 : chip.x;
    mk("rect", { x: chx, y: chip.y, width: cwid, height: 28, rx: 14, class: "fl-chip" }, gc);
    txt(chx + cwid / 2, chip.y + 18.5, label, { class: "fl-chip-t", "text-anchor": "middle" }, gc);

    // Sources.
    var srcGs = srcs.map(function (sr, i) {
      var a = S[i], wrap = mk("g", { class: "pop" }, s);
      delay(wrap, 80 + i * 70);
      var g = mk("g", { class: "fl-src", tabindex: 0, role: "button", "aria-label": sr.n + " (" + sr.f + ") : " + sr.r }, wrap);
      mk("rect", { x: a.x + 0.75, y: a.y + 0.75, width: a.w - 1.5, height: a.h - 1.5, rx: 12, class: "fl-card" }, g);
      var iy = a.y + (a.h - 32) / 2;
      mk("rect", { x: a.x + 12, y: iy, width: 32, height: 32, rx: 8, class: "fl-ic-bg" }, g);
      mk("path", { d: FLOW_ICONS[sr.i] || FLOW_ICONS.doc, transform: "translate(" + (a.x + 12) + " " + iy + ")", fill: "none", stroke: t.ink, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
      txt(a.x + 56, a.y + a.h / 2 - 3, sr.n, { class: "fl-name" }, g);
      txt(a.x + 56, a.y + a.h / 2 + 14, sr.f, { class: "fl-fmt" }, g);
      return g;
    });

    // Sorties.
    var outGs = outs.map(function (o, j) {
      var bx = O[j], wrap = mk("g", { class: "pop" }, s);
      delay(wrap, 900 + j * 90);
      var g = mk("g", { class: "fl-out" }, wrap), ty = bx.y + 26;
      mk("rect", { x: bx.x + 0.75, y: bx.y + 0.75, width: bx.w - 1.5, height: bx.h - 1.5, rx: 12, class: "fl-card" }, g);
      if (wide) { flowMini(g, j, bx.x + 18, bx.y + 16, bx.w - 36, 36, t); ty = bx.y + 78; }
      txt(bx.x + 18, ty, o[0], { class: "fl-name" }, g);
      txt(bx.x + 18, ty + 19, o[1], { class: "fl-sub" }, g);
      return g;
    });

    // Suivre une source jusqu'aux rapports qu'elle alimente.
    function focusSrc(i) {
      var on = i !== null, to = on ? srcs[i].to : [];
      s.classList.toggle("has-focus", on);
      srcGs.forEach(function (g, k) { g.classList.toggle("is-on", k === i); });
      outGs.forEach(function (g, k) { g.classList.toggle("is-on", to.indexOf(k) >= 0); });
      links.forEach(function (l) { l.g.classList.toggle("is-on", on && (l.src === i || (l.out !== undefined && to.indexOf(l.out) >= 0))); });
      flowRead(i);
    }
    srcGs.forEach(function (g, i) {
      var pick = function () { FLOW.pinned = FLOW.pinned === i ? null : i; focusSrc(FLOW.pinned); };
      g.addEventListener("pointerenter", function () { focusSrc(i); });
      g.addEventListener("pointerleave", function () { focusSrc(FLOW.pinned); });
      g.addEventListener("focus", function () { focusSrc(i); });
      g.addEventListener("blur", function () { focusSrc(FLOW.pinned); });
      g.addEventListener("click", pick);
      g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
    });
    focusSrc(FLOW.pinned);
    reveal(s, animate);
  }

  /* ---------- Registre des graphiques ---------- */
  var PLA = {
    weeks: ["S38", "S39", "S40", "S41", "S42", "S43", "S44", "S45", "S46", "S47", "S48", "S49"],
    t1: [110, 120, 118, 135, 150, 128, 115, 112, 120, 108, 100, 96], t2: [90, 95, 102, 110, 125, 98, 92, 88, 94, 90, 85, 80], t3: [70, 68, 75, 80, 88, 72, 70, 66, 69, 64, 60, 58]
  };
  var CHARTS = {
    "hero-combo": function (el, a) {
      combo(el, { h: 150, noAxis: true, labels: M1, bars: D.mois.prod, line: D.mois.bud, barMax: 22, label: "Production mensuelle et budget",
        tip: function (i) { return [M12[i] + " 2025", "Production " + fr(D.mois.prod[i], 0) + " MWh", "Budget " + fr(D.mois.bud[i], 0) + " MWh"]; } }, a);
    },
    "flow": function (el, a) { flowChart(el, a); },
    "enr-combo": function (el, a) {
      combo(el, { h: 240, labels: M12, bars: D.mois.prod, line: D.mois.bud, label: "Production mensuelle 2025 et budget",
        tip: function (i) { return [M12[i] + " 2025", "Production " + fr(D.mois.prod[i], 0) + " MWh", "Budget P50 " + fr(D.mois.bud[i], 0) + " MWh", "Écart " + pct(D.mois.prod[i] / D.mois.bud[i] - 1)]; } }, a);
    },
    "enr-causes": function (el, a) {
      var t = theme(el), cols = [t.ink, t.terra, t.sage, t.sand];
      donut(el, { h: 200, dec: 1, unit: "MWh", label: "Arrêts par cause", center: [fr(D.parc.pertes, 0), "MWh perdus"],
        items: D.causes.map(function (c, i) { return { label: c.cause.replace("Coupure ou travaux du réseau", "Réseau").replace("Maintenance préventive", "Maintenance"), value: c.mwh, color: cols[i] }; }) }, a);
    },
    "enr-bars": function (el, a) {
      var t = theme(el), rows = D.chaleur.map(function (r) { return { spv: r.spv, m: sum(r.v) / r.v.length * 100 }; }).sort(function (x, y) { return x.m - y.m; }).slice(0, 6);
      hbars(el, { labW: 74, rowH: 28, top: 20, min: 96, max: 100, target: 98.5, targetLabel: "objectif 98,5 %", label: "Disponibilité par société de projet",
        items: rows.map(function (x) { return { label: x.spv, value: x.m, valLabel: fr(x.m, 1) + " %", color: x.m < 98.5 ? t.terra : t.ink, tip: [x.spv, "Disponibilité moyenne 2025 : " + fr(x.m, 1) + " %"] }; }) }, a);
    },
    "btp-budget": function (el, a) {
      var t = theme(el), C = [["Les Cèdres", 820, 790, 845], ["École", 640, 610, 598], ["Halle Nord", 1150, 1180, 1210], ["Bureaux", 470, 430, 402], ["Gymnase", 930, 880, 861], ["Pôle santé", 1320, 1250, 1188]];
      grouped(el, { h: 260, labels: C.map(function (c) { return c[0]; }), label: "Budget prévu, engagé et réalisé par chantier",
        series: [{ name: "Prévu", vals: C.map(function (c) { return c[1]; }), color: t.sand }, { name: "Engagé", vals: C.map(function (c) { return c[2]; }), color: t.taupe }, { name: "Réalisé", vals: C.map(function (c) { return c[3]; }), color: t.ink }],
        colorFn: function (i, j, v, col) { return j === 2 && C[i][3] > C[i][1] ? t.terra : col; },
        tipExtra: function (i) { var d = C[i][3] - C[i][1]; return [d > 0 ? "Dépassement : +" + d + " k€" : "Sous le budget : " + d + " k€"]; },
        legend: [{ name: "prévu", color: t.sand }, { name: "engagé", color: t.taupe }, { name: "réalisé", color: t.ink }, { name: "réalisé au-delà du prévu", color: t.terra }] }, a);
    },
    "btp-scurve": function (el, a) {
      var t = theme(el), av = [4, 10, 19, 31, 44, 57, 69, 80, 90, 97], fa = [2, 6, 12, 20, 31, 43, 55, 67, 79, 88];
      lines(el, { h: 220, max: 100, between: true, endLabels: true, labels: M12.slice(0, 10), label: "Avancement et facturation cumulés", fmt: function (v) { return fr(v, 0) + " %"; },
        tipExtra: function (i) { return ["Reste à facturer : " + (av[i] - fa[i]) + " pts"]; },
        series: [{ name: "Avancement", values: av, color: t.ink }, { name: "Facturé", values: fa, color: t.terra }] }, a);
    },
    "btp-donut": function (el, a) {
      var t = theme(el);
      donut(el, { h: 200, dec: 0, unit: "réserves", label: "Réserves par statut", center: ["68 %", "levées"],
        items: [{ label: "Levées", value: 136, color: t.sage }, { label: "En cours", value: 44, color: t.sand }, { label: "Ouvertes", value: 20, color: t.terra }] }, a);
    },
    "mnt-combo": function (el, a) {
      var t = theme(el), pre = [62, 60, 64, 61, 66, 63, 58, 55, 65, 67, 64, 66], cur = [80, 71, 91, 88, 94, 108, 130, 121, 93, 82, 73, 85], del = [22, 21, 24, 20, 18, 19, 23, 21, 17, 15, 14, 10];
      combo(el, { h: 240, labels: M12, stack: [{ vals: pre, color: t.sage }, { vals: cur, color: t.terra }], line2: del, unit2: " h", label: "Interventions préventives et curatives, délai moyen",
        tip: function (i) { return [M12[i], pre[i] + " préventives", cur[i] + " curatives", "Délai moyen " + del[i] + " h"]; } }, a);
    },
    "mnt-gauge": function (el, a) {
      var t = theme(el);
      donut(el, { h: 200, dec: 0, unit: "interventions", label: "Préventif réalisé", center: ["87 %", "réalisé"],
        items: [{ label: "Réalisé", value: 652, color: t.sage }, { label: "En retard", value: 68, color: t.sand }, { label: "Non fait", value: 30, color: t.terra }] }, a);
    },
    "mnt-sites": function (el, a) {
      var t = theme(el), d = [["Usine Sud", 112], ["Entrepôt Nord", 71], ["Plateforme Ouest", 58], ["Siège", 48], ["Résidence Centre", 44], ["Agence Est", 36]];
      hbars(el, { labW: 130, rowH: 28, top: 6, min: 0, label: "Coût de maintenance par site",
        items: d.map(function (x, i) { return { label: x[0], value: x[1], valLabel: x[1] + " k€", color: i === 0 ? t.terra : t.ink, tip: [x[0], x[1] + " k€ sur 12 mois"] }; }) }, a);
    },
    "ind-control": function (el, a) {
      control(el, { h: 230, mean: 1.25, ucl: 2.0, label: "Taux de défauts par lot",
        values: [1.1, 1.3, 0.9, 1.2, 1.0, 1.4, 1.2, 1.1, 0.8, 1.3, 1.5, 1.2, 1.0, 1.4, 1.3, 1.6, 2.3, 2.6, 2.2, 1.4, 1.1, 1.2, 0.9, 1.0] }, a);
    },
    // Causes de défauts, triées : barres horizontales pour que les libellés restent lisibles dans une petite tuile.
    "ind-pareto": function (el, a) {
      var t = theme(el), d = [["Étiquetage", 34], ["Scellage", 27], ["Dosage", 16], ["Conditionnement", 9], ["Autres", 14]], acc = 0;
      hbars(el, { labW: 118, rowH: 32, top: 6, min: 0, label: "Causes de défauts",
        items: d.map(function (x, i) { acc += x[1]; return { label: x[0], short: x[0] === "Conditionnement" ? "Condit." : null, value: x[1], valLabel: x[1] + " %", color: i === 0 ? t.terra : t.ink, tip: [x[0], x[1] + " % des défauts", "Cumul " + acc + " %"] }; }) }, a);
    },
    "ind-bars": function (el, a) {
      var t = theme(el), d = [["Ligne 2", 84], ["Ligne 4", 81], ["Ligne 1", 78], ["Ligne 3", 69]];
      hbars(el, { labW: 64, rowH: 32, top: 22, min: 50, max: 100, target: 80, targetLabel: "objectif 80 %", label: "Rendement par ligne",
        items: d.map(function (x) { return { label: x[0], value: x[1], valLabel: x[1] + " %", color: x[1] < 80 ? t.terra : t.ink, tip: [x[0], "Rendement " + x[1] + " %"] }; }) }, a);
    },
    "pla-load": function (el, a) {
      combo(el, { h: 240, labels: PLA.weeks, cap: PLA.weeks.map(function () { return 320; }), label: "Charge par équipe et capacité",
        stack: [{ vals: PLA.t1, color: theme(el).ink }, { vals: PLA.t2, color: theme(el).sage }, { vals: PLA.t3, color: theme(el).sand }],
        tip: function (i) { var tt = PLA.t1[i] + PLA.t2[i] + PLA.t3[i]; return [PLA.weeks[i], "Équipe 1 : " + PLA.t1[i] + " h", "Équipe 2 : " + PLA.t2[i] + " h", "Équipe 3 : " + PLA.t3[i] + " h", tt > 320 ? "Surcharge : " + (tt - 320) + " h au-delà de la capacité" : "Charge " + tt + " h sur 320 h"]; } }, a);
    },
    "pla-gantt": function (el, a) {
      planning(el, { weeks: PLA.weeks, today: 4.5, label: "Planning des commandes",
        rows: [{ name: "Cde 2461", s: 0, e: 3 }, { name: "Cde 2462", s: 1, e: 5 }, { name: "Cde 2463", s: 2, e: 6, late: true }, { name: "Cde 2464", s: 3, e: 7, late: true }, { name: "Cde 2465", s: 5, e: 9 }, { name: "Cde 2466", s: 7, e: 11 }] }, a);
    },
    "pla-donut": function (el, a) {
      var t = theme(el);
      donut(el, { h: 200, dec: 0, unit: "commandes", label: "Commandes livrées à la date promise", center: ["91 %", "à l'heure"],
        items: [{ label: "À la date", value: 182, color: t.sage }, { label: "En retard", value: 18, color: t.terra }] }, a);
    },
    // Carte de l'accueil : un clic sur une région ouvre le rapport PV filtré sur elle.
    "b-map": function (el, a) {
      mapChart(el, { regions: D.regions, sel: null, color: regionColor, label: "Écart au budget par région, parc de démonstration",
        onPick: function (nom) {
          var pv = document.getElementById("rapport-pv");
          if (pv) pv.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
          pvSetRegion(nom);
        } }, a);
    },
    "delay": function (el, a) { delayChart(el, a); },
    "gantt": function (el, a) { gantt(el, a); }
  };
  Object.assign(CHARTS, CHARTS_PV, CHARTS_FIN);

  function renderChart(el, animate) {
    var f = CHARTS[el.dataset.chart];
    if (!f || !el.offsetParent || !D) return;
    try {
      f(el, animate);
      el.dataset.rendered = "1";
    } catch (err) {
      // Un graphique en erreur ne doit pas empêcher les autres de s'afficher.
      if (window.console) console.error("Graphique « " + el.dataset.chart + " » :", err);
    }
  }

  /* ---------- Mise en route ---------- */
  function init() {
    D = window.PIX_DATA || null;
    if (/[?&]typo=b\b/.test(window.location.search)) document.documentElement.classList.add("typo-b"); // comparaison temporaire
    tip = $(".tip");
    $$("[data-year]").forEach(function (e) { e.textContent = String(new Date().getFullYear()); });
    var hasIO = "IntersectionObserver" in window;

    // En-tête : ombre au défilement, menu mobile, lien actif.
    var header = $(".site-header"), nav = $("#nav"), menuBtn = $(".menu-btn");
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    });
    $$("#nav a").forEach(function (a) { a.addEventListener("click", function () { nav.classList.remove("is-open"); menuBtn.setAttribute("aria-expanded", "false"); }); });
    var navLinks = $$("#nav a[href^='#']:not(.btn)");
    if (hasIO) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          navLinks.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id); });
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      $$("main > section[id]").forEach(function (sec) { io.observe(sec); });
    }

    // Bouton fixe sur mobile : visible entre l'accueil et la réservation.
    var sticky = $(".sticky-cta"), heroIn = true, bookIn = false;
    if (hasIO && sticky && $("#accueil") && $("#reserver")) {
      var so = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.target.id === "accueil") heroIn = en.isIntersecting; else bookIn = en.isIntersecting; });
        sticky.classList.toggle("is-on", !heroIn && !bookIn);
      }, { threshold: 0 });
      so.observe($("#accueil"));
      so.observe($("#reserver"));
    }

    // Avant / après et coût du retard : se jouent une fois tout seuls, puis restent au choix du visiteur.
    function scheduleGantt() {
      if (GANTT.scheduled) return;
      GANTT.scheduled = true;
      setTimeout(function () { if (!GANTT.touched) setGantt("apres"); }, 2600);
    }
    function scheduleDelay() {
      if (DELAY.scheduled) return;
      DELAY.scheduled = true;
      setTimeout(function () { if (!DELAY.touched) setDelay("mens"); }, 3200);
      setTimeout(function () { if (!DELAY.touched) setDelay("auto"); }, 6400);
    }
    $$("[data-mode]").forEach(function (bt) { bt.addEventListener("click", function () { setGantt(bt.dataset.mode, true); }); });
    $$("[data-delay]").forEach(function (bt) { bt.addEventListener("click", function () { setDelay(bt.dataset.delay, true); }); });

    // Graphiques : dessinés à l'entrée dans l'écran.
    var charts = $$(".chart[data-chart]");
    if (hasIO) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting || en.target.dataset.rendered) return;
          renderChart(en.target, true);
          if (en.target.dataset.chart === "gantt") scheduleGantt();
          if (en.target.dataset.chart === "delay") scheduleDelay();
          if (en.target.dataset.rendered) cio.unobserve(en.target);
        });
      }, { rootMargin: "0px 0px -10% 0px", threshold: 0.2 });
      charts.forEach(function (c) { cio.observe(c); });
      var rio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); rio.unobserve(en.target); } });
      }, { threshold: 0.25 });
      $$("[data-reveal]").forEach(function (e) { rio.observe(e); });
    }
    if (!hasIO || staticMode) {
      charts.forEach(function (c) { renderChart(c, false); });
      $$("[data-reveal]").forEach(function (e) { e.classList.add("is-in"); });
    }
    var rt = null, lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(rt);
      rt = setTimeout(function () { $$(".chart[data-rendered]").forEach(function (c) { renderChart(c, false); }); }, 180);
    });

    // Onglets des métiers (flèches du clavier comprises).
    var tabs = $$("[role='tab']");
    function activate(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        panel.hidden = !on;
        if (on) $$(".chart", panel).forEach(function (c) { renderChart(c, true); });
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { activate(t, false); });
      t.addEventListener("keydown", function (e) {
        var k = e.key, j = null;
        if (k === "ArrowRight") j = (i + 1) % tabs.length;
        else if (k === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        else if (k === "Home") j = 0;
        else if (k === "End") j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); activate(tabs[j], true); }
      });
    });
    // Les graphiques de l'accueil mènent à l'exemple du métier correspondant.
    $$("[data-goto]").forEach(function (bt) {
      bt.addEventListener("click", function (e) {
        e.preventDefault();
        activate(document.getElementById(bt.dataset.goto), false);
        document.getElementById("exemples").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      });
    });

    // Des logiciels au rapport : choix du métier, et traits lumineux seulement quand le schéma est à l'écran.
    $$("[data-flow]").forEach(function (bt) {
      bt.addEventListener("click", function () {
        FLOW.sector = bt.dataset.flow;
        FLOW.pinned = null;
        $$("[data-flow]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === bt)); });
        var fc = $("[data-chart='flow']");
        if (fc) renderChart(fc, true);
      });
    });
    var flowFig = $(".flow-fig");
    if (flowFig && !staticMode) {
      if (hasIO) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { flowFig.classList.toggle("is-live", en.isIntersecting); });
        }, { threshold: 0.1 }).observe(flowFig);
      } else flowFig.classList.add("is-live");
    }

    // Parc photovoltaïque.
    if (D) {
      pvKpis(); pvTodo(); finKpis();
      var rr = $("[data-region-reset]");
      if (rr) rr.addEventListener("click", function () { pvSetRegion(null); });
      var sr = $("[data-soc-reset]");
      if (sr) sr.addEventListener("click", function () { PV.soc = null; finRefresh(); });
      $$("[data-view]").forEach(function (b) { b.addEventListener("click", function () { setView(b.dataset.view); }); });
      // Lien direct vers la vue Finance : ?vue=fin
      if (/[?&]vue=fin\b/.test(window.location.search) && $("[data-view='fin']")) setView("fin");
    }

    // Ce qui est livré.
    var lv = $("[data-chart='layers']");
    if (lv) layersViz(lv);
    $$(".layers-list button").forEach(function (bt) {
      bt.addEventListener("click", function () { setLayer(Number(bt.dataset.layer)); });
      bt.addEventListener("pointerenter", function () { setLayer(Number(bt.dataset.layer)); });
    });

    // Méthode : chaque étape met en avant son illustration.
    var visual = $(".steps-visual"), pinned = null;
    function focusStep(i) {
      visual.classList.toggle("has-focus", i !== null);
      $$(".st", visual).forEach(function (g) { g.classList.toggle("is-focus", String(i) === g.dataset.st); });
      $$(".step").forEach(function (b) { b.setAttribute("aria-pressed", String(String(pinned) === b.dataset.step)); });
    }
    $$(".step").forEach(function (b) {
      var i = Number(b.dataset.step);
      b.addEventListener("click", function () { pinned = pinned === i ? null : i; focusStep(pinned); });
      b.addEventListener("pointerenter", function () { focusStep(i); });
      b.addEventListener("pointerleave", function () { focusStep(pinned); });
    });

    // Deux formats de travail.
    var FORMATS = {
      ensemble: { who: [[55, 45], [50, 50], [70, 30], [60, 40], [75, 25]],
        text: "Vous construisez votre propre outil, en partant de zéro, avec ma méthode : je vous guide, je vous forme et je relis à chaque étape. Vous gardez la main et vous devenez autonome, sur la méthode comme sur l'outil." },
      cle: { who: [[20, 80], [25, 75], [5, 95], [45, 55], [35, 65]],
        text: "Je construis tout, vous validez à chaque étape et vos équipes sont formées à la livraison. C'est le format du Rapport d'exploitation PV, branché sur vos données." }
    };
    function setFormat(key) {
      var f = FORMATS[key];
      $$("[data-format]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.format === key)); });
      $("[data-format-desc]").textContent = f.text;
      $$(".who-col").forEach(function (col, i) {
        $(".you", col).style.flexGrow = f.who[i][0];
        $(".me", col).style.flexGrow = f.who[i][1];
        $("small", col).textContent = "vous " + f.who[i][0] + " %";
      });
    }
    $$("[data-format]").forEach(function (b) { b.addEventListener("click", function () { setFormat(b.dataset.format); }); });
    if ($("[data-format-desc]")) setFormat("cle");

    // Vidéos : le lecteur YouTube (sans cookie) ne se charge qu'au clic.
    var dlg = null;
    function ytFrame(id) {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0";
      f.title = "Lecteur vidéo YouTube";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      f.referrerPolicy = "strict-origin-when-cross-origin";
      return f;
    }
    $$("[data-yt]").forEach(function (bt) {
      bt.addEventListener("click", function () {
        var id = bt.dataset.yt;
        if (!bt.classList.contains("facade--s")) {
          var holder = document.createElement("div");
          holder.className = "facade";
          holder.appendChild(ytFrame(id));
          bt.replaceWith(holder);
          return;
        }
        if (!dlg) {
          dlg = document.createElement("dialog");
          dlg.className = "vid-modal";
          dlg.setAttribute("aria-label", "Vidéo");
          var close = document.createElement("button");
          close.type = "button";
          close.className = "vid-close";
          close.textContent = "Fermer";
          close.addEventListener("click", function () { dlg.close(); });
          var box = document.createElement("div");
          box.className = "vid-box";
          dlg.appendChild(close);
          dlg.appendChild(box);
          dlg.addEventListener("close", function () { box.replaceChildren(); });
          dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
          document.body.appendChild(dlg);
        }
        $(".vid-box", dlg).replaceChildren(ytFrame(id));
        dlg.showModal();
      });
    });

    // Agenda : Calendly ne se charge qu'à la demande ; on lui transmet le bouton d'origine.
    var origin = "site";
    $$("a[href='#reserver'][data-track]").forEach(function (a) { a.addEventListener("click", function () { origin = a.dataset.track; }); });
    // date : "AAAA-MM-JJ" quand le visiteur a cliqué un jour du calendrier, Calendly s'ouvre alors sur ce jour.
    function loadCalendly(bt, date) {
      var card = bt.closest(".book-card"), slot = $(".cal", card);
      var url = bt.dataset.calendly + "?hide_gdpr_banner=1&background_color=26201c&text_color=efe7d8&primary_color=dc6b2f&utm_source=pixcelor.com&utm_medium=site&utm_content=" + encodeURIComponent(origin);
      if (date) url += "&month=" + date.slice(0, 7) + "&date=" + date;
      var frame = document.createElement("div");
      frame.className = "book-frame";
      var f = document.createElement("iframe");
      f.src = url;
      f.title = "Agenda de réservation Calendly";
      f.referrerPolicy = "strict-origin-when-cross-origin";
      frame.appendChild(f);
      if (slot) slot.replaceWith(frame); else card.appendChild(frame);
      bt.disabled = true;
      bt.textContent = "Agenda affiché ci-dessous";
    }
    var calBtn = $("[data-calendly]");
    $$("[data-calendly]").forEach(function (bt) { bt.addEventListener("click", function () { loadCalendly(bt); }); });

    // Calendrier du mois : les jours ouvrés à venir sont cliquables. S'il en reste moins de cinq, on montre le mois suivant.
    var cal = $("[data-cal]");
    if (cal && calBtn) (function () {
      var today = new Date(), y = today.getFullYear(), m = today.getMonth(), pad = function (n) { return (n < 10 ? "0" : "") + n; };
      var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
      var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
      var future = 0, last = new Date(y, m + 1, 0).getDate();
      for (var dd = today.getDate() + 1; dd <= last; dd++) { var wd = new Date(y, m, dd).getDay(); if (wd && wd < 6) future++; }
      if (future < 5) { m += 1; if (m > 11) { m = 0; y += 1; } }
      var head = document.createElement("div");
      head.className = "cal-head";
      var hb = document.createElement("b");
      hb.textContent = MOIS[m] + " " + y;
      var hs = document.createElement("span");
      hs.textContent = "Visio de 30 minutes";
      head.appendChild(hb); head.appendChild(hs);
      var grid = document.createElement("div");
      grid.className = "cal-grid";
      ["L", "M", "M", "J", "V", "S", "D"].forEach(function (j) { var e = document.createElement("span"); e.className = "dow"; e.setAttribute("aria-hidden", "true"); e.textContent = j; grid.appendChild(e); });
      var first = (new Date(y, m, 1).getDay() + 6) % 7, nDays = new Date(y, m + 1, 0).getDate();
      for (var k = 0; k < first; k++) grid.appendChild(document.createElement("span"));
      for (var d = 1; d <= nDays; d++) {
        var date = new Date(y, m, d), wday = date.getDay(), iso = y + "-" + pad(m + 1) + "-" + pad(d);
        var isToday = date.toDateString() === today.toDateString(), open = wday > 0 && wday < 6 && date > today && !isToday;
        var cell = document.createElement(open ? "button" : "span");
        cell.className = "d" + (open ? "" : " is-off") + (isToday ? " is-today" : "");
        cell.textContent = String(d);
        if (open) {
          cell.type = "button";
          cell.setAttribute("aria-label", "Voir les créneaux du " + JOURS[wday] + " " + d + " " + MOIS[m]);
          (function (dateIso) { cell.addEventListener("click", function () { loadCalendly(calBtn, dateIso); }); })(iso);
        }
        grid.appendChild(cell);
      }
      var foot = document.createElement("p");
      foot.className = "cal-foot";
      foot.textContent = "Les créneaux libres s'affichent après votre choix.";
      cal.appendChild(head); cal.appendChild(grid); cal.appendChild(foot);
    })();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
