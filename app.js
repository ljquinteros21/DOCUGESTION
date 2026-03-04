const { useState, useRef, useEffect } = React;

const SHEET_ID = "1MkR17FiDZ8GXeRI_WSpXykkFRRhM7y-HBnM4iyytvvo";
const CLIENT_ID = "484884391845-4ioescn65dq17r6bs9mj5fnlhfl6kaq2.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";

const MODULES = [
  { id: "Facturas",  label: "Facturas",     icon: "🧾", color: "#6366f1" },
  { id: "Remitos",   label: "Remitos",      icon: "📦", color: "#0ea5e9" },
  { id: "OT",        label: "Órd. Trabajo", icon: "🔧", color: "#f59e0b" },
  { id: "OE",        label: "Órd. Entrega", icon: "🚚", color: "#10b981" },
  { id: "ML",        label: "Etiq. ML",     icon: "🛒", color: "#f97316" },
  { id: "TN",        label: "Etiq. TN",     icon: "🏪", color: "#8b5cf6" },
  { id: "CA",        label: "Correo Arg.",  icon: "✉️", color: "#ec4899" },
  { id: "ZN",        label: "Zipnova",      icon: "⚡", color: "#14b8a6" },
];

const FIELDS = {
  Facturas: ["Número", "Fecha", "Cliente", "CUIT", "Monto", "Estado"],
  Remitos:  ["Número", "Fecha", "Cliente", "Dirección", "Bultos", "Estado"],
  OT:       ["Número de Orden", "CUIT", "Cliente", "DNI/CUIT Cliente", "Teléfono", "Email", "Fecha de Recepción", "Fecha de Entrega", "Equipo", "Modelo", "Reporte Inicial", "Diagnóstico", "Solución Aplicada", "Estado"],
  OE:       ["Número", "Fecha", "Destinatario", "Dirección", "Estado"],
  ML:       ["Código de Envío", "Ref. ID Venta", "Fecha", "Remitente", "Nota", "Estado"],
  TN:       ["Número de Orden", "Fecha", "Cliente", "Teléfono", "DNI", "Producto", "SKU", "Cantidad", "Medio de Pago", "Estado"],
  CA:       ["Número de Envío", "Código Sucursal", "Fecha", "Destinatario", "Domicilio", "CP Destino", "Referencia", "Estado"],
  ZN:       ["Guía Zipnova", "Cuenta", "Destinatario", "Domicilio", "Localidad", "CP Destino", "Bulto", "ID Move", "Control", "Nota", "Estado"],
};

const ESTADOS = ["Pendiente", "En proceso", "Completado", "Cancelado"];

// ── Sheets helpers ──────────────────────────────────────────────────────────

function getToken() { return window._gtoken || ""; }

async function sheetsReq(path, method = "GET", body = null) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

async function ensureSheet(name) {
  const meta = await sheetsReq("");
  const exists = meta.sheets?.some(s => s.properties.title === name);
  if (!exists) {
    await sheetsReq(":batchUpdate", "POST", {
      requests: [{ addSheet: { properties: { title: name } } }],
    });
    await sheetsReq(`/values/${name}!A1:append?valueInputOption=RAW`, "POST", {
      values: [["_id", ...FIELDS[name], "_img"]],
    });
  }
}

async function readSheet(name) {
  const res = await sheetsReq(`/values/${name}`);
  const rows = res.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ""; });
    return obj;
  });
}

async function appendRow(name, rec) {
  const row = [rec._id, ...FIELDS[name].map(f => rec[f] || ""), rec._img || ""];
  await sheetsReq(`/values/${name}!A1:append?valueInputOption=RAW`, "POST", { values: [row] });
}

async function updateRow(name, rec) {
  const res = await sheetsReq(`/values/${name}`);
  const rows = res.values || [];
  const idx = rows.findIndex(r => r[0] === String(rec._id));
  if (idx === -1) return;
  const row = [rec._id, ...FIELDS[name].map(f => rec[f] || ""), rec._img || ""];
  await sheetsReq(`/values/${name}!A${idx + 1}?valueInputOption=RAW`, "PUT", { values: [row] });
}

async function deleteRow(name, id) {
  const meta = await sheetsReq("");
  const sheet = meta.sheets?.find(s => s.properties.title === name);
  if (!sheet) return;
  const sheetId = sheet.properties.sheetId;
  const res = await sheetsReq(`/values/${name}`);
  const rows = res.values || [];
  const idx = rows.findIndex(r => r[0] === String(id));
  if (idx === -1) return;
  await sheetsReq(":batchUpdate", "POST", {
    requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: idx, endIndex: idx + 1 } } }],
  });
}

// ── OCR helper ───────────────────────────────────────────────────────────────

function parseOCR(text, moduleId) {
  const fields = FIELDS[moduleId];
  const result = {};
  fields.forEach(f => { result[f] = ""; });
  text.split("\n").forEach(line => {
    fields.forEach(f => {
      const m = line.match(new RegExp(f + "[:\\s]+(.+)", "i"));
      if (m) result[f] = m[1].trim();
    });
  });
  return result;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const S = {
  app:        { fontFamily: "Inter,system-ui,sans-serif", background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column" },
  topbar:     { background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 16px", height: 56, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100 },
  logo:       { fontWeight: 700, fontSize: 17, color: "#1e293b", flex: 1 },
  main:       { flex: 1, padding: 16, maxWidth: 700, margin: "0 auto", width: "100%" },
  card:       { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.07)", padding: 16, marginBottom: 14 },
  h2:         { fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "0 0 14px" },
  grid:       { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10, marginBottom: 16 },
  row:        { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  input:      { flex: 1, minWidth: 120, border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", background: "#f8fafc" },
  select:     { border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 10px", fontSize: 14, background: "#f8fafc", outline: "none" },
  table:      { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:         { textAlign: "left", padding: "8px 10px", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #f1f5f9", cursor: "pointer", whiteSpace: "nowrap" },
  td:         { padding: "9px 10px", borderBottom: "1px solid #f8fafc", color: "#334155", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  formGroup:  { marginBottom: 14 },
  label:      { display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 5 },
  formInput:  { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", background: "#f8fafc" },
  scanBox:    { border: "2px dashed #e2e8f0", borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", marginBottom: 16, background: "#f8fafc" },
  imgPrev:    { width: "100%", borderRadius: 10, marginBottom: 12, maxHeight: 200, objectFit: "contain" },
  detailRow:  { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 },
  recentItem: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f8fafc" },
  toast:      { position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(0,0,0,.2)" },
  loginBox:   { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: 20, padding: 24 },
  btn: (color = "#6366f1", ghost = false) => ({
    background: ghost ? "transparent" : color,
    color: ghost ? color : "#fff",
    border: ghost ? `1.5px solid ${color}` : "none",
    borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  }),
  statCard: color => ({ background: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", borderTop: `3px solid ${color}`, cursor: "pointer" }),
  badge: st => {
    const map = { Pendiente: "#fef3c7:#92400e", "En proceso": "#dbeafe:#1e40af", Completado: "#d1fae5:#065f46", Cancelado: "#fee2e2:#991b1b" };
    const [bg, color] = (map[st] || "#f1f5f9:#334155").split(":");
    return { background: bg, color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, display: "inline-block" };
  },
  fab: color => ({ position: "fixed", bottom: 24, right: 20, width: 54, height: 54, borderRadius: "50%", background: color, color: "#fff", border: "none", fontSize: 26, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,.18)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }),
  sidebarItem: (active, color) => ({ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", cursor: "pointer", background: active ? "#f1f5f9" : "none", borderLeft: active ? `3px solid ${color}` : "3px solid transparent", color: active ? "#1e293b" : "#64748b", fontWeight: active ? 600 : 400, fontSize: 14 }),
};

const REQUIRED_FIELDS = {
  OT: ["Número de Orden", "Cliente", "Equipo"],
  OE: ["Destinatario", "Dirección"],
  Facturas: ["Número", "Cliente"],
  Remitos: ["Número", "Cliente"],
  ML: ["Código de Envío", "Ref. ID Venta"],
};

function getIlegibles(moduleId, formData) {
  return (REQUIRED_FIELDS[moduleId] || []).filter(f => !formData[f] || formData[f].trim() === "" || formData[f].trim().toUpperCase() === "ILEGIBLE");
}



function ApiKeyInput({ current, onSave }) {
  const [val, setVal] = useState(current || "");
  return React.createElement("div", { style: { marginTop: 10 } },
    React.createElement("input", {
      type: "password",
      placeholder: "sk-ant-...",
      value: val,
      onChange: e => setVal(e.target.value),
      style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }
    }),
    React.createElement("button", {
      style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" },
      onClick: () => onSave(val)
    }, "💾 Guardar key"),
    React.createElement("div", { style: { fontSize: 11, color: "#94a3b8", marginTop: 6 } }, "Se guarda solo en este dispositivo.")
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [auth, setAuth]               = useState("idle"); // idle | loading | ready | error
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalResults, setGlobalResults] = useState(null);
  const [apiKey, setApiKey]           = useState(localStorage.getItem("anthropic_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [activeModule, setActiveMod]  = useState("Facturas");
  const [data, setData]               = useState({});
  const [view, setView]               = useState("dashboard");
  const [formData, setFormData]       = useState({});
  const [editId, setEditId]           = useState(null);
  const [search, setSearch]           = useState("");
  const [filterEstado, setFilter]     = useState("");
  const [sortField, setSortField]     = useState("Fecha");
  const [sortDir, setSortDir]         = useState("desc");
  const [detailItem, setDetailItem]   = useState(null);
  const [ocrLoading, setOcrLoading]   = useState(false);
  const [ocrError, setOcrError]       = useState("");
  const [imgPreview, setImgPreview]   = useState(null);
  const [sidebarOpen, setSidebar]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [loadingMod, setLoadingMod]   = useState(false);
  const [toast, setToast]             = useState("");
  const fileRef = useRef();

  const mod    = MODULES.find(m => m.id === activeModule);
  const fields = FIELDS[activeModule];

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2800); };

  // ── Auth ──
  const handleLogin = () => {
    setAuth("loading");
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async resp => {
        if (resp.error) { setAuth("error"); return; }
        window._gtoken = resp.access_token;
        setAuth("ready");
        await loadAll();
      },
    });
    client.requestAccessToken();
  };

  const handleLogout = () => { window._gtoken = null; setAuth("idle"); setData({}); };

  const saveApiKey = key => { localStorage.setItem("anthropic_key", key); setApiKey(key); setShowKeyInput(false); };

  // ── Data loading ──
  const loadAll = async () => {
    setLoadingMod(true);
    const next = {};
    for (const m of MODULES) {
      try { await ensureSheet(m.id); next[m.id] = await readSheet(m.id); }
      catch { next[m.id] = []; }
    }
    setData(next);
    setLoadingMod(false);
  };

  const loadModule = async id => {
    setLoadingMod(true);
    try { await ensureSheet(id); setData(p => ({ ...p, [id]: [] })); const rows = await readSheet(id); setData(p => ({ ...p, [id]: rows })); }
    catch {}
    setLoadingMod(false);
  };

  // ── Records ──
  const records  = data[activeModule] || [];
  const filtered = records
    .filter(r => !search || Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())))
    .filter(r => !filterEstado || r["Estado"] === filterEstado)
    .sort((a, b) => {
      const va = a[sortField] || "", vb = b[sortField] || "";
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const openForm = (item = null) => {
    if (item) { setFormData({ ...item }); setEditId(item._id); }
    else {
      const empty = {};
      fields.forEach(f => { empty[f] = ""; });
      empty["Estado"] = "Pendiente";
      empty["Fecha"]  = new Date().toISOString().slice(0, 10);
      setFormData(empty); setEditId(null);
    }
    setImgPreview(null); setOcrError(""); setView("form");
  };

  const saveRecord = async () => {
    setSaving(true);
    const rec = { ...formData, _id: editId || Date.now(), _img: imgPreview || "" };
    try {
      if (editId) await updateRow(activeModule, rec);
      else        await appendRow(activeModule, rec);
      setData(p => {
        const list = (p[activeModule] || []).filter(r => r._id !== String(editId) && r._id !== editId);
        return { ...p, [activeModule]: [rec, ...list] };
      });
      showToast("✅ Guardado correctamente");
      setView("list");
    } catch { showToast("❌ Error al guardar"); }
    setSaving(false);
    setImgPreview(null);
  };

  const deleteRecord = async id => {
    setSaving(true);
    try {
      await deleteRow(activeModule, id);
      setData(p => ({ ...p, [activeModule]: p[activeModule].filter(r => r._id !== String(id) && r._id !== id) }));
      showToast("🗑️ Eliminado");
      if (view === "detail") setView("list");
    } catch { showToast("❌ Error al eliminar"); }
    setSaving(false);
  };

  // ── OCR ──
  const handleCapture = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setOcrLoading(true); setOcrError("");
    const reader = new FileReader();
    reader.onload = async ev => {
      const b64 = ev.target.result.split(",")[1];
      setImgPreview(ev.target.result);
      try {
  const moduleInstructions = {
    OT: `Es una Orden de Servicio Técnico de Equus Tecnología S.R.L. Buscá:
- "Orden de Servicio N°" → Número de Orden
- "C.U.I.T." de la empresa → CUIT
- "CLIENTE:" → Cliente
- "DNI / CUIT:" → DNI/CUIT Cliente
- "TEL.:" → Teléfono
- "CORREO ELECTRÓNICO:" → Email
- "FECHA DE RECEPCIÓN:" → Fecha de Recepción
- "FECHA DE ENTREGA:" → Fecha de Entrega
- "EQUIPO:" → Equipo
- "MODELO:" → Modelo
- "REPORTE INICIAL:" → Reporte Inicial
- "DIAGNOSTICO:" → Diagnóstico
- "SOLUCIÓN APLICADA:" → Solución Aplicada`,
    TN: `Es una orden de retiro de Tienda Nube de Equus Tecnología. Buscá:
- "Orden #" → Número de Orden (solo el número, ej: 9602)
- "Realizada el" → Fecha
- "Entregar a:" → Cliente
- "Teléfono:" → Teléfono
- El número de DNI → DNI
- El nombre del producto en negrita → Producto
- "SKU:" → SKU
- La cantidad a la derecha del producto → Cantidad
- "Medio de pago:" → Medio de Pago`,
- El número largo bajo el código de barras → Código de Envío
- "Ref. ID:" → Ref. ID Venta
- La fecha en formato "DD/MM/YYYY" → Fecha
- El nombre del remitente si aparece (puede no estar) → Remitente
- Cualquier texto manuscrito o nota adicional → Nota`,
- El número largo bajo el código de barras → Número de Envío
- El código de sucursal como "FBA01" → Código Sucursal
- La fecha en formato "DD/MM/YYYY" → Fecha
- El nombre del destinatario en la parte inferior → Destinatario
- "Domicilio:" → Domicilio
- "CP:" → CP Destino
- "Referencia:" → Referencia`,
    ZN: `Es una etiqueta de Zipnova. Buscá:
- "# GUÍA ZIPNOVA" → Guía Zipnova
- "Cuenta" → Cuenta
- "Destinatario:" → Destinatario
- "Domicilio:" → Domicilio
- "Localidad:" → Localidad
- "CP" → CP Destino
- "BULTO" → Bulto
- "ID MOVE" → ID Move
- "CONTROL" → Control
- Texto manuscrito grande → Nota`,
  };
  const extraInstructions = moduleInstructions[activeModule] ? `\n\nInstrucciones específicas para este documento:\n${moduleInstructions[activeModule]}` : "";
 setOcrError("Configurá tu API key de Anthropic en el menú ⚙️ para usar el escáner."); setOcrLoading(false); return; }
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
              { type: "text", text: `Sos un asistente experto en documentos comerciales argentinos. Analizá esta imagen y extraé los siguientes campos: ${fields.join(", ")}.

Reglas:
- Respondé SOLO con cada campo en formato "Campo: valor", uno por línea.
- Si un campo está presente pero es ilegible, escribí "Campo: ILEGIBLE".
- Si un campo directamente no existe en el documento, no lo incluyas.
- Capturá todo el texto aunque esté manuscrito o poco claro.
- No agregues explicaciones ni texto extra.${extraInstructions}` },
            ]}],
          }),
        });
        const json = await res.json();
        const txt  = json.content?.map(c => c.text || "").join("\n") || "";
        const parsed = parseOCR(txt, activeModule);
        setFormData(p => { const m = { ...p }; Object.keys(parsed).forEach(k => { if (parsed[k]) m[k] = parsed[k]; }); return m; });
      } catch { setOcrError("No se pudo procesar la imagen. Completá los datos manualmente."); }
      setOcrLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const doGlobalSearch = q => {
    if (!q.trim()) { setGlobalResults(null); return; }
    const results = {};
    MODULES.forEach(m => {
      const hits = (data[m.id] || []).filter(r =>
        ["Cliente","Destinatario","CUIT"].some(f => String(r[f] || "").toLowerCase().includes(q.toLowerCase()))
      );
      if (hits.length) results[m.id] = { ...m, hits };
    });
    setGlobalResults(results);
  };


  const totalByMod = MODULES.map(m => ({ ...m, count: (data[m.id] || []).length }));
  const recentAll  = MODULES.flatMap(m => (data[m.id] || []).map(r => ({ ...r, _modLabel: m.label, _modColor: m.color }))).slice(0, 8);

  // ── Login screen ──
  if (auth !== "ready") return (
    React.createElement("div", { style: S.app },
      React.createElement("div", { style: S.topbar }, React.createElement("span", { style: S.logo }, "DocGestión")),
      React.createElement("div", { style: S.loginBox },
        React.createElement("div", { style: { fontSize: 56 } }, "📋"),
        React.createElement("div", { style: { fontWeight: 700, fontSize: 22, color: "#1e293b", textAlign: "center" } }, "Gestión Documental"),
        React.createElement("div", { style: { color: "#64748b", fontSize: 15, textAlign: "center", maxWidth: 300 } }, "Conectate con Google para acceder a los documentos compartidos del equipo en tiempo real."),
        auth === "error" && React.createElement("div", { style: { color: "#ef4444", fontSize: 14 } }, "Error al conectar. Intentá de nuevo."),
        React.createElement("button", {
          style: { ...S.btn("#4285F4"), display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", fontSize: 16, borderRadius: 10 },
          onClick: handleLogin, disabled: auth === "loading",
        }, React.createElement("span", { style: { fontSize: 20 } }, "🔑"), auth === "loading" ? "Conectando..." : "Iniciar sesión con Google"),
        React.createElement("div", { style: { fontSize: 12, color: "#94a3b8", textAlign: "center", maxWidth: 280 } }, "Los datos se guardan en Google Sheets. Todos los miembros del equipo ven la misma información."),
      )
    )
  );

  // ── Main app ──
  return (
    React.createElement("div", { style: S.app },
      toast && React.createElement("div", { style: S.toast }, toast),

      // Topbar
      React.createElement("div", { style: S.topbar },
        React.createElement("button", { style: { background: "none", border: "none", fontSize: 22, cursor: "pointer" }, onClick: () => setSidebar(true) }, "☰"),
        React.createElement("span", { style: S.logo }, "DocGestión"),
        React.createElement("button", { style: S.btn(mod.color), onClick: () => setView("dashboard") }, "Dashboard"),
      ),

      // Sidebar overlay
      React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 200, display: sidebarOpen ? "block" : "none" }, onClick: () => setSidebar(false) }),

      // Sidebar
      React.createElement("div", { style: { position: "fixed", left: sidebarOpen ? 0 : -280, top: 0, bottom: 0, width: 260, background: "#fff", zIndex: 300, boxShadow: "4px 0 20px rgba(0,0,0,.1)", transition: "left .25s", padding: "20px 0", overflowY: "auto" } },
        React.createElement("div", { style: { padding: "0 20px 16px", borderBottom: "1px solid #f1f5f9", marginBottom: 8 } },
          React.createElement("div", { style: { fontWeight: 700, fontSize: 16, color: "#1e293b" } }, "Módulos"),
        ),
        ...MODULES.map(m =>
          React.createElement("div", {
            key: m.id,
            style: S.sidebarItem(activeModule === m.id && view !== "dashboard", m.color),
            onClick: () => { setActiveMod(m.id); setView("list"); setSearch(""); setFilter(""); setSidebar(false); loadModule(m.id); },
          },
            React.createElement("span", { style: { fontSize: 18 } }, m.icon),
            React.createElement("span", null, m.label),
            React.createElement("span", { style: { marginLeft: "auto", background: "#f1f5f9", borderRadius: 20, padding: "1px 8px", fontSize: 12, color: "#64748b" } }, (data[m.id] || []).length),
          )
        ),
        React.createElement("div", { style: { padding: "16px 20px", borderTop: "1px solid #f1f5f9", marginTop: 8 } },
          React.createElement("button", { style: { ...S.btn("#64748b", true), width: "100%", fontSize: 13 }, onClick: handleLogout }, "🔓 Cerrar sesión"),
        React.createElement("div", { style: { padding: "12px 20px" } },
          React.createElement("button", { style: { ...S.btn("#6366f1", true), width: "100%", fontSize: 13 }, onClick: () => setShowKeyInput(v => !v) }, "⚙️ API Key Anthropic"),
          showKeyInput && React.createElement(ApiKeyInput, { current: apiKey, onSave: saveApiKey }),
        ),
        ),
      ),

      // Main content
      React.createElement("div", { style: S.main },
        loadingMod && React.createElement("div", { style: { textAlign: "center", padding: 30, color: "#6366f1", fontWeight: 600 } }, "⏳ Cargando datos..."),

        // Dashboard
        !loadingMod && view === "dashboard" && React.createElement(React.Fragment, null,
          React.createElement("h2", { style: S.h2 }, "📊 Dashboard"),

          // Buscador global
          React.createElement("div", { style: { ...S.card, marginBottom: 16 } },
            React.createElement("div", { style: { fontWeight: 600, fontSize: 14, color: "#475569", marginBottom: 10 } }, "🔍 Buscar en todos los módulos"),
            React.createElement("div", { style: { display: "flex", gap: 8 } },
              React.createElement("input", {
                style: { ...S.input, flex: 1 },
                placeholder: "Nombre de cliente, destinatario, CUIT...",
                value: globalSearch,
                onChange: e => { setGlobalSearch(e.target.value); doGlobalSearch(e.target.value); },
              }),
              globalSearch && React.createElement("button", {
                style: S.btn("#64748b", true),
                onClick: () => { setGlobalSearch(""); setGlobalResults(null); }
              }, "✕"),
            ),
            // Resultados
            globalResults && React.createElement("div", { style: { marginTop: 14 } },
              Object.keys(globalResults).length === 0
                ? React.createElement("div", { style: { color: "#94a3b8", fontSize: 14 } }, "Sin resultados.")
                : Object.values(globalResults).map(({ id, label, icon, color, hits }) =>
                    React.createElement("div", { key: id, style: { marginBottom: 14 } },
                      React.createElement("div", { style: { fontWeight: 700, fontSize: 13, color, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 } },
                        React.createElement("span", null, icon), label,
                        React.createElement("span", { style: { background: "#f1f5f9", borderRadius: 20, padding: "1px 8px", fontSize: 11, color: "#64748b", fontWeight: 400 } }, `${hits.length} resultado${hits.length > 1 ? "s" : ""}`),
                      ),
                      ...hits.map((r, i) =>
                        React.createElement("div", {
                          key: i,
                          style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#f8fafc", borderRadius: 8, marginBottom: 6, cursor: "pointer" },
                          onClick: () => { setActiveMod(id); setDetailItem(r); setView("detail"); setGlobalSearch(""); setGlobalResults(null); }
                        },
                          React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                            React.createElement("div", { style: { fontWeight: 600, fontSize: 13, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                              r["Cliente"] || r["Destinatario"] || "—"
                            ),
                            React.createElement("div", { style: { fontSize: 12, color: "#64748b" } },
                              `N° ${r["Número"] || r["Número de Envío"] || "—"} · ${r["Fecha"] || "—"}`
                            ),
                          ),
                          r["Estado"] && React.createElement("span", { style: S.badge(r["Estado"]) }, r["Estado"]),
                        )
                      )
                    )
                  )
            ),
          ),

          React.createElement("div", { style: S.grid },
            ...totalByMod.map(m =>
              React.createElement("div", { key: m.id, style: S.statCard(m.color), onClick: () => { setActiveMod(m.id); setView("list"); } },
                React.createElement("div", { style: { fontSize: 20 } }, m.icon),
                React.createElement("div", { style: { fontSize: 24, fontWeight: 700, color: "#1e293b" } }, m.count),
                React.createElement("div", { style: { fontSize: 12, color: "#64748b", marginTop: 2 } }, m.label),
              )
            )
          ),
          React.createElement("div", { style: S.card },
            React.createElement("h2", { style: { ...S.h2, marginBottom: 8 } }, "Actividad reciente"),
            recentAll.length === 0
              ? React.createElement("div", { style: { color: "#94a3b8", fontSize: 14 } }, "Sin registros aún.")
              : recentAll.map((r, i) =>
                  React.createElement("div", { key: i, style: S.recentItem },
                    React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: r._modColor, display: "inline-block", flexShrink: 0 } }),
                    React.createElement("span", { style: { fontSize: 12, color: "#64748b", flexShrink: 0 } }, r._modLabel),
                    React.createElement("span", { style: { fontSize: 13, color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                      `${r["Número"] || r["Número de Envío"] || "Sin número"} — ${r["Cliente"] || r["Destinatario"] || ""}`
                    ),
                    r["Estado"] && React.createElement("span", { style: S.badge(r["Estado"]) }, r["Estado"]),
                  )
                )
          ),
        ),

        // List
        !loadingMod && view === "list" && React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 } },
            React.createElement("span", { style: { fontSize: 22 } }, mod.icon),
            React.createElement("h2", { style: { ...S.h2, margin: 0 } }, mod.label),
            React.createElement("button", { style: { ...S.btn(mod.color, true), marginLeft: "auto", padding: "7px 12px", fontSize: 13 }, onClick: () => loadModule(activeModule) }, "🔄 Actualizar"),
          ),
          React.createElement("div", { style: S.row },
            React.createElement("input", { style: S.input, placeholder: "Buscar...", value: search, onChange: e => setSearch(e.target.value) }),
            React.createElement("select", { style: S.select, value: filterEstado, onChange: e => setFilter(e.target.value) },
              React.createElement("option", { value: "" }, "Todos"),
              ...ESTADOS.map(e => React.createElement("option", { key: e }, e)),
            ),
          ),
          filtered.length === 0
            ? React.createElement("div", { style: { color: "#94a3b8", fontSize: 14, padding: "20px 0" } }, "Sin registros. Tocá + para agregar uno.")
            : React.createElement("div", { style: { overflowX: "auto" } },
                React.createElement("table", { style: S.table },
                  React.createElement("thead", null,
                    React.createElement("tr", null,
                      ...fields.slice(0, 4).map(f =>
                        React.createElement("th", { key: f, style: S.th, onClick: () => { setSortField(f); setSortDir(d => d === "asc" ? "desc" : "asc"); } },
                          `${f} ${sortField === f ? (sortDir === "asc" ? "↑" : "↓") : ""}`)
                      ),
                      React.createElement("th", { style: S.th }, "Acciones"),
                    )
                  ),
                  React.createElement("tbody", null,
                    ...filtered.map((r, i) =>
                      React.createElement("tr", { key: i, style: { cursor: "pointer" }, onClick: () => { setDetailItem(r); setView("detail"); } },
                        ...fields.slice(0, 4).map(f =>
                          React.createElement("td", { key: f, style: S.td },
                            f === "Estado" ? React.createElement("span", { style: S.badge(r[f]) }, r[f]) : (r[f] || "—")
                          )
                        ),
                        React.createElement("td", { style: S.td, onClick: e => e.stopPropagation() },
                          React.createElement("button", { style: { ...S.btn(mod.color, true), padding: "5px 10px", fontSize: 12, marginRight: 4 }, onClick: () => openForm(r) }, "✏️"),
                          React.createElement("button", { style: { ...S.btn("#ef4444", true), padding: "5px 10px", fontSize: 12 }, onClick: () => deleteRecord(r._id) }, "🗑️"),
                        ),
                      )
                    )
                  ),
                )
              ),
        ),

        // Form
        view === "form" && React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } },
            React.createElement("button", { style: { ...S.btn("#64748b", true), padding: "7px 12px" }, onClick: () => setView("list") }, "← Volver"),
            React.createElement("h2", { style: { ...S.h2, margin: 0 } }, `${editId ? "Editar" : "Nuevo"} ${mod.label}`),
          ),
          !editId && React.createElement("div", { style: S.scanBox, onClick: () => fileRef.current.click() },
            ocrLoading
              ? React.createElement("div", { style: { color: "#6366f1" } }, "🔍 Analizando imagen con IA...")
              : React.createElement(React.Fragment, null,
                  React.createElement("div", { style: { fontSize: 32 } }, "📷"),
                  React.createElement("div", { style: { fontWeight: 600, color: "#334155", marginTop: 6 } }, "Escanear documento"),
                  React.createElement("div", { style: { fontSize: 12, color: "#94a3b8", marginTop: 4 } }, "Tocá para abrir la cámara o elegir foto"),
                ),
            React.createElement("input", { ref: fileRef, type: "file", accept: "image/*", capture: "environment", style: { display: "none" }, onChange: handleCapture }),
          ),
          ocrError && React.createElement("div", { style: { color: "#ef4444", fontSize: 13, marginBottom: 12 } }, ocrError),
          imgPreview && React.createElement("img", { src: imgPreview, alt: "preview", style: S.imgPrev }),
          React.createElement("div", { style: S.card },
            ...fields.map(f => {
              const ilegible = (formData[f] || "").trim().toUpperCase() === "ILEGIBLE" || ((REQUIRED_FIELDS[activeModule] || []).includes(f) && !formData[f]);
              return React.createElement("div", { key: f, style: S.formGroup },
                React.createElement("label", { style: { ...S.label, color: ilegible ? "#ef4444" : "#475569" } },
                  f, ilegible && " ⚠️ Requerido — completá este campo"
                ),
                f === "Estado"
                  ? React.createElement("select", { style: S.formInput, value: formData[f] || "", onChange: e => setFormData(p => ({ ...p, [f]: e.target.value })) },
                      ...ESTADOS.map(e => React.createElement("option", { key: e }, e))
                    )
                  : f === "Fecha"
                  ? React.createElement("input", { type: "date", style: S.formInput, value: formData[f] || "", onChange: e => setFormData(p => ({ ...p, [f]: e.target.value })) })
                  : React.createElement("input", {
                      style: { ...S.formInput, borderColor: ilegible ? "#ef4444" : "#e2e8f0", background: ilegible ? "#fff5f5" : "#f8fafc" },
                      value: formData[f] === "ILEGIBLE" ? "" : (formData[f] || ""),
                      onChange: e => setFormData(p => ({ ...p, [f]: e.target.value })),
                      placeholder: ilegible ? `⚠️ Completá ${f.toLowerCase()} manualmente...` : `Ingresá ${f.toLowerCase()}...`
                    }),
              );
            }),
            getIlegibles(activeModule, formData).length > 0 && React.createElement("div", {
              style: { background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#92400e" }
            }, `⚠️ Completá los campos marcados antes de guardar: ${getIlegibles(activeModule, formData).join(", ")}`),
            React.createElement("button", {
              style: { ...S.btn(mod.color), width: "100%", padding: 12, opacity: (saving || getIlegibles(activeModule, formData).length > 0) ? 0.5 : 1 },
              onClick: saveRecord,
              disabled: saving || getIlegibles(activeModule, formData).length > 0
            }, saving ? "Guardando..." : "💾 Guardar en Google Sheets"),
          ),
        ),

        // Detail
        view === "detail" && detailItem && React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } },
            React.createElement("button", { style: { ...S.btn("#64748b", true), padding: "7px 12px" }, onClick: () => setView("list") }, "← Volver"),
            React.createElement("h2", { style: { ...S.h2, margin: 0 } }, "Detalle"),
          ),
          detailItem._img && React.createElement("img", { src: detailItem._img, alt: "doc", style: S.imgPrev }),
          React.createElement("div", { style: S.card },
            ...fields.map(f =>
              React.createElement("div", { key: f, style: S.detailRow },
                React.createElement("span", { style: { color: "#64748b", fontWeight: 600 } }, f),
                React.createElement("span", { style: { color: "#1e293b" } },
                  f === "Estado" ? React.createElement("span", { style: S.badge(detailItem[f]) }, detailItem[f]) : (detailItem[f] || "—")
                ),
              )
            ),
          ),
          React.createElement("div", { style: { display: "flex", gap: 8 } },
            React.createElement("button", { style: { ...S.btn(mod.color, true), flex: 1 }, onClick: () => openForm(detailItem) }, "✏️ Editar"),
            React.createElement("button", { style: { ...S.btn("#ef4444", true), flex: 1 }, onClick: () => deleteRecord(detailItem._id) }, "🗑️ Eliminar"),
          ),
        ),
      ),

      // FAB
      (view === "list" || view === "detail") && React.createElement("button", { style: S.fab(mod.color), onClick: () => openForm() }, "＋"),
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
