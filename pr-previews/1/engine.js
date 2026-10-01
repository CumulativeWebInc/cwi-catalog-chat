/* Catalog Q&A engine — deterministic retrieval, zero dependencies.
 * Runs identically in Node (WhatsApp webhook) and the browser (public demo).
 * The question text is NEVER executed, interpolated, or echoed: it is only
 * token-matched against card keywords. Unknown input -> honest refusal. */
(function (root) {
  'use strict';

  var FRESH_HOURS = 48;
  var MAX_INPUT = 500;

  var REFUSAL =
    "I don't have verified data on that. I only answer from the CWI catalog " +
    "(artist, tracks, verified placements, stream counts, rights status, contact). " +
    'Try asking: "Where is Zooted Zone placed?", "How many streams does Zooted Zone have?", or "How do I contact CWI?"';

  function normalize(s) {
    return String(s || '')
      .slice(0, MAX_INPUT)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function freshness(observed_at, nowMs) {
    if (!observed_at) return { label: 'static', note: 'product copy — not a measured value' };
    var t = Date.parse(observed_at);
    if (isNaN(t)) return { label: 'unknown', note: 'observation date unreadable' };
    var ageH = (nowMs - t) / 3600000;
    if (ageH <= FRESH_HOURS) return { label: 'fresh', note: 'observed ' + observed_at };
    return { label: 'stale', note: 'last verified ' + observed_at + ' — treated as stale, not refreshed' };
  }

  function scoreCard(card, tokens) {
    var hits = 0, total = 0;
    for (var i = 0; i < card.keywords.length; i++) {
      var kw = normalize(card.keywords[i]);
      if (!kw) continue;
      total++;
      var kwTokens = kw.split(' ');
      var matched = 0;
      for (var j = 0; j < kwTokens.length; j++) {
        if (tokens.indexOf(kwTokens[j]) !== -1) matched++;
      }
      // keyword counts if at least half its tokens appear (single-token keywords need full match)
      if (matched >= Math.max(1, Math.ceil(kwTokens.length / 2))) hits++;
    }
    return total ? hits / total : 0;
  }

  function answerQuestion(data, question, nowMs) {
    nowMs = nowMs || Date.now();
    var q = normalize(question);
    if (!q) return refuse();

    // hard block: empty/gibberish with no letters
    if (!/[a-z]/.test(q)) return refuse();

    var tokens = q.split(' ');
    var best = null, bestScore = 0;
    var cards = data.cards || [];
    for (var i = 0; i < cards.length; i++) {
      var s = scoreCard(cards[i], tokens);
      if (s > bestScore) { bestScore = s; best = cards[i]; }
    }
    // threshold: need a real match, not a stray word
    if (!best || bestScore < 0.34) return refuse();

    var fr = freshness(best.observed_at, nowMs);
    return {
      answered: true,
      card_id: best.id,
      title: best.title,
      text: best.text,
      tier: best.tier,
      observed_at: best.observed_at,
      source: best.source,
      freshness: fr.label,
      freshness_note: fr.note,
      match_score: Math.round(bestScore * 100) / 100,
    };
  }

  function refuse() {
    return {
      answered: false,
      card_id: 'refusal',
      title: 'No verified data',
      text: REFUSAL,
      tier: 'none',
      observed_at: null,
      source: null,
      freshness: 'static',
      freshness_note: 'refusal copy — not a catalog claim',
      match_score: 0,
    };
  }

  // WhatsApp-shaped reply: short plain text + evidence line.
  function toWhatsApp(result) {
    var out = result.text;
    if (out.length > 1200) out = out.slice(0, 1197) + '…';
    if (result.answered) {
      out += '\n\n_' + result.tier + ' · ' + result.freshness + ' (' + result.freshness_note + ')_';
    }
    return out;
  }

  root.CatalogQA = {
    answerQuestion: answerQuestion,
    toWhatsApp: toWhatsApp,
    REFUSAL: REFUSAL,
    FRESH_HOURS: FRESH_HOURS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// Node export guard (kept importable without running anything)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = globalThis.CatalogQA;
}
