const { useState, useRef, useEffect } = React;

const SHEET_ID = "1MkR17FiDZ8GXeRI_WSpXykkFRRhM7y-HBnM4iyytvvo";
const CLIENT_ID = "484884391845-4ioescn65dq17r6bs9mj5fnlhfl6kaq2.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";
const SESSION_KEY = "docgestion_session";
const SESSION_DAYS = 7;

const OT_ESTADOS = ["Ingresado","Diagnóstico","Presupuestado","Aprobado","En reparación","Completado","Retirado"];
const OT_ROLES = {
  recepcion: { label: "Recepción", icon: "🗂️" },
  mecanico:  { label: "Mecánico",  icon: "🔧" },
  encargado: { label: "Encargado", icon: "💼" },
};

const MODULES = [
  { id: "Facturas", label: "Facturas",     icon: "🧾", color: "#6366f1" },
  { id: "Remitos",  label: "Remitos",      icon: "📦", color: "#0ea5e9" },
  { id: "OT",       label: "Órd. Trabajo", icon: "🔧", color: "#f59e0b" },
  { id: "OE",       label: "Órd. Entrega", icon: "🚚", color: "#10b981" },
  { id: "ML",       label: "Etiq. ML",     icon: "🛒", color: "#f97316" },
  { id: "TN",       label: "Etiq. TN",     icon: "🏪", color: "#8b5cf6" },
  { id: "CA",       label: "Correo Arg.",  icon: "✉️", color: "#ec4899" },
  { id: "ZN",       label: "Zipnova",      icon: "⚡", color: "#14b8a6" },
];

const FIELDS = {
  Facturas: ["Número","Fecha","Cliente","CUIT","Monto","Estado"],
  Remitos:  ["Número","Fecha","Cliente","Dirección","Bultos","Estado"],
  OT:       ["Número de Orden","CUIT","Cliente","DNI/CUIT Cliente","Teléfono","Email","Fecha de Recepción","Fecha de Entrega","Equipo","Modelo","Reporte Inicial","Diagnóstico","Repuestos Necesarios","Repuestos Precios","Mano de Obra","Total Presupuesto","Fecha Estimada Fin","Solución Aplicada","Monto Pagado","Forma de Pago","Estado"],
  OE:       ["Número","Fecha","Destinatario","Dirección","Estado"],
  ML:       ["Código de Envío","Ref. ID Venta","Fecha","Remitente","Nota","Estado"],
  TN:       ["Número de Orden","Fecha","Cliente","Teléfono","DNI","Producto","SKU","Cantidad","Medio de Pago","Estado"],
  CA:       ["Número de Envío","Código Sucursal","Fecha","Destinatario","Domicilio","CP Destino","Referencia","Estado"],
  ZN:       ["Guía Zipnova","Cuenta","Destinatario","Domicilio","Localidad","CP Destino","Bulto","ID Move","Control","Nota","Estado"],
};

const ESTADOS = ["Pendiente","En proceso","Completado","Cancelado"];

const REQUIRED_FIELDS = {
  OT:       ["Número de Orden","Cliente","Equipo"],
  OE:       ["Destinatario","Dirección"],
  Facturas: ["Número","Cliente"],
  Remitos:  ["Número","Cliente"],
  CA:       ["Número de Envío","Destinatario"],
  ZN:       ["Guía Zipnova","Destinatario"],
  ML:       ["Código de Envío","Ref. ID Venta"],
  TN:       ["Número de Orden","Cliente"],
};

const OCR_INSTRUCTIONS = {
  OT: "Es una Orden de Servicio Técnico de Equus Tecnología S.R.L. Busca: campo 'Orden de Servicio N' para Número de Orden. Campo 'C.U.I.T.' para CUIT. Campo 'CLIENTE' para Cliente. Campo 'DNI / CUIT' para DNI/CUIT Cliente. Campo 'TEL.' para Teléfono. Campo 'CORREO ELECTRONICO' para Email. Campo 'FECHA DE RECEPCION' para Fecha de Recepción. Campo 'FECHA DE ENTREGA' para Fecha de Entrega. Campo 'EQUIPO' para Equipo. Campo 'MODELO' para Modelo. Campo 'REPORTE INICIAL' para Reporte Inicial. Campo 'DIAGNOSTICO' para Diagnóstico. Campo 'SOLUCION APLICADA' para Solución Aplicada.",
  TN: "Es una orden de retiro de Tienda Nube. Busca: 'Orden #' seguido del número para Número de Orden. 'Realizada el' para Fecha. 'Entregar a:' para Cliente. 'Teléfono:' para Teléfono. El número de DNI para DNI. El nombre del producto en negrita para Producto. 'SKU:' para SKU. La cantidad numérica junto al producto para Cantidad. 'Medio de pago:' para Medio de Pago.",
  ML: "Es una etiqueta de devolución de MercadoLibre. Busca: el número largo debajo del código de barras para Código de Envío. El campo 'Ref. ID' para Ref. ID Venta. La fecha en formato DD/MM/YYYY para Fecha. El nombre del remitente si aparece para Remitente. Cualquier texto manuscrito para Nota.",
  CA: "Es una etiqueta de Correo Argentino. Busca: el número largo debajo del código de barras para Número de Envío. El código alfanumérico corto como FBA01 para Código Sucursal. La fecha en formato DD/MM/YYYY para Fecha. El nombre del destinatario en la sección inferior para Destinatario. El domicilio del destinatario para Domicilio. El código postal CP para CP Destino. El campo Referencia para Referencia.",
  ZN: "Es una etiqueta de Zipnova. Busca: el campo 'GUIA ZIPNOVA' para Guía Zipnova. El campo 'Cuenta' para Cuenta. El campo 'Destinatario' para Destinatario. El campo 'Domicilio' para Domicilio. El campo 'Localidad' para Localidad. El código CP para CP Destino. El campo 'BULTO' para Bulto. El campo 'ID MOVE' para ID Move. El campo 'CONTROL' para Control. El texto manuscrito grande para Nota.",
};

function getIlegibles(moduleId, formData) {
  return (REQUIRED_FIELDS[moduleId] || []).filter(f => !formData[f] || formData[f].trim() === "" || formData[f].trim().toUpperCase() === "ILEGIBLE");
}

function parseOCR(text, moduleId) {
  const fields = FIELDS[moduleId] || [];
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

function getToken() { return window._gtoken || ""; }

async function sheetsReq(path, method, body) {
  method = method || "GET";
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + SHEET_ID + path, {
    method: method,
    headers: { "Authorization": "Bearer " + getToken(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

async function ensureSheet(name) {
  const meta = await sheetsReq("");
  const exists = meta.sheets && meta.sheets.some(function(s) { return s.properties.title === name; });
  if (!exists) {
    await sheetsReq(":batchUpdate", "POST", { requests: [{ addSheet: { properties: { title: name } } }] });
    await sheetsReq("/values/" + name + "!A1:append?valueInputOption=RAW", "POST", { values: [["_id"].concat(FIELDS[name] || []).concat(["_img"])] });
  }
}

async function readSheet(name) {
  const res = await sheetsReq("/values/" + name);
  const rows = res.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i] || ""; });
    return obj;
  });
}

async function appendRow(name, rec) {
  const fields = FIELDS[name] || [];
  const row = [rec._id].concat(fields.map(function(f) { return rec[f] || ""; })).concat([rec._img || ""]);
  await sheetsReq("/values/" + name + "!A1:append?valueInputOption=RAW", "POST", { values: [row] });
}

async function updateRow(name, rec) {
  const res = await sheetsReq("/values/" + name);
  const rows = res.values || [];
  const idx = rows.findIndex(function(r) { return r[0] === String(rec._id); });
  if (idx === -1) return;
  const fields = FIELDS[name] || [];
  const row = [rec._id].concat(fields.map(function(f) { return rec[f] || ""; })).concat([rec._img || ""]);
  await sheetsReq("/values/" + name + "!A" + (idx + 1) + "?valueInputOption=RAW", "PUT", { values: [row] });
}

async function deleteRow(name, id) {
  const meta = await sheetsReq("");
  const sheet = meta.sheets && meta.sheets.find(function(s) { return s.properties.title === name; });
  if (!sheet) return;
  const sheetId = sheet.properties.sheetId;
  const res = await sheetsReq("/values/" + name);
  const rows = res.values || [];
  const idx = rows.findIndex(function(r) { return r[0] === String(id); });
  if (idx === -1) return;
  await sheetsReq(":batchUpdate", "POST", { requests: [{ deleteDimension: { range: { sheetId: sheetId, dimension: "ROWS", startIndex: idx, endIndex: idx + 1 } } }] });
}

function isSessionValid() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return false;
  try {
    const data = JSON.parse(saved);
    return (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24) < SESSION_DAYS;
  } catch(e) { return false; }
}

const S = {
  app:       { fontFamily: "Inter,system-ui,sans-serif", background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column" },
  topbar:    { background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 16px", height: 56, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100 },
  logo:      { fontWeight: 700, fontSize: 17, color: "#1e293b", flex: 1 },
  main:      { flex: 1, padding: 16, maxWidth: 700, margin: "0 auto", width: "100%" },
  card:      { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.07)", padding: 16, marginBottom: 14 },
  h2:        { fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "0 0 14px" },
  grid:      { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10, marginBottom: 16 },
  row:       { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  input:     { flex: 1, minWidth: 120, border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", background: "#f8fafc" },
  select:    { border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 10px", fontSize: 14, background: "#f8fafc", outline: "none" },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:        { textAlign: "left", padding: "8px 10px", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #f1f5f9", cursor: "pointer", whiteSpace: "nowrap" },
  td:        { padding: "9px 10px", borderBottom: "1px solid #f8fafc", color: "#334155", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  formGroup: { marginBottom: 14 },
  label:     { display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 5 },
  formInput: { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", background: "#f8fafc", boxSizing: "border-box" },
  scanBox:   { border: "2px dashed #e2e8f0", borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", marginBottom: 16, background: "#f8fafc" },
  imgPrev:   { width: "100%", borderRadius: 10, marginBottom: 12, maxHeight: 200, objectFit: "contain" },
  detailRow: { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 },
  recentItem:{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f8fafc" },
  toast:     { position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(0,0,0,.2)" },
  loginBox:  { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: 20, padding: 24 },
  btn: function(color, ghost) {
    color = color || "#6366f1";
    return { background: ghost ? "transparent" : color, color: ghost ? color : "#fff", border: ghost ? ("1.5px solid " + color) : "none", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
  },
  statCard: function(color) {
    return { background: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", borderTop: "3px solid " + color, cursor: "pointer" };
  },
  badge: function(st) {
    const map = { "Pendiente": "#fef3c7:#92400e", "En proceso": "#dbeafe:#1e40af", "Completado": "#d1fae5:#065f46", "Cancelado": "#fee2e2:#991b1b", "Ingresado": "#e0f2fe:#0369a1", "Diagnóstico": "#fef3c7:#92400e", "Presupuestado": "#ede9fe:#5b21b6", "Aprobado": "#dcfce7:#166534", "En reparación": "#ffedd5:#9a3412", "Retirado": "#f1f5f9:#334155" };
    const parts = (map[st] || "#f1f5f9:#334155").split(":");
    return { background: parts[0], color: parts[1], borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, display: "inline-block" };
  },
  fab: function(color) {
    return { position: "fixed", bottom: 24, right: 20, width: 54, height: 54, borderRadius: "50%", background: color, color: "#fff", border: "none", fontSize: 26, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,.18)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" };
  },
  sidebarItem: function(active, color) {
    return { display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", cursor: "pointer", background: active ? "#f1f5f9" : "none", borderLeft: active ? ("3px solid " + color) : "3px solid transparent", color: active ? "#1e293b" : "#64748b", fontWeight: active ? 600 : 400, fontSize: 14 };
  },
};

function OTDetail(props) {
  const rec = props.rec;
  const onSave = props.onSave;
  const onBack = props.onBack;
  const role = props.role;
  const [d, setD] = useState(Object.assign({}, rec));
  const [saving, setSaving] = useState(false);
  const estado = d["Estado"] || "Ingresado";

  const fld = function(label, key, type, placeholder) {
    type = type || "text";
    placeholder = placeholder || "";
    return React.createElement("div", { style: { marginBottom: 12 } },
      React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4 } }, label),
      type === "textarea"
        ? React.createElement("textarea", { rows: 3, style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", background: "#f8fafc", resize: "vertical", boxSizing: "border-box" }, value: d[key] || "", onChange: function(e) { setD(function(p) { const n = Object.assign({}, p); n[key] = e.target.value; return n; }); }, placeholder: placeholder })
        : React.createElement("input", { type: type, style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", background: "#f8fafc", boxSizing: "border-box" }, value: d[key] || "", onChange: function(e) { setD(function(p) { const n = Object.assign({}, p); n[key] = e.target.value; return n; }); }, placeholder: placeholder })
    );
  };

  const rdFld = function(label, key) {
    return React.createElement("div", { style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 } },
      React.createElement("span", { style: { color: "#64748b", fontWeight: 600, flexShrink: 0, marginRight: 12 } }, label),
      React.createElement("span", { style: { color: "#1e293b", textAlign: "right" } }, d[key] || "—")
    );
  };

  const sec = function(title, content) {
    return React.createElement("div", { style: { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.07)", padding: 16, marginBottom: 14 } },
      React.createElement("div", { style: { fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #f1f5f9" } }, title),
      content
    );
  };

  const advance = async function(nextEstado, extra) {
    setSaving(true);
    const merged = Object.assign({}, d, extra || {}, { Estado: nextEstado });
    await onSave(merged);
    setSaving(false);
  };

  const statusBadge = React.createElement("span", { style: S.badge(estado) }, estado);

  const infoCliente = sec("👤 Datos del Cliente",
    React.createElement(React.Fragment, null, rdFld("Cliente","Cliente"), rdFld("Teléfono","Teléfono"), rdFld("Email","Email"), rdFld("DNI/CUIT","DNI/CUIT Cliente"), rdFld("Fecha Recepción","Fecha de Recepción"))
  );

  const infoEquipo = sec("⚙️ Equipo",
    React.createElement(React.Fragment, null, rdFld("Equipo","Equipo"), rdFld("Modelo","Modelo"), rdFld("Reporte Inicial","Reporte Inicial"))
  );

  const showDiagForm = (estado === "Ingresado" || estado === "Diagnóstico") && role === "mecanico";
  const showDiagRead = ["Presupuestado","Aprobado","En reparación","Completado","Retirado"].indexOf(estado) >= 0;
  const showPresupForm = estado === "Presupuestado" && role === "encargado";
  const showPresupRead = ["Aprobado","En reparación","Completado","Retirado"].indexOf(estado) >= 0;
  const showIniciarRep = estado === "Aprobado" && role === "mecanico";
  const showFinalizarRep = estado === "En reparación" && role === "mecanico";
  const showTrabajoRead = ["Completado","Retirado"].indexOf(estado) >= 0;
  const showEntrega = estado === "Completado" && role === "recepcion";

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } },
      React.createElement("button", { style: { background: "none", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 14 }, onClick: onBack }, "← Volver"),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontWeight: 700, fontSize: 16, color: "#1e293b" } }, "OT #" + (d["Número de Orden"] || "—")),
        React.createElement("div", { style: { marginTop: 4 } }, statusBadge)
      )
    ),
    infoCliente,
    infoEquipo,
    showDiagForm && sec("🔍 Diagnóstico",
      React.createElement(React.Fragment, null,
        fld("Falla encontrada","Diagnóstico","textarea","Describí la falla encontrada..."),
        fld("Repuestos necesarios","Repuestos Necesarios","textarea","Listá los repuestos necesarios..."),
        React.createElement("button", { style: { background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 4 }, onClick: function() { advance("Presupuestado"); }, disabled: saving }, saving ? "Guardando..." : "📋 Enviar a presupuestar")
      )
    ),
    showDiagRead && sec("🔍 Diagnóstico",
      React.createElement(React.Fragment, null, rdFld("Falla encontrada","Diagnóstico"), rdFld("Repuestos necesarios","Repuestos Necesarios"))
    ),
    showPresupForm && sec("💰 Presupuesto",
      React.createElement(React.Fragment, null,
        fld("Detalle repuestos y precios","Repuestos Precios","textarea","Ej: Carbones x2 $5000, Rodamiento $3200..."),
        fld("Mano de obra ($)","Mano de Obra","text","0"),
        fld("Total presupuesto ($)","Total Presupuesto","text","0"),
        React.createElement("button", { style: { background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 4 }, onClick: function() { advance("Aprobado"); }, disabled: saving }, saving ? "Guardando..." : "✅ Marcar como aprobado por cliente")
      )
    ),
    showPresupRead && sec("💰 Presupuesto",
      React.createElement(React.Fragment, null, rdFld("Repuestos","Repuestos Precios"), rdFld("Mano de obra","Mano de Obra"), rdFld("Total","Total Presupuesto"))
    ),
    showIniciarRep && sec("🔧 Iniciar Reparación",
      React.createElement(React.Fragment, null,
        fld("Fecha estimada de finalización","Fecha Estimada Fin","date"),
        React.createElement("button", { style: { background: "#f97316", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 4 }, onClick: function() { advance("En reparación"); }, disabled: saving }, saving ? "Guardando..." : "🔧 Iniciar reparación")
      )
    ),
    showFinalizarRep && sec("🔧 Finalizar Reparación",
      React.createElement(React.Fragment, null,
        rdFld("Fecha estimada fin","Fecha Estimada Fin"),
        fld("Solución aplicada","Solución Aplicada","textarea","Describí lo que se hizo..."),
        React.createElement("button", { style: { background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 4 }, onClick: function() { advance("Completado"); }, disabled: saving }, saving ? "Guardando..." : "✔️ Marcar como completado")
      )
    ),
    showTrabajoRead && sec("🔧 Trabajo realizado",
      React.createElement(React.Fragment, null, rdFld("Fecha estimada fin","Fecha Estimada Fin"), rdFld("Solución aplicada","Solución Aplicada"))
    ),
    showEntrega && sec("📦 Entrega y Pago",
      React.createElement(React.Fragment, null,
        React.createElement("div", { style: { background: "#d1fae5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#065f46", fontWeight: 600 } }, "✔️ Reparación completada — Total: $" + (d["Total Presupuesto"] || "—")),
        fld("Monto cobrado ($)","Monto Pagado","text","0"),
        React.createElement("div", { style: { marginBottom: 12 } },
          React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4 } }, "Forma de pago"),
          React.createElement("select", { style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 14, background: "#f8fafc", outline: "none" }, value: d["Forma de Pago"] || "", onChange: function(e) { setD(function(p) { const n = Object.assign({}, p); n["Forma de Pago"] = e.target.value; return n; }); } },
            React.createElement("option", { value: "" }, "Seleccioná..."),
            ["Efectivo","Transferencia","Tarjeta de débito","Tarjeta de crédito","MercadoPago"].map(function(f) { return React.createElement("option", { key: f }, f); })
          )
        ),
        React.createElement("button", { style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", width: "100%", opacity: (!d["Monto Pagado"] || !d["Forma de Pago"]) ? 0.5 : 1 }, onClick: function() { advance("Retirado"); }, disabled: saving || !d["Monto Pagado"] || !d["Forma de Pago"] }, saving ? "Guardando..." : "📦 Confirmar entrega y pago")
      )
    ),
    estado === "Retirado" && sec("📦 Entrega",
      React.createElement(React.Fragment, null,
        rdFld("Monto cobrado","Monto Pagado"),
        rdFld("Forma de pago","Forma de Pago"),
        React.createElement("div", { style: { background: "#f1f5f9", borderRadius: 8, padding: "10px 14px", marginTop: 8, fontSize: 13, color: "#334155", fontWeight: 600, textAlign: "center" } }, "✅ Equipo retirado y pago registrado")
      )
    )
  );
}

function ApiKeyInput(props) {
  const [val, setVal] = useState(props.current || "");
  return React.createElement("div", { style: { marginTop: 10 } },
    React.createElement("input", { type: "password", placeholder: "sk-ant-...", value: val, onChange: function(e) { setVal(e.target.value); }, style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8, boxSizing: "border-box" } }),
    React.createElement("button", { style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }, onClick: function() { props.onSave(val); } }, "💾 Guardar key"),
    React.createElement("div", { style: { fontSize: 11, color: "#94a3b8", marginTop: 6 } }, "Se guarda solo en este dispositivo.")
  );
}

function App() {
  const [auth, setAuth]             = useState("idle");
  const [role, setRole]             = useState(localStorage.getItem("docgestion_role") || "");
  const [apiKey, setApiKey]         = useState(localStorage.getItem("anthropic_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [activeModule, setActiveMod]= useState("Facturas");
  const [data, setData]             = useState({});
  const [view, setView]             = useState("dashboard");
  const [formData, setFormData]     = useState({});
  const [editId, setEditId]         = useState(null);
  const [search, setSearch]         = useState("");
  const [filterEstado, setFilter]   = useState("");
  const [sortField, setSortField]   = useState("Fecha");
  const [sortDir, setSortDir]       = useState("desc");
  const [detailItem, setDetailItem] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError]     = useState("");
  const [imgPreview, setImgPreview] = useState(null);
  const [sidebarOpen, setSidebar]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [loadingMod, setLoadingMod] = useState(false);
  const [toast, setToast]           = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalResults, setGlobalResults] = useState(null);
  const fileRef = useRef();

  const mod    = MODULES.find(function(m) { return m.id === activeModule; });
  const fields = FIELDS[activeModule] || [];

  const showToast = function(msg) { setToast(msg); setTimeout(function() { setToast(""); }, 2800); };

  useEffect(function() {
    if (isSessionValid()) {
      setAuth("loading");
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES, prompt: "",
        callback: async function(resp) {
          if (resp.error) { setAuth("idle"); return; }
          window._gtoken = resp.access_token;
          setAuth("ready");
          await loadAll();
        },
      });
      client.requestAccessToken();
    }
  }, []);

  const handleLogin = function() {
    setAuth("loading");
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPES,
      callback: async function(resp) {
        if (resp.error) { setAuth("error"); return; }
        window._gtoken = resp.access_token;
        localStorage.setItem(SESSION_KEY, JSON.stringify({ timestamp: Date.now() }));
        setAuth("ready");
        await loadAll();
      },
    });
    client.requestAccessToken();
  };

  const handleLogout = function() {
    window._gtoken = null;
    localStorage.removeItem(SESSION_KEY);
    setAuth("idle");
    setData({});
  };

  const saveRole = function(r) { localStorage.setItem("docgestion_role", r); setRole(r); };
  const saveApiKey = function(k) { localStorage.setItem("anthropic_key", k); setApiKey(k); setShowKeyInput(false); };

  const loadAll = async function() {
    setLoadingMod(true);
    const next = {};
    for (let i = 0; i < MODULES.length; i++) {
      const m = MODULES[i];
      try { await ensureSheet(m.id); next[m.id] = await readSheet(m.id); }
      catch(e) { next[m.id] = []; }
    }
    setData(next);
    setLoadingMod(false);
  };

  const loadModule = async function(id) {
    setLoadingMod(true);
    try { await ensureSheet(id); const rows = await readSheet(id); setData(function(p) { const n = Object.assign({}, p); n[id] = rows; return n; }); }
    catch(e) {}
    setLoadingMod(false);
  };

  const doGlobalSearch = function(q) {
    if (!q.trim()) { setGlobalResults(null); return; }
    const results = {};
    MODULES.forEach(function(m) {
      const hits = (data[m.id] || []).filter(function(r) {
        return ["Cliente","Destinatario","CUIT"].some(function(f) { return String(r[f] || "").toLowerCase().indexOf(q.toLowerCase()) >= 0; });
      });
      if (hits.length) results[m.id] = Object.assign({}, m, { hits: hits });
    });
    setGlobalResults(results);
  };

  const records = data[activeModule] || [];
  const filtered = records
    .filter(function(r) { return !search || Object.values(r).some(function(v) { return String(v).toLowerCase().indexOf(search.toLowerCase()) >= 0; }); })
    .filter(function(r) { return !filterEstado || r["Estado"] === filterEstado; })
    .sort(function(a, b) { const va = a[sortField] || "", vb = b[sortField] || ""; return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va); });

  const openForm = function(item) {
    if (item) { setFormData(Object.assign({}, item)); setEditId(item._id); }
    else {
      const empty = {};
      fields.forEach(function(f) { empty[f] = ""; });
      empty["Estado"] = "Pendiente";
      empty["Fecha"] = new Date().toISOString().slice(0, 10);
      if (activeModule === "OT") { empty["Estado"] = "Ingresado"; }
      setFormData(empty); setEditId(null);
    }
    setImgPreview(null); setOcrError(""); setView("form");
  };

  const saveRecord = async function() {
    setSaving(true);
    const rec = Object.assign({}, formData, { _id: editId || Date.now(), _img: imgPreview || "" });
    try {
      if (editId) await updateRow(activeModule, rec);
      else await appendRow(activeModule, rec);
      setData(function(p) {
        const list = (p[activeModule] || []).filter(function(r) { return r._id !== String(editId) && r._id !== editId; });
        const n = Object.assign({}, p); n[activeModule] = [rec].concat(list); return n;
      });
      showToast("✅ Guardado correctamente");
      setView("list");
    } catch(e) { showToast("❌ Error al guardar"); }
    setSaving(false); setImgPreview(null);
  };

  const saveOTRecord = async function(rec) {
    setSaving(true);
    try {
      const exists = (data["OT"] || []).some(function(r) { return r._id === rec._id || r._id === String(rec._id); });
      if (exists) await updateRow("OT", rec);
      else await appendRow("OT", rec);
      setData(function(p) {
        const list = (p["OT"] || []).filter(function(r) { return r._id !== String(rec._id) && r._id !== rec._id; });
        const n = Object.assign({}, p); n["OT"] = [rec].concat(list); return n;
      });
      showToast("✅ Guardado");
      setView("list");
    } catch(e) { showToast("❌ Error al guardar"); }
    setSaving(false);
  };

  const deleteRecord = async function(id) {
    setSaving(true);
    try {
      await deleteRow(activeModule, id);
      setData(function(p) { const n = Object.assign({}, p); n[activeModule] = p[activeModule].filter(function(r) { return r._id !== String(id) && r._id !== id; }); return n; });
      showToast("🗑️ Eliminado");
      if (view === "detail") setView("list");
    } catch(e) { showToast("❌ Error al eliminar"); }
    setSaving(false);
  };

  const handleCapture = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    setOcrLoading(true); setOcrError("");
    const reader = new FileReader();
    reader.onload = async function(ev) {
      const b64 = ev.target.result.split(",")[1];
      setImgPreview(ev.target.result);
      if (!apiKey) { setOcrError("Configurá tu API key de Anthropic en el menú ⚙️"); setOcrLoading(false); return; }
      try {
        const extra = OCR_INSTRUCTIONS[activeModule] ? " " + OCR_INSTRUCTIONS[activeModule] : "";
        const prompt = "Sos un asistente experto en documentos comerciales argentinos. Extraé los siguientes campos de esta imagen: " + fields.join(", ") + ". Reglas: responde SOLO con formato 'Campo: valor' uno por línea. Si un campo es ilegible escribe 'Campo: ILEGIBLE'. Si no existe no lo incluyas." + extra;
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } }, { type: "text", text: prompt }] }] })
        });
        const json = await res.json();
        const txt = (json.content || []).map(function(c) { return c.text || ""; }).join("\n");
        const parsed = parseOCR(txt, activeModule);
        setFormData(function(p) { const m = Object.assign({}, p); Object.keys(parsed).forEach(function(k) { if (parsed[k]) m[k] = parsed[k]; }); return m; });
      } catch(err) { setOcrError("No se pudo procesar la imagen. Completá los datos manualmente."); }
      setOcrLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const totalByMod = MODULES.map(function(m) { return Object.assign({}, m, { count: (data[m.id] || []).length }); });
  const recentAll  = MODULES.reduce(function(acc, m) { return acc.concat((data[m.id] || []).map(function(r) { return Object.assign({}, r, { _modLabel: m.label, _modColor: m.color }); })); }, []).slice(0, 8);

  if (auth !== "ready") return React.createElement("div", { style: S.app },
    React.createElement("div", { style: S.topbar }, React.createElement("span", { style: S.logo }, "DocGestión")),
    React.createElement("div", { style: S.loginBox },
      React.createElement("div", { style: { fontSize: 56 } }, "📋"),
      React.createElement("div", { style: { fontWeight: 700, fontSize: 22, color: "#1e293b" } }, "Gestión Documental"),
      React.createElement("div", { style: { color: "#64748b", fontSize: 15, textAlign: "center", maxWidth: 300 } }, "Conectate con Google para acceder a los documentos del equipo."),
      auth === "error" && React.createElement("div", { style: { color: "#ef4444", fontSize: 14 } }, "Error al conectar. Intentá de nuevo."),
      React.createElement("button", { style: Object.assign({}, S.btn("#4285F4"), { display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", fontSize: 16, borderRadius: 10 }), onClick: handleLogin, disabled: auth === "loading" },
        React.createElement("span", { style: { fontSize: 20 } }, "🔑"), auth === "loading" ? "Conectando..." : "Iniciar sesión con Google"
      )
    )
  );

  if (!role) return React.createElement("div", { style: S.app },
    React.createElement("div", { style: S.topbar }, React.createElement("span", { style: S.logo }, "DocGestión")),
    React.createElement("div", { style: S.loginBox },
      React.createElement("div", { style: { fontSize: 48 } }, "👋"),
      React.createElement("div", { style: { fontWeight: 700, fontSize: 20, color: "#1e293b" } }, "¿Cuál es tu rol?"),
      React.createElement("div", { style: { color: "#64748b", fontSize: 14, textAlign: "center" } }, "Define qué tareas ves en las Órdenes de Trabajo"),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 280 } },
        Object.entries(OT_ROLES).map(function(entry) {
          return React.createElement("button", { key: entry[0], style: Object.assign({}, S.btn("#6366f1"), { padding: "14px 20px", fontSize: 16, borderRadius: 12, display: "flex", alignItems: "center", gap: 12 }), onClick: function() { saveRole(entry[0]); } },
            React.createElement("span", { style: { fontSize: 24 } }, entry[1].icon), entry[1].label
          );
        })
      )
    )
  );

  if (activeModule === "OT" && view === "detail" && detailItem) return React.createElement("div", { style: S.app },
    React.createElement("div", { style: S.topbar },
      React.createElement("button", { style: { background: "none", border: "none", fontSize: 22, cursor: "pointer" }, onClick: function() { setSidebar(true); } }, "☰"),
      React.createElement("span", { style: S.logo }, "DocGestión"),
      React.createElement("span", { style: { fontSize: 13, color: "#64748b" } }, (OT_ROLES[role] ? OT_ROLES[role].icon : "") + " " + (OT_ROLES[role] ? OT_ROLES[role].label : ""))
    ),
    React.createElement("div", { style: S.main },
      React.createElement(OTDetail, { rec: detailItem, role: role, onBack: function() { setView("list"); }, onSave: saveOTRecord })
    )
  );

  const ilegibles = getIlegibles(activeModule, formData);

  return React.createElement("div", { style: S.app },
    toast && React.createElement("div", { style: S.toast }, toast),

    React.createElement("div", { style: S.topbar },
      React.createElement("button", { style: { background: "none", border: "none", fontSize: 22, cursor: "pointer" }, onClick: function() { setSidebar(true); } }, "☰"),
      React.createElement("span", { style: S.logo }, "DocGestión"),
      React.createElement("button", { style: S.btn(mod.color), onClick: function() { setView("dashboard"); } }, "Dashboard")
    ),

    React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 200, display: sidebarOpen ? "block" : "none" }, onClick: function() { setSidebar(false); } }),

    React.createElement("div", { style: { position: "fixed", left: sidebarOpen ? 0 : -280, top: 0, bottom: 0, width: 260, background: "#fff", zIndex: 300, boxShadow: "4px 0 20px rgba(0,0,0,.1)", transition: "left .25s", padding: "20px 0", overflowY: "auto" } },
      React.createElement("div", { style: { padding: "0 20px 16px", borderBottom: "1px solid #f1f5f9", marginBottom: 8 } },
        React.createElement("div", { style: { fontWeight: 700, fontSize: 16, color: "#1e293b" } }, "Módulos")
      ),
      MODULES.map(function(m) {
        return React.createElement("div", { key: m.id, style: S.sidebarItem(activeModule === m.id && view !== "dashboard", m.color), onClick: function() { setActiveMod(m.id); setView("list"); setSearch(""); setFilter(""); setSidebar(false); loadModule(m.id); } },
          React.createElement("span", { style: { fontSize: 18 } }, m.icon),
          React.createElement("span", null, m.label),
          React.createElement("span", { style: { marginLeft: "auto", background: "#f1f5f9", borderRadius: 20, padding: "1px 8px", fontSize: 12, color: "#64748b" } }, (data[m.id] || []).length)
        );
      }),
      React.createElement("div", { style: { padding: "16px 20px", borderTop: "1px solid #f1f5f9", marginTop: 8 } },
        React.createElement("button", { style: Object.assign({}, S.btn("#64748b", true), { width: "100%", fontSize: 13 }), onClick: handleLogout }, "🔓 Cerrar sesión"),
        React.createElement("button", { style: Object.assign({}, S.btn("#6366f1", true), { width: "100%", fontSize: 13, marginTop: 8 }), onClick: function() { localStorage.removeItem("docgestion_role"); setRole(""); setSidebar(false); } }, (OT_ROLES[role] ? OT_ROLES[role].icon : "👤") + " Cambiar rol"),
        React.createElement("button", { style: Object.assign({}, S.btn("#6366f1", true), { width: "100%", fontSize: 13, marginTop: 8 }), onClick: function() { setShowKeyInput(function(v) { return !v; }); } }, "⚙️ API Key Anthropic"),
        showKeyInput && React.createElement(ApiKeyInput, { current: apiKey, onSave: saveApiKey })
      )
    ),

    React.createElement("div", { style: S.main },
      loadingMod && React.createElement("div", { style: { textAlign: "center", padding: 30, color: "#6366f1", fontWeight: 600 } }, "⏳ Cargando datos..."),

      !loadingMod && view === "dashboard" && React.createElement(React.Fragment, null,
        React.createElement("h2", { style: S.h2 }, "📊 Dashboard"),
        React.createElement("div", { style: S.card },
          React.createElement("div", { style: { fontWeight: 600, fontSize: 14, color: "#475569", marginBottom: 10 } }, "🔍 Buscar en todos los módulos"),
          React.createElement("div", { style: { display: "flex", gap: 8 } },
            React.createElement("input", { style: Object.assign({}, S.input, { flex: 1 }), placeholder: "Nombre de cliente, destinatario, CUIT...", value: globalSearch, onChange: function(e) { setGlobalSearch(e.target.value); doGlobalSearch(e.target.value); } }),
            globalSearch && React.createElement("button", { style: S.btn("#64748b", true), onClick: function() { setGlobalSearch(""); setGlobalResults(null); } }, "✕")
          ),
          globalResults && React.createElement("div", { style: { marginTop: 14 } },
            Object.keys(globalResults).length === 0
              ? React.createElement("div", { style: { color: "#94a3b8", fontSize: 14 } }, "Sin resultados.")
              : Object.values(globalResults).map(function(item) {
                  return React.createElement("div", { key: item.id, style: { marginBottom: 14 } },
                    React.createElement("div", { style: { fontWeight: 700, fontSize: 13, color: item.color, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 } },
                      React.createElement("span", null, item.icon), item.label,
                      React.createElement("span", { style: { background: "#f1f5f9", borderRadius: 20, padding: "1px 8px", fontSize: 11, color: "#64748b", fontWeight: 400 } }, item.hits.length + " resultado" + (item.hits.length > 1 ? "s" : ""))
                    ),
                    item.hits.map(function(r, i) {
                      return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#f8fafc", borderRadius: 8, marginBottom: 6, cursor: "pointer" }, onClick: function() { setActiveMod(item.id); setDetailItem(r); setView("detail"); setGlobalSearch(""); setGlobalResults(null); } },
                        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                          React.createElement("div", { style: { fontWeight: 600, fontSize: 13, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r["Cliente"] || r["Destinatario"] || "—"),
                          React.createElement("div", { style: { fontSize: 12, color: "#64748b" } }, "N° " + (r["Número"] || r["Número de Orden"] || r["Número de Envío"] || r["Guía Zipnova"] || r["Código de Envío"] || "—") + " · " + (r["Fecha"] || r["Fecha de Recepción"] || "—"))
                        ),
                        r["Estado"] && React.createElement("span", { style: S.badge(r["Estado"]) }, r["Estado"])
                      );
                    })
                  );
                })
          )
        ),
        React.createElement("div", { style: S.grid },
          totalByMod.map(function(m) {
            return React.createElement("div", { key: m.id, style: S.statCard(m.color), onClick: function() { setActiveMod(m.id); setView("list"); } },
              React.createElement("div", { style: { fontSize: 20 } }, m.icon),
              React.createElement("div", { style: { fontSize: 24, fontWeight: 700, color: "#1e293b" } }, m.count),
              React.createElement("div", { style: { fontSize: 12, color: "#64748b", marginTop: 2 } }, m.label)
            );
          })
        ),
        React.createElement("div", { style: S.card },
          React.createElement("h2", { style: Object.assign({}, S.h2, { marginBottom: 8 }) }, "Actividad reciente"),
          recentAll.length === 0
            ? React.createElement("div", { style: { color: "#94a3b8", fontSize: 14 } }, "Sin registros aún.")
            : recentAll.map(function(r, i) {
                return React.createElement("div", { key: i, style: S.recentItem },
                  React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: r._modColor, display: "inline-block", flexShrink: 0 } }),
                  React.createElement("span", { style: { fontSize: 12, color: "#64748b", flexShrink: 0 } }, r._modLabel),
                  React.createElement("span", { style: { fontSize: 13, color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, (r["Número"] || r["Número de Orden"] || r["Número de Envío"] || r["Guía Zipnova"] || "Sin número") + " — " + (r["Cliente"] || r["Destinatario"] || "")),
                  r["Estado"] && React.createElement("span", { style: S.badge(r["Estado"]) }, r["Estado"])
                );
              })
        )
      ),

      !loadingMod && view === "list" && React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 } },
          React.createElement("span", { style: { fontSize: 22 } }, mod.icon),
          React.createElement("h2", { style: Object.assign({}, S.h2, { margin: 0 }) }, mod.label),
          React.createElement("button", { style: Object.assign({}, S.btn(mod.color, true), { marginLeft: "auto", padding: "7px 12px", fontSize: 13 }), onClick: function() { loadModule(activeModule); } }, "🔄")
        ),
        React.createElement("div", { style: S.row },
          React.createElement("input", { style: S.input, placeholder: "Buscar...", value: search, onChange: function(e) { setSearch(e.target.value); } }),
          React.createElement("select", { style: S.select, value: filterEstado, onChange: function(e) { setFilter(e.target.value); } },
            React.createElement("option", { value: "" }, "Todos"),
            (activeModule === "OT" ? OT_ESTADOS : ESTADOS).map(function(e) { return React.createElement("option", { key: e }, e); })
          )
        ),
        filtered.length === 0
          ? React.createElement("div", { style: { color: "#94a3b8", fontSize: 14, padding: "20px 0" } }, "Sin registros. Tocá + para agregar uno.")
          : React.createElement("div", { style: { overflowX: "auto" } },
              React.createElement("table", { style: S.table },
                React.createElement("thead", null,
                  React.createElement("tr", null,
                    fields.slice(0, 4).map(function(f) {
                      return React.createElement("th", { key: f, style: S.th, onClick: function() { setSortField(f); setSortDir(function(d) { return d === "asc" ? "desc" : "asc"; }); } }, f + (sortField === f ? (sortDir === "asc" ? " ↑" : " ↓") : ""));
                    }),
                    React.createElement("th", { style: S.th }, "Acciones")
                  )
                ),
                React.createElement("tbody", null,
                  filtered.map(function(r, i) {
                    return React.createElement("tr", { key: i, style: { cursor: "pointer" }, onClick: function() { setDetailItem(r); setView("detail"); } },
                      fields.slice(0, 4).map(function(f) {
                        return React.createElement("td", { key: f, style: S.td }, f === "Estado" ? React.createElement("span", { style: S.badge(r[f]) }, r[f]) : (r[f] || "—"));
                      }),
                      React.createElement("td", { style: S.td, onClick: function(e) { e.stopPropagation(); } },
                        React.createElement("button", { style: Object.assign({}, S.btn(mod.color, true), { padding: "5px 10px", fontSize: 12, marginRight: 4 }), onClick: function() { openForm(r); } }, "✏️"),
                        React.createElement("button", { style: Object.assign({}, S.btn("#ef4444", true), { padding: "5px 10px", fontSize: 12 }), onClick: function() { deleteRecord(r._id); } }, "🗑️")
                      )
                    );
                  })
                )
              )
            )
      ),

      view === "form" && React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } },
          React.createElement("button", { style: Object.assign({}, S.btn("#64748b", true), { padding: "7px 12px" }), onClick: function() { setView("list"); } }, "← Volver"),
          React.createElement("h2", { style: Object.assign({}, S.h2, { margin: 0 }) }, (editId ? "Editar" : "Nuevo") + " " + mod.label)
        ),
        !editId && React.createElement("div", { style: S.scanBox, onClick: function() { fileRef.current.click(); } },
          ocrLoading
            ? React.createElement("div", { style: { color: "#6366f1" } }, "🔍 Analizando imagen con IA...")
            : React.createElement(React.Fragment, null,
                React.createElement("div", { style: { fontSize: 32 } }, "📷"),
                React.createElement("div", { style: { fontWeight: 600, color: "#334155", marginTop: 6 } }, "Escanear documento"),
                React.createElement("div", { style: { fontSize: 12, color: "#94a3b8", marginTop: 4 } }, "Tocá para abrir la cámara o elegir foto")
              ),
          React.createElement("input", { ref: fileRef, type: "file", accept: "image/*", capture: "environment", style: { display: "none" }, onChange: handleCapture })
        ),
        ocrError && React.createElement("div", { style: { color: "#ef4444", fontSize: 13, marginBottom: 12 } }, ocrError),
        imgPreview && React.createElement("img", { src: imgPreview, alt: "preview", style: S.imgPrev }),
        React.createElement("div", { style: S.card },
          fields.map(function(f) {
            const ilegible = (formData[f] || "").trim().toUpperCase() === "ILEGIBLE" || ((REQUIRED_FIELDS[activeModule] || []).indexOf(f) >= 0 && !formData[f]);
            return React.createElement("div", { key: f, style: S.formGroup },
              React.createElement("label", { style: Object.assign({}, S.label, { color: ilegible ? "#ef4444" : "#475569" }) }, f + (ilegible ? " ⚠️ Requerido" : "")),
              f === "Estado"
                ? React.createElement("select", { style: S.formInput, value: formData[f] || "", onChange: function(e) { const v = e.target.value; setFormData(function(p) { const n = Object.assign({}, p); n[f] = v; return n; }); } },
                    (activeModule === "OT" ? OT_ESTADOS : ESTADOS).map(function(e) { return React.createElement("option", { key: e }, e); })
                  )
                : f === "Fecha" || f.indexOf("Fecha") >= 0
                ? React.createElement("input", { type: "date", style: S.formInput, value: formData[f] || "", onChange: function(e) { const v = e.target.value; setFormData(function(p) { const n = Object.assign({}, p); n[f] = v; return n; }); } })
                : React.createElement("input", { style: Object.assign({}, S.formInput, { borderColor: ilegible ? "#ef4444" : "#e2e8f0", background: ilegible ? "#fff5f5" : "#f8fafc" }), value: (formData[f] === "ILEGIBLE" ? "" : (formData[f] || "")), onChange: function(e) { const v = e.target.value; setFormData(function(p) { const n = Object.assign({}, p); n[f] = v; return n; }); }, placeholder: ilegible ? ("⚠️ Completá " + f.toLowerCase() + " manualmente...") : ("Ingresá " + f.toLowerCase() + "...") })
            );
          }),
          ilegibles.length > 0 && React.createElement("div", { style: { background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#92400e" } }, "⚠️ Completá antes de guardar: " + ilegibles.join(", ")),
          React.createElement("button", { style: Object.assign({}, S.btn(mod.color), { width: "100%", padding: 12, opacity: (saving || ilegibles.length > 0) ? 0.5 : 1 }), onClick: saveRecord, disabled: saving || ilegibles.length > 0 }, saving ? "Guardando..." : "💾 Guardar en Google Sheets")
        )
      ),

      !loadingMod && view === "detail" && detailItem && activeModule !== "OT" && React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } },
          React.createElement("button", { style: Object.assign({}, S.btn("#64748b", true), { padding: "7px 12px" }), onClick: function() { setView("list"); } }, "← Volver"),
          React.createElement("h2", { style: Object.assign({}, S.h2, { margin: 0 }) }, "Detalle")
        ),
        detailItem._img && React.createElement("img", { src: detailItem._img, alt: "doc", style: S.imgPrev }),
        React.createElement("div", { style: S.card },
          fields.map(function(f) {
            return React.createElement("div", { key: f, style: S.detailRow },
              React.createElement("span", { style: { color: "#64748b", fontWeight: 600 } }, f),
              React.createElement("span", { style: { color: "#1e293b" } }, f === "Estado" ? React.createElement("span", { style: S.badge(detailItem[f]) }, detailItem[f]) : (detailItem[f] || "—"))
            );
          })
        ),
        React.createElement("div", { style: { display: "flex", gap: 8 } },
          React.createElement("button", { style: Object.assign({}, S.btn(mod.color, true), { flex: 1 }), onClick: function() { openForm(detailItem); } }, "✏️ Editar"),
          React.createElement("button", { style: Object.assign({}, S.btn("#ef4444", true), { flex: 1 }), onClick: function() { deleteRecord(detailItem._id); } }, "🗑️ Eliminar")
        )
      )
    ),

    (view === "list" || view === "detail") && React.createElement("button", { style: S.fab(mod.color), onClick: function() { openForm(); } }, "＋")
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
