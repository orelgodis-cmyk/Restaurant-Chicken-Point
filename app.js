import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc,
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
  legacyOrelTasks: col("orelTasks")
};

const state = {
  daily: [], issues: [], weekly: [], employees: [], legacyFood: [],
  legacyDailyTasks: [], legacyWeeklyTasks: [], legacyMonthlyTasks: [], legacyOrelTasks: []
};

let employeeRowCounter = 0;

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
  if (item?.closedAt?.toMillis) return item.closedAt.toMillis();
  if (item?.createdAtText) return new Date(item.createdAtText).getTime() || 0;
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
  ["oldStock","abnormalProduct","shortage","plannedChicken","plannedSalads","plannedPotato","quantityPlan","goal1","goal2","goal3","midDecision","endLeftovers","wasteProduct","wasteQuantity","wasteReason","newIssueSummary","tomorrowChange"].forEach(id => { if ($(id)) $(id).value = ""; });
  $("fridgeTour").checked = false;
  [1,2,3].forEach(i => { $("tasteProduct"+i).value=""; $("tasteNote"+i).value=""; $("tasteStatus"+i).value="טוב וטרי"; });
  $("employeeRows").innerHTML = "";
  window.addEmployeeRow();
  window.addEmployeeRow();
}

window.saveDailyReport = async () => {
  const date = val("dailyDate") || todayLocal();
  const employees = collectEmployees();
  const tastes = [1,2,3].map(i => ({
    product: val(`tasteProduct${i}`), status: val(`tasteStatus${i}`), note: val(`tasteNote${i}`)
  })).filter(t => t.product || t.note);

  const report = {
    date,
    opening: {
      fridgeTour: checked("fridgeTour"), oldStock: val("oldStock"), freshnessStatus: val("freshnessStatus"),
      abnormalProduct: val("abnormalProduct"), shortage: val("shortage"), tastes
    },
    quantities: {
      expectedLoad: val("expectedLoad"), chicken: val("plannedChicken"), salads: val("plannedSalads"),
      potato: val("plannedPotato"), plan: val("quantityPlan")
    },
    goals: [val("goal1"), val("goal2"), val("goal3")],
    employees,
    midday: {
      clean: val("midClean"), moreFood: val("midMoreFood"), prep: val("midPrep"),
      actualLoad: val("actualLoad"), decision: val("midDecision")
    },
    endDay: {
      leftovers: val("endLeftovers"), wasteProduct: val("wasteProduct"), wasteQuantity: num(val("wasteQuantity")),
      wasteUnit: val("wasteUnit"), wasteReason: val("wasteReason"), newIssueSummary: val("newIssueSummary"),
      tomorrowChange: val("tomorrowChange")
    },
    createdAt: serverTimestamp(), createdAtText: new Date().toLocaleString("he-IL")
  };

  try {
    const saved = await addDoc(cols.daily, report);
    for (const employee of employees){
      if (!employee.name) continue;
      await addDoc(cols.employees, {
        ...employee,
        delayStatus: employee.delayMinutes > 15 ? "🔴 חריגה מעל 15 דקות" : employee.delayMinutes > 0 ? "🟡 חריגה עד 15 דקות" : "🟢 סיים בזמן",
        delayReason: employee.reason,
        note: "נשמר מתוך הדוח היומי החדש",
        date,
        dateText: heDate(date),
        sourceDailyReportId: saved.id,
        createdAt: serverTimestamp()
      });
    }
    $("dailySaveHint").textContent = `הדוח של ${heDate(date)} נשמר בענן ובהיסטוריה.`;
    toast("הדוח היומי נשמר ✅");
    clearTodayForm();
    $("dailyDate").value = todayLocal();
  } catch (error){
    console.error(error);
    alert("לא הצלחתי לשמור את הדוח. בדוק שהאפליקציה מחוברת לענן ונסה שוב.");
  }
};

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
  return {daily, issuesOpened, issuesClosed, employees, overtimeMinutes, wasteRows, topWaste, topCategory, topDelayed};
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
        overtimeMinutes: metrics.overtimeMinutes, topWaste: metrics.topWaste || null,
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
  $("managerSummary").innerHTML = `
    <b>🎯 מה דורש תשומת לב:</b><br>
    ${openIssues.length ? `🚨 יש ${openIssues.length} מעקבים פתוחים.` : "✅ אין כרגע בעיות פתוחות."}<br>
    ${nextFollow ? `📅 הבדיקה הקרובה: <b>${esc(nextFollow.title)}</b> — ${heDate(nextFollow.followUpDate)}.` : ""}<br>
    ${lastDaily?.endDay?.tomorrowChange ? `➡️ מהדוח האחרון למחר: ${esc(lastDaily.endDay.tomorrowChange)}` : "עדיין לא נשמר שינוי למחר."}
  `;
}

function dailyCard(r){
  const tastes = (r.opening?.tastes || []).filter(t => t.product).map(t => `${esc(t.product)} — ${esc(t.status)}`).join(" | ") || "לא נרשמו טעימות";
  const emp = (r.employees || []).map(e => `${esc(e.name || "עובד")}: ${esc(e.plannedOut || "-")}→${esc(e.actualOut || "-")} ${num(e.delayMinutes)>0?`(+${num(e.delayMinutes)} דק׳)`:""}`).join("<br>") || "לא נרשמו עובדים";
  const goals = (r.goals || []).filter(Boolean).map(g => `• ${esc(g)}`).join("<br>") || "לא נרשמו יעדים";
  return `<div class="item">
    <b>${heDate(r.date)}</b> <span class="badge">${esc(r.midday?.actualLoad || r.quantities?.expectedLoad || "")}</span><br>
    <b>מקררים:</b> ${r.opening?.fridgeTour ? "בוצע" : "לא סומן"} | <b>טריות:</b> ${esc(r.opening?.freshnessStatus || "-")}<br>
    <b>סחורה ישנה:</b> ${esc(r.opening?.oldStock || "-")}<br>
    <b>טעימות:</b> ${tastes}<br>
    <b>כמויות:</b> עוף ${esc(r.quantities?.chicken || "-")} | סלטים ${esc(r.quantities?.salads || "-")} | תפוח אדמה ${esc(r.quantities?.potato || "-")}<br>
    <b>יעדים:</b><br>${goals}<br>
    <b>עובדים:</b><br>${emp}<br>
    <b>אמצע יום:</b> ניקיון ${esc(r.midday?.clean || "-")} | אוכל ${esc(r.midday?.moreFood || "-")} | ${esc(r.midday?.prep || "-")}<br>
    <b>נשאר:</b> ${esc(r.endDay?.leftovers || "-")}<br>
    <b>פחת:</b> ${num(r.endDay?.wasteQuantity) ? `${esc(r.endDay?.wasteProduct)} — ${num(r.endDay?.wasteQuantity)} ${esc(r.endDay?.wasteUnit)}` : "לא נרשם פחת כמותי"}<br>
    <b>למחר:</b> ${esc(r.endDay?.tomorrowChange || "-")}
  </div>`;
}

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
    <div class="metric"><b>${state.daily.length}</b><span>דוחות בכל ההיסטוריה</span></div>`;

  const insights = [];
  if (m.topWaste) insights.push(`<div class="insight warn">🗑️ המוצר עם הכמות המצטברת הגבוהה ביותר השבוע: <b>${esc(m.topWaste[0])}</b> — ${m.topWaste[1]} יחידות מדידה שנרשמו.</div>`);
  else insights.push(`<div class="insight good">✅ לא נרשם השבוע פחת כמותי בדוחות החדשים.</div>`);
  if (m.topDelayed) insights.push(`<div class="insight warn">⏰ העובד עם הכי הרבה דקות חריגה השבוע: <b>${esc(m.topDelayed[0])}</b> — ${m.topDelayed[1]} דקות.</div>`);
  else insights.push(`<div class="insight good">✅ לא נמצאו חריגות שעות השבוע.</div>`);
  if (m.topCategory) insights.push(`<div class="insight">🔎 תחום הבעיה שחזר הכי הרבה: <b>${esc(m.topCategory[0])}</b> — ${m.topCategory[1]} דיווחים.</div>`);
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

function renderLegacyTasks(){
  const taskHTML = items => items.map(t => `<div class="legacy-task ${t.done?"done":""}">${t.done?"✅":"⬜"} ${esc(t.text || "משימה")}</div>`).join("") || `<p class="hint">אין נתונים.</p>`;
  $("legacyDailyTasks").innerHTML = taskHTML(state.legacyDailyTasks);
  $("legacyWeeklyTasks").innerHTML = taskHTML(state.legacyWeeklyTasks);
  $("legacyMonthlyTasks").innerHTML = taskHTML(state.legacyMonthlyTasks);
  $("legacyOrelTasks").innerHTML = taskHTML(state.legacyOrelTasks);
}

function renderLegacyHistory(){
  const foods = sorted(state.legacyFood).slice(0,20).map(r => {
    const productLines = r.products ? Object.values(r.products).map(p => `${esc(p.name || "מוצר")}: הוכן ${esc(p.made || "-")} | נשאר ${esc(p.left || "-")}`).join("<br>") : "";
    return `<div class="item"><b>דוח אוכל ישן — ${esc(r.date || "")}</b><br>${productLines}<br>טעם: ${esc(r.taste || "-")}<br>פחת: ${esc(r.wasteNote || "-")}<br>למחר: ${esc(r.tomorrowNote || "-")}</div>`;
  }).join("");
  const oldEmployees = sorted(state.employees).filter(e => !e.sourceDailyReportId).slice(0,20).map(e => `<div class="item"><b>${esc(e.name || "עובד")}</b> — ${esc(e.dateText || e.date || "")}<br>מתוכנן: ${esc(e.plannedOut || "-")} | בפועל: ${esc(e.actualOut || "-")} | חריגה: ${num(e.delayMinutes)} דק׳<br>${esc(e.delayReason || e.reason || "")}</div>`).join("");
  $("legacyHistory").innerHTML = `<h3>דוחות אוכל קודמים</h3>${foods || '<p class="hint">אין דוחות אוכל קודמים.</p>'}<h3>דיווחי עובדים קודמים</h3>${oldEmployees || '<p class="hint">אין דיווחי עובדים קודמים.</p>'}`;
}

function renderAll(){
  renderDashboard();
  renderDailyHistory();
  renderIssues();
  renderWeekly();
  renderWeeklyHistory();
  renderLegacyTasks();
  renderLegacyHistory();
}

function listenCollection(collectionRef, stateKey){
  onSnapshot(query(collectionRef), snapshot => {
    state[stateKey] = snapshot.docs.map(d => ({id:d.id, ...d.data()}));
    renderAll();
  }, error => {
    console.error(`Listener error for ${stateKey}`, error);
    setCloud("שגיאת חיבור לענן ⚠️", false);
  });
}

function init(){
  renderTasteRows();
  $("dailyDate").value = todayLocal();
  $("issueDate").value = todayLocal();
  $("issueFollowUp").value = todayLocal();
  window.addEmployeeRow();
  window.addEmployeeRow();
  listenCollection(cols.daily, "daily");
  listenCollection(cols.issues, "issues");
  listenCollection(cols.weekly, "weekly");
  listenCollection(cols.employees, "employees");
  listenCollection(cols.legacyFood, "legacyFood");
  listenCollection(cols.legacyDailyTasks, "legacyDailyTasks");
  listenCollection(cols.legacyWeeklyTasks, "legacyWeeklyTasks");
  listenCollection(cols.legacyMonthlyTasks, "legacyMonthlyTasks");
  listenCollection(cols.legacyOrelTasks, "legacyOrelTasks");
  setCloud("מחובר לענן ✅", true);
}

init();
