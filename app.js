import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, updateDoc,
  deleteDoc, onSnapshot, query, orderBy, serverTimestamp
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
  weekly: col("weeklyTasks"),
  dailyTasks: col("dailyTasks"),
  monthlyTasks: col("monthlyTasks"),
  orel: col("orelTasks"),
  food: col("foodReports"),
  emp: col("employeeReports"),
  improvements: col("improvements")
};

const defaultWeeklyTasks = [
  "ניקוי פנימי של המדיח + ריכוך",
  "החלפת מנדפים מעל הצ'יפסר (פעם 1)",
  "החלפת מנדפים מעל הצ'יפסר (פעם 2)",
  "ניקוי דלת החנות",
  "שטיפת המחסן"
];

const products = [
  {key:"potato", name:"🥔 תפוח אדמה"},
  {key:"cabbage", name:"🥬 כרוב צלוי"},
  {key:"chicken", name:"🍗 עוף"},
  {key:"schnitzel", name:"🍗 שניצלים"},
  {key:"salads", name:"🥗 סלטים"}
];

let state = {weeklyTasks:[], dailyTasks:[], monthlyTasks:[], orelTasks:[], foodReports:[], employeeReports:[], improvements:[]};

window.go = id => document.getElementById(id).scrollIntoView({behavior:"smooth"});
const val = id => document.getElementById(id).value.trim();
const today = () => new Date().toISOString().slice(0,10);
const clear = ids => ids.forEach(id => { const e=document.getElementById(id); if(e) e.value=""; });
document.getElementById("foodDate").value = today();

function setCloud(text, ok=true){
  const el=document.getElementById("cloudStatus");
  el.textContent=text;
  el.className = "cloud " + (ok ? "ok" : "bad");
}

async function seedWeeklyIfEmpty(){
  const snap = await getDocs(cols.weekly);
  if(snap.empty){
    for(const text of defaultWeeklyTasks){
      await addDoc(cols.weekly, {text, done:false, lastDone:"", createdAt:serverTimestamp()});
    }
  }
}

function renderFoodProducts(){
  document.getElementById("foodProducts").innerHTML = products.map(p => `
    <div class="product">
      <h3>${p.name}</h3>
      <div class="row">
        <div><label>כמה הכנו / הכנסנו?</label><input id="${p.key}_made" placeholder="לדוגמה: 6 מגשים"></div>
        <div><label>כמה נשאר?</label><input id="${p.key}_left" placeholder="לדוגמה: 1 מגש"></div>
      </div>
      <label>מצב בסוף יום</label>
      <select id="${p.key}_status">
        <option>🟢 היה בדיוק</option>
        <option>🟡 נשאר ממש מעט</option>
        <option>🔴 נגמר</option>
        <option>⚪ נשאר יותר מדי</option>
      </select>
    </div>`).join("");
}

function minutes(t){ if(!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; }
function delayStatus(planned, actual){
  const p=minutes(planned), a=minutes(actual);
  if(p===null || a===null) return {text:"לא חושב", diff:0};
  let diff=a-p;
  if(diff<=0) return {text:"🟢 סיים בזמן", diff};
  if(diff<=15) return {text:"🟡 חריגה עד 15 דקות", diff};
  return {text:"🔴 חריגה מעל 15 דקות", diff};
}

async function toggleIn(collectionName, id, done, extra={}){
  await updateDoc(doc(db, collectionName, id), {done:!done, ...extra});
}
async function deleteIn(collectionName, id){ if(confirm("למחוק?")) await deleteDoc(doc(db, collectionName, id)); }

window.toggleWeekly = async (id, done) => toggleIn("weeklyTasks", id, done, {lastDone: !done ? new Date().toLocaleDateString("he-IL") : ""});
window.resetWeekly = async () => { if(!confirm("לאפס את כל המשימות השבועיות?")) return; for(const t of state.weeklyTasks){ await updateDoc(doc(db,"weeklyTasks",t.id), {done:false}); } };

window.addDailyTask = async () => { const text=val("dailyTaskText"); if(!text)return alert("תרשום משימה"); await addDoc(cols.dailyTasks,{text,done:false,createdAt:serverTimestamp()}); clear(["dailyTaskText"]); };
window.toggleDaily = async (id,done)=>toggleIn("dailyTasks",id,done);
window.deleteDaily = async id=>deleteIn("dailyTasks",id);

window.addMonthlyTask = async () => { const text=val("monthlyTaskText"); if(!text)return alert("תרשום משימה"); await addDoc(cols.monthlyTasks,{text,done:false,createdAt:serverTimestamp()}); clear(["monthlyTaskText"]); };
window.toggleMonthly = async (id,done)=>toggleIn("monthlyTasks",id,done);
window.deleteMonthly = async id=>deleteIn("monthlyTasks",id);

window.addOrelTask = async () => { const text=val("orelTaskText"); if(!text)return alert("תרשום משימה"); await addDoc(cols.orel,{text,done:false,created:new Date().toLocaleDateString("he-IL"),createdAt:serverTimestamp()}); clear(["orelTaskText"]); };
window.toggleOrel = async (id,done)=>toggleIn("orelTasks",id,done);
window.deleteOrel = async id=>deleteIn("orelTasks",id);

window.addImprovement = async () => { const text=val("improveText"); if(!text)return alert("תרשום שיפור"); await addDoc(cols.improvements,{text,priority:val("improvePriority"),done:false,createdAt:serverTimestamp()}); clear(["improveText"]); };
window.toggleImprovement = async (id,done)=>toggleIn("improvements",id,done);
window.deleteImprovement = async id=>deleteIn("improvements",id);

window.saveFoodReport = async () => {
  const report = {
    date: val("foodDate") || today(),
    products: {},
    taste: val("foodTaste"),
    tasteNote: val("tasteNote"),
    shiftLevel: val("shiftLevel"),
    wasteNote: val("wasteNote"),
    note: val("foodNote"),
    tomorrowNote: val("tomorrowNote"),
    createdAt: serverTimestamp(),
    createdAtText: new Date().toLocaleString("he-IL")
  };
  products.forEach(p => report.products[p.key] = {name:p.name, made:val(`${p.key}_made`), left:val(`${p.key}_left`), status:val(`${p.key}_status`)});
  await addDoc(cols.food, report);
  products.forEach(p => clear([`${p.key}_made`, `${p.key}_left`]));
  clear(["tasteNote","wasteNote","foodNote","tomorrowNote"]);
  alert("דוח אוכל נשמר בענן ✅");
};

window.saveEmployee = async () => {
  if(!val("empName")) return alert("תרשום שם עובד");
  const status = delayStatus(val("empPlannedOut"), val("empActualOut"));
  await addDoc(cols.emp, {
    name: val("empName"), inTime: val("empIn"), plannedOut: val("empPlannedOut"), actualOut: val("empActualOut"),
    delayStatus: status.text, delayMinutes: status.diff, rating: val("empRating"), delayReason: val("empDelayReason"),
    note: val("empNote"), date: new Date().toLocaleDateString("he-IL"), createdAt: serverTimestamp()
  });
  clear(["empName","empIn","empPlannedOut","empActualOut","empNote"]);
  alert("דיווח עובד נשמר בענן ✅");
};

function taskListHTML(items, toggleFn, delFn){
  return items.map(t=>`<div class="item ${t.done?"done":""}"><b>${t.text}</b><br><span class="badge">${t.done?"בוצע":"פתוח"}</span><br><button class="doneBtn" onclick="${toggleFn}('${t.id}', ${t.done})">✔️ בוצע / פתוח</button><button class="delBtn" onclick="${delFn}('${t.id}')">🗑️ מחק</button></div>`).join("") || `<p class="hint">אין עדיין משימות.</p>`;
}

function render(){
  const weeklyDone = state.weeklyTasks.filter(t=>t.done).length;
  const progress = state.weeklyTasks.length ? Math.round((weeklyDone/state.weeklyTasks.length)*100) : 0;
  document.getElementById("weeklyProgress").innerText = progress + "%";
  document.getElementById("orelOpen").innerText = state.orelTasks.filter(t=>!t.done).length;
  document.getElementById("foodReports").innerText = state.foodReports.length;
  document.getElementById("employeeReports").innerText = state.employeeReports.length;

  const lastFood = state.foodReports[0];
  const delayed = state.employeeReports.filter(e=>e.delayMinutes>0).length;
  document.getElementById("managerSummary").innerHTML = `
    <b>🎯 תמונת מצב:</b><br>
    📋 משימות שבועיות פתוחות: ${state.weeklyTasks.filter(t=>!t.done).length}<br>
    👑 משימות אוראל פתוחות: ${state.orelTasks.filter(t=>!t.done).length}<br>
    👨‍🍳 עובדים עם חריגה בזמן: ${delayed}<br>
    ${lastFood ? `🍗 דוח אחרון: ${lastFood.date} | ${lastFood.shiftLevel} | טעם: ${lastFood.taste}` : "עדיין אין דוחות אוכל"}<br>
    ${lastFood && lastFood.tomorrowNote ? `🎯 למחר: ${lastFood.tomorrowNote}` : ""}
  `;

  document.getElementById("dailyTasks").innerHTML = taskListHTML(state.dailyTasks, "toggleDaily", "deleteDaily");
  document.getElementById("monthlyTasks").innerHTML = taskListHTML(state.monthlyTasks, "toggleMonthly", "deleteMonthly");
  document.getElementById("orelTasks").innerHTML = taskListHTML(state.orelTasks, "toggleOrel", "deleteOrel");
  document.getElementById("improvementsList").innerHTML = taskListHTML(state.improvements, "toggleImprovement", "deleteImprovement");

  document.getElementById("weeklyTasks").innerHTML = state.weeklyTasks.map(t=>`
    <div class="item ${t.done?"done":""}"><b>${t.text}</b><br><span class="badge">${t.done?"בוצע":"פתוח"}</span>${t.lastDone?`<span class="badge">בוצע לאחרונה: ${t.lastDone}</span>`:""}<br><button class="doneBtn" onclick="toggleWeekly('${t.id}', ${t.done})">✔️ בוצע / פתוח</button></div>`).join("");

  document.getElementById("employeesList").innerHTML = state.employeeReports.slice(0,5).map(e=>`
    <div class="item"><b>${e.name}</b> <span class="badge">${e.date||""}</span><br>
    כניסה: ${e.inTime||"-"} | צפי: ${e.plannedOut||"-"} | בפועל: ${e.actualOut||"-"}<br>
    ${e.delayStatus||""} ${e.delayMinutes>0?`(+${e.delayMinutes} דק')`:""}<br>${e.rating||""}<br>סיבה: ${e.delayReason||"-"}<br>הערה: ${e.note||"-"}</div>`).join("");

  document.getElementById("foodHistory").innerHTML = state.foodReports.slice(0,10).map(r=>{
    const lines = products.map(p=>{ const x=(r.products&&r.products[p.key])||{}; return `${p.name}: הוכן ${x.made||"-"} | נשאר ${x.left||"-"} | ${x.status||"-"}`; }).join("<br>");
    return `<div class="item"><b>${r.date||""}</b> <span class="badge">${r.shiftLevel||""}</span><br>${lines}<br>😋 טעם: ${r.taste||"-"}<br>🍽️ הערת טעם: ${r.tasteNote||"-"}<br>🗑️ בזבוז: ${r.wasteNote||"-"}<br>📝 הערה: ${r.note||"-"}<br>🎯 למחר: ${r.tomorrowNote||"-"}</div>`;
  }).join("") || `<p class="hint">אין עדיין דוחות אוכל.</p>`;

  document.getElementById("employeeHistory").innerHTML = state.employeeReports.slice(0,10).map(e=>`
    <div class="item"><b>${e.name}</b> <span class="badge">${e.date||""}</span><br>${e.inTime||"-"} עד ${e.actualOut||"-"} | ${e.delayStatus||""}<br>${e.rating||""}<br>${e.note||""}</div>`).join("") || `<p class="hint">אין עדיין דיווחי עובדים.</p>`;

  document.getElementById("insightsBox").innerHTML = buildInsights();
}

function buildInsights(){
  const reports = state.foodReports;
  if(reports.length < 2) return "צריך לפחות 2 דוחות אוכל כדי להתחיל להציג תובנות.";
  let statusCounts = {};
  reports.forEach(r => products.forEach(p => {
    const s = r.products?.[p.key]?.status || "";
    if(!statusCounts[p.name]) statusCounts[p.name] = {};
    statusCounts[p.name][s] = (statusCounts[p.name][s]||0)+1;
  }));
  return Object.entries(statusCounts).map(([name, counts]) => {
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="item"><b>${name}</b><br>המצב שחזר הכי הרבה: ${top?.[0]||"-"} (${top?.[1]||0} פעמים)</div>`;
  }).join("");
}

function listenCollection(collectionRef, key, ordered=false){
  const q = ordered ? query(collectionRef, orderBy("createdAt","desc")) : query(collectionRef);
  onSnapshot(q, snap => { state[key] = snap.docs.map(d=>({id:d.id,...d.data()})); render(); });
}

function listen(){
  listenCollection(cols.weekly, "weeklyTasks");
  listenCollection(cols.dailyTasks, "dailyTasks", true);
  listenCollection(cols.monthlyTasks, "monthlyTasks", true);
  listenCollection(cols.orel, "orelTasks", true);
  listenCollection(cols.food, "foodReports", true);
  listenCollection(cols.emp, "employeeReports", true);
  listenCollection(cols.improvements, "improvements", true);
}

renderFoodProducts();
seedWeeklyIfEmpty().then(()=>{ listen(); setCloud("מחובר לענן ✅", true); }).catch(err=>{ console.error(err); setCloud("שגיאת חיבור לענן ⚠️", false); alert("יש בעיה בחיבור ל-Firebase. שלח צילום מסך."); });
