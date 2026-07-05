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

const weeklyCol = collection(db, "weeklyTasks");
const orelCol = collection(db, "orelTasks");
const foodCol = collection(db, "foodReports");
const empCol = collection(db, "employeeReports");

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

let state = {weeklyTasks:[], orelTasks:[], foodReports:[], employeeReports:[]};

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
  const snap = await getDocs(weeklyCol);
  if(snap.empty){
    for(const text of defaultWeeklyTasks){
      await addDoc(weeklyCol, {text, done:false, lastDone:"", createdAt:serverTimestamp()});
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

window.toggleWeekly = async (id, done) => {
  await updateDoc(doc(db, "weeklyTasks", id), {
    done: !done,
    lastDone: !done ? new Date().toLocaleDateString("he-IL") : ""
  });
};

window.resetWeekly = async () => {
  if(!confirm("לאפס את כל המשימות השבועיות?")) return;
  for(const t of state.weeklyTasks){
    await updateDoc(doc(db, "weeklyTasks", t.id), {done:false});
  }
};

window.addOrelTask = async () => {
  const text = val("orelTaskText");
  if(!text) return alert("תרשום משימה");
  await addDoc(orelCol, {text, done:false, created:new Date().toLocaleDateString("he-IL"), createdAt:serverTimestamp()});
  document.getElementById("orelTaskText").value="";
};

window.toggleOrel = async (id, done) => {
  await updateDoc(doc(db, "orelTasks", id), {done:!done});
};

window.deleteOrel = async id => {
  if(confirm("למחוק משימה?")) await deleteDoc(doc(db, "orelTasks", id));
};

function minutes(t){
  if(!t) return null;
  const [h,m]=t.split(":").map(Number);
  return h*60+m;
}

function delayStatus(planned, actual){
  const p=minutes(planned), a=minutes(actual);
  if(p===null || a===null) return {text:"לא חושב", diff:0};
  let diff=a-p;
  if(diff<=0) return {text:"🟢 סיים בזמן", diff};
  if(diff<=15) return {text:"🟡 חריגה עד 15 דקות", diff};
  return {text:"🔴 חריגה מעל 15 דקות", diff};
}

window.saveFoodReport = async () => {
  const report = {
    date: val("foodDate") || today(),
    products: {},
    taste: val("foodTaste"),
    tasteNote: val("tasteNote"),
    shiftLevel: val("shiftLevel"),
    wasteNote: val("wasteNote"),
    note: val("foodNote"),
    createdAt: serverTimestamp(),
    createdAtText: new Date().toLocaleString("he-IL")
  };
  products.forEach(p => {
    report.products[p.key] = {
      name: p.name,
      made: val(`${p.key}_made`),
      left: val(`${p.key}_left`),
      status: val(`${p.key}_status`)
    };
  });
  await addDoc(foodCol, report);
  products.forEach(p => clear([`${p.key}_made`, `${p.key}_left`]));
  clear(["tasteNote","wasteNote","foodNote"]);
  alert("דוח אוכל נשמר בענן ✅");
};

window.saveEmployee = async () => {
  if(!val("empName")) return alert("תרשום שם עובד");
  const status = delayStatus(val("empPlannedOut"), val("empActualOut"));
  await addDoc(empCol, {
    name: val("empName"),
    inTime: val("empIn"),
    plannedOut: val("empPlannedOut"),
    actualOut: val("empActualOut"),
    delayStatus: status.text,
    delayMinutes: status.diff,
    rating: val("empRating"),
    delayReason: val("empDelayReason"),
    note: val("empNote"),
    date: new Date().toLocaleDateString("he-IL"),
    createdAt: serverTimestamp()
  });
  clear(["empName","empIn","empPlannedOut","empActualOut","empNote"]);
  alert("דיווח עובד נשמר בענן ✅");
};

function render(){
  const weeklyDone = state.weeklyTasks.filter(t=>t.done).length;
  const progress = state.weeklyTasks.length ? Math.round((weeklyDone/state.weeklyTasks.length)*100) : 0;
  document.getElementById("weeklyProgress").innerText = progress + "%";
  document.getElementById("orelOpen").innerText = state.orelTasks.filter(t=>!t.done).length;
  document.getElementById("foodReports").innerText = state.foodReports.length;
  document.getElementById("employeeReports").innerText = state.employeeReports.length;

  document.getElementById("weeklyTasks").innerHTML = state.weeklyTasks.map(t=>`
    <div class="item ${t.done ? "done" : ""}">
      <b>${t.text}</b><br>
      <span class="badge">${t.done ? "בוצע" : "פתוח"}</span>
      ${t.lastDone ? `<span class="badge">בוצע לאחרונה: ${t.lastDone}</span>` : ""}
      <br><button class="doneBtn" onclick="toggleWeekly('${t.id}', ${t.done})">✔️ בוצע / פתוח</button>
    </div>`).join("");

  document.getElementById("orelTasks").innerHTML = state.orelTasks.map(t=>`
    <div class="item ${t.done ? "done" : ""}">
      <b>${t.text}</b><br>
      <span class="badge">${t.done ? "בוצע" : "פתוח"}</span><br>
      <button class="doneBtn" onclick="toggleOrel('${t.id}', ${t.done})">✔️ בוצע / פתוח</button>
      <button class="delBtn" onclick="deleteOrel('${t.id}')">🗑️ מחק</button>
    </div>`).join("") || `<p class="hint">אין עדיין משימות אישיות.</p>`;

  document.getElementById("employeesList").innerHTML = state.employeeReports.slice(0,5).map(e=>`
    <div class="item">
      <b>${e.name}</b> <span class="badge">${e.date || ""}</span><br>
      כניסה: ${e.inTime || "-"} | צפי סיום: ${e.plannedOut || "-"} | בפועל: ${e.actualOut || "-"}<br>
      ${e.delayStatus || ""} ${e.delayMinutes>0 ? `(+${e.delayMinutes} דק')` : ""}<br>
      ${e.rating || ""}<br>
      סיבה: ${e.delayReason || "-"}<br>
      הערה: ${e.note || "-"}
    </div>`).join("");

  document.getElementById("foodHistory").innerHTML = state.foodReports.slice(0,10).map(r=>{
    const lines = products.map(p=>{
      const x = (r.products && r.products[p.key]) || {};
      return `${p.name}: הוכן ${x.made || "-"} | נשאר ${x.left || "-"} | ${x.status || "-"}`;
    }).join("<br>");
    return `<div class="item">
      <b>${r.date || ""}</b> <span class="badge">${r.shiftLevel || ""}</span><br>
      ${lines}<br>
      😋 טעם: ${r.taste || "-"}<br>
      🍽️ הערת טעם: ${r.tasteNote || "-"}<br>
      🗑️ בזבוז: ${r.wasteNote || "-"}<br>
      📝 הערה: ${r.note || "-"}
    </div>`;
  }).join("") || `<p class="hint">אין עדיין דוחות אוכל.</p>`;

  document.getElementById("employeeHistory").innerHTML = state.employeeReports.slice(0,10).map(e=>`
    <div class="item">
      <b>${e.name}</b> <span class="badge">${e.date || ""}</span><br>
      ${e.inTime || "-"} עד ${e.actualOut || "-"} | ${e.delayStatus || ""}<br>
      ${e.rating || ""}<br>
      ${e.note || ""}
    </div>`).join("") || `<p class="hint">אין עדיין דיווחי עובדים.</p>`;
}

function listen(){
  onSnapshot(query(weeklyCol), snap => {
    state.weeklyTasks = snap.docs.map(d=>({id:d.id,...d.data()}));
    render();
  });
  onSnapshot(query(orelCol), snap => {
    state.orelTasks = snap.docs.map(d=>({id:d.id,...d.data()}));
    render();
  });
  onSnapshot(query(foodCol, orderBy("createdAt", "desc")), snap => {
    state.foodReports = snap.docs.map(d=>({id:d.id,...d.data()}));
    render();
  });
  onSnapshot(query(empCol, orderBy("createdAt", "desc")), snap => {
    state.employeeReports = snap.docs.map(d=>({id:d.id,...d.data()}));
    render();
  });
}

renderFoodProducts();
seedWeeklyIfEmpty().then(()=>{
  listen();
  setCloud("מחובר לענן ✅", true);
}).catch(err=>{
  console.error(err);
  setCloud("שגיאת חיבור לענן ⚠️", false);
  alert("יש בעיה בחיבור ל-Firebase. שלח צילום מסך.");
});
