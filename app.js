// app.js — 家庭基礎クイズ（クリック方式 + 記入方式）
import quizData from './data.js';
import { fullTextData } from './fulltext.js';
import { sectionSVGs } from './icons.js';

// ══════════════════════════════════════════════════════════════
//  状態
// ══════════════════════════════════════════════════════════════
let textMode   = 'quiz'; // 'quiz' | 'type' | 'full'
let reviewMode = false;
const reviewSet = new Set();

// 各空白の状態: Map('${qi}-${bi}' → 0|1|2)
const blankStates = new Map();

// ── ヘルパー ──────────────────────────────────────────────────

function bKey(qi, bi) { return `${qi}-${bi}`; }
function getState(qi, bi) { return blankStates.get(bKey(qi, bi)) ?? 0; }

function getBlankText(qi, bi) {
  const blanks = (quizData[qi]?.segs ?? []).filter(s => s.b !== undefined);
  return blanks[bi]?.b ?? '?';
}

const totalBlanks = quizData.reduce(
  (n, item) => n + item.segs.filter(s => s.b !== undefined).length, 0
);

// 全角→半角正規化（答え合わせ用）
function normalize(s) {
  return s.trim()
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ');
}

// ══════════════════════════════════════════════════════════════
//  クリックモード用: 空白要素
// ══════════════════════════════════════════════════════════════

function applyBlankState(el) {
  const qi = +el.dataset.qi;
  const bi = +el.dataset.bi;
  const s  = getState(qi, bi);
  el.className = `blank s${s}`;
  el.title = ['クリックで答えを表示（正解）','もう一度クリックで不正解','クリックでリセット'][s];
}

function makeBlank(qi, bi, ansText) {
  const el = document.createElement('span');
  el.dataset.qi = qi;
  el.dataset.bi = bi;
  el.textContent = ansText;
  el.addEventListener('click', onBlankClick);
  applyBlankState(el);
  return el;
}

function onBlankClick(e) {
  const el = e.currentTarget;
  const qi = +el.dataset.qi;
  const bi = +el.dataset.bi;
  const s  = getState(qi, bi);
  const next = s === 0 ? 1 : s === 1 ? 2 : 0;
  blankStates.set(bKey(qi, bi), next);
  applyBlankState(el);
  updateScore();
  updateReviewBtn();
}

// ══════════════════════════════════════════════════════════════
//  記入モード用: 入力欄
// ══════════════════════════════════════════════════════════════

function makeTypeInput(qi, bi, ansText) {
  const el = document.createElement('input');
  el.type = 'text';
  el.dataset.qi  = qi;
  el.dataset.bi  = bi;
  el.dataset.ans = ansText;
  el.className   = 'blank-input';
  // 答えの文字数に合わせて幅を設定（日本語は約1em/文字）
  el.style.width = `${Math.max(ansText.length * 1.2 + 0.6, 3)}em`;
  el.setAttribute('autocomplete',   'off');
  el.setAttribute('autocorrect',    'off');
  el.setAttribute('autocapitalize', 'none');
  el.setAttribute('spellcheck',     'false');
  el.setAttribute('enterkeyhint',   'next');

  // IME入力中はEnterで送信しない
  let composing = false;
  el.addEventListener('compositionstart', () => { composing = true; });
  el.addEventListener('compositionend',   () => { composing = false; });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !composing) {
      e.preventDefault();
      submitTypeInput(el);
    }
  });
  return el;
}

function submitTypeInput(el) {
  const qi    = +el.dataset.qi;
  const bi    = +el.dataset.bi;
  const ans   = el.dataset.ans;
  const typed = el.value.trim();

  // ① 次の未回答入力欄を先に探す（iOS: フォーカス移動が先でないとキーボードが閉じる）
  const allInputs = Array.from(document.querySelectorAll('.blank-input:not([readonly])'));
  const idx       = allInputs.indexOf(el);
  const nextInp   = allInputs[idx + 1] ?? null;

  // ② 次の入力欄へフォーカスを移す（同期処理: キーボードを閉じさせない）
  if (nextInp) {
    nextInp.focus();
    nextInp.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ③ 現在の入力欄を採点・確定（未入力は不正解スキップ）
  const state = (typed && normalize(typed) === normalize(ans)) ? 1 : 2;
  blankStates.set(bKey(qi, bi), state);
  el.value = ans;                      // 正解を表示
  el.setAttribute('readonly', '');
  el.className = `blank-input s${state}`;

  updateScore();
  updateReviewBtn();
}

// ══════════════════════════════════════════════════════════════
//  描画
// ══════════════════════════════════════════════════════════════

const content = document.getElementById('content');

function render() {
  content.innerHTML = '';
  if      (textMode === 'quiz') renderQuiz();
  else if (textMode === 'type') renderTypeMode();
  else                          renderFull();
}

/** セクションヘッダーを作る共通関数 */
function makeSecHeader(sec) {
  const hdr = document.createElement('div');
  hdr.className = 'sec-header';
  hdr.innerHTML = `<span class="sec-title">${sec}</span>`;
  return hdr;
}

/** 問題行の骨格（SVGアイコン付き）を作る */
function makeQRow(qi, item) {
  const row = document.createElement('div');
  row.className = 'q-row';
  row.id = `q-${qi}`;
  const svg = sectionSVGs[item.sec];
  if (svg) {
    const iconEl = document.createElement('span');
    iconEl.className = 'q-icon';
    iconEl.innerHTML = svg;
    row.appendChild(iconEl);
  }
  return row;
}

/** 抜粋（クリック）モード */
function renderQuiz() {
  let lastSec = null;

  quizData.forEach((item, qi) => {
    if (reviewMode && !reviewSet.has(qi)) return;

    if (item.sec !== lastSec) {
      lastSec = item.sec;
      content.appendChild(makeSecHeader(item.sec));
    }

    const row = makeQRow(qi, item);
    let bi = 0;
    item.segs.forEach(seg => {
      if (seg.t !== undefined) {
        row.appendChild(document.createTextNode(seg.t));
      } else {
        row.appendChild(makeBlank(qi, bi++, seg.b));
      }
    });
    content.appendChild(row);
  });

  content.appendChild(makeCompleteCard());
}

/** 記入モード */
function renderTypeMode() {
  let lastSec = null;

  quizData.forEach((item, qi) => {
    if (reviewMode && !reviewSet.has(qi)) return;

    if (item.sec !== lastSec) {
      lastSec = item.sec;
      content.appendChild(makeSecHeader(item.sec));
    }

    const row = makeQRow(qi, item);
    let bi = 0;
    item.segs.forEach(seg => {
      if (seg.t !== undefined) {
        row.appendChild(document.createTextNode(seg.t));
      } else {
        const s = getState(qi, bi);
        // 既回答はクリック用スパン、未回答は入力欄
        row.appendChild(s !== 0
          ? makeBlank(qi, bi, seg.b)
          : makeTypeInput(qi, bi, seg.b));
        bi++;
      }
    });
    content.appendChild(row);
  });

  content.appendChild(makeCompleteCard());

  // 最初の未回答入力欄にフォーカス
  const first = content.querySelector('.blank-input:not([readonly])');
  if (first) {
    // 少し遅延してDOMが安定してからフォーカス
    setTimeout(() => {
      first.focus();
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }
}

/** 全文モード */
function renderFull() {
  fullTextData.forEach(block => {
    switch (block.ty) {
      case 'h2': {
        const el = document.createElement('div');
        el.className = 'ft-h2';
        el.textContent = block.v;
        content.appendChild(el);
        break;
      }
      case 'h3': {
        const el = document.createElement('div');
        el.className = 'ft-h3';
        el.textContent = block.v;
        content.appendChild(el);
        break;
      }
      case 'p': {
        const el = document.createElement('p');
        el.className = 'ft-p';
        block.parts.forEach(part => {
          if (typeof part === 'string') {
            el.appendChild(document.createTextNode(part));
          } else {
            el.appendChild(makeBlank(part.qi, part.bi, getBlankText(part.qi, part.bi)));
          }
        });
        content.appendChild(el);
        break;
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  スコア表示
// ══════════════════════════════════════════════════════════════

const headerScore  = document.getElementById('header-score');
const scoreBarFill = document.getElementById('score-bar-fill');

function updateScore() {
  let correct = 0, wrong = 0, total;

  if (reviewMode && reviewSet.size > 0) {
    total = 0;
    quizData.forEach((item, qi) => {
      if (!reviewSet.has(qi)) return;
      let bi = 0;
      item.segs.forEach(seg => {
        if (seg.b !== undefined) {
          total++;
          const s = getState(qi, bi++);
          if (s === 1) correct++;
          else if (s === 2) wrong++;
        }
      });
    });
  } else {
    total = totalBlanks;
    blankStates.forEach(s => {
      if (s === 1) correct++;
      else if (s === 2) wrong++;
    });
  }

  const answered = correct + wrong;
  const pct = total > 0 ? (answered / total * 100) : 0;

  headerScore.textContent = `✓ ${correct}　✗ ${wrong}　残 ${total - answered}`;
  scoreBarFill.style.width = `${pct}%`;

  // 完了カード
  const card = document.getElementById('complete-card');
  if (card) {
    const isComplete = answered === total && total > 0;
    const wasHidden  = card.hidden;
    card.hidden = !isComplete;
    if (isComplete) {
      const correctPct = Math.round(correct / total * 100);
      card.querySelector('#cmp-title').textContent = reviewMode ? '復習完了' : '全問完了';
      card.querySelector('#cmp-correct').textContent = `✓ ${correct}`;
      card.querySelector('#cmp-wrong').textContent   = `✗ ${wrong}`;
      card.querySelector('#cmp-pct').textContent     = `${correctPct}%`;
      const rb = card.querySelector('#cmp-review-btn');
      rb.hidden = wrong === 0;
      rb.textContent = `復習 ${wrong}問`;
      if (wasHidden) setTimeout(() => card.scrollIntoView({ behavior:'smooth', block:'nearest' }), 80);
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  完了カード
// ══════════════════════════════════════════════════════════════

function makeCompleteCard() {
  const card = document.createElement('div');
  card.id = 'complete-card';
  card.hidden = true;
  card.innerHTML = `
    <div id="cmp-title">全問完了</div>
    <div id="cmp-stats">
      <span id="cmp-correct">✓ 0</span>
      <span id="cmp-wrong">✗ 0</span>
    </div>
    <div id="cmp-pct">0%</div>
    <div id="cmp-btns">
      <button id="cmp-review-btn" hidden>復習</button>
      <button id="cmp-reset-btn">リセット</button>
    </div>
  `;
  card.querySelector('#cmp-review-btn').addEventListener('click', enterReviewMode);
  card.querySelector('#cmp-reset-btn').addEventListener('click', () => {
    if (confirm('進捗をリセットしますか？')) resetAll();
  });
  return card;
}

// ══════════════════════════════════════════════════════════════
//  タブ切り替え
// ══════════════════════════════════════════════════════════════

function setTab(mode) {
  textMode = mode;
  document.getElementById('tab-quiz').classList.toggle('active', mode === 'quiz');
  document.getElementById('tab-type').classList.toggle('active', mode === 'type');
  document.getElementById('tab-full').classList.toggle('active', mode === 'full');
}

document.getElementById('tab-quiz').addEventListener('click', () => {
  setTab('quiz');
  render();
  updateScore();
});

document.getElementById('tab-type').addEventListener('click', () => {
  setTab('type');
  render();
  updateScore();
});

document.getElementById('tab-full').addEventListener('click', () => {
  // 全文モードに切り替えたら復習モード解除（キーボードも自然に閉じる）
  reviewMode = false;
  reviewSet.clear();
  setTab('full');
  render();
  updateScore();
  updateReviewBtn();
});

// ══════════════════════════════════════════════════════════════
//  復習モード
// ══════════════════════════════════════════════════════════════

const reviewBtn = document.getElementById('review-btn');

function enterReviewMode() {
  reviewSet.clear();
  blankStates.forEach((s, key) => {
    if (s === 2) reviewSet.add(+key.split('-')[0]);
  });
  if (reviewSet.size === 0) return;

  blankStates.forEach((s, key) => {
    if (s === 2) blankStates.set(key, 0);
  });

  reviewMode = true;
  // 全文モード中なら抜粋モードへ戻す
  if (textMode === 'full') setTab('quiz');
  else setTab(textMode);

  render();
  updateScore();
  updateReviewBtn();
  document.getElementById('main').scrollTop = 0;
}

function exitReviewMode() {
  reviewMode = false;
  reviewSet.clear();
  render();
  updateScore();
  updateReviewBtn();
}

function updateReviewBtn() {
  if (reviewMode) {
    reviewBtn.textContent = '← 全問に戻る';
    reviewBtn.disabled = false;
    reviewBtn.classList.add('active');
  } else {
    let wrongCount = 0;
    blankStates.forEach(s => { if (s === 2) wrongCount++; });
    reviewBtn.textContent = wrongCount > 0 ? `復習 ${wrongCount}問` : '復習';
    reviewBtn.disabled    = wrongCount === 0;
    reviewBtn.classList.remove('active');
  }
}

reviewBtn.addEventListener('click', () => {
  if (reviewMode) exitReviewMode();
  else enterReviewMode();
});

// ══════════════════════════════════════════════════════════════
//  リセット
// ══════════════════════════════════════════════════════════════

function resetAll() {
  blankStates.clear();
  reviewMode = false;
  reviewSet.clear();

  if (textMode === 'type') {
    // 記入モードは再描画でinputを復元する
    render();
  } else {
    document.querySelectorAll('.blank').forEach(el => applyBlankState(el));
  }
  updateScore();
  updateReviewBtn();
}

document.getElementById('reset-btn').addEventListener('click', () => {
  if (confirm('進捗をリセットしますか？')) resetAll();
});

// ══════════════════════════════════════════════════════════════
//  初期化
// ══════════════════════════════════════════════════════════════

function init() {
  render();
  updateScore();
  updateReviewBtn();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
