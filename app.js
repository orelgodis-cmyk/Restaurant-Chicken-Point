import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, increment,
  onSnapshot, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBuAL0eXnZ2cEghLanezJogCTFZPc4sAh4",
  authDomain: "chicken-point-cff9e.firebaseapp.com",
  projectId: "chicken-point-cff9e",
  storageBucket: "chicken-point-cff9e.firebasestorage.app",
  messagingSenderId: "31862549107",
  appId: "1:31862549107:web:dfa27e80b8acf55e1e1806",
  measurementId: "G-5QFYRD68MQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const col = name => collection(db, name);

const cols = {
  daily: col("managerDailyReports"),
  issues: col("managementIssues"),
  weekly: col("weeklyManagementReports"),
  employees: col("employeeReports"),
  legacyFood: col("foodReports"),
  legacyDailyTasks: col("dailyTasks"),
  legacyWeeklyTasks: col("weeklyTasks"),
  legacyMonthlyTasks: col("monthlyTasks"),
  legacyOrelTasks: col("orelTasks"),
  improvements: col("improvements"),
  taskHistory: col("taskHistory"),
  greenBowl: col("greenBowlReports")
};

const state = {
  daily: [], issues: [], weekly: [], employees: [], legacyFood: [],
  legacyDailyTasks: [], legacyWeeklyTasks: [], legacyMonthlyTasks: [], legacyOrelTasks: [],
  improvements: [], taskHistory: [], greenBowl: []
};

let employeeRowCounter = 0;
let editingDailyReportId = "";
let initialDailyLoaded = false;
const resettingTaskIds = new Set();
const products = [
  {key:"potato", name:"תפוח אדמה"},
  {key:"cabbage", name:"כרוב צלוי"},
  {key:"chicken", name:"עוף"},
  {key:"schnitzel", name:"שניצלים"},
  {key:"salads", name:"סלטים"}
];
const taskTypes = {
  daily: {collection:"dailyTasks", stateKey:"legacyDailyTasks", input:"dailyTaskText", label:"יומית"},
  weekly: {collection:"weeklyTasks", stateKey:"legacyWeeklyTasks", input:"weeklyTaskText", label:"שבועית"},
  monthly: {collection:"monthlyTasks", stateKey:"legacyMonthlyTasks", input:"monthlyTaskText", label:"חודשית"},
  orel: {collection:"orelTasks", stateKey:"legacyOrelTasks", input:"orelTaskText", label:"אישית"}
};

const $ = id => document.getElementById(id);
const val = id => ($(id)?.value || "").trim();
const checked = id => Boolean($(id)?.checked);
const todayLocal = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const heDate = iso => {
  if (!iso) return "";
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("he-IL");
};
const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
const num = value => Number(value) || 0;

window.go = id => $(id)?.scrollIntoView({behavior:"smooth", block:"start"});
window.refreshWeekly = () => renderWeekly();

function setCloud(text, ok = true){
  $("cloudStatus").textContent = text;
  $("cloudStatus").className = `cloud ${ok ? "ok" : "bad"}`;
}

function toast(message){
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function timestampMs(item){
  if (item?.createdAt?.toMillis) return item.createdAt.toMillis();
  if (item?.completedAt?.toMillis) return item.completedAt.toMillis();
  if (item?.closedAt?.toMillis) return item.closedAt.toMillis();
  if (item?.createdAtText) return new Date(item.createdAtText).getTime() || 0;
  if (item?.completedAtText) return new Date(item.completedAtText).getTime() || 0;
  if (item?.completedDate) return new Date(`${item.completedDate}T00:00:00`).getTime() || 0;
  if (item?.date) return new Date(item.date).getTime() || 0;
  return 0;
}

function sorted(items){
  return [...items].sort((a,b) => timestampMs(b) - timestampMs(a));
}

function minutes(time){
  if (!time) return null;
  const [h,m] = time.split(":").map(Number);
  return h * 60 + m;
}

function overtime(planned, actual){
  const p = minutes(planned), a = minutes(actual);
  if (p === null || a === null) return 0;
  return Math.max(0, a - p);
}

function sundayKey(iso = todayLocal()){
  const [y,m,d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - date.getDay());
  const yy = date.getFullYear();
  const mm = String(date.getMonth()+1).padStart(2,"0");
  const dd = String(date.getDate()).padStart(2,"0");
  return `${yy}-${mm}-${dd}`;
}

function periodKey(type, iso = todayLocal()){
  if (type === "daily") return iso;
  if (type === "weekly") return sundayKey(iso);
  if (type === "monthly") return iso.slice(0,7);
  return "once";
}

async function resetDueTasks(type, items){
  if (!["daily","weekly","monthly"].includes(type)) return;
  const currentKey = periodKey(type);
  for (const task of items){
    if (!task.done || resettingTaskIds.has(`${type}_${task.id}`)) continue;
    const lastKey = task.lastDonePeriod || (task.lastDoneISO ? periodKey(type, task.lastDoneISO) : "");
    if (lastKey === currentKey) continue;
    const guard = `${type}_${task.id}`;
    resettingTaskIds.add(guard);
    try {
      await updateDoc(doc(db, taskTypes[type].collection, task.id), {
        done:false,
        autoResetAt:serverTimestamp(),
        autoResetForPeriod:currentKey
      });
    } catch (error){
      console.error("Task auto reset failed", error);
    } finally {
      resettingTaskIds.delete(guard);
    }
  }
}

window.addTask = async type => {
  const cfg = taskTypes[type];
  if (!cfg) return;
  const text = val(cfg.input);
  if (!text) return alert("תרשום משימה");
  try {
    await addDoc(col(cfg.collection), {
      text, done:false, taskType:type, createdAt:serverTimestamp(), createdAtText:new Date().toLocaleString("he-IL")
    });
    $(cfg.input).value = "";
    toast(`משימה ${cfg.label} נוספה ✅`);
  } catch (error){ console.error(error); alert("לא הצלחתי להוסיף את המשימה."); }
};

window.toggleTask = async (type, id, done) => {
  const cfg = taskTypes[type];
  if (!cfg) return;
  try {
    if (!done){
      const task = state[cfg.stateKey].find(t => t.id === id);
      const iso = todayLocal();
      await addDoc(cols.taskHistory, {
        taskId:id, taskText:task?.text || "משימה", taskType:type, taskTypeLabel:cfg.label,
        completedDate:iso, completedAt:serverTimestamp(), completedAtText:new Date().toLocaleString("he-IL")
      });
      await updateDoc(doc(db, cfg.collection, id), {
        done:true, lastDoneISO:iso, lastDone:new Date().toLocaleDateString("he-IL"),
        lastDonePeriod:periodKey(type, iso), completedAt:serverTimestamp(), completionCount:increment(1)
      });
      toast("המשימה בוצעה ונשמרה בהיסטוריה ✅");
    } else {
      await updateDoc(doc(db, cfg.collection, id), {done:false, reopenedAt:serverTimestamp()});
      toast("המשימה הוחזרה לפתוחות");
    }
  } catch (error){ console.error(error); alert("לא הצלחתי לעדכן את המשימה."); }
};

window.deleteTask = async (type, id) => {
  const cfg = taskTypes[type];
  if (!cfg || !confirm("למחוק את המשימה? היסטוריית ביצועים שכבר נשמרה לא תימחק.")) return;
  try { await deleteDoc(doc(db, cfg.collection, id)); toast("המשימה נמחקה"); }
  catch (error){ console.error(error); alert("לא הצלחתי למחוק את המשימה."); }
};

function taskListHTML(items, type){
  return sorted(items).map(t => `<div class="task-item ${t.done?"done":""}">
    <div class="task-text"><b>${t.done?"✅":"⬜"} ${esc(t.text || "משימה")}</b>
      ${t.lastDone ? `<small>בוצע לאחרונה: ${esc(t.lastDone)}</small>` : ""}
    </div>
    <div class="task-actions">
      <button class="${t.done?"reopen-btn":"done-btn"}" onclick="toggleTask('${type}','${t.id}',${Boolean(t.done)})">${t.done?"↩️ פתח":"✔️ בוצע"}</button>
      <button class="remove-btn" onclick="deleteTask('${type}','${t.id}')">🗑️</button>
    </div>
  </div>`).join("") || `<p class="hint">אין עדיין משימות.</p>`;
}

function renderTasks(){
  $("dailyTasks").innerHTML = taskListHTML(state.legacyDailyTasks, "daily");
  $("weeklyTasks").innerHTML = taskListHTML(state.legacyWeeklyTasks, "weekly");
  $("monthlyTasks").innerHTML = taskListHTML(state.legacyMonthlyTasks, "monthly");
  $("orelTasks").innerHTML = taskListHTML(state.legacyOrelTasks, "orel");
  const all = [...state.legacyDailyTasks,...state.legacyWeeklyTasks,...state.legacyMonthlyTasks,...state.legacyOrelTasks];
  const open = all.filter(t => !t.done).length;
  const done = all.filter(t => t.done).length;
  $("taskProgressBadge").textContent = `${open} פתוחות · ${done} בוצעו`;
  $("taskHistory").innerHTML = sorted(state.taskHistory).slice(0,80).map(h => `<div class="history-row">
    <b>✅ ${esc(h.taskText || "משימה")}</b>
    <span>${esc(h.taskTypeLabel || h.taskType || "")} · ${heDate(h.completedDate) || esc(h.completedAtText || "")}</span>
  </div>`).join("") || `<p class="hint">היסטוריית הביצוע תתחיל מהסימונים החדשים.</p>`;
}

function renderFoodProducts(){
  $("foodProducts").innerHTML = products.map(p => `<div class="food-product-row">
    <h4>${esc(p.name)}</h4>
    <div class="three-grid">
      <div><label>כמה הכנו?</label><input id="${p.key}_made" placeholder="כמות"></div>
      <div><label>כמה נשאר?</label><input id="${p.key}_left" placeholder="כמות"></div>
      <div><label>מצב סוף יום</label><select id="${p.key}_status"><option>היה בדיוק</option><option>נשאר ממש מעט</option><option>נגמר</option><option>נשאר יותר מדי</option><option>לא הוכן</option></select></div>
    </div>
  </div>`).join("");
}

window.saveFoodReport = async () => {
  const report = {
    date: val("foodDate") || todayLocal(), products:{}, taste:val("foodTaste"), tasteNote:val("tasteNote"),
    shiftLevel:val("shiftLevel"), wasteNote:val("foodWasteNote"), note:val("foodNote"),
    tomorrowNote:val("foodTomorrowNote"), createdAt:serverTimestamp(), createdAtText:new Date().toLocaleString("he-IL")
  };
  products.forEach(p => report.products[p.key] = {name:p.name, made:val(`${p.key}_made`), left:val(`${p.key}_left`), status:val(`${p.key}_status`)});
  try {
    await addDoc(cols.legacyFood, report);
    products.forEach(p => { $(`${p.key}_made`).value=""; $(`${p.key}_left`).value=""; });
    ["tasteNote","foodWasteNote","foodNote","foodTomorrowNote"].forEach(id => $(id).value="");
    toast("דוח האוכל נשמר בענן ובהיסטוריה ✅");
  } catch (error){ console.error(error); alert("לא הצלחתי לשמור את דוח האוכל."); }
};

function renderFoodModule(){
  const reports = sorted(state.legacyFood);
  $("foodHistory").innerHTML = reports.slice(0,30).map(r => {
    const lines = products.map(p => {
      const x = r.products?.[p.key] || {};
      return `<b>${esc(p.name)}:</b> הוכן ${esc(x.made||"-")} · נשאר ${esc(x.left||"-")} · ${esc(x.status||"-")}`;
    }).join("<br>");
    return `<div class="item"><b>${heDate(r.date) || esc(r.date || "")} · ${esc(r.shiftLevel || "")}</b><br>${lines}<br>
      <b>טעם:</b> ${esc(r.taste || "-")} ${r.tasteNote?`· ${esc(r.tasteNote)}`:""}<br>
      <b>פחת:</b> ${esc(r.wasteNote || "-")}<br><b>למחר:</b> ${esc(r.tomorrowNote || "-")}</div>`;
  }).join("") || `<p class="hint">עדיין אין דוחות אוכל.</p>`;

  if (reports.length < 2){
    $("foodInsights").innerHTML = `<div class="insight warn">צריך לפחות שני דוחות אוכל כדי להתחיל לזהות דפוסים.</div>`;
    return;
  }
  const statusCounts = {};
  reports.forEach(r => products.forEach(p => {
    const status = r.products?.[p.key]?.status;
    if (!status) return;
    statusCounts[p.name] ||= {};
    statusCounts[p.name][status] = (statusCounts[p.name][status] || 0) + 1;
  }));
  $("foodInsights").innerHTML = Object.entries(statusCounts).map(([name, counts]) => {
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="insight"><b>${esc(name)}</b> — המצב שחזר הכי הרבה: ${esc(top?.[0] || "-")} (${top?.[1] || 0} פעמים)</div>`;
  }).join("");
}

window.addImprovement = async () => {
  const text = val("improveText");
  if (!text) return alert("תרשום רעיון או שיפור");
  try {
    await addDoc(cols.improvements, {text, priority:val("improvePriority"), done:false, createdAt:serverTimestamp(), createdAtText:new Date().toLocaleString("he-IL")});
    $("improveText").value="";
    toast("השיפור נוסף למעקב 💡");
  } catch (error){ console.error(error); alert("לא הצלחתי לשמור את השיפור."); }
};

window.toggleImprovement = async (id, done) => {
  try {
    await updateDoc(doc(db,"improvements",id), {done:!done, completedAt:!done?serverTimestamp():null});
    toast(!done ? "השיפור בוצע ✅" : "השיפור הוחזר לפתוחים");
  } catch (error){ console.error(error); alert("לא הצלחתי לעדכן את השיפור."); }
};

window.deleteImprovement = async id => {
  if (!confirm("למחוק את השיפור?")) return;
  try { await deleteDoc(doc(db,"improvements",id)); toast("השיפור נמחק"); }
  catch (error){ console.error(error); alert("לא הצלחתי למחוק את השיפור."); }
};

function renderImprovements(){
  $("improvementsList").innerHTML = sorted(state.improvements).map(i => `<div class="task-item ${i.done?"done":""}">
    <div class="task-text"><b>${i.done?"✅":"💡"} ${esc(i.text)}</b><small>עדיפות: ${esc(i.priority || "בינונית")}</small></div>
    <div class="task-actions"><button class="${i.done?"reopen-btn":"done-btn"}" onclick="toggleImprovement('${i.id}',${Boolean(i.done)})">${i.done?"↩️ פתח":"✔️ בוצע"}</button><button class="remove-btn" onclick="deleteImprovement('${i.id}')">🗑️</button></div>
  </div>`).join("") || `<p class="hint">אין עדיין רעיונות לשיפור.</p>`;
}

function dailySummaryText(r){
  if (!r) return "";
  const tastes = (r.opening?.tastes || []).filter(t=>t.product).map(t=>`${t.product}: ${t.status}${t.note?` (${t.note})`:""}`).join("; ") || "לא נרשמו";
  const employeeLines = (r.employees || []).map(e => `• ${e.name || "עובד"}: יציאה מתוכננת ${e.plannedOut || "-"}, בפועל ${e.actualOut || "ממתין לעדכון"}${e.actualOut && num(e.delayMinutes)>0?`, חריגה ${num(e.delayMinutes)} דקות`:""}${e.reason?` — ${e.reason}`:""}`).join("\n") || "• לא נרשמו חריגות עובדים";
  const waste = num(r.endDay?.wasteQuantity)>0 ? `${r.endDay?.wasteProduct || "מוצר"}: ${num(r.endDay?.wasteQuantity)} ${r.endDay?.wasteUnit || ""} — ${r.endDay?.wasteReason || "ללא סיבה"}` : "לא נרשם פחת כמותי";
  const goals = (r.goals || []).filter(Boolean).map(g=>`• ${g}`).join("\n") || "• לא נרשמו";
  return `סיכום יומי — Chicken Point — ${heDate(r.date)}\n\nמצב היום: ${r.midday?.actualLoad || r.quantities?.expectedLoad || "לא צוין"}\n\nבדיקות שבוצעו:\n• סיבוב מקררים: ${r.opening?.fridgeTour?"בוצע":"לא סומן"}\n• טריות: ${r.opening?.freshnessStatus || "לא צוין"}\n• סחורה שחייבת להסתיים: ${r.opening?.oldStock || "אין"}\n• חוסרים / מוצר לא תקין: ${r.opening?.shortage || r.opening?.abnormalProduct || "לא נמצאו"}\n• טעימות: ${tastes}\n• בדיקת אמצע יום: ${r.midday?.decision || `${r.midday?.prep || "-"}, ${r.midday?.moreFood || "-"}`}\n\nשעות עובדים בסוף היום:\n${employeeLines}\n\nמה נשאר: ${r.endDay?.leftovers || "לא נרשם"}\nפחת: ${waste}\nבעיה שעלתה: ${r.endDay?.newIssueSummary || "לא עלתה בעיה חדשה"}\n\nשלושת היעדים שנקבעו:\n${goals}\n\nמה משנים מחר:\n${r.endDay?.tomorrowChange || "לא נרשם שינוי"}`;
}

async function copyText(text){
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
}

window.copyLatestDailySummary = async () => {
  const latest = sorted(state.daily)[0];
  if (!latest) return alert("עדיין אין דוח יומי שממנו אפשר להכין סיכום");
  await copyText(dailySummaryText(latest));
  toast("הסיכום היומי הועתק — אפשר להדביק בוואטסאפ 📲");
};

window.copyDailySummary = async id => {
  const report = state.daily.find(r => r.id === id);
  if (!report) return;
  await copyText(dailySummaryText(report));
  toast("הסיכום הועתק לוואטסאפ 📲");
};

function renderTasteRows(){
  $("tasteRows").innerHTML = [1,2,3].map(i => `
    <div class="taste-row">
      <h4>טעימה ${i}</h4>
      <input id="tasteProduct${i}" placeholder="שם המוצר">
      <label>טעם וטריות</label>
      <select id="tasteStatus${i}">
        <option>טוב וטרי</option>
        <option>בינוני — דורש תשומת לב</option>
        <option>לא תקין — לא למכור</option>
        <option>לא נבדק</option>
      </select>
      <textarea id="tasteNote${i}" placeholder="הערה קצרה"></textarea>
    </div>`).join("");
}

window.addEmployeeRow = () => {
  employeeRowCounter += 1;
  const id = employeeRowCounter;
  const wrap = document.createElement("div");
  wrap.className = "employee-row";
  wrap.dataset.employeeRow = String(id);
  wrap.innerHTML = `
    <div class="employee-grid">
      <div><label>שם העובד</label><input data-field="name" placeholder="שם"></div>
      <div><label>שעת כניסה</label><input data-field="inTime" type="time"></div>
      <div><label>יציאה מתוכננת</label><input data-field="plannedOut" type="time"></div>
      <div><label>יציאה בפועל</label><input data-field="actualOut" type="time"></div>
    </div>
    <div class="employee-extra">
      <div><label>חריגה</label><div class="calculated" data-field="calculated">טרם חושב</div></div>
      <div><label>סיבה / הערה</label><input data-field="reason" placeholder="למה נשאר מעבר לתכנון?"></div>
      <button class="remove-btn" type="button" onclick="removeEmployeeRow(${id})">מחק</button>
    </div>`;
  $("employeeRows").appendChild(wrap);
  wrap.querySelectorAll('input[type="time"]').forEach(input => input.addEventListener("change", () => updateEmployeeCalculation(wrap)));
};

window.removeEmployeeRow = id => {
  document.querySelector(`[data-employee-row="${id}"]`)?.remove();
};

function updateEmployeeCalculation(row){
  const planned = row.querySelector('[data-field="plannedOut"]').value;
  const actual = row.querySelector('[data-field="actualOut"]').value;
  const diff = overtime(planned, actual);
  const box = row.querySelector('[data-field="calculated"]');
  if (!planned || !actual) box.textContent = "טרם חושב";
  else if (diff === 0) box.textContent = "🟢 יצא בזמן";
  else box.textContent = `🔴 ${diff} דקות חריגה`;
}

function collectEmployees(){
  return [...document.querySelectorAll("[data-employee-row]")].map(row => {
    const get = field => row.querySelector(`[data-field="${field}"]`)?.value.trim() || "";
    const plannedOut = get("plannedOut"), actualOut = get("actualOut");
    return {
      name: get("name"), inTime: get("inTime"), plannedOut, actualOut,
      delayMinutes: overtime(plannedOut, actualOut), reason: get("reason")
    };
  }).filter(e => e.name || e.plannedOut || e.actualOut);
}

function clearTodayForm(){
  ["oldStock","abnormalProduct","shortage","goal1","goal2","goal3","midDecision","endLeftovers","wasteProduct","wasteQuantity","wasteReason","newIssueSummary","tomorrowChange"].forEach(id => { if ($(id)) $(id).value = ""; });
  $("fridgeTour").checked = false;
  [1,2,3].forEach(i => { $("tasteProduct"+i).value=""; $("tasteNote"+i).value=""; $("tasteStatus"+i).value="טוב וטרי"; });
  $("employeeRows").innerHTML = "";
  window.addEmployeeRow();
  window.addEmployeeRow();
}

function getDailyReportForDate(date){
  return sorted(state.daily.filter(r => r.date === date))[0] || null;
}

function collectOpeningData(){
  const tastes = [1,2,3].map(i => ({
    product: val(`tasteProduct${i}`), status: val(`tasteStatus${i}`), note: val(`tasteNote${i}`)
  })).filter(t => t.product || t.note);
  return {
    fridgeTour: checked("fridgeTour"),
    oldStock: val("oldStock"),
    freshnessStatus: val("freshnessStatus"),
    abnormalProduct: val("abnormalProduct"),
    shortage: val("shortage"),
    tastes
  };
}

function collectGoals(){
  return [val("goal1"), val("goal2"), val("goal3")];
}

function collectMiddayData(){
  return {
    clean: val("midClean"),
    moreFood: val("midMoreFood"),
    prep: val("midPrep"),
    actualLoad: val("actualLoad"),
    decision: val("midDecision")
  };
}

function collectEndDayData(){
  return {
    leftovers: val("endLeftovers"),
    wasteProduct: val("wasteProduct"),
    wasteQuantity: num(val("wasteQuantity")),
    wasteUnit: val("wasteUnit"),
    wasteReason: val("wasteReason"),
    newIssueSummary: val("newIssueSummary"),
    tomorrowChange: val("tomorrowChange")
  };
}

async function syncEmployeeReports(reportId, date, employees){
  const oldRows = state.employees.filter(e => e.sourceDailyReportId === reportId);
  for (const row of oldRows){
    await deleteDoc(doc(db, "employeeReports", row.id));
  }
  for (const employee of employees){
    if (!employee.name) continue;
    await addDoc(cols.employees, {
      ...employee,
      delayStatus: employee.actualOut
        ? (employee.delayMinutes > 15 ? "🔴 חריגה מעל 15 דקות" : employee.delayMinutes > 0 ? "🟡 חריגה עד 15 דקות" : "🟢 סיים בזמן")
        : "🟡 ממתין לעדכון",
      delayReason: employee.reason,
      note: "נשמר מתוך הדוח היומי החדש",
      date,
      dateText: heDate(date),
      sourceDailyReportId: reportId,
      createdAt: serverTimestamp()
    });
  }
}

async function saveDailySection(section){
  const date = val("dailyDate") || todayLocal();
  const existing = getDailyReportForDate(date);
  const nowText = new Date().toLocaleString("he-IL");
  const updates = {date, updatedAt: serverTimestamp(), updatedAtText: nowText};

  if (section === "morning"){
    updates.opening = collectOpeningData();
    updates.goals = collectGoals();
    updates.morningSavedAt = serverTimestamp();
    updates.morningSavedAtText = nowText;
  }
  if (section === "midday"){
    updates.midday = collectMiddayData();
    updates.middaySavedAt = serverTimestamp();
    updates.middaySavedAtText = nowText;
  }
  if (section === "end"){
    updates.employees = collectEmployees();
    updates.endDay = collectEndDayData();
    updates.endSavedAt = serverTimestamp();
    updates.endSavedAtText = nowText;
  }

  try {
    let reportId = existing?.id || "";
    if (existing){
      await updateDoc(doc(db, "managerDailyReports", existing.id), updates);
    } else {
      const saved = await addDoc(cols.daily, {
        date,
        opening: section === "morning" ? updates.opening : {},
        goals: section === "morning" ? updates.goals : [],
        midday: section === "midday" ? updates.midday : {},
        employees: section === "end" ? updates.employees : [],
        endDay: section === "end" ? updates.endDay : {},
        ...(section === "morning" ? {morningSavedAt:serverTimestamp(), morningSavedAtText:nowText} : {}),
        ...(section === "midday" ? {middaySavedAt:serverTimestamp(), middaySavedAtText:nowText} : {}),
        ...(section === "end" ? {endSavedAt:serverTimestamp(), endSavedAtText:nowText} : {}),
        createdAt: serverTimestamp(),
        createdAtText: nowText
      });
      reportId = saved.id;
    }

    if (section === "end"){
      await syncEmployeeReports(reportId, date, updates.employees || []);
    }

    const label = section === "morning" ? "דיווח הבוקר" : section === "midday" ? "בדיקת אמצע היום" : "דיווח סוף היום";
    $("dailySaveHint").textContent = `${label} של ${heDate(date)} נשמר בענן ובהיסטוריה.`;
    toast(`${label} נשמר ✅`);
  } catch (error){
    console.error(error);
    alert("לא הצלחתי לשמור. בדוק שהאפליקציה מחוברת לענן ונסה שוב.");
  }
}

window.saveMorningReport = () => saveDailySection("morning");
window.saveMiddayReport = () => saveDailySection("midday");
window.saveDailyReport = () => saveDailySection("end");

function setEmployeeRows(employees = []){
  $("employeeRows").innerHTML = "";
  employeeRowCounter = 0;
  const rows = employees.length ? employees : [{},{}];
  rows.forEach(employee => {
    window.addEmployeeRow();
    const row = $("employeeRows").lastElementChild;
    if (!row) return;
    ["name","inTime","plannedOut","actualOut","reason"].forEach(field => {
      const input = row.querySelector(`[data-field="${field}"]`);
      if (input) input.value = employee[field] || "";
    });
    updateEmployeeCalculation(row);
  });
}

function loadDailyReportIntoForm(date){
  const report = getDailyReportForDate(date);
  const opening = report?.opening || {};
  $("fridgeTour").checked = Boolean(opening.fridgeTour);
  $("oldStock").value = opening.oldStock || "";
  $("freshnessStatus").value = opening.freshnessStatus || "הכול טרי ותקין";
  $("abnormalProduct").value = opening.abnormalProduct || "";
  $("shortage").value = opening.shortage || "";
  const tastes = opening.tastes || [];
  [1,2,3].forEach((i, index) => {
    const taste = tastes[index] || {};
    $("tasteProduct"+i).value = taste.product || "";
    $("tasteStatus"+i).value = taste.status || "טוב וטרי";
    $("tasteNote"+i).value = taste.note || "";
  });
  const goals = report?.goals || [];
  [1,2,3].forEach((i,index) => $("goal"+i).value = goals[index] || "");

  const midday = report?.midday || {};
  $("midClean").value = midday.clean || "כן";
  $("midMoreFood").value = midday.moreFood || "לא";
  $("midPrep").value = midday.prep || "להמשיך כרגיל";
  $("actualLoad").value = midday.actualLoad || "רגיל";
  $("midDecision").value = midday.decision || "";

  const endDay = report?.endDay || {};
  $("endLeftovers").value = endDay.leftovers || "";
  $("wasteProduct").value = endDay.wasteProduct || "";
  $("wasteQuantity").value = endDay.wasteQuantity || "";
  $("wasteUnit").value = endDay.wasteUnit || "לא נזרק";
  $("wasteReason").value = endDay.wasteReason || "";
  $("newIssueSummary").value = endDay.newIssueSummary || "";
  $("tomorrowChange").value = endDay.tomorrowChange || "";
  setEmployeeRows(report?.employees || []);

  $("dailySaveHint").textContent = report
    ? `נטען הדוח של ${heDate(date)}. אפשר להמשיך ולעדכן כל חלק בנפרד.`
    : `אין עדיין דוח שמור ל־${heDate(date)}.`;
}

async function compressImage(file){
  if (!file) return "";
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
  const max = 900;
  let width = img.width, height = img.height;
  const scale = Math.min(1, max / Math.max(width, height));
  width = Math.round(width * scale); height = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  const compressed = canvas.toDataURL("image/jpeg", 0.68);
  if (compressed.length > 850000) throw new Error("התמונה עדיין גדולה מדי");
  return compressed;
}

window.saveIssue = async () => {
  if (!val("issueTitle")) return alert("תרשום כותרת לבעיה");
  if (!val("issueDescription")) return alert("תרשום מה בדיוק הבעיה");
  if (!val("issueSolution")) return alert("תרשום פתרון או פעולה לבדיקה");
  try {
    const photoFile = $("issuePhoto").files[0];
    const photoData = photoFile ? await compressImage(photoFile) : "";
    await addDoc(cols.issues, {
      date: val("issueDate") || todayLocal(), title: val("issueTitle"), category: val("issueCategory"),
      description: val("issueDescription"), quantity: num(val("issueQuantity")), unit: val("issueUnit"),
      owner: val("issueOwner"), cause: val("issueCause"), solution: val("issueSolution"),
      followUpDate: val("issueFollowUp"), photoData, status: "open", followUpNote: "", result: "",
      createdAt: serverTimestamp(), createdAtText: new Date().toLocaleString("he-IL")
    });
    ["issueTitle","issueDescription","issueQuantity","issueUnit","issueOwner","issueCause","issueSolution","issuePhoto"].forEach(id => { if ($(id)) $(id).value=""; });
    $("issueFollowUp").value = todayLocal();
  $("greenBowlDate").value = todayLocal();
  $("greenBowlDate").addEventListener("change", () => loadGreenBowlIntoForm(val("greenBowlDate") || todayLocal()));
    toast("הבעיה נפתחה ונשמרה במעקב 🚨");
    go("trackers");
  } catch (error){
    console.error(error);
    alert(error.message === "התמונה עדיין גדולה מדי" ? "התמונה גדולה מדי. נסה צילום קטן יותר." : "לא הצלחתי לשמור את הבעיה.");
  }
};

window.saveIssueFollowUp = async id => {
  const note = $(`follow_${id}`)?.value.trim() || "";
  const result = $(`result_${id}`)?.value || "עדיין בבדיקה";
  if (!note) return alert("תרשום מה בדקת ומה קרה");
  try {
    await updateDoc(doc(db, "managementIssues", id), {
      followUpNote: note, result, lastCheckedDate: todayLocal(), lastCheckedAt: serverTimestamp(), status: "monitoring"
    });
    toast("הבדיקה החוזרת נשמרה ✅");
  } catch (error){ console.error(error); alert("לא הצלחתי לעדכן את המעקב."); }
};

window.closeIssue = async id => {
  const note = $(`follow_${id}`)?.value.trim() || "";
  const result = $(`result_${id}`)?.value || "נפתר";
  if (!note) return alert("לפני הסגירה תרשום מה הייתה התוצאה");
  if (!confirm("לסגור את הבעיה ולהעביר אותה להיסטוריה?")) return;
  try {
    await updateDoc(doc(db, "managementIssues", id), {
      followUpNote: note, result, status: "closed", closedDate: todayLocal(), closedAt: serverTimestamp()
    });
    toast("הבעיה נסגרה ועברה להיסטוריה ✅");
  } catch (error){ console.error(error); alert("לא הצלחתי לסגור את הבעיה."); }
};

function weekStartDate(){
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - 6);
  return d;
}

function isThisWeek(iso){
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00`);
  return d >= weekStartDate();
}

function weeklyMetrics(){
  const daily = state.daily.filter(r => isThisWeek(r.date));
  const issuesOpened = state.issues.filter(i => isThisWeek(i.date));
  const issuesClosed = state.issues.filter(i => i.status === "closed" && isThisWeek(i.closedDate));
  const employees = state.employees.filter(e => isThisWeek(e.date));
  const taskCompletions = state.taskHistory.filter(h => isThisWeek(h.completedDate));
  const overtimeMinutes = employees.reduce((sum,e) => sum + Math.max(0, num(e.delayMinutes)), 0);
  const wasteRows = daily.filter(r => num(r.endDay?.wasteQuantity) > 0);
  const wasteByProduct = {};
  wasteRows.forEach(r => {
    const product = r.endDay?.wasteProduct || "לא צוין";
    wasteByProduct[product] = (wasteByProduct[product] || 0) + num(r.endDay?.wasteQuantity);
  });
  const topWaste = Object.entries(wasteByProduct).sort((a,b) => b[1]-a[1])[0];
  const categoryCounts = {};
  issuesOpened.forEach(i => categoryCounts[i.category || "אחר"] = (categoryCounts[i.category || "אחר"] || 0) + 1);
  const topCategory = Object.entries(categoryCounts).sort((a,b) => b[1]-a[1])[0];
  const delayedEmployees = {};
  employees.forEach(e => {
    if (num(e.delayMinutes) > 0) delayedEmployees[e.name || "ללא שם"] = (delayedEmployees[e.name || "ללא שם"] || 0) + num(e.delayMinutes);
  });
  const topDelayed = Object.entries(delayedEmployees).sort((a,b) => b[1]-a[1])[0];
  return {daily, issuesOpened, issuesClosed, employees, taskCompletions, overtimeMinutes, wasteRows, topWaste, topCategory, topDelayed};
}

window.saveWeeklyReport = async () => {
  const metrics = weeklyMetrics();
  const decisions = [val("decision1"), val("decision2"), val("decision3")];
  if (!val("weeklySave") && !val("weeklyOptimize") && !val("weeklyImprove") && !decisions.some(Boolean)) return alert("תרשום לפחות מסקנה אחת לשבוע");
  try {
    await addDoc(cols.weekly, {
      weekEnding: todayLocal(),
      save: val("weeklySave"), optimize: val("weeklyOptimize"), improve: val("weeklyImprove"), decisions,
      snapshot: {
        dailyReports: metrics.daily.length, openIssues: state.issues.filter(i => i.status !== "closed").length,
        issuesOpened: metrics.issuesOpened.length, issuesClosed: metrics.issuesClosed.length,
        overtimeMinutes: metrics.overtimeMinutes, tasksCompleted: metrics.taskCompletions.length, topWaste: metrics.topWaste || null,
        topIssueCategory: metrics.topCategory || null, topDelayedEmployee: metrics.topDelayed || null
      },
      createdAt: serverTimestamp(), createdAtText: new Date().toLocaleString("he-IL")
    });
    ["weeklySave","weeklyOptimize","weeklyImprove","decision1","decision2","decision3"].forEach(id => $(id).value="");
    toast("הסיכום השבועי נשמר בהיסטוריה ✅");
  } catch (error){ console.error(error); alert("לא הצלחתי לשמור את הסיכום השבועי."); }
};

function renderDashboard(){
  const metrics = weeklyMetrics();
  const openIssues = state.issues.filter(i => i.status !== "closed");
  $("dailyCount").textContent = state.daily.length;
  $("openIssuesCount").textContent = openIssues.length;
  $("weekOvertime").textContent = metrics.overtimeMinutes;
  $("resolvedWeek").textContent = metrics.issuesClosed.length;
  $("todayLabel").textContent = new Date().toLocaleDateString("he-IL", {weekday:"long", day:"numeric", month:"numeric"});
  const nextFollow = sorted(openIssues.filter(i => i.followUpDate)).sort((a,b) => String(a.followUpDate).localeCompare(String(b.followUpDate)))[0];
  const lastDaily = sorted(state.daily)[0];
  const allTasks = [...state.legacyDailyTasks,...state.legacyWeeklyTasks,...state.legacyMonthlyTasks,...state.legacyOrelTasks];
  const openTasks = allTasks.filter(t => !t.done).length;
  $("managerSummary").innerHTML = `
    <b>🎯 מה דורש תשומת לב:</b><br>
    📋 ${openTasks} משימות ותזכורות פתוחות.<br>
    ${openIssues.length ? `🚨 יש ${openIssues.length} מעקבים פתוחים.` : "✅ אין כרגע בעיות פתוחות."}<br>
    ${nextFollow ? `📅 הבדיקה הקרובה: <b>${esc(nextFollow.title)}</b> — ${heDate(nextFollow.followUpDate)}.` : ""}<br>
    ${lastDaily?.endDay?.tomorrowChange ? `➡️ מהדוח האחרון למחר: ${esc(lastDaily.endDay.tomorrowChange)}` : "עדיין לא נשמר שינוי למחר."}
  `;
}

function dailyCard(r){
  const tastes = (r.opening?.tastes || []).filter(t => t.product).map(t => `${esc(t.product)} — ${esc(t.status)}`).join(" | ") || "לא נרשמו טעימות";
  const emp = (r.employees || []).map(e => {
    const actual = e.actualOut ? esc(e.actualOut) : '<span class="pending-text">ממתין לעדכון</span>';
    return `${esc(e.name || "עובד")}: ${esc(e.plannedOut || "-")}→${actual} ${e.actualOut && num(e.delayMinutes)>0?`(+${num(e.delayMinutes)} דק׳)`:""}${e.reason?` — ${esc(e.reason)}`:""}`;
  }).join("<br>") || "לא נרשמו עובדים";
  const goals = (r.goals || []).filter(Boolean).map(g => `• ${esc(g)}`).join("<br>") || "לא נרשמו יעדים";
  return `<div class="item">
    <b>${heDate(r.date)}</b> <span class="badge">${esc(r.midday?.actualLoad || r.quantities?.expectedLoad || "")}</span><br>
    <b>מקררים:</b> ${r.opening?.fridgeTour ? "בוצע" : "לא סומן"} | <b>טריות:</b> ${esc(r.opening?.freshnessStatus || "-")}<br>
    <b>סחורה ישנה:</b> ${esc(r.opening?.oldStock || "-")}<br>
    <b>טעימות:</b> ${tastes}<br>
    <b>יעדים:</b><br>${goals}<br>
    <b>שעות עובדים בסוף היום:</b><br>${emp}<br>
    <b>אמצע יום:</b> ניקיון ${esc(r.midday?.clean || "-")} | אוכל ${esc(r.midday?.moreFood || "-")} | ${esc(r.midday?.prep || "-")}<br>
    <b>נשאר:</b> ${esc(r.endDay?.leftovers || "-")}<br>
    <b>פחת:</b> ${num(r.endDay?.wasteQuantity) ? `${esc(r.endDay?.wasteProduct)} — ${num(r.endDay?.wasteQuantity)} ${esc(r.endDay?.wasteUnit)}` : "לא נרשם פחת כמותי"}<br>
    <b>למחר:</b> ${esc(r.endDay?.tomorrowChange || "-")}
    ${r.hoursUpdatedAtText ? `<span class="updated-note">שעות העובדים עודכנו לאחרונה: ${esc(r.hoursUpdatedAtText)}</span>` : ""}
    <div class="actions">
      <button class="edit-btn" onclick="openEmployeeHoursEditor('${r.id}')">✏️ עדכן שעות עובדים</button>
      <button class="edit-btn" onclick="copyDailySummary('${r.id}')">📲 העתק סיכום לאלעד</button>
    </div>
  </div>`;
}


window.openEmployeeHoursEditor = id => {
  const report = state.daily.find(r => r.id === id);
  if (!report) return;
  editingDailyReportId = id;
  $("employeeEditDate").textContent = `דוח של ${heDate(report.date)}`;
  const rows = report.employees || [];
  $("employeeEditRows").innerHTML = rows.length ? rows.map((e, index) => `
    <div class="employee-edit-row" data-edit-employee="${index}">
      <div class="employee-edit-grid">
        <div><label>שם העובד</label><input data-field="name" value="${esc(e.name || "")}"></div>
        <div><label>יציאה מתוכננת</label><input data-field="plannedOut" type="time" value="${esc(e.plannedOut || "")}"></div>
        <div><label>יציאה בפועל</label><input data-field="actualOut" type="time" value="${esc(e.actualOut || "")}"></div>
      </div>
      <label>סיבה / הערה</label><input data-field="reason" value="${esc(e.reason || "")}" placeholder="למה נשאר מעבר לתכנון?">
      <div class="calculated" data-field="calculated">${e.actualOut ? (num(e.delayMinutes)>0 ? `🔴 ${num(e.delayMinutes)} דקות חריגה` : "🟢 יצא בזמן") : "🟡 ממתין לשעת יציאה בפועל"}</div>
    </div>`).join("") : '<p class="hint">לא נרשמו עובדים בדוח הזה.</p>';
  document.querySelectorAll('[data-edit-employee] input[type="time"]').forEach(input => {
    input.addEventListener("change", () => {
      const row = input.closest('[data-edit-employee]');
      const planned = row.querySelector('[data-field="plannedOut"]').value;
      const actual = row.querySelector('[data-field="actualOut"]').value;
      const box = row.querySelector('[data-field="calculated"]');
      if (!actual) box.textContent = "🟡 ממתין לשעת יציאה בפועל";
      else {
        const diff = overtime(planned, actual);
        box.textContent = diff > 0 ? `🔴 ${diff} דקות חריגה` : "🟢 יצא בזמן";
      }
    });
  });
  $("employeeEditHint").textContent = "";
  $("employeeEditModal").classList.remove("hidden");
  $("employeeEditModal").setAttribute("aria-hidden", "false");
};

window.closeEmployeeHoursEditor = () => {
  editingDailyReportId = "";
  $("employeeEditModal").classList.add("hidden");
  $("employeeEditModal").setAttribute("aria-hidden", "true");
};

window.saveEmployeeHoursEdit = async () => {
  const report = state.daily.find(r => r.id === editingDailyReportId);
  if (!report) return;
  const employees = [...document.querySelectorAll('[data-edit-employee]')].map(row => {
    const get = field => row.querySelector(`[data-field="${field}"]`)?.value.trim() || "";
    const plannedOut = get("plannedOut"), actualOut = get("actualOut");
    return {
      name: get("name"),
      inTime: (report.employees?.[Number(row.dataset.editEmployee)]?.inTime) || "",
      plannedOut, actualOut,
      delayMinutes: overtime(plannedOut, actualOut),
      reason: get("reason")
    };
  });
  const nowText = new Date().toLocaleString("he-IL");
  const history = Array.isArray(report.employeeHoursHistory) ? [...report.employeeHoursHistory] : [];
  history.push({
    changedAtText: nowText,
    previousEmployees: report.employees || []
  });
  try {
    await updateDoc(doc(db, "managerDailyReports", report.id), {
      employees,
      employeeHoursHistory: history,
      hoursUpdatedAt: serverTimestamp(),
      hoursUpdatedAtText: nowText,
      hoursEditCount: increment(1)
    });
    const linked = state.employees.filter(e => e.sourceDailyReportId === report.id);
    for (const employee of employees){
      const existing = linked.find(e => String(e.name || "").trim() === String(employee.name || "").trim());
      const data = {
        ...employee,
        delayStatus: !employee.actualOut ? "🟡 ממתין לעדכון" : employee.delayMinutes > 15 ? "🔴 חריגה מעל 15 דקות" : employee.delayMinutes > 0 ? "🟡 חריגה עד 15 דקות" : "🟢 סיים בזמן",
        delayReason: employee.reason,
        updatedAt: serverTimestamp(),
        updatedAtText: nowText
      };
      if (existing) await updateDoc(doc(db, "employeeReports", existing.id), data);
      else if (employee.name) await addDoc(cols.employees, {
        ...data, date: report.date, dateText: heDate(report.date), sourceDailyReportId: report.id, note: "נוסף בעדכון שעות מהדוח היומי", createdAt: serverTimestamp()
      });
    }
    $("employeeEditHint").textContent = `השעות עודכנו ונשמרו בהיסטוריה ב־${nowText}.`;
    toast("שעות העובדים עודכנו ✅");
    setTimeout(() => closeEmployeeHoursEditor(), 700);
  } catch (error){
    console.error(error);
    alert("לא הצלחתי לעדכן את שעות העובדים. בדוק חיבור לענן ונסה שוב.");
  }
};

function renderDailyHistory(){
  $("dailyHistory").innerHTML = sorted(state.daily).map(dailyCard).join("") || `<p class="hint">עדיין אין דוחות יומיים.</p>`;
}

function issueCard(i, closed = false){
  const quantity = num(i.quantity) ? `${num(i.quantity)} ${esc(i.unit || "")}` : "לא נרשמה כמות";
  const photo = i.photoData ? `<img class="issue-photo" src="${i.photoData}" alt="תמונה שצורפה לבעיה">` : "";
  if (closed){
    return `<div class="item closed">
      <b>${esc(i.title)}</b> <span class="badge green">נסגרה</span> <span class="badge">${esc(i.category || "")}</span><br>
      <b>נפתחה:</b> ${heDate(i.date)} | <b>נסגרה:</b> ${heDate(i.closedDate)}<br>
      <b>בעיה:</b> ${esc(i.description)}<br><b>כמות:</b> ${quantity}<br>
      <b>פתרון:</b> ${esc(i.solution)}<br><b>תוצאה:</b> ${esc(i.followUpNote || i.result || "-")}
      ${photo}
    </div>`;
  }
  return `<div class="item open">
    <b>${esc(i.title)}</b> <span class="badge red">${i.status === "monitoring" ? "בבדיקה" : "פתוח"}</span> <span class="badge">${esc(i.category || "")}</span><br>
    <b>נפתח:</b> ${heDate(i.date)} | <b>בדיקה חוזרת:</b> ${heDate(i.followUpDate) || "לא נקבעה"}<br>
    <b>בעיה:</b> ${esc(i.description)}<br><b>כמות:</b> ${quantity}<br>
    <b>סיבה:</b> ${esc(i.cause || "-")}<br><b>פתרון:</b> ${esc(i.solution)}<br><b>אחראי:</b> ${esc(i.owner || "-")}
    ${i.followUpNote ? `<br><b>בדיקה אחרונה:</b> ${esc(i.followUpNote)} (${esc(i.result || "")})` : ""}
    ${photo}
    <div class="follow-box">
      <label>מה בדקתי ומה קרה?</label>
      <textarea id="follow_${i.id}" placeholder="לדוגמה: הורדנו מגש אחד ונשארה רק רבע כמות"></textarea>
      <label>תוצאה</label>
      <select id="result_${i.id}"><option>יש שיפור — ממשיכים לבדוק</option><option>אין שיפור — צריך פתרון אחר</option><option>נפתר</option></select>
      <div class="actions">
        <button class="edit-btn" onclick="saveIssueFollowUp('${i.id}')">שמור בדיקה חוזרת</button>
        <button class="done-btn" onclick="closeIssue('${i.id}')">סגור והעבר להיסטוריה</button>
      </div>
    </div>
  </div>`;
}

function renderIssues(){
  const open = sorted(state.issues.filter(i => i.status !== "closed"));
  const closed = sorted(state.issues.filter(i => i.status === "closed"));
  $("openBadge").textContent = `${open.length} פתוחים`;
  $("openIssues").innerHTML = open.map(i => issueCard(i)).join("") || `<div class="insight good">✅ אין כרגע מעקבים פתוחים.</div>`;
  $("closedIssues").innerHTML = closed.map(i => issueCard(i, true)).join("") || `<p class="hint">עדיין אין בעיות שנסגרו.</p>`;
}

function renderWeekly(){
  const m = weeklyMetrics();
  const openCount = state.issues.filter(i => i.status !== "closed").length;
  $("weeklyStats").innerHTML = `
    <div class="metric"><b>${m.daily.length}</b><span>דוחות ב־7 ימים</span></div>
    <div class="metric"><b>${m.issuesOpened.length}</b><span>בעיות שנפתחו</span></div>
    <div class="metric"><b>${m.issuesClosed.length}</b><span>בעיות שנסגרו</span></div>
    <div class="metric"><b>${m.overtimeMinutes}</b><span>דקות חריגה</span></div>
    <div class="metric"><b>${m.wasteRows.length}</b><span>ימים עם פחת כמותי</span></div>
    <div class="metric"><b>${openCount}</b><span>מעקבים פתוחים כעת</span></div>
    <div class="metric"><b>${m.employees.length}</b><span>דיווחי עובדים</span></div>
    <div class="metric"><b>${m.taskCompletions.length}</b><span>משימות שבוצעו</span></div>`;

  const insights = [];
  if (m.topWaste) insights.push(`<div class="insight warn">🗑️ המוצר עם הכמות המצטברת הגבוהה ביותר השבוע: <b>${esc(m.topWaste[0])}</b> — ${m.topWaste[1]} יחידות מדידה שנרשמו.</div>`);
  else insights.push(`<div class="insight good">✅ לא נרשם השבוע פחת כמותי בדוחות החדשים.</div>`);
  if (m.topDelayed) insights.push(`<div class="insight warn">⏰ העובד עם הכי הרבה דקות חריגה השבוע: <b>${esc(m.topDelayed[0])}</b> — ${m.topDelayed[1]} דקות.</div>`);
  else insights.push(`<div class="insight good">✅ לא נמצאו חריגות שעות השבוע.</div>`);
  if (m.topCategory) insights.push(`<div class="insight">🔎 תחום הבעיה שחזר הכי הרבה: <b>${esc(m.topCategory[0])}</b> — ${m.topCategory[1]} דיווחים.</div>`);
  insights.push(`<div class="insight">📋 השבוע סומנו <b>${m.taskCompletions.length}</b> משימות כבוצעו ונשמרו בהיסטוריה.</div>`);
  if (m.daily.length < 5) insights.push(`<div class="insight warn">📝 נשמרו רק ${m.daily.length} דוחות ב־7 הימים האחרונים. כדי לזהות דפוסים כדאי לשמור דוח בכל יום עבודה.</div>`);
  else insights.push(`<div class="insight good">📈 יש רצף נתונים טוב השבוע — אפשר כבר להציג מגמות ולא רק תחושות.</div>`);
  $("weeklyInsights").innerHTML = insights.join("");
}

function renderWeeklyHistory(){
  $("weeklyHistory").innerHTML = sorted(state.weekly).map(w => {
    const decisions = (w.decisions || []).filter(Boolean).map(d => `• ${esc(d)}`).join("<br>") || "-";
    return `<div class="item">
      <b>שבוע שהסתיים ב־${heDate(w.weekEnding)}</b><br>
      <span class="badge">${num(w.snapshot?.dailyReports)} דוחות</span>
      <span class="badge red">${num(w.snapshot?.overtimeMinutes)} דק׳ חריגה</span>
      <span class="badge green">${num(w.snapshot?.issuesClosed)} בעיות נסגרו</span><br>
      <b>לחסוך:</b> ${esc(w.save || "-")}<br>
      <b>לייעל:</b> ${esc(w.optimize || "-")}<br>
      <b>לשפר:</b> ${esc(w.improve || "-")}<br>
      <b>החלטות:</b><br>${decisions}
    </div>`;
  }).join("") || `<p class="hint">עדיין אין סיכומים שבועיים.</p>`;
}

function renderLegacyHistory(){
  const foods = sorted(state.legacyFood).slice(0,20).map(r => {
    const productLines = r.products ? Object.values(r.products).map(p => `${esc(p.name || "מוצר")}: הוכן ${esc(p.made || "-")} | נשאר ${esc(p.left || "-")}`).join("<br>") : "";
    return `<div class="item"><b>דוח אוכל ישן — ${esc(r.date || "")}</b><br>${productLines}<br>טעם: ${esc(r.taste || "-")}<br>פחת: ${esc(r.wasteNote || "-")}<br>למחר: ${esc(r.tomorrowNote || "-")}</div>`;
  }).join("");
  const oldEmployees = sorted(state.employees).filter(e => !e.sourceDailyReportId).slice(0,20).map(e => `<div class="item"><b>${esc(e.name || "עובד")}</b> — ${esc(e.dateText || e.date || "")}<br>מתוכנן: ${esc(e.plannedOut || "-")} | בפועל: ${esc(e.actualOut || "-")} | חריגה: ${num(e.delayMinutes)} דק׳<br>${esc(e.delayReason || e.reason || "")}</div>`).join("");
  $("legacyHistory").innerHTML = `<h3>דוחות אוכל קודמים</h3>${foods || '<p class="hint">אין דוחות אוכל קודמים.</p>'}<h3>דיווחי עובדים קודמים</h3>${oldEmployees || '<p class="hint">אין דיווחי עובדים קודמים.</p>'}`;
}


const greenBowlAccurateItems = [
  {key:"bread", label:"לחם"},
  {key:"vegetables", label:"ירקות"},
  {key:"proteins", label:"חלבונים"},
  {key:"salads", label:"סלטים"},
  {key:"sauces", label:"רטבים ותוספות"}
];

function greenBowlScoreLabel(score){
  const n = num(score);
  if (n >= 9) return "מצוין";
  if (n >= 7) return "טוב";
  if (n >= 5) return "דורש שיפור";
  return "בעייתי";
}

function collectGreenBowlAccurate(){
  return greenBowlAccurateItems
    .filter(item => checked(`gb_${item.key}`))
    .map(item => item.label);
}

window.saveGreenBowlReport = async () => {
  const date = val("greenBowlDate") || todayLocal();
  const score = num(val("greenBowlScore"));
  if (!score || score < 1 || score > 10) return alert("בחר ציון יומי בין 1 ל־10");
  const data = {
    date,
    score,
    scoreLabel: greenBowlScoreLabel(score),
    accurate: collectGreenBowlAccurate(),
    accurateOther: val("greenBowlAccurateOther"),
    tomorrowChange: val("greenBowlTomorrowChange"),
    waste: val("greenBowlWaste"),
    wasteDetail: val("greenBowlWasteDetail"),
    shortage: val("greenBowlShortage"),
    shortageDetail: val("greenBowlShortageDetail"),
    managerSummary: val("greenBowlSummary"),
    updatedAt: serverTimestamp(),
    updatedAtText: new Date().toLocaleString("he-IL")
  };
  try {
    const existing = sorted(state.greenBowl.filter(r => r.date === date))[0];
    if (existing) await updateDoc(doc(db, "greenBowlReports", existing.id), data);
    else await addDoc(cols.greenBowl, {...data, createdAt:serverTimestamp(), createdAtText:new Date().toLocaleString("he-IL")});
    $("greenBowlSaveHint").textContent = `המעקב של ${heDate(date)} נשמר בענן ובהיסטוריה.`;
    toast("מעקב גרין בול נשמר ✅");
  } catch (error){
    console.error(error);
    alert("לא הצלחתי לשמור את מעקב גרין בול. בדוק חיבור לענן ונסה שוב.");
  }
};

function loadGreenBowlIntoForm(date){
  const report = sorted(state.greenBowl.filter(r => r.date === date))[0];
  greenBowlAccurateItems.forEach(item => { const el=$("gb_"+item.key); if(el) el.checked = Boolean(report?.accurate?.includes(item.label)); });
  $("greenBowlScore").value = report?.score || "";
  $("greenBowlAccurateOther").value = report?.accurateOther || "";
  $("greenBowlTomorrowChange").value = report?.tomorrowChange || "";
  $("greenBowlWaste").value = report?.waste || "לא";
  $("greenBowlWasteDetail").value = report?.wasteDetail || "";
  $("greenBowlShortage").value = report?.shortage || "לא";
  $("greenBowlShortageDetail").value = report?.shortageDetail || "";
  $("greenBowlSummary").value = report?.managerSummary || "";
  $("greenBowlSaveHint").textContent = report ? `נטען מעקב שמור ל־${heDate(date)}. כל שמירה נוספת תעדכן אותו.` : "";
}

function renderGreenBowl(){
  const reports = sorted(state.greenBowl);
  const wrap = $("greenBowlHistory");
  if (!wrap) return;
  wrap.innerHTML = reports.slice(0,60).map(r => {
    const accurate = [...(r.accurate || []), r.accurateOther].filter(Boolean).join(", ") || "לא צוין";
    return `<div class="item green-bowl-history-item">
      <div class="gb-history-head"><b>${heDate(r.date)}</b><span class="score-chip score-${num(r.score)}">${num(r.score)}/10 · ${esc(r.scoreLabel || greenBowlScoreLabel(r.score))}</span></div>
      <b>מה היה מדויק:</b> ${esc(accurate)}<br>
      <b>מה משנים למחר:</b> ${esc(r.tomorrowChange || "אין שינוי")}<br>
      <b>פחת:</b> ${esc(r.waste || "לא")} ${r.wasteDetail?`— ${esc(r.wasteDetail)}`:""}<br>
      <b>חוסר:</b> ${esc(r.shortage || "לא")} ${r.shortageDetail?`— ${esc(r.shortageDetail)}`:""}<br>
      <b>סיכום מנהל:</b> ${esc(r.managerSummary || "-")}
    </div>`;
  }).join("") || `<p class="hint">עדיין אין דיווחי גרין בול.</p>`;
  const last7 = reports.slice(0,7);
  const avg = last7.length ? (last7.reduce((sum,r)=>sum+num(r.score),0)/last7.length).toFixed(1) : "-";
  $("greenBowlStats").innerHTML = `<div class="metric"><b>${reports.length}</b><span>דיווחים שנשמרו</span></div><div class="metric"><b>${avg}</b><span>ממוצע 7 דיווחים</span></div><div class="metric"><b>${last7.filter(r=>num(r.score)>=9).length}</b><span>ימים מצוינים</span></div>`;
}

function renderAll(){
  renderDashboard();
  renderDailyHistory();
  renderIssues();
  renderWeekly();
  renderWeeklyHistory();
  renderTasks();
  renderFoodModule();
  renderImprovements();
  renderLegacyHistory();
  renderGreenBowl();
}

function listenCollection(collectionRef, stateKey, taskType = ""){
  onSnapshot(query(collectionRef), snapshot => {
    state[stateKey] = snapshot.docs.map(d => ({id:d.id, ...d.data()}));
    if (taskType) resetDueTasks(taskType, state[stateKey]);
    renderAll();
    if (stateKey === "greenBowl") loadGreenBowlIntoForm(val("greenBowlDate") || todayLocal());
    if (stateKey === "daily" && !initialDailyLoaded){
      initialDailyLoaded = true;
      loadDailyReportIntoForm(val("dailyDate") || todayLocal());
    }
  }, error => {
    console.error(`Listener error for ${stateKey}`, error);
    setCloud("שגיאת חיבור לענן ⚠️", false);
  });
}

function init(){
  renderTasteRows();
  renderFoodProducts();
  $("dailyDate").value = todayLocal();
  $("foodDate").value = todayLocal();
  $("issueDate").value = todayLocal();
  $("issueFollowUp").value = todayLocal();
  $("greenBowlDate").value = todayLocal();
  $("greenBowlDate").addEventListener("change", () => loadGreenBowlIntoForm(val("greenBowlDate") || todayLocal()));
  window.addEmployeeRow();
  window.addEmployeeRow();
  $("dailyDate").addEventListener("change", () => loadDailyReportIntoForm(val("dailyDate") || todayLocal()));
  listenCollection(cols.daily, "daily");
  listenCollection(cols.issues, "issues");
  listenCollection(cols.weekly, "weekly");
  listenCollection(cols.employees, "employees");
  listenCollection(cols.legacyFood, "legacyFood");
  listenCollection(cols.legacyDailyTasks, "legacyDailyTasks", "daily");
  listenCollection(cols.legacyWeeklyTasks, "legacyWeeklyTasks", "weekly");
  listenCollection(cols.legacyMonthlyTasks, "legacyMonthlyTasks", "monthly");
  listenCollection(cols.legacyOrelTasks, "legacyOrelTasks", "orel");
  listenCollection(cols.improvements, "improvements");
  listenCollection(cols.taskHistory, "taskHistory");
  listenCollection(cols.greenBowl, "greenBowl");
  setCloud("מחובר לענן ✅", true);
}

init();
