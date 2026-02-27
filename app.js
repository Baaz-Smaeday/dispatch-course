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
    '🚛 Week 1: Dispatch Foundations',
    '⚡ RPM Target: $2.50+/mile',
    '📞 ICAR Broker Call Method',
    '📄 BOL = #1 Document in Trucking',
    '🎯 Check Broker Credit Score on DAT',
    '⏰ USA HOS: 11 hrs max driving',
    '🌍 IST = EST + 10:30 hours',
    '💰 10 Trucks = $30,000/month potential',
    '🏆 Eagle Academy Certified Dispatcher',
    '📊 Deadhead Target: Under 15%',
    '🔥 Hot Lane: Chicago ↔ Los Angeles',
    '✅ Always get TONU clause in RC',
  ], 'ticker_inner');
});
