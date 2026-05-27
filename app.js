// app.js — 公民クイズ メインロジック（クリック方式）
import quizData from './data.js';
import { fullTextData } from './fulltext.js';

// ══════════════════════════════════════════════════════════════
//  状態
// ══════════════════════════════════════════════════════════════
let textMode   = 'quiz'; // 'quiz' | 'full'
let reviewMode = false;  // 不正解のみ再出題モード
const reviewSet = new Set(); // reviewMode中に表示するqi

// 各空白の状態: Map('${qi}-${bi}' → 0|1|2)
// 0 = 未解答（非表示）
// 1 = 正解（1回目クリック・答え表示）
// 2 = 不正解（2回目クリック）
const blankStates = new Map();

// ── ヘルパー ──────────────────────────────────────────────────

function bKey(qi, bi) { return `${qi}-${bi}`; }
function getState(qi, bi) { return blankStates.get(bKey(qi, bi)) ?? 0; }

/** quizData[qi] の bi番目の空白テキストを返す */
function getBlankText(qi, bi) {
  const blanks = (quizData[qi]?.segs ?? []).filter(s => s.b !== undefined);
  return blanks[bi]?.b ?? '?';
}

/** 全空白数 */
const totalBlanks = quizData.reduce(
  (n, item) => n + item.segs.filter(s => s.b !== undefined).length, 0
);

// ══════════════════════════════════════════════════════════════
//  空白要素の生成・状態更新
// ══════════════════════════════════════════════════════════════

function applyBlankState(el) {
  const qi = +el.dataset.qi;
  const bi = +el.dataset.bi;
  const s  = getState(qi, bi);
  el.className = `blank s${s}`;
  el.title = [
    'クリックで答えを表示（正解）',
    'もう一度クリックで不正解',
    'クリックでリセット'
  ][s];
}

function makeBlank(qi, bi, ansText) {
  const el = document.createElement('span');
  el.dataset.qi = qi;
  el.dataset.bi = bi;
  el.textContent = ansText; // 常にセット（colorで表示/非表示を制御）
  el.addEventListener('click', onBlankClick);
  applyBlankState(el);
  return el;
}

function onBlankClick(e) {
  const el = e.currentTarget;
  const qi = +el.dataset.qi;
  const bi = +el.dataset.bi;
  const s  = getState(qi, bi);
  // 0 → 1 → 2 → 0 でサイクル
  const next = s === 0 ? 1 : s === 1 ? 2 : 0;
  blankStates.set(bKey(qi, bi), next);
  applyBlankState(el);
  updateScore();
  updateReviewBtn();
}

// ══════════════════════════════════════════════════════════════
//  描画
// ══════════════════════════════════════════════════════════════

const content = document.getElementById('content');

function render() {
  content.innerHTML = '';
  if (textMode === 'quiz') renderQuiz();
  else renderFull();
}

/** 穴埋え文のみモード */
function renderQuiz() {
  let lastSec = null;

  quizData.forEach((item, qi) => {
    // reviewMode時: reviewSetに含まれるqiのみ表示
    if (reviewMode && !reviewSet.has(qi)) return;

    // セクションヘッダー（変化時のみ）
    const secKey = item.page + item.sec;
    if (secKey !== lastSec) {
      lastSec = secKey;
      const hdr = document.createElement('div');
      hdr.className = 'sec-header';
      hdr.innerHTML = `<span class="sec-page">${item.page}</span><span class="sec-title">${item.sec}</span>`;
      content.appendChild(hdr);
    }

    // 問題文
    const row = document.createElement('div');
    row.className = 'q-row';
    row.id = `q-${qi}`;

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

  // 完了カードを最下部に追加
  content.appendChild(makeCompleteCard());
}

/** 全文モード */
function renderFull() {
  fullTextData.forEach(block => {
    switch (block.ty) {
      case 'page': {
        const el = document.createElement('div');
        el.className = 'ft-page';
        el.textContent = block.v;
        content.appendChild(el);
        break;
      }
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
    // 復習モード: reviewSetのqiだけカウント
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

  // 完了カード表示/更新
  const card = document.getElementById('complete-card');
  if (card) {
    const isComplete = answered === total && total > 0;
    const wasHidden = card.hidden;
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
      // 初めて完了した瞬間だけスクロール
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
//  復習モード
// ══════════════════════════════════════════════════════════════

const reviewBtn = document.getElementById('review-btn');

function enterReviewMode() {
  // state=2 のqiを収集
  reviewSet.clear();
  blankStates.forEach((s, key) => {
    if (s === 2) reviewSet.add(+key.split('-')[0]);
  });
  if (reviewSet.size === 0) return;

  // 不正解をリセット（再挑戦できるように state=0 へ）
  blankStates.forEach((s, key) => {
    if (s === 2) blankStates.set(key, 0);
  });

  reviewMode = true;
  // 穴埋えモードへ強制切り替え
  textMode = 'quiz';
  document.getElementById('tab-quiz').classList.add('active');
  document.getElementById('tab-full').classList.remove('active');

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
    reviewBtn.disabled = wrongCount === 0;
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
  document.querySelectorAll('.blank').forEach(el => applyBlankState(el));
  updateScore();
  updateReviewBtn();
}

// ══════════════════════════════════════════════════════════════
//  イベント
// ══════════════════════════════════════════════════════════════

document.getElementById('tab-quiz').addEventListener('click', () => {
  textMode = 'quiz';
  document.getElementById('tab-quiz').classList.add('active');
  document.getElementById('tab-full').classList.remove('active');
  render();
  updateScore();
});

document.getElementById('tab-full').addEventListener('click', () => {
  textMode = 'full';
  reviewMode = false; // 全文モードに切り替えたら復習モード解除
  reviewSet.clear();
  document.getElementById('tab-full').classList.add('active');
  document.getElementById('tab-quiz').classList.remove('active');
  render();
  updateScore();
  updateReviewBtn();
});

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

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
