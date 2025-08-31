// Minimal SPA loader
const state = {
  manifest: [],
  filtered: [],
  current: null,
  progress: JSON.parse(localStorage.getItem("progress") || "{}"),
  hideComplete: false,
};

const el = (sel) => document.querySelector(sel);
const nav = el("#nav");
const content = el("#content");
const path = el("#path");
const search = el("#search");
const progressBar = el("#progressBar span");
const progressText = el("#progressText");

document.addEventListener("keydown", (e)=>{
  if (e.key === "/" && document.activeElement !== search){ e.preventDefault(); search.focus(); }
});

el("#toggleSidebar").addEventListener("click", ()=>{
  document.body.classList.toggle("sidebar-open");
});
el("#resetProgress").addEventListener("click", ()=>{
  if (confirm("Reset all progress?")) {
    state.progress = {};
    localStorage.removeItem("progress");
    render();
  }
});
el("#filterComplete").addEventListener("change", (e)=>{
  state.hideComplete = e.target.checked;
  renderSidebar();
});

async function boot(){
  const res = await fetch("lessons/manifest.json");
  state.manifest = await res.json();
  state.filtered = state.manifest;
  search.addEventListener("input", onSearch);
  render();
  // Open first lesson by default
  if (location.hash) {
    openById(location.hash.slice(1));
  } else if (state.manifest.length) {
    openById(state.manifest[0].id);
  }
  window.addEventListener("hashchange", ()=>{
    const id = location.hash.slice(1);
    if (id) openById(id);
  });
}
boot();

function onSearch(e){
  const q = e.target.value.toLowerCase().trim();
  if (!q) { state.filtered = state.manifest; renderSidebar(); return; }
  state.filtered = state.manifest.filter(item => (
    item.title.toLowerCase().includes(q) ||
    (item.tags||[]).join(" ").toLowerCase().includes(q) ||
    (item.category||"").toLowerCase().includes(q)
  ));
  renderSidebar();
}

function render(){
  renderSidebar();
  renderProgress();
}

function renderSidebar(){
  nav.innerHTML = "";
  const groups = {};
  for (const item of state.filtered){
    if (state.hideComplete && state.progress[item.id]?.done) continue;
    const key = item.category;
    groups[key] = groups[key] || [];
    groups[key].push(item);
  }
  for (const [cat, items] of Object.entries(groups)){
    const sec = document.createElement("div");
    sec.className = "nav-section";
    const h = document.createElement("h3");
    h.textContent = cat;
    sec.appendChild(h);
    for (const item of items){
      const a = document.createElement("div");
      a.className = "nav-item" + (state.current?.id === item.id ? " active": "") + (state.progress[item.id]?.done ? " done": "");
      a.addEventListener("click", ()=> openById(item.id));
      const dot = document.createElement("span");
      dot.className = "status";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `${item.seq.toString().padStart(3,"0")} • ${item.title}`;
      const tags = document.createElement("div");
      tags.className = "tags";
      tags.textContent = item.tags?.join(" • ") || "";
      a.append(dot,title,tags);
      sec.appendChild(a);
    }
    nav.appendChild(sec);
  }
}

function renderProgress(){
  const total = state.manifest.length;
  const done = Object.values(state.progress).filter(p => p.done).length;
  const pct = Math.round((done/total)*100);
  progressBar.style.width = pct + "%";
  progressText.textContent = `${pct}% complete (${done}/${total})`;
}

async function openById(id){
  const item = state.manifest.find(x => x.id === id);
  if (!item) return;
  state.current = item;
  location.hash = item.id;

  const res = await fetch(item.path);
  let md = await res.text();

  // Render mini-markdown (very small subset)
  let html = md
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n\n- (.*?)(?=(\n\n|$))/gs, (m, p1)=>{
      const items = p1.split("\n- ").map(x=>`<li>${x}</li>`).join("");
      return `<ul>${items}</ul>`;
    })
    .replace(/```([a-zA-Z0-9+-]*)\n([\s\S]*?)```/g, (m, lang, code)=>{
      return `<pre><code data-lang="${lang}">${escapeHtml(code)}</code></pre>`;
    })
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^/, "<p>").replace(/$/, "</p>");

  // Quizzes: :::quiz question? || A || B* || C
  html = html.replace(/:::quiz\s*([\s\S]*?):::/g, (_, body)=>{
    const lines = body.trim().split("||").map(s=>s.trim()).filter(Boolean);
    const q = lines.shift();
    const options = lines.map((opt, i)=>({text: opt.replace(/\*$/,""), correct: /\*$/.test(opt), i}));
    const id = "quiz_"+Math.random().toString(36).slice(2);
    const answers = JSON.parse(localStorage.getItem("quiz")||"{}");
    const saved = answers[id] || null;

    const optionsHtml = options.map(o=>`<label class="option ${saved==o.i?(o.correct?"correct":"incorrect"):""}" data-i="${o.i}" data-c="${o.correct?'1':'0'}">${escapeHtml(o.text)}</label>`).join("");
    return `<div class="quiz" data-id="${id}"><h4>${escapeHtml(q)}</h4>${optionsHtml}</div>`;
  });

  content.innerHTML = html;
  wireQuizzes();

  // Path cards
  path.innerHTML = "";
  if (item.next && item.next.length){
    item.next.forEach(nid=>{
      const n = state.manifest.find(x => x.id === nid);
      if (!n) return;
      const card = document.createElement("div");
      card.className = "card";
      const h = document.createElement("h5"); h.textContent = n.title;
      const p = document.createElement("p"); p.textContent = (n.tags||[]).join(" • ");
      const btn = document.createElement("button"); btn.textContent = "Go →";
      btn.addEventListener("click", ()=> openById(n.id));
      card.append(h,p,btn);
      path.appendChild(card);
    });
  }

  // Mark read when opened
  state.progress[item.id] = state.progress[item.id] || {};
  state.progress[item.id].opened = true;
  localStorage.setItem("progress", JSON.stringify(state.progress));
  renderSidebar();
  renderProgress();
}

function wireQuizzes(){
  content.querySelectorAll(".quiz").forEach(qel=>{
    qel.addEventListener("click", (e)=>{
      const opt = e.target.closest(".option");
      if (!opt) return;
      const id = qel.dataset.id;
      const correct = opt.dataset.c === "1";
      const selected = +opt.dataset.i;
      const answers = JSON.parse(localStorage.getItem("quiz")||"{}");
      answers[id] = selected;
      localStorage.setItem("quiz", JSON.stringify(answers));
      qel.querySelectorAll(".option").forEach(o=>o.classList.remove("correct","incorrect"));
      opt.classList.add(correct ? "correct" : "incorrect");

      // If correct, mark lesson as done
      const cur = state.current?.id;
      if (correct && cur){
        state.progress[cur] = {opened:true, done:true};
        localStorage.setItem("progress", JSON.stringify(state.progress));
        renderSidebar();
        renderProgress();
      }
    });
  });
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
