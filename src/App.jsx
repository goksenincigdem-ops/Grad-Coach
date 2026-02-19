import { useState, useRef, useEffect, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const FREE_MSG_LIMIT = 5;
const PLANS = {
  starter: { name: "Starter",  price: "€9",   period: "/ay", color: "#00CFC8", msgs: "50 mesaj/ay",    features: ["CV Review", "Job Strategy", "Tüm modüller", "Email destek"] },
  pro:     { name: "Pro",      price: "€19",  period: "/ay", color: "#A78BFA", msgs: "Sınırsız mesaj", features: ["Starter'daki her şey", "CV dosya yükleme", "Haftalık plan PDF", "Mock interview"] },
  campus:  { name: "Campus",   price: "€299", period: "/ay", color: "#FFB347", msgs: "Üniversite lisansı", features: ["Tüm öğrenciler sınırsız", "Admin dashboard", "Toplu CV analizi", "API erişimi"] },
};

const MODULES = [
  { id: "chat",     icon: "💬", label: "Coach Chat",       color: "#00CFC8" },
  { id: "cv",       icon: "📄", label: "CV Review",        color: "#4EEAE2" },
  { id: "strategy", icon: "🎯", label: "Job Strategy",     color: "#00A89F" },
  { id: "skills",   icon: "⚡", label: "Skills & Projects", color: "#2DD4BF" },
  { id: "network",  icon: "🌐", label: "Networking",       color: "#5EEAD4" },
  { id: "plan",     icon: "📋", label: "Weekly Plan",      color: "#34D399" },
];

const MODULE_PROMPTS = {
  cv:       "I want you to review my CV. Ask me to paste it, then give: Top 5 fixes, rewrite suggestions with examples, ATS keyword pack, layout guidance, and pre-apply checklist. Be specific.",
  strategy: "Build a complete new-grad job search strategy. Ask: city, target roles, weekly hours. Then give: where to apply, tracking system, outreach templates, weekly targets.",
  skills:   "Help identify skill gaps and project ideas for my target role. Ask my role and skill level. Suggest 2-4 skill tracks with project ideas: scope, tools, deliverables, timeframe.",
  network:  "Suggest networking paths through hobbies/community. Ask city, introvert/extrovert, budget, interests. Give 8-10 specific places with 'how to join' playbook.",
  plan:     "Create a concrete 7-day job search action plan. Ask my situation briefly. Make it a daily checklist with tasks, time estimates, and success metrics.",
};

const SYSTEM_PROMPT = `You are an expert Graduate Career Coach embedded in a mobile app.
Audience: new graduates (0-2 years experience).
Rules:
- Practical, specific, encouraging but honest
- Minimum clarifying questions — proceed with assumptions, label them
- Tailor advice to user's city, field, constraints
- Low-cost/high-leverage actions only
- No generic fluff — every recommendation = an action
- Use markdown: **bold**, ## headings, - bullets, 1. numbered lists
- End with "**Next action:**" when relevant
- For CV reviews: give concrete rewrite examples
- For job strategy: give specific company names and platforms`;

const ONBOARDING = [
  { id: "welcome", title: "Hoş geldin! 👋",        sub: "İş hayatına güçlü bir başlangıç yapalım.",        icon: "🎓" },
  { id: "city",    title: "Nerede iş arıyorsun?",  sub: "Şehir bazlı en uygun tavsiyeleri verelim.",       icon: "📍" },
  { id: "role",    title: "Hedef rolün ne?",        sub: "Birden fazla yazabilirsin, virgülle ayır.",        icon: "🎯" },
  { id: "status",  title: "Şu anki durumun?",       sub: "Sana özel yol haritası oluşturalım.",             icon: "📊" },
];

// ─── HELPERS ───────────────────────────────────────────────────────────────
function parseMarkdown(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 class="md-h1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em>$1</em>')
    .replace(/`(.+?)`/g,      '<code class="md-code">$1</code>')
    .replace(/^- (.+)$/gm,    '<li class="md-li">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="md-li md-ol"><span class="md-num">$1.</span>$2</li>')
    .split('\n').map(line => {
      if (line.startsWith('<h') || line.startsWith('<li')) return line;
      if (line.trim() === '') return '<div class="md-sp"></div>';
      return `<p class="md-p">${line}</p>`;
    }).join('');
}

function useLS(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  const set = useCallback(val => {
    setV(val);
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key]);
  return [v, set];
}

// ─── SUB-COMPONENTS ────────────────────────────────────────────────────────
function Msg({ msg, fresh }) {
  const isUser = msg.role === "user";
  return (
    <div className={`msg-row ${isUser ? "msg-user" : "msg-ai"} ${fresh ? "msg-in" : ""}`}>
      {!isUser && <div className="av ai-av">🎓</div>}
      <div className={`bubble ${isUser ? "b-user" : "b-ai"}`}>
        {isUser
          ? <p style={{margin:0,whiteSpace:"pre-wrap"}}>{msg.content}</p>
          : <div className="md" dangerouslySetInnerHTML={{__html: parseMarkdown(msg.content)}} />
        }
      </div>
      {isUser && <div className="av user-av">👤</div>}
    </div>
  );
}

function Typing() {
  return (
    <div className="msg-row msg-ai msg-in">
      <div className="av ai-av">🎓</div>
      <div className="bubble b-ai typing-b">
        <span className="dot"/><span className="dot"/><span className="dot"/>
      </div>
    </div>
  );
}

function Paywall({ onClose, onUpgrade }) {
  const [hov, setHov] = useState(null);
  return (
    <div className="overlay-dark" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <button className="x-btn" onClick={onClose}>✕</button>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:44,marginBottom:12}}>🚀</div>
          <h2 className="modal-t">Ücretsiz limitine ulaştın</h2>
          <p className="modal-s">Koçunla konuşmaya devam etmek için bir plan seç.</p>
        </div>
        <div className="plans-g">
          {Object.entries(PLANS).map(([k,p])=>(
            <div key={k} className={`plan-c ${hov===k?"plan-hov":""}`}
              style={{"--pc":p.color}}
              onMouseEnter={()=>setHov(k)} onMouseLeave={()=>setHov(null)}
              onClick={()=>onUpgrade(k)}>
              {k==="pro" && <div className="p-badge">En Popüler</div>}
              <div className="p-name" style={{color:p.color}}>{p.name}</div>
              <div className="p-price"><span className="p-num">{p.price}</span><span className="p-per">{p.period}</span></div>
              <div className="p-msgs">{p.msgs}</div>
              <ul className="p-feats">
                {p.features.map(f=>(
                  <li key={f}><span style={{color:p.color,fontWeight:700}}>✓ </span>{f}</li>
                ))}
              </ul>
              <button className="p-btn" style={{background:p.color}}>Seç</button>
            </div>
          ))}
        </div>
        <p className="modal-foot">İptal istediğinde 1 tık. Kart bilgisi şifreli saklanır.</p>
      </div>
    </div>
  );
}

function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({city:"",role:"",status:""});
  const inp = useRef(null);
  useEffect(() => { inp.current?.focus(); }, [step]);

  const statuses = ["Son yıl öğrencisiyim","Yeni mezunum (0-1 yıl)","1-2 yıl deneyimim var"];
  const keys = ["","city","role","status"];

  const next = (val="") => {
    const k = keys[step];
    const updated = k ? {...data,[k]:val||data[k]} : data;
    if (step >= ONBOARDING.length-1) { onDone({...updated,[keys[step]]:val||data[keys[step]]}); }
    else { setData(updated); setStep(s=>s+1); }
  };

  const s = ONBOARDING[step];
  return (
    <div className="ob-wrap">
      <div className="ob-card">
        <div className="ob-prog">{ONBOARDING.map((_,i)=><div key={i} className={`ob-dot ${i<=step?"ob-on":""}`}/>)}</div>
        <div className="ob-ico">{s.icon}</div>
        <h2 className="ob-title">{s.title}</h2>
        <p className="ob-sub">{s.sub}</p>
        {step===0 && <button className="ob-btn" onClick={()=>next()}>Başlayalım →</button>}
        {(step===1||step===2) && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <input ref={inp} className="ob-inp"
              placeholder={step===1?"Örn: İstanbul, Berlin...":"Örn: UX Designer, Data Analyst..."}
              defaultValue={data[keys[step]]}
              onKeyDown={e=>e.key==="Enter"&&next(e.target.value)}/>
            <button className="ob-btn" onClick={()=>next(inp.current?.value)}>Devam →</button>
          </div>
        )}
        {step===3 && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {statuses.map(s=>(
              <button key={s} className="status-b" onClick={()=>next(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UsageBar({used,limit}) {
  const pct = Math.min((used/limit)*100,100);
  const col = pct>80?"#FF6B6B":pct>60?"#FFB347":"#00CFC8";
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div className="u-track"><div className="u-fill" style={{width:`${pct}%`,background:col}}/></div>
      <span className="u-label" style={{color:col}}>{used}/{limit}</span>
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
export default function App() {
  const [onboarded,  setOnboarded]  = useLS("gc_ob",    false);
  const [user,       setUser]       = useLS("gc_user",  {});
  const [msgCount,   setMsgCount]   = useLS("gc_cnt",   0);
  const [isPro,      setIsPro]      = useLS("gc_pro",   false);
  const [convos,     setConvos]     = useLS("gc_conv",  {});
  const [active,     setActive]     = useState("chat");
  const [input,      setInput]      = useState("");
  const [loadingMod, setLoadingMod] = useState(null);
  const [paywall,    setPaywall]    = useState(false);
  const [sidebar,    setSidebar]    = useState(false);
  const [freshIdx,   setFreshIdx]   = useState(-1);
  const end     = useRef(null);
  const taRef   = useRef(null);
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  const loading = loadingMod === active;

  const msgs   = convos[active] || [];
  const actmod = MODULES.find(m=>m.id===active);

  useEffect(()=>{ end.current?.scrollIntoView({behavior:"smooth"}); },[convos,loading,active]);
  useEffect(()=>{
    if(!taRef.current) return;
    taRef.current.style.height="auto";
    taRef.current.style.height=Math.min(taRef.current.scrollHeight,160)+"px";
  },[input]);

  const handleDone = (data) => {
    setUser(data);
    setOnboarded(true);
    const g = `Merhaba! 👋 **${data.city || "şehrin"}**de **${data.role || "hedef rolün"}** için hazırım.\n\nDurum: *${data.status || "belirtilmedi"}*\n\n6 modülüm var — CV inceleme, iş stratejisi, networking, haftalık plan ve daha fazlası.\n\nNasıl başlayalım? CV'n var mı, yoksa önce stratejiyi mi konuşalım?`;
    setConvos({chat:[{role:"assistant",content:g}]});
  };

  const openModule = async (id) => {
    setActive(id);
    setSidebar(false);
    if (id !== "chat" && !(convos[id]?.length)) {
      setLoadingMod(id);
      try {
        const res = await fetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: MODULE_PROMPTS[id] }] })
        });
        const d = await res.json();
        const r = d.content?.map(b => b.text).join("") || "Başlayalım!";
        setConvos(p => ({ ...p, [id]: [{ role: "assistant", content: r }] }));
        setFreshIdx(0);
      } catch {
        setConvos(p => ({ ...p, [id]: [{ role: "assistant", content: "Bağlantı hatası. Tekrar deneyin." }] }));
      }
      setLoadingMod(null);
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    if (!isPro && msgCount >= FREE_MSG_LIMIT) { setPaywall(true); return; }
    const currentModule = activeRef.current;
    const currentMsgs   = convos[currentModule] || [];
    const um   = { role: "user", content: input.trim() };
    const hist = [...currentMsgs, um];
    setConvos(p => ({ ...p, [currentModule]: hist }));
    setFreshIdx(hist.length - 1);
    setInput("");
    // reset textarea height
    if (taRef.current) { taRef.current.style.height = "auto"; }
    setLoadingMod(currentModule);
    if (!isPro) setMsgCount(c => c + 1);
    try {
      const ctx = user.city ? `User context: City=${user.city}, Role=${user.role}, Status=${user.status}\n\n` : "";
      // Keep last 20 messages max to avoid localStorage overflow and token limits
      const trimmedHist = hist.slice(-20);
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: ctx + SYSTEM_PROMPT,
          messages: trimmedHist.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const d = await res.json();
      const r = d.content?.map(b => b.text).join("") || "Bir sorun oluştu.";
      const updated = [...hist, { role: "assistant", content: r }];
      // trim stored conversation to last 40 messages to prevent localStorage bloat
      const stored = updated.slice(-40);
      setConvos(p => ({ ...p, [currentModule]: stored }));
      setFreshIdx(stored.length - 1);
    } catch {
      const updated = [...hist, { role: "assistant", content: "Bağlantı hatası. Tekrar deneyin." }];
      setConvos(p => ({ ...p, [currentModule]: updated }));
    }
    setLoadingMod(null);
  };

  if (!onboarded) return (<><S/><Onboarding onDone={handleDone}/></>);

  return (
    <>
      <S/>
      {paywall && <Paywall onClose={()=>setPaywall(false)} onUpgrade={()=>{setIsPro(true);setPaywall(false);}}/>}
      <div className="shell">
        {sidebar && <div className="scrim" onClick={()=>setSidebar(false)}/>}
        <aside className={`sb ${sidebar?"sb-open":""}`}>
          <div className="sb-logo">
            <div className="logo">GradCoach</div>
            <div className="logo-s">AI Career Advisor</div>
          </div>
          {user.city && (
            <div className="sb-user">
              <div className="su-c">📍 {user.city}</div>
              <div className="su-r">🎯 {user.role||"Hedef yok"}</div>
            </div>
          )}
          <nav className="sb-nav">
            <div className="nav-lbl">Modüller</div>
            {MODULES.map(m=>(
              <div key={m.id} className={`nav-i ${active===m.id?"nav-a":""}`}
                style={{"--mc":m.color}} onClick={()=>openModule(m.id)}>
                <span className="nav-ico">{m.icon}</span>
                <span className="nav-t">{m.label}</span>
                {loadingMod===m.id
                  ? <span className="nav-spin">◌</span>
                  : (convos[m.id]?.length>0)&&<span className="nav-dot" style={{background:m.color}}/>
                }
              </div>
            ))}
          </nav>
          <div className="sb-foot">
            {!isPro ? (
              <>
                <UsageBar used={msgCount} limit={FREE_MSG_LIMIT}/>
                <button className="up-btn" onClick={()=>setPaywall(true)}>✨ Pro'ya Yükselt</button>
              </>
            ) : (
              <div className="pro-b">
                <span>✨</span>
                <div><div className="pro-t">Pro Aktif</div><div className="pro-s">Sınırsız mesaj</div></div>
              </div>
            )}
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <button className="menu-b" onClick={()=>setSidebar(true)}>☰</button>
            <span className="tb-dot" style={{background:actmod?.color,boxShadow:`0 0 8px ${actmod?.color}`}}/>
            <span className="tb-title">{actmod?.label}</span>
            <div style={{marginLeft:"auto",display:"flex",gap:8}}>
              {msgs.length>0&&<button className="icon-b" onClick={()=>setConvos(p=>({...p,[active]:[]}))} title="Temizle">🗑</button>}
            </div>
          </header>

          <div className="msgs-area">
            {msgs.length===0&&!loading ? (
              <div className="empty">
                <div className="e-ico">{actmod?.icon}</div>
                <div className="e-t">{actmod?.label}</div>
                <div className="e-s">Bu modülde koçunla konuşmaya başla</div>
              </div>
            ) : (
              msgs.map((m,i)=><Msg key={i} msg={m} fresh={i===freshIdx}/>)
            )}
            {loading && <Typing/>}
            <div ref={end}/>
          </div>

          {active==="chat"&&msgs.length<=1&&!loading&&(
            <div className="chips">
              {["CV'mi incele","İş stratejisi kur","Deneyimim yok, ne yapayım?","Networking nasıl?","Bu hafta plan yap"].map(c=>(
                <button key={c} className="chip" onClick={()=>{setInput(c);setTimeout(()=>taRef.current?.focus(),50)}}>{c}</button>
              ))}
            </div>
          )}

          {!isPro&&msgCount>=FREE_MSG_LIMIT ? (
            <div className="pw-bar">
              <span>🔒 Ücretsiz limitin doldu</span>
              <button className="pw-btn" onClick={()=>setPaywall(true)}>Pro'ya geç →</button>
            </div>
          ) : (
            <div className="inp-area">
              <div className="inp-row">
                <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
                  placeholder="Koçuna bir şey sor..." rows={1}/>
                <button className="send-b" onClick={send} disabled={!input.trim() || !!loadingMod}>
                  {loading ? <span className="spin">◌</span> : "➤"}
                </button>
              </div>
              <div className="inp-hint">Enter ile gönder · Shift+Enter yeni satır</div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────
function S() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#040E0F;--sf:#061012;--sf2:#0A181A;
      --bd:#0D1F22;--bd2:#112629;
      --ac:#00CFC8;--ac2:#00A89F;--ac3:#4EEAE2;
      --tx:#DFF4F3;--tx2:#5F9EA0;--tx3:#2A5055;
      --sb:248px;--ease:cubic-bezier(.4,0,.2,1);
    }
    body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--tx);height:100vh;overflow:hidden}
    body::before{
      content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
      background:
        radial-gradient(ellipse 80% 70% at -5% -5%,rgba(0,95,88,.52) 0%,transparent 58%),
        radial-gradient(ellipse 65% 55% at 108% 108%,rgba(0,120,110,.32) 0%,transparent 55%),
        radial-gradient(ellipse 50% 40% at 50% 115%,rgba(0,65,70,.28) 0%,transparent 60%);
      animation:bgP 14s ease-in-out infinite alternate;
    }
    @keyframes bgP{from{opacity:.8}to{opacity:1}}
    #root{height:100vh}

    /* ONBOARDING */
    .ob-wrap{height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;z-index:1}
    .ob-card{background:var(--sf);border:1px solid var(--bd2);border-radius:24px;padding:40px 36px;width:100%;max-width:420px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.5),0 0 60px rgba(0,207,200,.06);animation:cardIn .5s var(--ease)}
    @keyframes cardIn{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:none}}
    .ob-prog{display:flex;gap:8px;justify-content:center;margin-bottom:28px}
    .ob-dot{width:32px;height:4px;border-radius:2px;background:var(--bd2);transition:background .3s}
    .ob-on{background:var(--ac)}
    .ob-ico{font-size:48px;margin-bottom:16px}
    .ob-title{font-family:'Syne',sans-serif;font-size:24px;font-weight:800;margin-bottom:8px}
    .ob-sub{font-size:14px;color:var(--tx2);margin-bottom:28px;line-height:1.55}
    .ob-inp{width:100%;background:var(--sf2);border:1px solid var(--bd2);border-radius:12px;padding:14px 16px;font-family:'DM Sans',sans-serif;font-size:15px;color:var(--tx);outline:none;transition:border-color .2s,box-shadow .2s}
    .ob-inp::placeholder{color:var(--tx3)}
    .ob-inp:focus{border-color:rgba(0,207,200,.4);box-shadow:0 0 0 3px rgba(0,207,200,.08)}
    .ob-btn{background:linear-gradient(135deg,#00CFC8,#007A75);border:none;border-radius:12px;padding:14px 24px;font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#040E0F;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 20px rgba(0,168,159,.4);width:100%}
    .ob-btn:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,207,200,.45)}
    .status-b{background:var(--sf2);border:1px solid var(--bd2);border-radius:12px;padding:14px 20px;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--tx);cursor:pointer;text-align:left;transition:all .15s;width:100%}
    .status-b:hover{border-color:var(--ac);background:rgba(0,207,200,.07);color:var(--ac3)}

    /* PAYWALL */
    .overlay-dark{position:fixed;inset:0;background:rgba(4,14,15,.88);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;animation:fadeIn .2s}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .modal{background:var(--sf);border:1px solid var(--bd2);border-radius:24px;padding:36px 32px;width:100%;max-width:780px;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 32px 100px rgba(0,0,0,.6);animation:slUp .3s var(--ease)}
    @keyframes slUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
    .x-btn{position:absolute;top:18px;right:18px;background:var(--sf2);border:1px solid var(--bd2);border-radius:8px;width:32px;height:32px;color:var(--tx2);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .15s}
    .x-btn:hover{color:var(--tx);border-color:var(--ac)}
    .modal-t{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;margin-bottom:8px}
    .modal-s{font-size:14px;color:var(--tx2)}
    .plans-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
    .plan-c{background:var(--sf2);border:1px solid var(--bd2);border-radius:16px;padding:24px 20px;cursor:pointer;position:relative;transition:all .2s var(--ease)}
    .plan-hov{border-color:var(--pc);transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3)}
    .p-badge{position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#A78BFA;color:#fff;font-size:11px;font-weight:700;border-radius:20px;padding:3px 12px;white-space:nowrap;font-family:'Syne',sans-serif}
    .p-name{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:10px}
    .p-price{display:flex;align-items:baseline;gap:2px;margin-bottom:4px}
    .p-num{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:var(--tx)}
    .p-per{font-size:13px;color:var(--tx2)}
    .p-msgs{font-size:12px;color:var(--tx3);margin-bottom:16px}
    .p-feats{list-style:none;display:flex;flex-direction:column;gap:8px;margin-bottom:20px;font-size:13px;color:var(--tx2)}
    .p-btn{width:100%;padding:11px;border:none;border-radius:10px;font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#040E0F;cursor:pointer;transition:filter .15s}
    .p-btn:hover{filter:brightness(1.1)}
    .modal-foot{text-align:center;font-size:12px;color:var(--tx3)}

    /* SHELL */
    .shell{display:flex;height:100vh;overflow:hidden;position:relative;z-index:1}
    main.main{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden}
    .scrim{position:fixed;inset:0;background:rgba(4,14,15,.7);backdrop-filter:blur(4px);z-index:99}

    /* SIDEBAR */
    .sb{width:var(--sb);background:var(--sf);border-right:1px solid var(--bd);display:flex;flex-direction:column;flex-shrink:0;z-index:100;transition:transform .3s var(--ease);position:relative}
    .sb::after{content:'';position:absolute;top:0;right:-1px;width:1px;height:100%;background:linear-gradient(180deg,transparent,rgba(0,207,200,.38),rgba(78,234,226,.18),transparent);pointer-events:none}
    .sb-logo{padding:22px 18px 14px;border-bottom:1px solid var(--bd)}
    .logo{font-family:'Syne',sans-serif;font-weight:800;font-size:20px;background:linear-gradient(135deg,#00CFC8,#4EEAE2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-.5px}
    .logo-s{font-size:10px;color:var(--tx3);margin-top:2px;letter-spacing:.8px;text-transform:uppercase;font-weight:500}
    .sb-user{padding:12px 18px;border-bottom:1px solid var(--bd);background:rgba(0,207,200,.03)}
    .su-c{font-size:12px;color:var(--ac3);font-weight:500}
    .su-r{font-size:11px;color:var(--tx3);margin-top:3px}
    .sb-nav{padding:10px;flex:1;display:flex;flex-direction:column;gap:2px;overflow-y:auto}
    .nav-lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);padding:8px 10px 4px;font-weight:600}
    .nav-i{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;border:1px solid transparent;transition:all .15s var(--ease)}
    .nav-i:hover{background:var(--sf2)}
    .nav-a{background:linear-gradient(135deg,rgba(0,207,200,.1),rgba(0,168,159,.05));border-color:rgba(0,207,200,.2);box-shadow:0 2px 12px rgba(0,207,200,.06)}
    .nav-ico{font-size:16px;flex-shrink:0}
    .nav-t{font-size:13px;font-weight:500;color:var(--tx2);flex:1;transition:color .15s}
    .nav-a .nav-t{color:var(--tx)}
    .nav-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .nav-spin{font-size:13px;color:var(--ac);animation:sp .8s linear infinite;flex-shrink:0}
    .sb-foot{padding:14px 16px;border-top:1px solid var(--bd);display:flex;flex-direction:column;gap:10px}
    .u-track{flex:1;height:4px;border-radius:2px;background:var(--bd2);overflow:hidden}
    .u-fill{height:100%;border-radius:2px;transition:width .5s var(--ease),background .3s}
    .u-label{font-size:11px;font-weight:600;flex-shrink:0}
    .up-btn{background:linear-gradient(135deg,#00CFC8,#007A75);border:none;border-radius:10px;padding:11px 16px;font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#040E0F;cursor:pointer;transition:all .15s;box-shadow:0 4px 16px rgba(0,168,159,.3)}
    .up-btn:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(0,207,200,.4)}
    .pro-b{display:flex;align-items:center;gap:10px;background:rgba(0,207,200,.08);border:1px solid rgba(0,207,200,.2);border-radius:10px;padding:10px 12px}
    .pro-t{font-size:12px;font-weight:700;color:var(--ac3)}
    .pro-s{font-size:11px;color:var(--tx3)}

    /* TOPBAR */
    .topbar{display:flex;align-items:center;gap:10px;padding:14px 18px;background:rgba(6,16,18,.88);border-bottom:1px solid var(--bd);backdrop-filter:blur(16px);flex-shrink:0;position:relative;z-index:1}
    .menu-b{display:none;background:var(--sf2);border:1px solid var(--bd2);border-radius:8px;width:36px;height:36px;align-items:center;justify-content:center;cursor:pointer;font-size:16px;color:var(--tx2);flex-shrink:0;transition:all .15s}
    .menu-b:hover{color:var(--tx);border-color:var(--ac)}
    .tb-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .tb-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:700}
    .icon-b{background:var(--sf2);border:1px solid var(--bd2);border-radius:8px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:all .15s}
    .icon-b:hover{border-color:rgba(255,107,107,.5)}

    /* MESSAGES */
    .msgs-area{flex:1;min-height:0;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column;gap:14px;scrollbar-width:thin;scrollbar-color:var(--bd2) transparent;position:relative;z-index:1}
    .msgs-area::-webkit-scrollbar{width:4px}
    .msgs-area::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
    .empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;opacity:.45}
    .e-ico{font-size:52px}
    .e-t{font-family:'Syne',sans-serif;font-size:16px;font-weight:700}
    .e-s{font-size:13px;color:var(--tx2)}
    .msg-row{display:flex;gap:10px;align-items:flex-end}
    .msg-in{animation:msgIn .35s var(--ease)}
    @keyframes msgIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    .msg-user{flex-direction:row-reverse}
    .av{width:32px;height:32px;border-radius:10px;background:var(--sf2);border:1px solid var(--bd2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
    .ai-av{background:rgba(0,207,200,.08);border-color:rgba(0,207,200,.18)}
    .user-av{background:rgba(0,168,159,.12);border-color:rgba(0,207,200,.22)}
    .bubble{max-width:min(540px,calc(100% - 56px));padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.65}
    .b-ai{background:linear-gradient(135deg,rgba(10,24,26,.97),rgba(6,16,18,.95));border:1px solid rgba(0,207,200,.12);border-bottom-left-radius:4px;box-shadow:0 2px 16px rgba(0,0,0,.3)}
    .b-user{background:linear-gradient(135deg,#007A75,#005550);color:#DFF4F3;border-bottom-right-radius:4px;font-weight:500;box-shadow:0 4px 16px rgba(0,168,159,.3)}
    .typing-b{display:flex;align-items:center;gap:6px;padding:16px 20px}
    .dot{width:7px;height:7px;border-radius:50%;background:var(--ac);opacity:.6;animation:bnc 1.2s infinite}
    .dot:nth-child(2){animation-delay:.2s}
    .dot:nth-child(3){animation-delay:.4s}
    @keyframes bnc{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-6px);opacity:1}}

    /* MARKDOWN */
    .md{font-size:14px;line-height:1.7}
    .md-h1{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;background:linear-gradient(135deg,#00CFC8,#4EEAE2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:14px 0 6px}
    .md-h2{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:var(--tx);margin:12px 0 5px;padding-bottom:4px;border-bottom:1px solid var(--bd2)}
    .md-h3{font-size:12px;font-weight:600;color:var(--ac);text-transform:uppercase;letter-spacing:.6px;margin:10px 0 4px}
    .md-p{margin:3px 0;color:var(--tx)}
    .md-sp{height:6px}
    .md-li{display:flex;gap:8px;padding:3px 0;color:var(--tx);padding-left:4px}
    .md-li::before{content:"▸";color:var(--ac3);flex-shrink:0;font-size:10px;margin-top:4px}
    .md-li.md-ol::before{content:none}
    .md-num{color:var(--ac);font-weight:700;flex-shrink:0;min-width:22px}
    .md-code{background:rgba(0,207,200,.08);color:var(--ac3);border-radius:4px;padding:1px 7px;font-family:'Courier New',monospace;font-size:12.5px;border:1px solid rgba(0,207,200,.16)}
    strong{color:var(--ac3);font-weight:600}
    em{color:var(--tx2);font-style:italic}

    /* CHIPS */
    .chips{display:flex;gap:8px;padding:4px 20px 12px;overflow-x:auto;flex-shrink:0;scrollbar-width:none}
    .chips::-webkit-scrollbar{display:none}
    .chip{white-space:nowrap;background:rgba(0,207,200,.06);border:1px solid rgba(0,207,200,.16);border-radius:20px;padding:7px 16px;font-size:13px;color:var(--ac3);cursor:pointer;flex-shrink:0;transition:all .15s;font-family:'DM Sans',sans-serif}
    .chip:hover{background:rgba(0,207,200,.12);border-color:var(--ac);box-shadow:0 0 14px rgba(0,207,200,.15);transform:translateY(-1px)}

    /* PAYWALL BAR */
    .pw-bar{display:flex;align-items:center;justify-content:center;gap:14px;padding:16px 20px;background:rgba(6,16,18,.92);border-top:1px solid rgba(255,107,107,.2);backdrop-filter:blur(12px);flex-shrink:0;font-size:14px;color:var(--tx2)}
    .pw-btn{background:linear-gradient(135deg,#00CFC8,#007A75);border:none;border-radius:8px;padding:8px 18px;font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#040E0F;cursor:pointer;transition:all .15s}
    .pw-btn:hover{transform:scale(1.03)}

    /* INPUT */
    .inp-area{padding:14px 18px;background:rgba(6,16,18,.9);border-top:1px solid var(--bd);flex-shrink:0;backdrop-filter:blur(16px);position:relative;z-index:1}
    .inp-row{display:flex;gap:10px;align-items:flex-end;background:var(--sf2);border:1px solid var(--bd2);border-radius:14px;padding:8px 8px 8px 16px;transition:border-color .2s,box-shadow .2s}
    .inp-row:focus-within{border-color:rgba(0,207,200,.38);box-shadow:0 0 0 3px rgba(0,207,200,.06),0 0 24px rgba(0,207,200,.04)}
    .inp-row textarea{flex:1;background:transparent;border:none;outline:none;resize:none;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--tx);line-height:1.55;min-height:24px;max-height:160px;overflow-y:auto;padding:4px 0}
    .inp-row textarea::placeholder{color:var(--tx3)}
    .send-b{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#00CFC8,#007A75);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;color:#040E0F;font-weight:700;transition:all .15s;box-shadow:0 4px 14px rgba(0,168,159,.4)}
    .send-b:hover:not(:disabled){transform:scale(1.07);box-shadow:0 6px 22px rgba(0,207,200,.5)}
    .send-b:disabled{opacity:.35;cursor:not-allowed;box-shadow:none}
    .spin{display:inline-block;animation:sp .8s linear infinite}
    @keyframes sp{to{transform:rotate(360deg)}}
    .inp-hint{font-size:11px;color:var(--tx3);margin-top:6px;text-align:center}

    /* MOBILE */
    @media(max-width:700px){
      .sb{position:fixed;left:0;top:0;bottom:0;transform:translateX(-100%);box-shadow:4px 0 40px rgba(0,0,0,.6)}
      .sb-open{transform:translateX(0)}
      .menu-b{display:flex}
      .msgs-area{padding:16px 14px;gap:12px}
      .inp-area{padding:12px 14px}
      .chips{padding:0 14px 10px}
      .plans-g{grid-template-columns:1fr}
      .modal{padding:28px 20px}
      .ob-card{padding:32px 22px}
    }
  `}</style>;
}
