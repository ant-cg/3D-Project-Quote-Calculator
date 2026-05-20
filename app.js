// ─── app.js ───────────────────────────────────────────────────────────────────
// Boots after config.json loads (falls back to built-in defaults if absent).

fetch("config.json")
  .then(r => r.json())
  .then(cfg => init(cfg))
  .catch(() => init(null));

// ─────────────────────────────────────────────────────────────────────────────
function init(cfg) {

  // ── Config / defaults ──────────────────────────────────────────────────────
  const baseRates = cfg?.baseRates ?? {
    modeling: 150, texturing: 100, shaders: 120,
    rigging:  180, animation: 160, blueprints: 200, vfx: 180
  }; // ! USE config.json to override these defaults, not hardcoded values in the app!

  const COMPLEXITY_MULTS = cfg?.complexityMultipliers ?? {
    1: 0.6, 2: 0.85, 3: 1.0, 4: 1.4, 5: 2.0
  };

  const SCOPE_MULTS = cfg?.scopeMultipliers ?? {
    micro: 0.5,
    small: 1.0,
    large: 1.4,
    massive: 2.0
  };

  const assetLevels = cfg?.assetUsageLevels ?? {
    none:    { discount: 0.00 },
    partial: { discount: 0.20 },
    mostly:  { discount: 0.40 }
  };

  const BASE_MIN     = cfg?.baseMinimum        ?? 80;
  const CLEANUP_COST = cfg?.cleanupCost        ?? 150;
  const IP_DISC      = cfg?.ipDiscountMultiplier ?? 0.85;

  // Timeline pricing:
  //   ≥ 30 days  → 0.85× (client gets a patience discount)
  //   15–29 days → 1.00× (standard)
  //   8–14 days  → 1.25× (tighter)
  //   5–7 days   → 1.50× (urgent, minimum accepted)
  //   < 5 days   → rejected
  const TIMELINE_BANDS = [
    { minDays: 30, multiplier: 0.85, label: "Long timeline (30 + days)",       cls: "discount" },
    { minDays: 15, multiplier: 1.00, label: "Standard timeline (15–29 days)",  cls: ""         },
    { minDays:  8, multiplier: 1.25, label: "Short timeline (8–14 days)",      cls: "penalty"  },
    { minDays:  5, multiplier: 1.50, label: "Urgent timeline (5–7 days)",      cls: "penalty"  },
  ];
  const MIN_DAYS = 5;

  // Populate client tiers
  const tierSelect = document.getElementById("clientTier");
  const tiers = cfg?.clientTiers ?? {
    low: { label: "Personal / Commission", multiplier: 0.8 },
    mid: { label: "Startup / Studio", multiplier: 1.0 },
    enterprise: { label: "Enterprise / Publisher", multiplier: 1.5 }
  };

  Object.entries(tiers).forEach(([key, data]) => {
    const opt = document.createElement("option");
    opt.value = data.multiplier;
    opt.textContent = data.label;
    if (key === "mid") opt.selected = true;
    tierSelect.appendChild(opt);
  });

  // ── Country → region tier (multiplier) ────────────────────────────────────
  // Users cannot select this — it is determined automatically by IP.
  const countryTierMap = {
    // ── Very high purchasing power ─────────────────────────
    US:1.00, CA:0.95, GB:0.95, AU:0.95, NZ:0.90,
    DE:0.95, FR:0.92, NL:0.95, SE:0.95, NO:1.00,
    DK:1.00, FI:0.95, CH:1.00, AT:0.95, BE:0.93,
    IE:1.00, LU:1.00, IS:0.95,
    JP:0.95, SG:1.00, KR:0.95, HK:0.95, TW:0.90,

    // ── High income ────────────────────────────────────────
    AE:1.00, QA:1.00, KW:0.95, SA:0.90, IL:0.90,

    // ── Upper-middle income ────────────────────────────────
    ES:0.85, IT:0.85, PT:0.80,

    PL:0.80, CZ:0.85, SI:0.85, SK:0.80,
    HU:0.75, HR:0.75, RO:0.75, BG:0.70,
    RS:0.70, UA:0.65,

    CL:0.80, UY:0.80,
    PA:0.75, CR:0.75,
    MX:0.70, BR:0.70,
    AR:0.65, CO:0.65, PE:0.65, EC:0.65,
    GT:0.60,

    TR:0.70,
    MA:0.65, TN:0.65, DZ:0.65,
    JO:0.70, LB:0.65,

    ZA:0.65,

    // ── Middle income ──────────────────────────────────────
    MY:0.75, TH:0.70, CN:0.70,
    ID:0.60, PH:0.60, VN:0.60,

    KZ:0.70, AZ:0.65, GE:0.65, UZ:0.60,

    // ── Lower income ───────────────────────────────────────
    IN:0.50, BD:0.45, PK:0.45, LK:0.55, NP:0.45,
    KH:0.50, LA:0.50, MM:0.50,

    NG:0.50, KE:0.50, GH:0.50,
    TZ:0.45, ET:0.45, UG:0.45,
    SN:0.50, CI:0.50, CM:0.50,
    ZW:0.45, MZ:0.45, MG:0.45, ZM:0.45
  };

  function getRegionLabel(mult) {
    if (mult >= 0.95) return "Standard pricing";
    if (mult >= 0.85) return "High purchasing power adjustment";
    if (mult >= 0.70) return "Regional purchasing power adjustment";
    if (mult >= 0.55) return "Emerging market pricing";
    return "Low income region pricing";
  }

  // Detected region state
  let detectedRegionMult  = 1.00;
  let detectedRegionLabel = "";
  let detectedCountryName = "";

  // ── Helpers for new asset‑group architecture ─────────────────────────────────
  const REUSE_FACTORS = {
    modeling: 0.6, texturing: 0.5, shaders: 0.6,
    rigging: 0.7, animation: 0.9
  };

  function getComplexityMult(v) {
    return COMPLEXITY_MULTS[v] ?? 1;
  }

  const PRESETS = {
    Prop:       {modeling:true,texturing:true,shaders:true,rigging:false,animation:false,complexity:3},
    'Hero Prop':{modeling:true,texturing:true,shaders:true,rigging:false,animation:false,complexity:4},
    Character:  {modeling:true,texturing:true,shaders:true,rigging:true,animation:false,complexity:4},
    Creature:   {modeling:true,texturing:true,shaders:true,rigging:true,animation:false,complexity:5},
    Animation:  {modeling:false,texturing:false,shaders:false,rigging:false,animation:true,complexity:3},
    Environment:{modeling:true,texturing:true,shaders:false,rigging:false,animation:false,complexity:2},
    Custom:     {}
  };

  const PROJECT_TASK_RATES = cfg?.projectTaskRates ?? {
    sceneAssembly: 80, lighting:70, rendering:60, compositing:50,
    blueprint:40, optimization:50
  };

  const assetTableBody = document.querySelector('#assetGroups tbody');
  const addAssetBtn = document.getElementById('addAssetGroup');

  function applyPresetToRow(row, presetName) {
    const preset = PRESETS[presetName] || {};
    ['modeling','texturing','shaders','rigging','animation'].forEach(t => {
      const cb = row.querySelector(`.task-${t}`);
      if (cb) cb.checked = !!preset[t];
    });
    const compEl = row.querySelector('.asset-complexity');
    if (compEl && preset.complexity) compEl.value = preset.complexity;
    const nameEl = row.querySelector('.asset-name');
    if (nameEl && !nameEl.value && presetName) nameEl.value = presetName;
  }

  function createAssetRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select class="preset">
          <option value="">Custom</option>
          <option value="Prop">Prop</option>
          <option value="Hero Prop">Hero Prop</option>
          <option value="Character">Character</option>
          <option value="Creature">Creature</option>
          <option value="Animation">Animation</option>
          <option value="Environment">Environment</option>
        </select>
        <input type="text" class="asset-name" placeholder="Name"/>
      </td>
      <td><input type="number" class="asset-qty" value="1" min="1"/></td>
      <td><input type="checkbox" class="task-modeling"/></td>
      <td><input type="checkbox" class="task-texturing"/></td>
      <td><input type="checkbox" class="task-shaders"/></td>
      <td><input type="checkbox" class="task-rigging"/></td>
      <td><input type="checkbox" class="task-animation"/></td>
      <td>
        <select class="asset-complexity">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3" selected>3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
      </td>
      <td>
        <select class="asset-scope">
          <option value="micro">Micro</option>
          <option value="small" selected>Small</option>
          <option value="large">Large</option>
          <option value="massive">Massive</option>
        </select>
      </td>
      <td><button type="button" class="remove-asset">×</button></td>
    `;
    tr.querySelector('.preset').addEventListener('change', e => applyPresetToRow(tr, e.target.value));
    tr.querySelector('.remove-asset').addEventListener('click', () => {
      tr.remove();
      calculateQuote();
    });
    tr.querySelectorAll('input, select').forEach(el => el.addEventListener('change', calculateQuote));
    assetTableBody.appendChild(tr);
    calculateQuote();
    return tr;
  }

  addAssetBtn?.addEventListener('click', createAssetRow);

  // recalc when general inputs change
  document.querySelectorAll('#projectSetup input, #projectSetup select, #projectTasks input, #projectTasks select, #pricingModifiers input').forEach(el =>{
    el.addEventListener('change', calculateQuote);
  });

  // ── Summary accordion ──────────────────────────────────────────────────────
  const summaryToggle = document.getElementById("summaryToggle");
  const summaryBody   = document.getElementById("summaryBody");
  summaryToggle?.addEventListener("click", () => {
    summaryToggle.classList.toggle("open");
    summaryBody.classList.toggle("open");
  });

  // ── Set due date min to tomorrow + 4 (= 5 days from today inclusive) ───────
  const dueDateEl    = document.getElementById("dueDate");
  const dueDateError = document.getElementById("dueDateError");

  (function setDateConstraints() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1); // start date is always tomorrow
    const minDue = new Date(tomorrow);
    minDue.setDate(minDue.getDate() + (MIN_DAYS - 1)); // earliest due = tomorrow + 4
    dueDateEl.min = fmt(minDue);
  })();

  function fmt(d) {
    return d.toISOString().split("T")[0];
  }

  // ── Manual country selector (datalist) ───────────────────────────────────
  const countrySelect = document.getElementById("countrySelect");
  const countryInfo   = document.getElementById("countryInfo");
  if (countrySelect) {
    const regionNamer = new Intl.DisplayNames(['en'], {type: 'region'});
    const codes = Object.keys(countryTierMap).sort((a, b) => {
      return regionNamer.of(a).localeCompare(regionNamer.of(b));
    });
    codes.forEach(code => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${regionNamer.of(code)} (${code})`;
      countrySelect.appendChild(opt);
    });

    countrySelect.addEventListener('change', () => {
      const code = countrySelect.value;
      if (!code || !countryTierMap[code]) {
        detectedRegionMult  = 1.00;
        detectedRegionLabel = '';
        detectedCountryName = '';
        countryInfo.textContent = '';
        calculateQuote();
        return;
      }
      const mult = countryTierMap[code];
      detectedRegionMult  = mult;
      detectedRegionLabel = getRegionLabel(mult);
      detectedCountryName = regionNamer.of(code);
      countryInfo.textContent = `${detectedCountryName} — ${detectedRegionLabel}.`;
      calculateQuote();
    });
  }

  // ── Snapshot for PDF ───────────────────────────────────────────────────────
  let lastSnapshot = null;

  // ── Calculate ──────────────────────────────────────────────────────────────
  function calculateQuote() {
    // Clear previous errors
    dueDateEl.classList.remove("input-error");
    dueDateError.classList.remove("visible");
    dueDateError.textContent = "";

    // ── Validate due date ────────────────────────────────────────────────────
    const dueVal = dueDateEl.value;
    if (!dueVal) {
      dueDateEl.classList.add("input-error");
      dueDateError.textContent = "Please select a project due date.";
      dueDateError.classList.add("visible");
      dueDateEl.focus();
      return;
    }

    const today    = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const dueDate  = new Date(dueVal);

    const days = Math.round((dueDate - tomorrow) / 86400000) + 1; // inclusive of start

    if (days < MIN_DAYS) {
      dueDateEl.classList.add("input-error");
      dueDateError.textContent = `Minimum project length is ${MIN_DAYS} days. Please select a later date.`;
      dueDateError.classList.add("visible");
      return;
    }

    // ── Find timeline band ───────────────────────────────────────────────────
    let timelineMult  = 1.00;
    let timelineLabel = "";
    let timelineCls   = "";
    for (const band of TIMELINE_BANDS) {
      if (days >= band.minDays) {
        timelineMult  = band.multiplier;
        timelineLabel = band.label;
        timelineCls   = band.cls;
        break;
      }
    }

    // ── Compute work cost ────────────────────────────────────────────────────
    const lines = [];
    let subtotal = 0;

    // asset groups
    const rows = assetTableBody.querySelectorAll('tr');
    if (rows.length === 0) {
      alert("Please add at least one asset group.");
      return;
    }
    rows.forEach(tr => {
      const name = tr.querySelector('.asset-name').value || 'Unnamed';
      const qty = parseInt(tr.querySelector('.asset-qty').value) || 1;
      const comp = parseInt(tr.querySelector('.asset-complexity').value) || 1;
      const compMult = getComplexityMult(comp);
      const scopeVal = tr.querySelector('.asset-scope')?.value ?? "small";
      const scopeMult = SCOPE_MULTS[scopeVal] ?? 1;
      let groupCost = 0;
      const tasksDone = [];
      ['modeling','texturing','shaders','rigging','animation'].forEach(task => {
        const cb = tr.querySelector(`.task-${task}`);
        if (cb && cb.checked) {
          const base = baseRates[task] || 0;
          const reuse = REUSE_FACTORS[task] || 0;
          const cost = base * compMult * scopeMult * (1 + (qty - 1) * reuse);
          groupCost += cost;
          tasksDone.push(capitalize(task));
        }
      });
      if (tasksDone.length) {
        subtotal += groupCost;
        lines.push({ label: `${name} (${qty}) — ${tasksDone.join(' + ')}`, value: groupCost, cls: "" });
      }
    });

    // project‑wide tasks
    document.querySelectorAll('.proj-task').forEach(cb => {
      if (!cb.checked) return;
      const key = cb.value;
      const cost = PROJECT_TASK_RATES[key] || baseRates[key] || 0;
      subtotal += cost;
      lines.push({ label: capitalize(key.replace(/([A-Z])/g,' $1')), value: cost, cls: "" });
    });

    // ── Asset usage discount ───────────────────────────────────────────────
    const assetVal  = document.querySelector('input[name="assetUsage"]:checked')?.value ?? "none";
    const discount  = assetLevels[assetVal]?.discount ?? 0;
    if (discount > 0) {
      const save = subtotal * discount;
      subtotal  -= save;
      if (subtotal < BASE_MIN) subtotal = BASE_MIN;
      lines.push({ label: `Asset usage discount (−${Math.round(discount*100)}%)`, value: -save, cls: "discount" });
    }

    // ── Client tier ──────────────────────────────────────────────────────────
    const tierMult = Number(document.getElementById("clientTier").value);
    const tierText = document.getElementById("clientTier").selectedOptions[0]?.text ?? "";
    if (tierMult !== 1) {
      const delta = subtotal * (tierMult - 1);
      lines.push({ label: `Client tier — ${tierText}`, value: delta, cls: tierMult > 1 ? "penalty" : "discount" });
    }
    subtotal *= tierMult;

    // ── Timeline multiplier ───────────────────────────────────────────────────
    if (timelineMult !== 1) {
      const delta = subtotal * (timelineMult - 1);
      lines.push({ label: `${timelineLabel} (×${timelineMult.toFixed(2)})`, value: delta, cls: timelineCls });
    }
    subtotal *= timelineMult;

    // ── Country / region ──────────────────────────────────────────────────────
    if (detectedRegionMult !== 1) {
      const delta = subtotal * (detectedRegionMult - 1);
      lines.push({ label: `${detectedRegionLabel} (${detectedCountryName})`, value: delta, cls: "discount" });
    }
    subtotal *= detectedRegionMult;

    // ── IP rights discount ────────────────────────────────────────────────────
    if (document.getElementById("ipOwnership").checked) {
      const delta = subtotal * (IP_DISC - 1);
      lines.push({ label: "Artist keeps IP rights (−15%)", value: delta, cls: "discount" });
      subtotal *= IP_DISC;
    }

    const protectedTotal = Math.max(subtotal, BASE_MIN);
    const total = Math.round(protectedTotal);

    // ── Display price ─────────────────────────────────────────────────────────
    document.getElementById("price").textContent = "$" + total.toLocaleString();
    document.getElementById("priceNote").textContent =
      `Based on ${days}-day timeline (tomorrow → ${dueVal}). Final quote confirmed after project discovery.`;

    // Region badge
    const badge = document.getElementById("regionBadge");
    if (detectedRegionLabel) {
      badge.textContent = detectedRegionLabel;
      badge.classList.add("visible");
    }

    // ── Build summary HTML ────────────────────────────────────────────────────
    let html = "";
    lines.forEach(l => {
      const sign = l.value >= 0 ? "+" : "−";
      const abs  = Math.abs(Math.round(l.value)).toLocaleString();
      const mod  = l.cls ? ` summary-row--${l.cls}` : "";
      html += `<div class="summary-row${mod}">
        <span class="s-label">${l.label}</span>
        <span class="s-value">${sign}$${abs}</span>
      </div>`;
    });
    html += `<div class="summary-row summary-row--total">
      <span class="s-label">Total Estimate</span>
      <span class="s-value">$${total.toLocaleString()}</span>
    </div>`;
    summaryBody.innerHTML = html;

    // Auto-open summary
    summaryToggle.classList.add("open");
    summaryBody.classList.add("open");

    // Show result block
    const resultEl = document.getElementById("quoteResult");
    resultEl.classList.add("visible");

    // Save for PDF
    lastSnapshot = { total, lines, days, dueVal };
  }

  // ── PDF download ───────────────────────────────────────────────────────────
  document.getElementById("downloadPdf")?.addEventListener("click", () => {
    if (!lastSnapshot) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();

    // Background
    doc.setFillColor(10, 10, 12);
    doc.rect(0, 0, W, H, "F");

    // Top accent bar
    doc.setFillColor(200, 255, 87);
    doc.rect(0, 0, W, 5, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(234, 234, 240);
    doc.text("3D Project Quote", 48, 56);

    // Subtitle
    const now = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 110);
    doc.text(`Generated: ${now}`, 48, 74);
    if (lastSnapshot.dueVal) {
      doc.text(`Timeline: ${lastSnapshot.days} days  |  Due: ${lastSnapshot.dueVal}`, 48, 88);
    }

    // Divider
    doc.setDrawColor(37, 37, 48);
    doc.line(48, 100, W - 48, 100);

    // Line items
    let y = 124;
    doc.setFontSize(10);

    lastSnapshot.lines.forEach(l => {
      const sign  = l.value >= 0 ? "+" : "−";
      const abs   = Math.abs(Math.round(l.value)).toLocaleString();
      let r = 234, g = 234, b = 240; // default text color
      if (l.cls === "discount") { r = 200; g = 255; b = 87;  }
      if (l.cls === "penalty")  { r = 255; g = 95;  b = 95;  }

      doc.setTextColor(152, 152, 170);
      doc.text(l.label, 48, y);
      doc.setTextColor(r, g, b);
      doc.text(`${sign}$${abs}`, W - 48, y, { align: "right" });
      y += 24;
    });

    // Total box
    y += 8;
    doc.setFillColor(24, 24, 30);
    doc.roundedRect(40, y - 18, W - 80, 38, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(234, 234, 240);
    doc.text("Total Estimate", 56, y + 9);
    doc.setTextColor(200, 255, 87);
    doc.text(`$${lastSnapshot.total.toLocaleString()}`, W - 56, y + 9, { align: "right" });

    // Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 110);
    doc.text("This is an estimate. Final pricing confirmed after project discovery.", 48, H - 36);

    doc.save("3d-project-quote.pdf");
  });

  document.getElementById("calculateBtn")?.addEventListener("click", calculateQuote);
}

// ── Utility ────────────────────────────────────────────────────────────────────
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
