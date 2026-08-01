import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, increment
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
const $ = id => document.getElementById(id);
const val = id => ($(id)?.value || "").trim();
const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
const numberValue = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const quantityUnits = ["יחידות","ק״ג","מגשים","גסטרו","פיילות","ליטר"];


const collections = {
  food: col("foodReports"),
  green: col("greenBowlReports"),
  daily: col("dailyTasks"),
  weekly: col("weeklyTasks"),
  monthly: col("monthlyTasks"),
  orel: col("orelTasks"),
  reminders: col("orelReminders"),
  taskHistory: col("taskHistory"),
  midday: col("middayRestaurantChecks")
};

const state = {
  food: [], green: [], daily: [], weekly: [], monthly: [], orel: [], reminders: [], taskHistory: [], midday: []
};

const foodItems = [
  {key:"potato", name:"תפוח אדמה"},
  {key:"roastedCabbage", name:"כרוב צלוי"},
  {key:"mashedPotato", name:"פירה"},
  {key:"coleslaw", name:"קולסלו"},
  {key:"greenSalad", name:"סלט ירוק"}
];

const taskConfig = {
  daily:{collection:"dailyTasks", stateKey:"daily", label:"יומית"},
  weekly:{collection:"weeklyTasks", stateKey:"weekly", label:"שבועית"},
  monthly:{collection:"monthlyTasks", stateKey:"monthly", label:"חודשית"},
  orel:{collection:"orelTasks", stateKey:"orel", label:"אישית"}
};

let activeTaskFilter = "open";
let greenRowCounter = 0;

function todayLocal(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function heDate(iso){
  if (!iso) return "";
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("he-IL");
}

function timestampMs(item){
  for (const key of ["createdAt","completedAt","updatedAt"]){
    if (item?.[key]?.toMillis) return item[key].toMillis();
  }
  for (const key of ["createdAtText","completedAtText","date"]){
    if (item?.[key]){
      const ms = new Date(item[key].includes?.("T") ? item[key] : `${item[key]}T00:00:00`).getTime();
      if (ms) return ms;
    }
  }
  return 0;
}

function sorted(items){ return [...items].sort((a,b)=>timestampMs(b)-timestampMs(a)); }

function toast(message){
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2400);
}

function setCloud(text, ok=true){
  const el = $("cloudStatus");
  el.textContent = text;
  el.className = `cloud ${ok ? "ok" : "bad"}`;
}

function currentPeriod(type, iso=todayLocal()){
  if (type === "daily") return iso;
  if (type === "monthly") return iso.slice(0,7);
  if (type === "weekly"){
    const [y,m,d] = iso.split("-").map(Number);
    const dt = new Date(y,m-1,d);
    dt.setDate(dt.getDate()-dt.getDay());
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  }
  return "once";
}

window.openView = (viewId, anchorId="") => {
  location.hash = viewId.replace("View","");
  showView(viewId, anchorId);
};

window.goHome = () => {
  history.replaceState(null,"",location.pathname + location.search);
  showView("homeView");
};

function showView(viewId, anchorId=""){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===viewId));
  window.scrollTo({top:0,behavior:"instant"});
  if (anchorId) setTimeout(()=>$(anchorId)?.scrollIntoView({behavior:"smooth",block:"start"}),80);
}

window.addEventListener("hashchange",()=>{
  const map = {food:"foodView",green:"greenView",tasks:"tasksView"};
  showView(map[location.hash.slice(1)] || "homeView");
});

function unitOptions(selected="יחידות"){
  return quantityUnits.map(unit=>`<option ${unit===selected?"selected":""}>${unit}</option>`).join("");
}

function formatQuantity(value, unit){
  const amount = numberValue(value);
  return amount ? `${amount} ${unit || "יחידות"}` : "0";
}

function aggregateTotals(entries){
  const totals = {left:{}, waste:{}};
  entries.forEach(entry=>{
    const unit = entry.unit || "יחידות";
    const left = numberValue(entry.leftQuantity ?? entry.leftQty);
    const waste = numberValue(entry.wasteQuantity ?? entry.wasteQty);
    if (left) totals.left[unit] = (totals.left[unit] || 0) + left;
    if (waste) totals.waste[unit] = (totals.waste[unit] || 0) + waste;
  });
  return totals;
}

function formatTotalsGroup(group){
  const parts = Object.entries(group).filter(([,value])=>value>0).map(([unit,value])=>`${Number(value.toFixed(2))} ${unit}`);
  return parts.join(" · ") || "0";
}

function totalsHTML(reports, entriesGetter){
  const entries = reports.flatMap(entriesGetter);
  const totals = aggregateTotals(entries);
  return `<div class="totals-grid">
    <div class="total-card left-total"><span>סה״כ נשאר</span><b>${esc(formatTotalsGroup(totals.left))}</b></div>
    <div class="total-card waste-total"><span>סה״כ נזרק</span><b>${esc(formatTotalsGroup(totals.waste))}</b></div>
    <div class="total-card"><span>מספר דיווחים</span><b>${reports.length}</b></div>
  </div>`;
}

function renderFoodProducts(){
  $("foodProducts").innerHTML = foodItems.map(item=>`
    <div class="product-quantity-card">
      <div class="product-card-head">
        <b>${esc(item.name)}</b>
        <select id="food_${item.key}">
          <option>לא נשאר</option>
          <option selected>נשאר מעט</option>
          <option>נשאר הרבה</option>
          <option>היה חסר</option>
          <option>לא הוכן</option>
        </select>
      </div>
      <div class="quantity-grid">
        <div><label for="food_${item.key}_left">כמה נשאר?</label><input id="food_${item.key}_left" type="number" min="0" step="0.1" placeholder="0"></div>
        <div><label for="food_${item.key}_waste">כמה נזרק?</label><input id="food_${item.key}_waste" type="number" min="0" step="0.1" placeholder="0"></div>
        <div><label for="food_${item.key}_unit">יחידה</label><select id="food_${item.key}_unit">${unitOptions()}</select></div>
      </div>
    </div>`).join("");
}

window.saveFoodReport = async () => {
  const date = val("foodDate") || todayLocal();
  const products = {};
  let hasQuantity = false;
  foodItems.forEach(item=>{
    const status = val(`food_${item.key}`);
    const leftQuantity = numberValue(val(`food_${item.key}_left`));
    const wasteQuantity = numberValue(val(`food_${item.key}_waste`));
    const unit = val(`food_${item.key}_unit`) || "יחידות";
    if (leftQuantity || wasteQuantity) hasQuantity = true;
    products[item.key] = {name:item.name,status,left:status,made:"",leftQuantity,wasteQuantity,unit};
  });
  const report = {
    date,
    shiftLevel:val("shiftLevel"),
    products,
    keepNote:val("foodKeepNote"),
    note:val("foodKeepNote"),
    tomorrowNote:val("foodTomorrowNote"),
    middayDecision:val("middayDecision"),
    middayNote:val("middayNote"),
    createdAt:serverTimestamp(),
    createdAtText:new Date().toLocaleString("he-IL")
  };
  if (!report.middayDecision && !report.keepNote && !report.tomorrowNote && !hasQuantity){
    return alert("תבחר החלטה ב־12:00, תרשום הערה או תכניס כמות שנשארה/נזרקה.");
  }
  try{
    await addDoc(collections.food,report);
    if (report.middayDecision){
      await addDoc(collections.midday,{date,decision:report.middayDecision,note:report.middayNote,createdAt:serverTimestamp(),createdAtText:new Date().toLocaleString("he-IL")});
    }
    $("foodKeepNote").value="";
    $("foodTomorrowNote").value="";
    $("middayNote").value="";
    foodItems.forEach(item=>{
      $(`food_${item.key}_left`).value="";
      $(`food_${item.key}_waste`).value="";
    });
    toast("מעקב האוכל והכמויות נשמרו ✅");
    goHome();
  }catch(error){
    console.error(error); alert("לא הצלחתי לשמור. בדוק חיבור לאינטרנט ונסה שוב.");
  }
};

function foodEntries(report){
  return foodItems.map(item=>{
    const product = report.products?.[item.key];
    return product ? {...product,name:product.name || item.name} : null;
  }).filter(Boolean);
}

function renderFoodHistory(){
  const reports = sorted(state.food);
  $("foodTotals").innerHTML = totalsHTML(reports, foodEntries);
  $("foodHistory").innerHTML = reports.slice(0,60).map(r=>{
    const productLines = foodEntries(r).map(p=>{
      const details = [];
      if (numberValue(p.leftQuantity)) details.push(`נשאר ${formatQuantity(p.leftQuantity,p.unit)}`);
      if (numberValue(p.wasteQuantity)) details.push(`נזרק ${formatQuantity(p.wasteQuantity,p.unit)}`);
      if (!details.length && (p.status || p.left)) details.push(p.status || p.left);
      return details.length ? `<div class="quantity-history-line"><b>${esc(p.name)}:</b> ${esc(details.join(" · "))}</div>` : "";
    }).filter(Boolean).join("");
    return `<div class="history-item"><b>${heDate(r.date)} · ${esc(r.shiftLevel||"")}</b>${productLines ? `<div class="quantity-history">${productLines}</div>` : `<small>דוח ללא כמויות מספריות</small>`}${r.middayDecision?`<p><b>12:00:</b> ${esc(r.middayDecision)} ${r.middayNote?`— ${esc(r.middayNote)}`:""}</p>`:""}${r.keepNote||r.note?`<p><b>לשמר:</b> ${esc(r.keepNote||r.note)}</p>`:""}${r.tomorrowNote?`<p><b>למחר:</b> ${esc(r.tomorrowNote)}</p>`:""}</div>`;
  }).join("") || `<div class="empty-state">עדיין אין דוחות אוכל.</div>`;
}

window.addGreenQuantityRow = (data={}) => {
  const id = ++greenRowCounter;
  const row = document.createElement("div");
  row.className = "quantity-entry-row";
  row.dataset.greenRow = String(id);
  row.innerHTML = `
    <div class="quantity-entry-head"><input class="green-product" placeholder="שם המוצר" value="${esc(data.product||"")}"><button type="button" onclick="removeGreenQuantityRow(${id})" aria-label="הסר מוצר">🗑️</button></div>
    <div class="quantity-grid">
      <div><label>כמה נשאר?</label><input class="green-left" type="number" min="0" step="0.1" placeholder="0" value="${data.leftQuantity||data.leftQty||""}"></div>
      <div><label>כמה נזרק?</label><input class="green-waste" type="number" min="0" step="0.1" placeholder="0" value="${data.wasteQuantity||data.wasteQty||""}"></div>
      <div><label>יחידה</label><select class="green-unit">${unitOptions(data.unit||"יחידות")}</select></div>
    </div>`;
  $("greenQuantityRows").appendChild(row);
};

window.removeGreenQuantityRow = id => {
  document.querySelector(`[data-green-row="${id}"]`)?.remove();
};

function collectGreenQuantities(){
  return [...document.querySelectorAll("[data-green-row]")].map(row=>({
    product:row.querySelector(".green-product")?.value.trim() || "",
    leftQuantity:numberValue(row.querySelector(".green-left")?.value),
    wasteQuantity:numberValue(row.querySelector(".green-waste")?.value),
    unit:row.querySelector(".green-unit")?.value || "יחידות"
  })).filter(item=>item.product && (item.leftQuantity || item.wasteQuantity));
}

function resetGreenQuantityRows(){
  $("greenQuantityRows").innerHTML="";
  greenRowCounter=0;
  addGreenQuantityRow();
  addGreenQuantityRow();
}

window.saveGreenReport = async () => {
  const date = val("greenDate") || todayLocal();
  const accurate = val("greenAccurate");
  const wasteNote = val("greenWasteNote");
  const tomorrow = val("greenTomorrow");
  const quantities = collectGreenQuantities();
  if (!accurate && !wasteNote && !tomorrow && !quantities.length) return alert("תרשום לפחות פרט אחד או כמות שנשארה/נזרקה.");
  try{
    await addDoc(collections.green,{
      date,
      status:val("greenStatus"),
      rating:"",
      accurate,
      quantities,
      leftovers:wasteNote,
      waste:wasteNote,
      wasteNote,
      actions:accurate,
      tomorrow,
      createdAt:serverTimestamp(),
      createdAtText:new Date().toLocaleString("he-IL")
    });
    ["greenAccurate","greenWasteNote","greenTomorrow"].forEach(id=>$(id).value="");
    resetGreenQuantityRows();
    toast("מעקב גרין בול והכמויות נשמרו ✅");
    goHome();
  }catch(error){
    console.error(error); alert("לא הצלחתי לשמור. בדוק חיבור לאינטרנט ונסה שוב.");
  }
};

function greenEntries(report){
  return Array.isArray(report.quantities) ? report.quantities : [];
}

function renderGreenHistory(){
  const reports = sorted(state.green);
  $("greenTotals").innerHTML = totalsHTML(reports, greenEntries);
  $("greenHistory").innerHTML = reports.slice(0,60).map(r=>{
    const quantityLines = greenEntries(r).map(item=>{
      const details=[];
      if (numberValue(item.leftQuantity ?? item.leftQty)) details.push(`נשאר ${formatQuantity(item.leftQuantity ?? item.leftQty,item.unit)}`);
      if (numberValue(item.wasteQuantity ?? item.wasteQty)) details.push(`נזרק ${formatQuantity(item.wasteQuantity ?? item.wasteQty,item.unit)}`);
      return `<div class="quantity-history-line"><b>${esc(item.product||"מוצר")}:</b> ${esc(details.join(" · "))}</div>`;
    }).join("");
    return `<div class="history-item">
      <b>${heDate(r.date)} · ${esc(r.status||"דוח גרין בול")}</b>
      ${quantityLines ? `<div class="quantity-history">${quantityLines}</div>` : `<small>דוח ללא כמויות מספריות</small>`}
      ${r.accurate||r.actions?`<p><b>מדויק:</b> ${esc(r.accurate||r.actions)}</p>`:""}
      ${r.wasteNote||r.waste||r.leftovers?`<p><b>הערת פחת/חוסר:</b> ${esc(r.wasteNote||r.waste||r.leftovers)}</p>`:""}
      ${r.tomorrow?`<p><b>למחר:</b> ${esc(r.tomorrow)}</p>`:""}
    </div>`;
  }).join("") || `<div class="empty-state">עדיין אין דוחות גרין בול.</div>`;
}

window.toggleReminderFields = () => {
  const show = val("taskKind") === "reminder";
  $("reminderDateWrap").classList.toggle("hidden",!show);
  $("reminderTimeWrap").classList.toggle("hidden",!show);
};

window.addTaskOrReminder = async () => {
  const text = val("taskText");
  const kind = val("taskKind");
  if (!text) return alert("תרשום מה צריך לעשות.");
  try{
    if (kind === "reminder"){
      const date = val("taskDate") || todayLocal();
      await addDoc(collections.reminders,{text,date,time:val("taskTime"),category:"אישי",done:false,createdAt:serverTimestamp(),createdAtText:new Date().toLocaleString("he-IL")});
    }else{
      const cfg = taskConfig[kind];
      await addDoc(col(cfg.collection),{text,done:false,taskType:kind,createdAt:serverTimestamp(),createdAtText:new Date().toLocaleString("he-IL")});
    }
    $("taskText").value="";
    toast("המשימה נוספה ✅");
  }catch(error){
    console.error(error); alert("לא הצלחתי להוסיף את המשימה.");
  }
};

window.completeTask = async (source,id) => {
  try{
    if (source === "reminder"){
      const item = state.reminders.find(x=>x.id===id);
      await updateDoc(doc(db,"orelReminders",id),{done:true,completedAt:serverTimestamp(),completedAtText:new Date().toLocaleString("he-IL")});
      await addDoc(collections.taskHistory,{taskId:id,taskText:item?.text||"תזכורת",taskType:"reminder",taskTypeLabel:"תזכורת",completedDate:todayLocal(),completedAt:serverTimestamp(),completedAtText:new Date().toLocaleString("he-IL")});
    }else{
      const cfg = taskConfig[source];
      const item = state[cfg.stateKey].find(x=>x.id===id);
      await updateDoc(doc(db,cfg.collection,id),{done:true,lastDoneISO:todayLocal(),lastDone:new Date().toLocaleDateString("he-IL"),lastDonePeriod:currentPeriod(source),completedAt:serverTimestamp(),completionCount:increment(1)});
      await addDoc(collections.taskHistory,{taskId:id,taskText:item?.text||"משימה",taskType:source,taskTypeLabel:cfg.label,completedDate:todayLocal(),completedAt:serverTimestamp(),completedAtText:new Date().toLocaleString("he-IL")});
    }
    toast("סומן כבוצע ✅");
  }catch(error){console.error(error);alert("לא הצלחתי לעדכן את המשימה.");}
};

window.deleteTaskItem = async (source,id) => {
  if (!confirm("למחוק את המשימה?")) return;
  try{
    const collectionName = source === "reminder" ? "orelReminders" : taskConfig[source].collection;
    await deleteDoc(doc(db,collectionName,id));
    toast("המשימה נמחקה");
  }catch(error){console.error(error);alert("לא הצלחתי למחוק.");}
};

window.setTaskFilter = (filter,button) => {
  activeTaskFilter = filter;
  document.querySelectorAll("[data-task-filter]").forEach(btn=>btn.classList.toggle("active",btn===button));
  renderTasks();
};

function reminderDue(r){
  if (r.done) return false;
  const today = todayLocal();
  if (!r.date) return false;
  return r.date <= today;
}

function taskRows(){
  const rows = [];
  for (const type of ["daily","weekly","monthly","orel"]){
    const cfg = taskConfig[type];
    state[cfg.stateKey].forEach(item=>rows.push({...item,source:type,typeLabel:cfg.label}));
  }
  state.reminders.forEach(item=>rows.push({...item,source:"reminder",typeLabel:"תזכורת"}));
  return rows;
}

function renderTasks(){
  let rows = taskRows().filter(r=>!r.done);
  if (activeTaskFilter === "daily") rows = rows.filter(r=>r.source==="daily");
  if (activeTaskFilter === "weekly") rows = rows.filter(r=>r.source==="weekly");
  if (activeTaskFilter === "personal") rows = rows.filter(r=>["orel","reminder","monthly"].includes(r.source));
  rows.sort((a,b)=>{
    if (a.source==="reminder" && b.source!=="reminder") return -1;
    if (b.source==="reminder" && a.source!=="reminder") return 1;
    return timestampMs(b)-timestampMs(a);
  });
  $("tasksList").innerHTML = rows.map(r=>{
    const due = r.source==="reminder" && reminderDue(r);
    const when = r.source==="reminder" ? `${heDate(r.date)}${r.time?` · ${esc(r.time)}`:""}` : r.lastDone ? `בוצע לאחרונה: ${esc(r.lastDone)}` : r.typeLabel;
    return `<div class="task-item ${due?"due":""}"><div><b>${esc(r.text||"משימה")}</b><small>${esc(when||r.typeLabel)}</small></div><div class="task-actions"><button class="done-btn" onclick="completeTask('${r.source}','${r.id}')">✔️</button><button class="delete-btn" onclick="deleteTaskItem('${r.source}','${r.id}')">🗑️</button></div></div>`;
  }).join("") || `<div class="empty-state">אין משימות פתוחות 🎉</div>`;

  $("taskHistory").innerHTML = sorted(state.taskHistory).slice(0,60).map(h=>`<div class="history-item"><b>✅ ${esc(h.taskText||"משימה")}</b><small>${esc(h.taskTypeLabel||h.taskType||"")} · ${heDate(h.completedDate)||esc(h.completedAtText||"")}</small></div>`).join("") || `<div class="empty-state">ההיסטוריה תופיע כאן אחרי ביצוע משימות.</div>`;
}

async function resetRecurringTasks(type,items){
  if (!["daily","weekly","monthly"].includes(type)) return;
  const period = currentPeriod(type);
  for (const item of items){
    if (!item.done) continue;
    const previous = item.lastDonePeriod || (item.lastDoneISO ? currentPeriod(type,item.lastDoneISO) : "");
    if (previous === period) continue;
    try{ await updateDoc(doc(db,taskConfig[type].collection,item.id),{done:false,autoResetAt:serverTimestamp(),autoResetForPeriod:period}); }
    catch(error){ console.warn("Task reset failed",error); }
  }
}

function renderHome(){
  const today = todayLocal();
  const foodToday = state.food.some(r=>r.date===today);
  const greenToday = state.green.some(r=>r.date===today);
  const middayToday = state.midday.some(r=>r.date===today) || state.food.some(r=>r.date===today && r.middayDecision);
  const openTasks = taskRows().filter(r=>!r.done).length;

  $("foodBadge").textContent = foodToday ? "מולא היום ✅" : "לא מולא היום";
  $("foodBadge").classList.toggle("done",foodToday);
  $("greenBadge").textContent = greenToday ? "מולא היום ✅" : "לא מולא היום";
  $("greenBadge").classList.toggle("done",greenToday);
  $("tasksBadge").textContent = `${openTasks} פתוחות`;

  const now = new Date();
  const due = now.getHours() >= 12;
  const banner = $("middayBanner");
  banner.classList.toggle("due",due && !middayToday);
  banner.classList.toggle("done",middayToday);
  $("middayBannerText").textContent = middayToday ? "הבדיקה בוצעה ונשמרה היום ✅" : due ? "הגיע הזמן לבדוק אם להכניס עוד אוכל או לעצור הכנות" : "לבדוק אם להכניס עוד אוכל או לעצור הכנות";
  $("middayState").textContent = middayToday ? "בוצע היום ✅" : "ממתין לבדיקה";
  $("middayState").classList.toggle("done",middayToday);

  const doneCount = [foodToday,greenToday,middayToday].filter(Boolean).length;
  $("homeSummary").textContent = `${doneCount}/3 בדיקות עיקריות הושלמו היום · ${openTasks} משימות פתוחות`;
}

function renderAll(){
  renderFoodHistory();
  renderGreenHistory();
  renderTasks();
  renderHome();
}

function listen(source,key){
  onSnapshot(source,snapshot=>{
    state[key] = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    if (["daily","weekly","monthly"].includes(key)) resetRecurringTasks(key,state[key]);
    renderAll();
    setCloud("מחובר לענן",true);
  },error=>{
    console.error(error); setCloud("שגיאת חיבור",false);
  });
}

function init(){
  const today = todayLocal();
  $("todayLabel").textContent = new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"});
  $("foodDate").value = today;
  $("greenDate").value = today;
  $("taskDate").value = today;
  renderFoodProducts();
  resetGreenQuantityRows();
  toggleReminderFields();

  listen(collections.food,"food");
  listen(collections.green,"green");
  listen(collections.daily,"daily");
  listen(collections.weekly,"weekly");
  listen(collections.monthly,"monthly");
  listen(collections.orel,"orel");
  listen(collections.reminders,"reminders");
  listen(collections.taskHistory,"taskHistory");
  listen(collections.midday,"midday");

  const map = {food:"foodView",green:"greenView",tasks:"tasksView"};
  showView(map[location.hash.slice(1)] || "homeView");
  setInterval(renderHome,60000);
}

init();
