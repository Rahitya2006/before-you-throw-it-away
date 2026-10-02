const state = {
  photos: [],
  analysis: null,
  selectedPath: null,
  language: "en",
  currentGuideStep: 0,
  guideDone: [],
};

const dictionaries = {
  en: {},
  hi: {},
  te: {}
};

const demoProfiles = [
  {
    key: "laptop",
    matches: ["laptop","computer","notebook","macbook","charger","screen"],
    objectName: "Old Laptop",
    category: "Electronics",
    condition: "Damaged / Partially Functional",
    confidence: 78,
    summary: "The item looks like an older laptop with visible wear. Based on the description and demo rules, it may still have useful components and could be worth repairing, repurposing, donating, or sending to an e-waste stream.",
    issues: ["visible wear", "possible battery issue", "electronic components"],
    suggested: "repair",
    materials: ["electronics", "plastic", "metal", "battery"],
  },
  {
    key: "chair",
    matches: ["chair","stool","seat","furniture","wood"],
    objectName: "Used Chair",
    category: "Furniture",
    condition: "Used / Repairable",
    confidence: 83,
    summary: "The item appears to be a used chair. It looks suitable for continued use if the damaged or loose parts can be fixed, and it may also have reuse or donation potential.",
    issues: ["general wear", "possible loose joint", "upholstery may need work"],
    suggested: "repair",
    materials: ["wood", "metal", "fabric"],
  },
  {
    key: "clothes",
    matches: ["shirt","t-shirt","tshirt","jeans","dress","clothes","clothing","jacket","pants"],
    objectName: "Used Clothing",
    category: "Textile",
    condition: "Used / Potentially Reusable",
    confidence: 89,
    summary: "This appears to be clothing that may still have value. Depending on cleanliness and condition, it could be reused, donated, repaired, or routed to textile recycling.",
    issues: ["fabric wear", "stains may be present", "check cleanliness"],
    suggested: "donate",
    materials: ["textile"],
  },
  {
    key: "bottle",
    matches: ["bottle","plastic bottle","container","water bottle"],
    objectName: "Plastic Bottle",
    category: "Plastic",
    condition: "Used",
    confidence: 93,
    summary: "This looks like a plastic bottle. It may be reusable for a safe secondary purpose or suitable for the local plastic recycling stream, depending on the material and local rules.",
    issues: ["used container", "plastic material"],
    suggested: "reuse",
    materials: ["plastic"],
  },
  {
    key: "phone",
    matches: ["phone","mobile","smartphone","iphone","android"],
    objectName: "Old Smartphone",
    category: "Electronics",
    condition: "Used / Potentially Repairable",
    confidence: 86,
    summary: "This appears to be an older smartphone. If it powers on, repair or donation may be possible; if it is no longer useful, e-waste recycling is an appropriate path.",
    issues: ["battery health may be reduced", "screen/body wear", "electronic components"],
    suggested: "repair",
    materials: ["electronics", "glass", "metal", "battery"],
  }
];

const workflows = {
  reuse: {
    title: "Reuse it in a new way",
    intro: "Let’s look for practical ways this item could keep being useful instead of becoming waste.",
  },
  repair: {
    title: "Check whether you can repair it",
    intro: "We’ll first decide whether this looks suitable for a safe DIY repair or whether professional help makes more sense.",
  },
  donate: {
    title: "Pass it on",
    intro: "Let’s check whether the item is suitable for donation and what a simple donation process could look like.",
  },
  recycle: {
    title: "Recycle it responsibly",
    intro: "We’ll identify the likely material stream and separate household steps from specialist collection.",
  }
};

function showPage(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const page = document.getElementById(`page-${name}`);
  if(page) page.classList.add("active");
  window.scrollTo({top:0, behavior:"smooth"});
  if(name === "history") renderHistory();
}

function toast(message){
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(()=>el.classList.remove("show"), 2800);
}

function setupUploads(){
  ["cameraInput","fileInput"].forEach(id=>{
    document.getElementById(id).addEventListener("change", e=>{
      addPhotos([...e.target.files]);
      e.target.value = "";
    });
  });
  const dz = document.getElementById("dropZone");
  dz.addEventListener("dragover", e=>{e.preventDefault(); dz.style.borderColor="#2f8f59"});
  dz.addEventListener("dragleave", ()=>{dz.style.borderColor="#bfd2c3"});
  dz.addEventListener("drop", e=>{
    e.preventDefault(); dz.style.borderColor="#bfd2c3";
    addPhotos([...e.dataTransfer.files].filter(f=>f.type.startsWith("image/")));
  });
}

function addPhotos(files){
  for(const file of files){
    if(!file.type.startsWith("image/")) continue;
    if(state.photos.length >= 6){
      toast("You can add up to 6 photos in this prototype.");
      break;
    }
    state.photos.push({file, url: URL.createObjectURL(file)});
  }
  renderPreviews();
}

function removePhoto(index){
  const p = state.photos[index];
  if(p?.url) URL.revokeObjectURL(p.url);
  state.photos.splice(index,1);
  renderPreviews();
}

function renderPreviews(){
  const grid = document.getElementById("previewGrid");
  grid.innerHTML = state.photos.map((p,i)=>`
    <div class="preview">
      <img src="${p.url}" alt="Uploaded view ${i+1}">
      <button onclick="removePhoto(${i})" aria-label="Remove photo">×</button>
    </div>
  `).join("");
}

function chooseProfile(text){ /* kept as a fallback/demo helper */
  const t = (text||"").toLowerCase();
  return demoProfiles.find(p=>p.matches.some(m=>t.includes(m))) || {
    key: "general",
    objectName: "Everyday Household Item",
    category: "Household",
    condition: "Condition needs a closer look",
    confidence: state.photos.length >= 3 ? 70 : 52,
    summary: "The prototype can see that you provided an item, but the demo analyzer cannot truly inspect its image yet. Adding a description such as the object's name, whether it works, and what is damaged will make this test result more useful.",
    issues: ["needs real vision model", "description can improve identification"],
    suggested: "reuse",
    materials: ["unknown"],
  };
}

async function runDemoAnalysis(){
  if(state.photos.length === 0){
    toast("Please add at least one photo first.");
    return;
  }

  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  btn.textContent = "Analyzing your photos…";

  try {
    const images = [];
    for (const p of state.photos) {
      const dataUrl = await fileToDataUrl(p.file);
      const parts = dataUrl.split(",");
      images.push({
        mimeType: p.file.type || "image/jpeg",
        data: parts[1]
      });
    }

    const description = document.getElementById("descriptionInput").value.trim();
    const language = state.language;
    console.log("SENDING TO AI:", JSON.stringify({images, description, language}));
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        images,
        description,
        language
      })
    });

    const payload = await response.json();

    if(!response.ok){
      throw new Error(payload.error || "The AI service returned an error.");
    }

    state.analysis = payload;
    state.currentGuideStep = 0;
    state.guideDone = [];
    renderAnalysis();
    saveHistory();
    showPage("result");
  } catch (error) {
    console.error(error);
    toast(error.message || "Something went wrong while analyzing the item.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze My Item →";
  }
}

function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(new Error("Could not read one of the images."));
    reader.readAsDataURL(file);
  });
}

function renderAnalysis(){
  const a = state.analysis;
  document.getElementById("objectName").textContent = a.object_name || a.objectName || "Unknown item";
  document.getElementById("conditionBadge").textContent = a.condition || "Condition uncertain";
  const confidence = a.condition_confidence ?? a.confidence ?? null;
  document.getElementById("confidenceText").textContent =
    confidence !== null ? `${confidence}% confidence` : "Confidence unavailable";
  document.getElementById("analysisSummary").textContent =
    a.summary || a.recommendation_reason || "The AI analyzed the item, but no summary was returned.";

  const issues = a.detected_damage || a.issues || [];
  document.getElementById("detectedIssues").innerHTML =
    (issues.length ? issues : ["No obvious damage detected"]).map(x=>`<span class="tag">${escapeHtml(x)}</span>`).join("");

  const suggested = (a.recommended_option || a.suggested || "reuse").toLowerCase();
  document.getElementById("aiSuggestion").innerHTML =
    `AI suggestion: <strong>${capitalize(suggested)}</strong>. You still choose the path.`;

  const images = state.photos.slice(0,4).map(p=>`<div class="result-image"><img src="${p.url}" alt="Item photo"></div>`).join("");
  document.getElementById("resultImageGrid").innerHTML = images;
}

function selectPath(path){
  state.selectedPath = path;
  state.currentGuideStep = 0;
  state.guideDone = [];
  renderWorkflow();
  showPage("workflow");
}

function renderWorkflow(){
  const path = state.selectedPath;
  const a = state.analysis;
  document.getElementById("workflowPathBadge").textContent = path.toUpperCase();
  const wf = workflows[path];

  let content = `
    <div class="workflow-hero">
      <span class="eyebrow">Step 3 · Plan</span>
      <h2>${wf.title}</h2>
      <p>${wf.intro}</p>
    </div>
  `;

  if(path === "reuse") content += reuseWorkflow(a);
  if(path === "repair") content += repairWorkflow(a);
  if(path === "donate") content += donateWorkflow(a);
  if(path === "recycle") content += recycleWorkflow(a);

  document.getElementById("workflowContent").innerHTML = content;
  setupWorkflowChat();
}

function reuseWorkflow(a){
  const items = (a.reuse_options || []).slice(0,4);
  const fallback = [
    {title:"Repurpose for storage",difficulty:"Easy",cost:"Low",time:"30–60 min",description:"Turn the item into an organizer, holder, box, shelf, or other useful storage."},
    {title:"Make it décor",difficulty:"Easy",cost:"Low",time:"1–2 hr",description:"Clean and refinish the item so it becomes useful décor."},
    {title:"Create a practical upgrade",difficulty:"Medium",cost:"Low–Medium",time:"1–3 hr",description:"Combine the item with safe, simple materials to create a useful new object."},
    {title:"Reuse safe components",difficulty:"Medium",cost:"Low",time:"20–60 min",description:"Keep parts or materials that can safely be reused elsewhere."}
  ];
  const list = items.length ? items : fallback;
  return `
    <div class="workflow-grid">
      <div class="workflow-card">
        <h3>Reuse ideas for your item</h3>
        <div class="recommendation-grid">
          ${list.map((x,i)=>`
          <div class="recommendation">
            <h4>${escapeHtml(x.title || "Reuse idea")}</h4>
            <div class="recommendation-meta">
              <span class="pill">${escapeHtml(x.difficulty || "Varies")}</span>
              <span class="pill">${escapeHtml(x.cost || "Varies")}</span>
              <span class="pill">${escapeHtml(x.time || "Varies")}</span>
            </div>
            <p>${escapeHtml(x.description || x.desc || "")}</p>
            <button class="small-btn primary" onclick="openGuide('reuse',${i})">See detailed guide →</button>
          </div>
          `).join("")}
        </div>
      </div>
      ${chatPanel("Ask AI about reuse")}
    </div>
  `;
}

function repairWorkflow(a){
  const ra = a.repair_assessment || {};
  const safetyText = (a.safety_concerns || []).join(" ");
  const diy = ra.diy_feasibility || ra.diy || "Needs assessment";
  const professional = ra.professional_help || "";
  return `
    <div class="workflow-grid">
      <div class="workflow-card">
        <h3>Repair assessment</h3>
        <div class="assessment">
          <strong>${escapeHtml(diy)}</strong>
          <span>${escapeHtml(ra.summary || "The AI is assessing the likely repair path from the photos and description.")}</span>
        </div>
        ${ra.tools?.length ? `<div class="small-label">Possible tools</div><div class="tag-row">${ra.tools.map(x=>`<span class="tag">${escapeHtml(x)}</span>`).join("")}</div>` : ""}
        ${professional ? `<div class="assessment" style="margin-top:14px"><strong>Professional help</strong><span>${escapeHtml(professional)}</span></div>` : ""}
        ${safetyText ? `<div class="safety"><strong>Safety notice:</strong> ${escapeHtml(safetyText)}</div>` : ""}
        <button class="primary-btn" style="margin-top:15px" onclick="openGuide('repair',0)">Start Repair Guide</button>
        <button class="ghost-btn" style="margin-top:15px" onclick="showNearby('repair')">Find Nearby Repair Help</button>
      </div>
      ${chatPanel("Ask AI about the repair")}
    </div>
  `;
}

function donateWorkflow(a){
  const da = a.donation_assessment || {};
  return `
    <div class="workflow-grid">
      <div class="workflow-card">
        <h3>Is it suitable for donation?</h3>
        <div class="assessment">
          <strong>${escapeHtml(da.suitability || "Potentially suitable")}</strong>
          <span>${escapeHtml(da.summary || "Donation is usually most useful when the item is clean, safe, and usable.")}</span>
        </div>
        <div class="guide-step"><h4>1. Clean and prepare it</h4><p>Remove personal data and clean the item where appropriate.</p></div>
        <div class="guide-step"><h4>2. Check acceptance</h4><p>Confirm that a local organization currently accepts this item type and condition.</p></div>
        <div class="guide-step"><h4>3. Choose drop-off or pickup</h4><p>Availability depends on the organization and location.</p></div>
        <button class="primary-btn" style="margin-top:15px" onclick="showNearby('donate')">Find Donation Options Near Me</button>
        <div id="nearby-donate"></div>
      </div>
      ${chatPanel("Ask AI about donation")}
    </div>
  `;
}

function recycleWorkflow(a){
  const ra = a.recycling_assessment || {};
  const materials = (a.materials || []).join(", ");
  return `
    <div class="workflow-grid">
      <div class="workflow-card">
        <h3>Recycling plan</h3>
        <div class="assessment">
          <strong>${escapeHtml(ra.stream || (materials || "Unknown material stream"))}</strong>
          <span>${escapeHtml(ra.summary || "Verify local recycling rules before using household collection.")}</span>
        </div>
        ${ra.hazardous_handling ? `<div class="safety"><strong>Handling note:</strong> ${escapeHtml(ra.hazardous_handling)}</div>` : ""}
        <div class="guide-step"><h4>1. Prepare safely</h4><p>Separate materials only when safe and appropriate.</p></div>
        <div class="guide-step"><h4>2. Use the correct collection stream</h4><p>Local rules vary, so check the municipality or verified collector.</p></div>
        <div class="guide-step"><h4>3. Find specialist help when needed</h4><p>Electronics, batteries, chemicals, and other specialist items may require dedicated collection.</p></div>
        <button class="primary-btn" style="margin-top:15px" onclick="showNearby('recycle')">Find Recycling Options Near Me</button>
        <div id="nearby-recycle"></div>
      </div>
      ${chatPanel("Ask AI about recycling")}
    </div>
  `;
}

function openGuide(path, recommendationIndex){
  state.selectedPath = path;
  state.currentGuideStep = 0;
  state.guideDone = [];
  renderGuide(path, recommendationIndex ?? 0);
}

const guideTemplates = {
  reuse: [
    {title:"Clean and inspect the item",body:"Start by removing dust, dirt, and loose pieces. Check for cracks, sharp edges, unstable parts, or anything unsafe to reuse."},
    {title:"Gather simple materials",body:"Use the smallest practical set of materials first. Reuse supplies you already have when they are safe and suitable."},
    {title:"Build the new use",body:"Follow the selected idea gradually. Test stability and fit after each major change instead of doing everything at once."},
    {title:"Finish and test",body:"Make sure the final result is stable, clean, and safe for the intended use before putting it into daily use."}
  ],
  repair: [
    {title:"Describe the fault",body:"Write down exactly what fails and what still works. This helps separate the symptom from the likely cause."},
    {title:"Make it safe",body:"Disconnect power where relevant and move to a safe work area. Never bypass safety systems just to make a repair work."},
    {title:"Inspect the likely cause",body:"Look for loose connections, worn parts, cracks, blocked areas, or obvious damage. Stop if you encounter a hazardous component or uncertain electrical/battery issue."},
    {title:"Repair or replace the part",body:"Use a compatible replacement and follow the item's instructions where available. Test gradually rather than returning immediately to full use."},
    {title:"Decide whether professional help is needed",body:"If the item remains unsafe, the repair requires specialist tools, or the fault is unclear, stop and use a qualified repair service."}
  ]
};

function renderGuide(path, recommendationIndex){
  const steps = guideTemplates[path] || guideTemplates.reuse;
  document.getElementById("workflowPathBadge").textContent = `${path.toUpperCase()} · GUIDE`;
  document.getElementById("workflowContent").innerHTML = `
    <div class="workflow-grid">
      <div class="workflow-card">
        <span class="eyebrow">Step-by-step assistant</span>
        <h3>${path === "reuse" ? "Detailed reuse guide" : "Detailed repair guide"}</h3>
        <div id="guideBody"></div>
        <div class="guide-controls">
          <span id="stepCounter" class="step-counter"></span>
          <div>
            <button class="check-btn" id="doneBtn" onclick="toggleDone()">Mark step done ✓</button>
            <button class="small-btn primary" id="nextGuideBtn" onclick="nextGuide()">Next →</button>
          </div>
        </div>
        <button class="ghost-btn" style="margin-top:14px" onclick="renderWorkflow()">← Back to ${capitalize(path)} options</button>
      </div>
      ${chatPanel("Ask AI while you work")}
    </div>
  `;
  state.guideRecommendation = recommendationIndex;
  state.guideSteps = steps;
  renderCurrentGuideStep();
  setupWorkflowChat();
}

function renderCurrentGuideStep(){
  const steps = state.guideSteps || guideTemplates[state.selectedPath] || guideTemplates.reuse;
  const i = state.currentGuideStep;
  const step = steps[i];
  document.getElementById("guideBody").innerHTML = `
    <div class="assessment"><strong>Step ${i+1}: ${step.title}</strong><span>${step.body}</span></div>
  `;
  document.getElementById("stepCounter").textContent = `${i+1} of ${steps.length}`;
  document.getElementById("doneBtn").classList.toggle("done", !!state.guideDone[i]);
  document.getElementById("doneBtn").textContent = state.guideDone[i] ? "Step done ✓" : "Mark step done ✓";
  document.getElementById("nextGuideBtn").textContent = i === steps.length-1 ? "Finish →" : "Next →";
}

function toggleDone(){
  state.guideDone[state.currentGuideStep] = !state.guideDone[state.currentGuideStep];
  renderCurrentGuideStep();
}

function nextGuide(){
  const steps = state.guideSteps || [];
  if(state.currentGuideStep < steps.length - 1){
    state.currentGuideStep += 1;
    renderCurrentGuideStep();
  } else {
    toast("Nice! You reached the end of this guide.");
    saveHistory();
  }
}

function chatPanel(title){
  return `
    <div class="workflow-card chat-box">
      <h3>${title}</h3>
      <div class="chat-log" id="chatLog">
        <div class="bubble ai">Hi! I remember the item you just analyzed. Ask me a follow-up question about this step or workflow.</div>
      </div>
      <div class="chat-input">
        <input id="chatInput" placeholder="e.g. What if I don't have the right tool?" onkeydown="if(event.key==='Enter') sendChat()">
        <button class="small-btn primary" onclick="sendChat()">Ask</button>
      </div>
    </div>
  `;
}

function setupWorkflowChat(){
  const input = document.getElementById("chatInput");
  if(input) input.focus();
}

function sendChat(){
  const input = document.getElementById("chatInput");
  const log = document.getElementById("chatLog");
  if(!input || !log || !input.value.trim()) return;
  const q = input.value.trim();
  log.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHtml(q)}</div>`);
  input.value = "";
  const answer = generateDemoChat(q);
  setTimeout(()=>{
    log.insertAdjacentHTML("beforeend", `<div class="bubble ai">${answer}</div>`);
    log.scrollTop = log.scrollHeight;
  }, 250);
  log.scrollTop = log.scrollHeight;
}

function generateDemoChat(q){
  const lower = q.toLowerCase();
  if(lower.includes("tool")) return "Tell me what tool you have and what you're trying to do. In the real AI version, I’ll use the uploaded item and your current step as context so you don't have to repeat everything.";
  if(lower.includes("safe") || lower.includes("danger")) return "For anything involving mains electricity, lithium batteries, gas, chemicals, or structural safety, stop and verify the procedure or use a qualified professional. This prototype intentionally takes a cautious approach.";
  if(lower.includes("cost") || lower.includes("price")) return "A real version can estimate parts and service costs using live data. For this prototype, treat any cost discussion as a rough planning estimate only.";
  if(lower.includes("where") || lower.includes("near")) return "Use the nearby options button in the current workflow. The final version will use your location with a real places/search API and show verified businesses rather than AI-invented details.";
  return "Good question. In the connected version, I’ll answer using this exact item, the photos you uploaded, your selected path, and the step you're currently on. For now, I can only provide prototype guidance.";
}

async function showNearby(kind){
  let target = document.getElementById(`nearby-${kind}`);
  if(!target){
    const candidates = ["nearby-donate","nearby-recycle","nearby-repair"];
    target = candidates.map(id=>document.getElementById(id)).find(Boolean);
  }
  if(!target) return;
  target.innerHTML = '<div class="assessment">Checking your location…</div>';
  if(!navigator.geolocation){
    target.innerHTML = manualLocationFallback(kind);
    return;
  }
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude} = pos.coords;
    const query = kind === "repair" ? "repair shop near me" : kind === "donate" ? "donation center near me" : "recycling center near me";
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&center=${latitude},${longitude}`;
    target.innerHTML = nearbyCard(kind, maps);
  }, ()=>{
    target.innerHTML = manualLocationFallback(kind);
  }, {enableHighAccuracy:false, timeout:8000});
}

function manualLocationFallback(kind){
  const label = kind === "repair" ? "repair shops" : kind === "donate" ? "donation centers" : "recycling centers";
  return `
    <div class="assessment">
      <strong>Location access was unavailable.</strong>
      <span>For this prototype, you can search for verified ${label} yourself. The connected version will add a city/postcode box and live place results.</span>
      <div style="margin-top:10px">
        <a class="small-btn primary" target="_blank" href="https://www.google.com/maps/search/${encodeURIComponent(label)}">Search nearby</a>
      </div>
    </div>`;
}

function nearbyCard(kind, maps){
  const label = kind === "repair" ? "repair help" : kind === "donate" ? "donation options" : "recycling options";
  return `
    <div class="location-card">
      <div class="top"><div><h4>Nearby ${label}</h4><p>Location permission is available.</p></div><span class="pill">LIVE MAP SEARCH</span></div>
      <p>This prototype opens a map search. The next version will replace this with real business cards containing names, phone numbers, hours, accepted items, and verified addresses.</p>
      <div class="location-actions">
        <a class="small-btn primary" target="_blank" href="${maps}">Open Map Search ↗</a>
      </div>
    </div>`;
}

function saveHistory(){
  if(!state.analysis) return;
  const item = {
    name: state.analysis.object_name || state.analysis.objectName || "Analyzed item",
    condition: state.analysis.condition || "Unknown",
    path: state.selectedPath || null,
    image: "",
    savedAt: new Date().toLocaleString()
  };
  const data = JSON.parse(localStorage.getItem("btia-history") || "[]");
  data.unshift(item);
  localStorage.setItem("btia-history", JSON.stringify(data.slice(0,12)));
}

function renderHistory(){
  const list = document.getElementById("historyList");
  const data = JSON.parse(localStorage.getItem("btia-history") || "[]");
  if(!data.length){
    list.innerHTML = '<div class="empty">No saved analyses yet.<br><br>Analyze an item and it will appear here.</div>';
    return;
  }
  list.innerHTML = data.map(x=>`
    <article class="history-item">
      <div class="history-thumb">${x.image ? `<img src="${x.image}" alt="${escapeHtml(x.name)}">` : ""}</div>
      <h3>${escapeHtml(x.name)}</h3>
      <p>${escapeHtml(x.condition)}${x.path ? ` · Chose ${escapeHtml(x.path)}` : ""}</p>
      <p style="margin-top:7px">${escapeHtml(x.savedAt)}</p>
    </article>
  `).join("");
}

function clearHistory(){
  localStorage.removeItem("btia-history");
  renderHistory();
  toast("History cleared.");
}

function toggleVoice(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    toast("Voice input is not supported in this browser.");
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = document.getElementById("voiceLang").value;
  rec.interimResults = true;
  rec.continuous = false;
  const btn = document.getElementById("voiceBtn");
  const status = document.getElementById("voiceStatus");
  btn.classList.add("active");
  status.textContent = "Listening… speak now.";
  let finalText = "";
  rec.onresult = e=>{
    let interim = "";
    for(let i=e.resultIndex;i<e.results.length;i++){
      const txt = e.results[i][0].transcript;
      if(e.results[i].isFinal) finalText += txt;
      else interim += txt;
    }
    status.textContent = interim ? `Hearing: ${interim}` : "Transcribing…";
  };
  rec.onend = ()=>{
    if(finalText){
      const t = document.getElementById("descriptionInput");
      t.value = `${t.value ? t.value + " " : ""}${finalText}`.trim();
      status.textContent = "Voice added to description.";
    }else status.textContent = "No speech captured. Try again.";
    btn.classList.remove("active");
  };
  rec.onerror = ()=>{
    btn.classList.remove("active");
    status.textContent = "Voice input stopped.";
  };
  rec.start();
}

function setLanguage(lang){
  state.language = lang;
  const messages = {
    en: "Language set to English.",
    hi: "भाषा हिन्दी पर सेट है।",
    te: "భాష తెలుగుగా మార్చబడింది।"
  };
  toast(messages[lang] || messages.en);
}

function capitalize(s){return s ? s.charAt(0).toUpperCase()+s.slice(1) : s}
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}

setupUploads();
renderHistory();
