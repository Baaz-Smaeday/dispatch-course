/* ================================================================
   EAGLE ACADEMY — SHARED APP.JS
   Text-to-Speech Engine | Quiz Engine | Progress Tracker | Utils
   ================================================================ */

'use strict';

// ══════════════════════════════════════════════
// 1. TEXT-TO-SPEECH ENGINE
// ══════════════════════════════════════════════
const TTS = {
  synth: window.speechSynthesis,
  current: null,
  lang: 'en',

  speak(text, lang = 'en-US', statusId = null) {
    this.stop();
    if (!this.synth) { alert('Text-to-speech not supported in this browser.'); return; }
    // Clean text — remove HTML tags
    const clean = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = lang;
    utt.rate = 0.88;
    utt.pitch = 1;
    utt.volume = 1;

    // Try to find a matching voice
    const voices = this.synth.getVoices();
    const match = voices.find(v => v.lang.startsWith(lang.substring(0,2)));
    if (match) utt.voice = match;

    if (statusId) {
      const el = document.getElementById(statusId);
      if (el) { el.style.display = 'inline'; el.textContent = '🔊 Playing...'; }
      utt.onend  = () => { if (el) el.style.display = 'none'; };
      utt.onerror = () => { if (el) el.style.display = 'none'; };
    }

    this.current = utt;
    this.synth.speak(utt);
  },

  stop() {
    if (this.synth) {
      this.synth.cancel();
      // Hide all playing indicators
      document.querySelectorAll('.audio-playing').forEach(el => el.style.display = 'none');
    }
  },

  speakElement(elId, lang = 'en-US', statusId = null) {
    const el = document.getElementById(elId);
    if (!el) return;
    this.speak(el.innerText || el.textContent, lang, statusId);
  }
};

// Load voices on page load (Chrome needs this)
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices(); // preload
  };
}

// ══════════════════════════════════════════════
// 2. LANGUAGE TOGGLE ENGINE
// ══════════════════════════════════════════════
const LangEngine = {
  current: 'en',

  init() {
    const saved = localStorage.getItem('ea_lang') || 'en';
    this.setLang(saved, false);
  },

  setLang(lang, save = true) {
    this.current = lang;
    if (save) localStorage.setItem('ea_lang', lang);

    // Toggle content
    document.querySelectorAll('.content-en').forEach(el => {
      el.classList.toggle('show', lang === 'en');
    });
    document.querySelectorAll('.content-hi').forEach(el => {
      el.classList.toggle('show', lang === 'hi');
    });

    // Update buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    TTS.stop();
  },

  toggle() {
    this.setLang(this.current === 'en' ? 'hi' : 'en');
  }
};

// ══════════════════════════════════════════════
// 3. PROGRESS TRACKER
// ══════════════════════════════════════════════
const Progress = {
  key: 'ea_progress',

  get() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; }
    catch { return {}; }
  },

  save(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  },

  markTopicDone(courseId, weekId, dayId, topicId) {
    const p = this.get();
    const k = `${courseId}_w${weekId}_d${dayId}_t${topicId}`;
    p[k] = { done: true, ts: Date.now() };
    this.save(p);
    this.updateUI();
  },

  markDayDone(courseId, weekId, dayId) {
    const p = this.get();
    const k = `${courseId}_w${weekId}_d${dayId}`;
    p[k] = { done: true, ts: Date.now() };
    this.save(p);
    this.updateUI();
  },

  markQuizScore(courseId, weekId, dayId, topicId, score, total) {
    const p = this.get();
    const k = `quiz_${courseId}_w${weekId}_d${dayId}_t${topicId}`;
    p[k] = { score, total, pct: Math.round((score/total)*100), ts: Date.now() };
    this.save(p);
  },

  isTopicDone(courseId, weekId, dayId, topicId) {
    return !!this.get()[`${courseId}_w${weekId}_d${dayId}_t${topicId}`];
  },

  isDayDone(courseId, weekId, dayId) {
    return !!this.get()[`${courseId}_w${weekId}_d${dayId}`];
  },

  getWeekProgress(courseId, weekId, totalTopics) {
    const p = this.get();
    let done = 0;
    Object.keys(p).forEach(k => {
      if (k.startsWith(`${courseId}_w${weekId}_`) && p[k].done) done++;
    });
    return Math.round((done / totalTopics) * 100);
  },

  updateUI() {
    // Update any progress bars on the page
    document.querySelectorAll('[data-progress-bar]').forEach(bar => {
      const id = bar.dataset.progressBar;
      const fill = bar.querySelector('.progress-fill');
      if (fill && id) {
        const pct = parseInt(id) || 0;
        fill.style.width = pct + '%';
      }
    });
  }
};

// ══════════════════════════════════════════════
// 4. QUIZ ENGINE
// ══════════════════════════════════════════════
const QuizEngine = {
  instances: {},

  init(quizId, questions, options = {}) {
    const container = document.getElementById(quizId);
    if (!container) return;

    const opts = {
      courseId: options.courseId || 'fd',
      weekId:   options.weekId   || 1,
      dayId:    options.dayId    || 1,
      topicId:  options.topicId  || 0,
      onPass:   options.onPass   || null,
      passScore: options.passScore || 70,
      ...options
    };

    this.instances[quizId] = {
      questions, opts,
      current: 0,
      score: 0,
      answered: new Array(questions.length).fill(null)
    };

    this.render(quizId);
  },

  render(quizId) {
    const container = document.getElementById(quizId);
    const inst = this.instances[quizId];
    if (!container || !inst) return;

    const { questions, opts } = inst;

    let html = `
      <div class="quiz-header">
        <span style="font-size:28px">✅</span>
        <div>
          <div class="quiz-title">Topic Quiz — ${questions.length} Questions</div>
          <div style="font-size:12px;color:var(--grey)">प्रश्नोत्तरी — Score 70%+ to complete this topic</div>
        </div>
        <span class="tag tag-orange" style="margin-left:auto">${questions.length} Qs</span>
      </div>
      <div id="${quizId}_questions">`;

    questions.forEach((q, qi) => {
      html += `
        <div class="quiz-q" id="${quizId}_q${qi}">
          <div class="quiz-q-num">QUESTION ${qi+1} OF ${questions.length}</div>
          <div class="quiz-q-text">${q.q}</div>
          <div class="quiz-opts">`;

      q.opts.forEach((opt, oi) => {
        html += `
            <button class="quiz-opt" data-quiz="${quizId}" data-qi="${qi}" data-oi="${oi}" onclick="QuizEngine.answer('${quizId}',${qi},${oi})">
              <span class="quiz-opt-letter">${String.fromCharCode(65+oi)}</span>
              ${opt}
            </button>`;
      });

      html += `</div>
          <div class="quiz-feedback" id="${quizId}_fb${qi}"></div>
        </div>`;
    });

    html += `</div>
      <div id="${quizId}_submit" style="margin-top:16px;display:none">
        <button class="btn btn-primary btn-full btn-lg" onclick="QuizEngine.submit('${quizId}')">
          📊 See My Results
        </button>
      </div>
      <div class="quiz-result" id="${quizId}_result"></div>`;

    container.innerHTML = html;
  },

  answer(quizId, qi, oi) {
    const inst = this.instances[quizId];
    if (!inst || inst.answered[qi] !== null) return;

    const q = inst.questions[qi];
    inst.answered[qi] = oi;
    if (oi === q.ans) inst.score++;

    // Visual feedback
    const qEl = document.getElementById(`${quizId}_q${qi}`);
    if (qEl) {
      qEl.querySelectorAll('.quiz-opt').forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.ans) btn.classList.add('correct');
        else if (i === oi && oi !== q.ans) btn.classList.add('wrong');
      });
    }

    const fb = document.getElementById(`${quizId}_fb${qi}`);
    if (fb) {
      fb.classList.add('show');
      if (oi === q.ans) {
        fb.classList.add('right');
        fb.innerHTML = `✅ Correct! ${q.explain || ''}`;
      } else {
        fb.classList.add('wrong');
        fb.innerHTML = `❌ Incorrect. Correct answer: <strong>${q.opts[q.ans]}</strong>. ${q.explain || ''}`;
      }
    }

    // Check if all answered
    const allDone = inst.answered.every(a => a !== null);
    const submitBtn = document.getElementById(`${quizId}_submit`);
    if (allDone && submitBtn) submitBtn.style.display = 'block';
  },

  submit(quizId) {
    const inst = this.instances[quizId];
    if (!inst) return;

    const pct = Math.round((inst.score / inst.questions.length) * 100);
    const passed = pct >= inst.opts.passScore;

    // Save to progress
    Progress.markQuizScore(
      inst.opts.courseId, inst.opts.weekId, inst.opts.dayId, inst.opts.topicId,
      inst.score, inst.questions.length
    );

    const questionsEl = document.getElementById(`${quizId}_questions`);
    const submitEl    = document.getElementById(`${quizId}_submit`);
    const resultEl    = document.getElementById(`${quizId}_result`);

    if (questionsEl) questionsEl.style.display = 'none';
    if (submitEl)    submitEl.style.display = 'none';

    let emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🥇' : '📚';
    let grade = pct >= 90 ? 'Excellent!' : pct >= 70 ? 'Good — Topic Passed!' : 'Keep Studying';
    let gradeHi = pct >= 90 ? 'शानदार!' : pct >= 70 ? 'अच्छा — टॉपिक पास!' : 'और पढ़ें';
    let color = pct >= 70 ? 'var(--green)' : 'var(--orange)';

    if (resultEl) {
      resultEl.classList.add('show');
      resultEl.innerHTML = `
        <div style="font-size:56px;margin-bottom:8px">${emoji}</div>
        <div class="quiz-score" style="color:${color}">${pct}%</div>
        <div style="font-size:18px;font-family:'Syne',sans-serif;font-weight:700;margin:8px 0">${grade}</div>
        <div style="font-size:13px;color:var(--orange);margin-bottom:8px">${gradeHi}</div>
        <div style="font-size:14px;color:var(--grey);margin-bottom:20px">
          ${inst.score} / ${inst.questions.length} correct &nbsp;•&nbsp; ${pct}%
        </div>
        ${passed
          ? `<div style="background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:12px 16px;font-size:13px;color:#86efac;margin-bottom:16px">
               ✅ Topic Complete! Move to the next topic.
             </div>`
          : `<div style="background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--orange2);margin-bottom:16px">
               ⚠️ You need 70% to pass. Review the topic and try again.
             </div>`
        }
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-outline" onclick="QuizEngine.retry('${quizId}')">🔄 Retry Quiz</button>
          ${passed ? `<button class="btn btn-primary" onclick="QuizEngine.next('${quizId}')">Next Topic →</button>` : ''}
        </div>`;
    }

    if (passed && inst.opts.onPass) inst.opts.onPass(pct);
  },

  retry(quizId) {
    const inst = this.instances[quizId];
    if (!inst) return;
    inst.score = 0;
    inst.answered = new Array(inst.questions.length).fill(null);
    this.render(quizId);
  },

  next(quizId) {
    // Scroll to next topic
    const container = document.getElementById(quizId);
    if (!container) return;
    const allTopics = document.querySelectorAll('.topic-card');
    let found = false;
    allTopics.forEach(card => {
      if (found && !card.classList.contains('scrolled')) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        card.classList.add('scrolled');
        found = false;
      }
      if (card.contains(container)) found = true;
    });
  }
};

// ══════════════════════════════════════════════
// 5. TOPIC ACCORDION ENGINE
// ══════════════════════════════════════════════
const Accordion = {
  toggle(headerId) {
    const header = document.getElementById(headerId);
    if (!header) return;
    const body   = document.getElementById(headerId + '_body');
    const chevron = header.querySelector('.topic-chevron');
    const isOpen = body.classList.contains('open');

    if (!isOpen) {
      body.classList.add('open');
      header.classList.add('open');
      if (chevron) chevron.classList.add('open');
    } else {
      body.classList.remove('open');
      header.classList.remove('open');
      if (chevron) chevron.classList.remove('open');
    }
  },

  openFirst() {
    const first = document.querySelector('.topic-header');
    if (first) first.click();
  }
};

// ══════════════════════════════════════════════
// 6. DAY NAVIGATION
// ══════════════════════════════════════════════
const DayNav = {
  showDay(dayNum) {
    document.querySelectorAll('.day-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById(`day${dayNum}`);
    const tab   = document.getElementById(`tab${dayNum}`);
    if (panel) panel.classList.add('active');
    if (tab)   tab.classList.add('active');
    TTS.stop();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// ══════════════════════════════════════════════
// 7. VIDEO PLAYER
// ══════════════════════════════════════════════
const VideoPlayer = {
  loadYouTube(containerId, youtubeUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let videoId = '';
    const match = youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (match) videoId = match[1];

    if (videoId) {
      container.innerHTML = `
        <iframe class="video-embed"
          src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1"
          title="Eagle Academy Video"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen>
        </iframe>`;
    }
  },

  renderPlaceholder(containerId, duration = '8–12 min', topicTitle = '') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="video-placeholder" onclick="VideoPlayer.promptUrl('${containerId}')">
        <div class="video-play-icon">▶</div>
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;color:var(--white)">${topicTitle || 'Topic Video'}</div>
        <div style="font-size:12px;color:var(--grey)">Duration: ${duration} • Click to add YouTube link</div>
        <div style="font-size:11px;color:var(--orange);margin-top:4px">🎬 Video Coming Soon — Instructor will add before class</div>
      </div>`;
  },

  promptUrl(containerId) {
    const url = prompt('Paste YouTube video URL for this topic:');
    if (url && url.includes('youtu')) {
      this.loadYouTube(containerId, url);
      // Save URL
      localStorage.setItem(`ea_video_${containerId}`, url);
    }
  },

  init(containerId, duration, topicTitle) {
    const saved = localStorage.getItem(`ea_video_${containerId}`);
    if (saved) {
      this.loadYouTube(containerId, saved);
    } else {
      this.renderPlaceholder(containerId, duration, topicTitle);
    }
  }
};

// ══════════════════════════════════════════════
// 8. TOAST NOTIFICATIONS
// ══════════════════════════════════════════════
const Toast = {
  show(message, type = 'success', duration = 3000) {
    let toast = document.getElementById('ea_toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ea_toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toast.className = `toast show ${type}`;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { toast.className = 'toast'; }, duration);
  }
};

// ══════════════════════════════════════════════
// 9. TICKER BAR
// ══════════════════════════════════════════════
function initTicker(items, containerId = 'ticker') {
  const el = document.getElementById(containerId);
  if (!el) return;
  const doubled = [...items, ...items];
  el.innerHTML = doubled.map(i => `<span style="margin-right:48px">${i}</span>`).join('');
}

// ══════════════════════════════════════════════
// 10. STUDENT INFO
// ══════════════════════════════════════════════
const Student = {
  get() {
    try { return JSON.parse(localStorage.getItem('ea_student')) || {}; }
    catch { return {}; }
  },
  getName() { return this.get().name || 'Student'; },
  getCourse() { return this.get().course || 'International Freight Dispatcher'; }
};

// ══════════════════════════════════════════════
// 11. PAGE INIT
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Init language
  LangEngine.init();

  // Lang toggle buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => LangEngine.setLang(btn.dataset.lang));
  });

  // Open first day tab if exists
  const firstDayTab = document.querySelector('.day-tab');
  if (firstDayTab) firstDayTab.click();

  // Greet student
  const nameEl = document.getElementById('student_name');
  if (nameEl) nameEl.textContent = Student.getName();

  // Init ticker
  initTicker([
    '🇬🇧 UK Focus: O-Licence · DVSA · Drivers Hours · Tachograph',
    '📞 ICAR Broker Call Method — Introduce · Confirm · Ask · Rate',
    '📄 BOL = Most Important Document in Freight',
    '🎯 Check Broker Credit Score on DAT before booking',
    '⏰ UK Drivers Hours: 9hrs driving, 10hrs max with extension',
    '🌍 IST = GMT + 5:30 hours',
    '🏆 Eagle Academy — Skill-Certified Dispatcher',
    '📊 Empty Running Target: Under 15% of total miles',
    '🔥 UK Pallet Networks: Palletforce · Pall-Ex · TPN · Palletways',
    '✅ Always verify O-Licence before working with a UK carrier',
    '📋 CMR Note required for all international road freight',
    '🚛 Courier Exchange — 6,000+ UK carriers on one platform',
  ], 'ticker_inner');
});

// ══════════════════════════════════════════════
// 12. FLOATING MADAM JI CHAT WIDGET
// Shows on ALL pages always
// ══════════════════════════════════════════════
(function() {

  const CSS = `
    #mj-fab{position:fixed;bottom:88px;right:20px;z-index:9000;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:2px solid rgba(168,85,247,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 4px 24px rgba(124,58,237,0.4);transition:transform .2s,box-shadow .2s;animation:mjBounce 2.5s ease-in-out infinite,mjColorCycle 4s ease-in-out infinite}
    #mj-fab:hover{transform:scale(1.15) rotate(5deg)!important;box-shadow:0 6px 36px rgba(124,58,237,0.7)!important;animation:none!important;background:linear-gradient(135deg,#9333ea,#6366f1)!important}
    #mj-fab::after{content:"Ask Madam JI 🦉";position:absolute;right:64px;top:50%;transform:translateY(-50%) scale(0.8);background:rgba(15,12,61,0.95);border:1px solid rgba(124,58,237,0.4);color:#e9d5ff;font-size:11px;font-weight:700;font-family:'DM Sans',sans-serif;padding:5px 12px;border-radius:999px;white-space:nowrap;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}
    #mj-fab:hover::after{opacity:1;transform:translateY(-50%) scale(1)}
    @keyframes mjBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
    @keyframes mjColorCycle{0%,100%{box-shadow:0 4px 24px rgba(124,58,237,0.5),0 0 0 0 rgba(124,58,237,0.2)}33%{box-shadow:0 4px 28px rgba(99,102,241,0.6),0 0 0 6px rgba(99,102,241,0.1)}66%{box-shadow:0 4px 28px rgba(219,39,119,0.5),0 0 0 6px rgba(219,39,119,0.1)}}
    #mj-fab .mj-badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#f97316;font-size:9px;font-weight:900;color:white;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;border:2px solid #0f0c3d}
    #mj-popup{position:fixed;bottom:154px;right:20px;z-index:9000;width:360px;max-height:540px;background:rgba(15,12,61,0.98);border:1px solid rgba(124,58,237,0.4);border-radius:20px;box-shadow:0 16px 56px rgba(0,0,0,0.6);display:flex;flex-direction:column;transform:translateY(20px) scale(0.95);opacity:0;pointer-events:none;transition:all .25s cubic-bezier(.22,1,.36,1);backdrop-filter:blur(20px)}
    #mj-popup.open{transform:translateY(0) scale(1);opacity:1;pointer-events:all}
    .mj-pop-head{padding:14px 16px;border-bottom:1px solid rgba(124,58,237,0.2);display:flex;align-items:center;gap:10px;flex-shrink:0}
    .mj-pop-orb{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#f97316);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
    .mj-pop-info .mj-pop-name{font-weight:700;font-size:13px;color:#f0f2f8}
    .mj-pop-info .mj-pop-sub{font-size:10px;color:rgba(168,85,247,0.9);font-family:'JetBrains Mono',monospace;letter-spacing:.5px}
    .mj-pop-close{margin-left:auto;background:none;border:none;color:rgba(255,255,255,0.4);font-size:18px;cursor:pointer;padding:4px;line-height:1;transition:color .15s}
    .mj-pop-close:hover{color:white}
    .mj-pop-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;max-height:340px;scrollbar-width:thin;scrollbar-color:rgba(124,58,237,0.3) transparent}
    .mj-msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.5}
    .mj-msg.bot{background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.2);color:#e2d9f3;border-bottom-left-radius:3px;align-self:flex-start}
    .mj-msg.user{background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.2);color:#fde8d8;border-bottom-right-radius:3px;align-self:flex-end}
    .mj-msg.typing{display:flex;gap:4px;align-items:center;padding:12px}
    .mj-dot{width:7px;height:7px;border-radius:50%;background:#a855f7;animation:dotB .8s ease-in-out infinite}
    .mj-dot:nth-child(2){animation-delay:.15s}.mj-dot:nth-child(3){animation-delay:.3s}
    @keyframes dotB{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
    .mj-pop-key{padding:8px 12px;border-top:1px solid rgba(124,58,237,0.15);flex-shrink:0;display:none}
    .mj-pop-key input{width:100%;padding:7px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(124,58,237,0.3);border-radius:8px;color:white;font-size:11px;font-family:'JetBrains Mono',monospace;outline:none}
    .mj-pop-key input::placeholder{color:rgba(255,255,255,0.25)}
    .mj-pop-input{padding:10px 12px;border-top:1px solid rgba(124,58,237,0.15);display:flex;gap:8px;flex-shrink:0}
    .mj-pop-input input{flex:1;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(124,58,237,0.25);border-radius:10px;color:white;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .15s}
    .mj-pop-input input:focus{border-color:rgba(124,58,237,0.6)}
    .mj-pop-input input::placeholder{color:rgba(255,255,255,0.2)}
    .mj-send{padding:9px 14px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;border-radius:10px;color:white;cursor:pointer;font-size:15px;transition:filter .15s;flex-shrink:0}
    .mj-send:hover{filter:brightness(1.15)}
    @media(max-width:400px){#mj-popup{width:calc(100vw - 16px);right:8px;bottom:84px}}
  `;

  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);

  const SYSTEM = `You are Madam JI — the AI study assistant for Eagle Academy UK Freight Dispatcher Certification. You help students understand UK and USA freight dispatch concepts. You are friendly, encouraging, and knowledgeable. Topics you help with: UK transport law, O-Licence, DVSA, drivers hours, tachographs, CMR notes, Courier Exchange, pallet networks, USA HOS rules, broker calls, ICAR method, load boards, BOL, Rate Confirmation, freight documentation. Keep answers concise and student-friendly. You can respond in Hindi if asked. Never discuss earnings figures or make income promises — focus only on skills and knowledge.`;

  let history = [];
  let apiKey = localStorage.getItem('ea_mj_key') || '';

  document.body.insertAdjacentHTML('beforeend', `
    <button id="mj-fab" onclick="mjToggle()" title="Ask Madam JI">🦉<span class="mj-badge">AI</span></button>
    <div id="mj-popup">
      <div class="mj-pop-head">
        <div class="mj-pop-orb">🦉</div>
        <div class="mj-pop-info">
          <div class="mj-pop-name">Madam JI</div>
          <div class="mj-pop-sub">AI STUDY ASSISTANT · EAGLE ACADEMY</div>
        </div>
        <button class="mj-pop-close" onclick="mjToggle()">✕</button>
      </div>
      <div class="mj-pop-msgs" id="mj-msgs">
        <div class="mj-msg bot">नमस्ते! 🙏 Hi! I'm Madam JI — your Eagle Academy AI tutor. Ask me anything about UK or USA freight dispatch!</div>
      </div>
      <div class="mj-pop-key" id="mj-key-row">
        <input id="mj-api-input" type="password" placeholder="Paste Anthropic API key to activate Madam JI…" onchange="mjSaveKey(this.value)"/>
      </div>
      <div class="mj-pop-input">
        <input id="mj-q" type="text" placeholder="Ask a question…" onkeydown="if(event.key==='Enter')mjSend()"/>
        <button class="mj-send" onclick="mjSend()">➤</button>
      </div>
    </div>
  `);

  // Show API key row if no key saved
  if (!apiKey) document.getElementById('mj-key-row').style.display = 'block';

  window.mjToggle = function() {
    document.getElementById('mj-popup').classList.toggle('open');
  };

  window.mjSaveKey = function(val) {
    apiKey = val.trim();
    localStorage.setItem('ea_mj_key', apiKey);
    if (apiKey) document.getElementById('mj-key-row').style.display = 'none';
  };

  window.mjSend = async function() {
    const inp = document.getElementById('mj-q');
    const q = inp.value.trim();
    if (!q) return;
    inp.value = '';

    // Check API key
    if (!apiKey) {
      document.getElementById('mj-key-row').style.display = 'block';
      mjAddMsg('Please paste your Anthropic API key above to use Madam JI. 🔑', 'bot');
      return;
    }

    mjAddMsg(q, 'user');
    history.push({ role: 'user', content: q });

    // Typing indicator
    const typing = document.createElement('div');
    typing.className = 'mj-msg bot typing';
    typing.id = 'mj-typing';
    typing.innerHTML = '<div class="mj-dot"></div><div class="mj-dot"></div><div class="mj-dot"></div>';
    document.getElementById('mj-msgs').appendChild(typing);
    mjScroll();

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: SYSTEM,
          messages: history
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || 'Sorry, I could not get a response. Please try again.';
      history.push({ role: 'assistant', content: reply });
      document.getElementById('mj-typing')?.remove();
      mjAddMsg(reply, 'bot');
    } catch(e) {
      document.getElementById('mj-typing')?.remove();
      mjAddMsg('Connection error. Check your API key and try again.', 'bot');
    }
  };

  function mjAddMsg(text, role) {
    const div = document.createElement('div');
    div.className = 'mj-msg ' + role;
    div.textContent = text;
    document.getElementById('mj-msgs').appendChild(div);
    mjScroll();
  }

  function mjScroll() {
    const msgs = document.getElementById('mj-msgs');
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Quick question chips — inject after first message
  setTimeout(() => {
    const chips = ['What is an O-Licence?','How do UK drivers hours work?','What is the ICAR method?','What is a tachograph?'];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;padding:4px 0';
    chips.forEach(c => {
      const b = document.createElement('button');
      b.style.cssText = 'padding:4px 10px;border-radius:999px;border:1px solid rgba(124,58,237,0.35);background:rgba(124,58,237,0.1);color:#c4b5fd;font-size:11px;cursor:pointer;font-family:"DM Sans",sans-serif;transition:all .15s';
      b.onmouseover = () => { b.style.background = 'rgba(124,58,237,0.25)'; };
      b.onmouseout = () => { b.style.background = 'rgba(124,58,237,0.1)'; };
      b.textContent = c;
      b.onclick = () => { document.getElementById('mj-q').value = c; mjSend(); };
      wrap.appendChild(b);
    });
    document.getElementById('mj-msgs').appendChild(wrap);
  }, 200);

})();


// ══════════════════════════════════════════════
// 13. FLOATING TOOLS QUICK-ACCESS PANEL
// Shows on ALL pages always
// ══════════════════════════════════════════════
(function() {

  const CSS = `
    #tools-fab{position:fixed;bottom:24px;left:20px;z-index:9000;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#f97316,#ea6c0a);border:2px solid rgba(249,115,22,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;transition:transform .2s,box-shadow .2s;animation:toolsBounce 2.5s ease-in-out infinite 1.2s,toolsColorCycle 4s ease-in-out infinite 0.8s}
    #tools-fab:hover{transform:scale(1.15) rotate(-5deg)!important;box-shadow:0 6px 36px rgba(249,115,22,0.7)!important;animation:none!important;background:linear-gradient(135deg,#fb923c,#f97316)!important}
    #tools-fab::after{content:"Quick Tools 🔧";position:absolute;left:64px;top:50%;transform:translateY(-50%) scale(0.8);background:rgba(15,12,61,0.95);border:1px solid rgba(249,115,22,0.4);color:#fed7aa;font-size:11px;font-weight:700;font-family:'DM Sans',sans-serif;padding:5px 12px;border-radius:999px;white-space:nowrap;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}
    #tools-fab:hover::after{opacity:1;transform:translateY(-50%) scale(1)}
    @keyframes toolsBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
    @keyframes toolsColorCycle{0%,100%{box-shadow:0 4px 24px rgba(249,115,22,0.5),0 0 0 0 rgba(249,115,22,0.2)}33%{box-shadow:0 4px 28px rgba(245,158,11,0.6),0 0 0 6px rgba(245,158,11,0.1)}66%{box-shadow:0 4px 28px rgba(239,68,68,0.5),0 0 0 6px rgba(239,68,68,0.1)}}
    #tools-popup{position:fixed;bottom:90px;left:20px;z-index:9000;width:320px;background:rgba(15,12,61,0.98);border:1px solid rgba(249,115,22,0.3);border-radius:20px;box-shadow:0 16px 56px rgba(0,0,0,0.6);transform:translateY(20px) scale(0.95);opacity:0;pointer-events:none;transition:all .25s cubic-bezier(.22,1,.36,1);backdrop-filter:blur(20px);overflow:hidden}
    #tools-popup.open{transform:translateY(0) scale(1);opacity:1;pointer-events:all}
    .tp-head{padding:13px 16px;border-bottom:1px solid rgba(249,115,22,0.15);display:flex;align-items:center;justify-content:space-between}
    .tp-head-title{font-weight:700;font-size:13px;color:#f0f2f8;display:flex;align-items:center;gap:7px}
    .tp-close{background:none;border:none;color:rgba(255,255,255,0.4);font-size:17px;cursor:pointer;transition:color .15s}
    .tp-close:hover{color:white}
    .tp-link{display:flex;align-items:center;gap:12px;padding:11px 16px;text-decoration:none;color:#f0f2f8;transition:background .15s;border-bottom:1px solid rgba(255,255,255,0.05)}
    .tp-link:last-child{border-bottom:none}
    .tp-link:hover{background:rgba(249,115,22,0.08)}
    .tp-icon{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
    .tp-text .tp-name{font-size:13px;font-weight:600}
    .tp-text .tp-desc{font-size:10px;color:rgba(255,255,255,0.35);margin-top:1px;font-family:'JetBrains Mono',monospace}
    .tp-all{display:block;text-align:center;padding:10px;font-size:12px;font-weight:600;color:var(--orange,#f97316);text-decoration:none;background:rgba(249,115,22,0.06);transition:background .15s}
    .tp-all:hover{background:rgba(249,115,22,0.12)}
  `;

  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);

  document.body.insertAdjacentHTML('beforeend', `
    <button id="tools-fab" onclick="toolsToggle()" title="Quick Tools">🔧</button>
    <div id="tools-popup">
      <div class="tp-head">
        <div class="tp-head-title">🛠️ Quick Tools</div>
        <button class="tp-close" onclick="toolsToggle()">✕</button>
      </div>
      <a href="tools.html" class="tp-link" onclick="toolsToggle()">
        <div class="tp-icon" style="background:rgba(249,115,22,0.15)">⏱</div>
        <div class="tp-text"><div class="tp-name">Drivers' Hours Checker</div><div class="tp-desc">UK · Can they legally complete this load?</div></div>
      </a>
      <a href="tools.html" class="tp-link" onclick="toolsToggle()">
        <div class="tp-icon" style="background:rgba(34,197,94,0.15)">💷</div>
        <div class="tp-text"><div class="tp-name">Rate Calculator</div><div class="tp-desc">UK & USA · Cost per mile · Profitability</div></div>
      </a>
      <a href="tools.html" class="tp-link" onclick="toolsToggle()">
        <div class="tp-icon" style="background:rgba(6,182,212,0.15)">🌍</div>
        <div class="tp-text"><div class="tp-name">Time Zone Converter</div><div class="tp-desc">IST · GMT · EST · PST</div></div>
      </a>
      <a href="tools.html" class="tp-link" onclick="toolsToggle()">
        <div class="tp-icon" style="background:rgba(239,68,68,0.15)">📋</div>
        <div class="tp-text"><div class="tp-name">Tachograph Checker</div><div class="tp-desc">UK · Infringement · WTD hours</div></div>
      </a>
      <a href="tools.html" class="tp-all">View All Tools →</a>
    </div>
  `);

  window.toolsToggle = function() {
    document.getElementById('tools-popup').classList.toggle('open');
    // Close Madam JI if open
    document.getElementById('mj-popup')?.classList.remove('open');
  };

  // Close Madam JI closes tools too
  const origMjToggle = window.mjToggle;
  if (origMjToggle) {
    window.mjToggle = function() {
      document.getElementById('tools-popup')?.classList.remove('open');
      origMjToggle();
    };
  }

})();


// ══════════════════════════════════════════════
// 14. GLOBAL CARD HOVER GLOW ENHANCEMENT
// Adds orange glow to all topic-card, tool-card
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const glowCSS = `
    .topic-card{transition:box-shadow .2s,border-color .2s,transform .18s!important}
    .topic-card:hover{box-shadow:0 0 0 2px rgba(249,115,22,0.35),0 8px 32px rgba(249,115,22,0.12)!important;border-color:rgba(249,115,22,0.4)!important;transform:translateY(-2px)!important}
    .topic-card.done:hover{box-shadow:0 0 0 2px rgba(34,197,94,0.35),0 8px 24px rgba(34,197,94,0.1)!important}
    .tool-card{transition:box-shadow .2s,border-color .2s,transform .18s!important}
    .tool-card:hover{box-shadow:0 0 0 2px rgba(249,115,22,0.3),0 8px 32px rgba(249,115,22,0.1)!important;transform:translateY(-2px)!important}
    .day-tab{transition:all .15s!important}
    .day-tab:hover{background:rgba(249,115,22,0.1)!important;color:var(--orange)!important}
    .q-opt{transition:all .15s!important}
    .q-opt:hover:not(:disabled){box-shadow:0 0 0 2px rgba(249,115,22,0.4)!important;transform:translateX(3px)!important}
    a[href],button:not(:disabled){cursor:pointer!important}
  `;
  const s = document.createElement('style');
  s.textContent = glowCSS;
  document.head.appendChild(s);
});
