const KEY = "restaurant_os_v1";
let db = JSON.parse(localStorage.getItem(KEY) || '{"daily":[],"tasks":[],"presence":[],"ideas":[]}');

document.getElementById("reportDate").value = new Date().toISOString().slice(0,10);

function save(){
  localStorage.setItem(KEY, JSON.stringify(db));
  render();
}

function scrollToBox(id){
  document.getElementById(id).scrollIntoView({behavior:"smooth"});
}

function val(id){
  return document.getElementById(id).value.trim();
}

function clear(ids){
  ids.forEach(id => document.getElementById(id).value = "");
}

function saveDaily(){
  db.daily.unshift({
    date: val("reportDate") || new Date().toISOString().slice(0,10),
    potatoMade: val("potatoMade"),
    potatoLeft: val("potatoLeft"),
    cabbageMade: val("cabbageMade"),
    cabbageLeft: val("cabbageLeft"),
    schnitzel: val("schnitzel"),
    waste: val("waste"),
    note: val("dailyNote")
  });
  clear(["potatoMade","potatoLeft","cabbageMade","cabbageLeft","schnitzel","waste","dailyNote"]);
  save();
  alert("הדיווח נשמר ✅");
}

function addTask(){
  if(!val("taskText")) return alert("תרשום משימה");
  db.tasks.unshift({
    text: val("taskText"),
    type: val("taskType"),
    owner: val("taskOwner"),
    done: false
  });
  clear(["taskText","taskOwner"]);
  save();
}

function toggleTask(i){
  db.tasks[i].done = !db.tasks[i].done;
  save();
}

function deleteTask(i){
  db.tasks.splice(i,1);
  save();
}

function savePresence(){
  if(!val("employeeName")) return alert("תרשום שם עובד");
  db.presence.unshift({
    name: val("employeeName"),
    inTime: val("inTime"),
    outTime: val("outTime"),
    note: val("presenceNote"),
    date: new Date().toLocaleDateString("he-IL")
  });
  clear(["employeeName","inTime","outTime","presenceNote"]);
  save();
}

function addIdea(){
  if(!val("ideaText")) return alert("תרשום רעיון");
  db.ideas.unshift({
    text: val("ideaText"),
    priority: val("ideaPriority"),
    done: false
  });
  clear(["ideaText"]);
  save();
}

function toggleIdea(i){
  db.ideas[i].done = !db.ideas[i].done;
  save();
}

function render(){
  document.getElementById("openTasks").innerText = db.tasks.filter(t=>!t.done).length;
  document.getElementById("dailyReports").innerText = db.daily.length;
  document.getElementById("presenceCount").innerText = db.presence.length;
  document.getElementById("ideasCount").innerText = db.ideas.filter(i=>!i.done).length;

  document.getElementById("dailyList").innerHTML = db.daily.slice(0,5).map(d => `
    <div class="item">
      <b>${d.date}</b><br>
      🥔 הכנו: ${d.potatoMade || "-"} | נשאר: ${d.potatoLeft || "-"}<br>
      🥬 הכנו: ${d.cabbageMade || "-"} | נשאר: ${d.cabbageLeft || "-"}<br>
      🍗 ${d.schnitzel || "-"}<br>
      🗑️ ${d.waste || "-"}<br>
      📝 ${d.note || "-"}
    </div>
  `).join("");

  document.getElementById("tasksList").innerHTML = db.tasks.map((t,i) => `
    <div class="item ${t.done ? "done" : ""}">
      <b>${t.text}</b><br>
      סוג: ${t.type} | אחראי: ${t.owner || "-"}<br>
      <button class="doneBtn" onclick="toggleTask(${i})">✔️ בוצע / פתוח</button>
      <button class="delBtn" onclick="deleteTask(${i})">🗑️ מחק</button>
    </div>
  `).join("");

  document.getElementById("presenceList").innerHTML = db.presence.slice(0,10).map(p => `
    <div class="item">
      <b>${p.name}</b> - ${p.date}<br>
      כניסה: ${p.inTime || "-"} | יציאה: ${p.outTime || "-"}<br>
      ${p.note || ""}
    </div>
  `).join("");

  document.getElementById("ideasList").innerHTML = db.ideas.map((idea,i) => `
    <div class="item ${idea.done ? "done" : ""}">
      <b>${idea.text}</b><br>
      עדיפות: ${idea.priority}<br>
      <button class="doneBtn" onclick="toggleIdea(${i})">✔️ בוצע / פתוח</button>
    </div>
  `).join("");
}
render();
