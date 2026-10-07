(function () {
  "use strict";

  var KEY = "sekigae-kuji-v1";
  var COLORS = ["#8e2f2a", "#21573f", "#2d4f78", "#8a5a12", "#5d4578", "#1f6a70"];
  var MAX_FILE = 5 * 1024 * 1024;

  var state = defaultState();
  var pending = null;
  var busy = false;
  var audioCtx = null;
  var fxTimer = 0;
  var toastTimer = 0;

  function defaultState() {
    return {
      v: 1, students: [], rows: [6, 6, 6, 6], columns: null, pins: [], groups: [],
      assignment: null, unseated: [], history: null, aisle: false, teacherView: false,
      avoidOpposite: false, assignMode: "random", numberFrom: "left", filledBy: "", gaps: [],
      sound: true, mode: "view", draft: null, swapFrom: null, nextId: 1
    };
  }

  function clampInt(value, min, max) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = min;
    return Math.min(max, Math.max(min, n));
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function studentById(id) {
    for (var i = 0; i < state.students.length; i += 1) if (state.students[i].id === id) return state.students[i];
    return null;
  }
  function seatsNow() {
    var gaps = {};
    state.gaps.forEach(function (id) { gaps[id] = 1; });
    return Sekigae.makeSeats(state.rows, state.columns).filter(function (seat) { return !gaps[seat.id]; });
  }
  function isGap(id) {
    return state.gaps.indexOf(id) >= 0;
  }
  function chartGrid(mirror) {
    return Sekigae.buildChartGrid(state.rows, {
      aisle: state.aisle,
      mirror: !!mirror,
      columns: state.columns,
      gaps: state.gaps
    });
  }
  function neighborMap() {
    return Sekigae.seatNeighbors(state.rows, { aisle: state.aisle, columns: state.columns, gaps: state.gaps });
  }
  function seatCountInRow(row) {
    var n = 0;
    seatsNow().forEach(function (seat) { if (seat.row === row) n += 1; });
    return n;
  }
  function toggle(list, id) {
    var index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else list.push(id);
  }
  function heldStudent(id) {
    return state.pins.some(function (pin) { return pin.studentId === id; }) ||
      state.groups.some(function (group) { return group.studentIds.indexOf(id) >= 0; });
  }
  function heldSeat(id) {
    return state.pins.some(function (pin) { return pin.seatId === id; }) ||
      state.groups.some(function (group) { return group.seatIds.indexOf(id) >= 0; });
  }
  function groupForSeat(id) {
    for (var i = 0; i < state.groups.length; i += 1) if (state.groups[i].seatIds.indexOf(id) >= 0) return state.groups[i];
    return null;
  }
  function groupIntact(group) {
    var found = {};
    Object.keys(state.assignment || {}).forEach(function (id) {
      var person = state.assignment[id];
      if (group.studentIds.indexOf(person) >= 0 && group.seatIds.indexOf(id) >= 0) found[person] = 1;
    });
    var i;
    for (i = 0; i < group.studentIds.length; i += 1) if (!found[group.studentIds[i]]) return false;
    return true;
  }
  function howOf(seatId, studentId) {
    if (!studentId) return "空席";
    var pin = null;
    state.pins.forEach(function (item) { if (item.studentId === studentId) pin = item; });
    if (pin) return pin.seatId === seatId ? "固定" : "手直し";
    var group = null;
    state.groups.forEach(function (item) { if (item.studentIds.indexOf(studentId) >= 0) group = item; });
    if (group) {
      if (group.seatIds.indexOf(seatId) >= 0) return group.name ? "限定抽選（" + group.name + "）" : "限定抽選";
      return "手直し";
    }
    if (state.pins.some(function (item) { return item.seatId === seatId; })) return "手直し";
    var seatGroup = groupForSeat(seatId);
    if (seatGroup && !groupIntact(seatGroup)) return "手直し";
    if (state.filledBy === "left") return "出席番号順（左はじ）";
    if (state.filledBy === "right") return "出席番号順（右はじ）";
    return "ランダム";
  }
  function kindOf(how) {
    if (how === "固定") return "pin";
    if (how.indexOf("限定") === 0) return "group";
    return "open";
  }
  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { flash("この端末に結果を保存できませんでした。"); }
  }
  function cleanId(id, prefix) { return typeof id === "string" && new RegExp("^" + prefix + "\\d+$").test(id) ? id : ""; }
  function load() {
    var data;
    try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (err) { return; }
    if (!data || data.v !== 1) return;
    var next = defaultState();
    var maxId = 1;
    if (Array.isArray(data.students)) {
      data.students.slice(0, 500).forEach(function (item) {
        var id = cleanId(item && item.id, "s");
        if (!id || !item.name) return;
        next.students.push({
          id: id,
          number: String(item.number || "").slice(0, 20),
          name: String(item.name).slice(0, 80),
          gender: Sekigae.cleanGender(item.gender)
        });
        maxId = Math.max(maxId, parseInt(id.slice(1), 10) || 0);
      });
    }
    if (Array.isArray(data.rows) && data.rows.length <= 20 && data.rows.every(function (n) { return typeof n === "number" && n >= 0 && n <= 20; })) next.rows = data.rows.slice();
    var columnsIn = Array.isArray(data.columns) && data.columns.length ? data.columns : null;
    var adopted = Sekigae.adoptLayout(next.rows, columnsIn, data.gaps);
    next.rows = adopted.rows;
    next.columns = null;
    next.gaps = adopted.gaps;
    var knownS = {};
    next.students.forEach(function (s) { knownS[s.id] = 1; });
    var knownSeat = adopted.seats;
    if (Array.isArray(data.pins)) {
      data.pins.forEach(function (pin) {
        var seatId = adopted.mapId(pin.seatId);
        if (knownS[pin.studentId] && knownSeat[seatId]) next.pins.push({ studentId: pin.studentId, seatId: seatId });
      });
    }
    if (Array.isArray(data.groups)) {
      data.groups.slice(0, 12).forEach(function (group) {
        var id = cleanId(group.id, "g");
        if (!id) return;
        var people = (group.studentIds || []).filter(function (sid) { return knownS[sid]; });
        var seats = [];
        var seenSeat = {};
        (group.seatIds || []).forEach(function (sid) {
          var nextId = adopted.mapId(sid);
          if (!knownSeat[nextId] || seenSeat[nextId]) return;
          seenSeat[nextId] = 1;
          seats.push(nextId);
        });
        if (!people.length || !seats.length || people.length > seats.length) return;
        next.groups.push({ id: id, name: String(group.name || "").slice(0, 24), studentIds: people, seatIds: seats, color: group.color || COLORS[0] });
        maxId = Math.max(maxId, parseInt(id.slice(1), 10) || 0);
      });
    }
    if (data.assignment && typeof data.assignment === "object") {
      next.assignment = {};
      Object.keys(data.assignment).forEach(function (seatId) {
        var nextId = adopted.mapId(seatId);
        if (knownSeat[nextId] && knownS[data.assignment[seatId]]) next.assignment[nextId] = data.assignment[seatId];
      });
    }
    next.unseated = Array.isArray(data.unseated) ? data.unseated.filter(function (id) { return knownS[id]; }) : [];
    next.aisle = !!data.aisle;
    next.teacherView = !!data.teacherView;
    next.avoidOpposite = !!data.avoidOpposite;
    next.assignMode = data.assignMode === "number" ? "number" : "random";
    next.numberFrom = data.numberFrom === "right" ? "right" : "left";
    next.filledBy = data.filledBy === "left" || data.filledBy === "right" ? data.filledBy : "";
    next.sound = data.sound !== false;
    if (data.mode === "gap") next.mode = "gap";
    next.nextId = Math.max(maxId, data.nextId | 0);
    state = next;
  }

  function flash(message) {
    var el = document.getElementById("toast");
    el.hidden = false;
    el.textContent = message;
    document.getElementById("live").textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4200);
  }

  function describe(rows, holes) {
    var total = rows.reduce(function (sum, n) { return sum + n; }, 0) - (holes || 0);
    if (total < 0) total = 0;
    var even = rows.length > 0 && rows.every(function (n) { return n === rows[0]; });
    if (even) return rows.length + "行 × " + rows[0] + "列（合計" + total + "席）";
    return "合計" + total + "席 / " + rows.length + "行";
  }
  function problems() {
    var seats = seatsNow();
    var errors = Sekigae.validate(state.students, seats, state.pins, state.groups);
    var warnings = Sekigae.warningsFor(state.students, seats, state.pins, state.groups);
    if (!state.students.length) errors.push("名簿がありません。");
    if (!seats.length) errors.push("座席がありません。");
    if (state.draft && (state.draft.studentIds.length || state.draft.seatIds.length)) errors.push("作りかけの限定抽選を確定するか、やめてください。");
    return { errors: errors, warnings: warnings, seats: seats };
  }

  function renderStatus() {
    var report = problems();
    var bits = ["名簿 " + state.students.length + "人", describe(state.rows, state.gaps.length)];
    if (state.pins.length) bits.push("固定 " + state.pins.length);
    if (state.groups.length) bits.push("限定抽選 " + state.groups.length + "組");
    if (state.gaps.length) bits.push("抜き " + state.gaps.length + "席");
    var oppositeLeft = state.avoidOpposite && state.assignment
      ? Sekigae.countOpposite(state.students, state.assignment, neighborMap())
      : 0;
    if (oppositeLeft > 0) bits.push("周りが異性だけの席が" + oppositeLeft + "人分残っています");
    document.getElementById("status").textContent = bits.concat(report.errors, report.warnings).join(" / ");
    document.getElementById("btnDraw").disabled = report.errors.length > 0 || busy;
    document.getElementById("btnQuiet").disabled = report.errors.length > 0 || busy;
    document.getElementById("btnUndo").disabled = !state.history;
    var poster = document.getElementById("viewPoster");
    var teacher = document.getElementById("viewTeacher");
    poster.setAttribute("aria-pressed", state.teacherView ? "false" : "true");
    teacher.setAttribute("aria-pressed", state.teacherView ? "true" : "false");
    document.getElementById("aisle").checked = state.aisle;
    document.getElementById("avoidOpposite").checked = state.avoidOpposite;
    document.getElementById("assignMode").value = state.assignMode === "number" ? "number" : "random";
    document.getElementById("numberFrom").value = state.numberFrom === "right" ? "right" : "left";
    var numberOrder = state.assignMode === "number";
    document.getElementById("numberFromLabel").hidden = !numberOrder;
    document.getElementById("numberHint").hidden = !numberOrder;
    document.getElementById("pinMode").setAttribute("aria-pressed", state.mode === "pin" ? "true" : "false");
    document.getElementById("gapHint").hidden = false;
    document.getElementById("swapMode").setAttribute("aria-pressed", state.mode === "swap" ? "true" : "false");
    document.getElementById("btnSound").setAttribute("aria-pressed", state.sound ? "true" : "false");
    document.getElementById("btnSound").textContent = state.sound ? "音あり" : "音なし";
    document.getElementById("draftBox").hidden = !state.draft;
    document.getElementById("newGroup").hidden = !!state.draft;
    document.getElementById("rosterPickHint").hidden = !(state.mode === "group" && state.draft);
  }

  function renderRoster() {
    var list = document.getElementById("roster");
    var filter = document.getElementById("rosterFilter").value.trim().toLowerCase();
    list.textContent = "";
    state.students.forEach(function (student) {
      var item = document.createElement("li");
      item.className = "person";
      item.dataset.id = student.id;
      var number = document.createElement("input");
      number.value = student.number;
      number.maxLength = 20;
      number.setAttribute("aria-label", "番号");
      var picking = state.mode === "group" && state.draft;
      if (picking) item.classList.add("is-picking");
      var name = document.createElement(picking ? "button" : "input");
      if (picking) {
        name.type = "button";
        name.className = "pick-person";
        name.dataset.pickStudent = student.id;
        name.dataset.personName = student.name;
        name.textContent = student.name;
      } else {
        name.value = student.name;
        name.maxLength = 80;
        name.setAttribute("aria-label", "名前");
      }
      var gender = document.createElement("select");
      gender.setAttribute("aria-label", "性別");
      [["", "—"], ["男", "男"], ["女", "女"]].forEach(function (pair) {
        var option = document.createElement("option");
        option.value = pair[0];
        option.textContent = pair[1];
        gender.appendChild(option);
      });
      gender.value = student.gender === "男" || student.gender === "女" ? student.gender : "";
      var remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "削除";
      remove.dataset.removeStudent = student.id;
      number.addEventListener("input", function () { onPersonEdit(student.id, "number", number.value); });
      if (!picking) name.addEventListener("input", function () { onPersonEdit(student.id, "name", name.value); });
      gender.addEventListener("change", function () { onPersonEdit(student.id, "gender", gender.value); });
      item.append(number, name, gender, remove);
      var hay = (student.number + " " + student.name + " " + (student.gender || "")).toLowerCase();
      item.hidden = !!filter && hay.indexOf(filter) < 0;
      list.appendChild(item);
    });
    paintPeople();
    renderPinSelect();
  }

  function paintPeople() {
    var draftIds = state.draft ? state.draft.studentIds : [];
    document.querySelectorAll(".person").forEach(function (el) {
      var chosen = draftIds.indexOf(el.dataset.id) >= 0;
      el.classList.toggle("is-in-draft", chosen);
      el.classList.toggle("is-locked", heldStudent(el.dataset.id));
      var pick = el.querySelector("[data-pick-student]");
      if (pick) {
        pick.setAttribute("aria-pressed", chosen ? "true" : "false");
        pick.textContent = (chosen ? "選択中 " : "") + (pick.dataset.personName || "");
      }
    });
  }

  function renderPinSelect() {
    var select = document.getElementById("pinStudent");
    var current = select.value;
    select.textContent = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "人を選ぶ";
    select.appendChild(blank);
    state.students.forEach(function (student) {
      if (state.groups.some(function (group) { return group.studentIds.indexOf(student.id) >= 0; })) return;
      var option = document.createElement("option");
      option.value = student.id;
      option.textContent = (student.number ? student.number + " " : "") + student.name + (student.gender ? "（" + student.gender + "）" : "");
      select.appendChild(option);
    });
    if (current) select.value = current;
  }

  function renderRoom() {
    var grid = chartGrid(state.teacherView);
    var room = document.getElementById("room");
    room.classList.toggle("is-gapping", state.mode === "gap");
    room.textContent = "";
    var stack = document.createElement("div");
    stack.className = "room-stack";
    var front = document.createElement("p");
    front.className = "front-label";
    front.textContent = "前";
    var board = document.createElement("div");
    board.className = "board";
    board.id = "board";
    board.textContent = "黒板";
    var note = document.createElement("p");
    note.className = "view-note";
    note.textContent = state.teacherView
      ? "教員用。教卓から見て左が左。黒板は前の中央。"
      : "掲示用。黒板に向かって左が左。黒板は前の中央。";
    stack.append(front, board, note);
    grid.lines.forEach(function (line) {
      var row = document.createElement("div");
      row.className = "seat-row";
      var label = document.createElement("div");
      label.className = "row-label";
      label.textContent = line.row + 1 + "行目";
      var lineEl = document.createElement("div");
      lineEl.className = "seat-line";
      line.cells.forEach(function (cell) {
        if (cell.type === "pad") {
          var pad = document.createElement("span");
          pad.className = "pad";
          lineEl.appendChild(pad);
          return;
        }
        if (cell.type === "gap") {
          var hole = document.createElement("button");
          hole.type = "button";
          hole.className = "pad is-gap";
          hole.dataset.seat = "r" + line.row + "c" + cell.col;
          hole.textContent = "×";
          hole.setAttribute("aria-label", "抜いた席");
          hole.title = "抜いた席。もう一度クリックすると戻ります。";
          lineEl.appendChild(hole);
          return;
        }
        if (cell.type === "aisle") {
          var aisle = document.createElement("span");
          aisle.className = "aisle";
          aisle.textContent = "通路";
          lineEl.appendChild(aisle);
          return;
        }
        lineEl.appendChild(seatButton(line.row, cell.col));
      });
      row.append(label, lineEl);
      stack.appendChild(row);
    });
    var back = document.createElement("p");
    back.className = "back-label";
    back.textContent = "うしろ";
    stack.appendChild(back);
    room.appendChild(stack);
    renderUnseated();
    syncBoard();
  }

  function syncBoard() {
    var room = document.getElementById("room");
    var line = room && room.querySelector(".seat-line");
    if (room && line) {
      var label = line.parentElement.querySelector(".row-label");
      var labelWidth = label ? label.offsetWidth + 8 : 0;
      var count = line.children.length || 1;
      var seat = Math.floor((room.clientWidth - labelWidth - 6 * Math.max(0, count - 1)) / count);
      if (!isFinite(seat) || seat < 28) seat = 28;
      if (seat > 92) seat = 92;
      room.style.setProperty("--seat", seat + "px");
      var guard = 0;
      while (room.scrollWidth > room.clientWidth + 1 && seat > 28 && guard < 48) {
        seat -= 1;
        room.style.setProperty("--seat", seat + "px");
        guard += 1;
      }
    }
    var board = document.getElementById("board");
    var width = 0;
    document.querySelectorAll(".seat-line").forEach(function (row) { width = Math.max(width, row.offsetWidth); });
    if (board && width) board.style.width = width + "px";
  }

  function seatButton(row, col) {
    var seatId = "r" + row + "c" + col;
    var studentId = state.assignment ? state.assignment[seatId] : "";
    var student = studentId ? studentById(studentId) : null;
    var pin = state.pins.some(function (item) { return item.seatId === seatId; });
    var group = groupForSeat(seatId);
    var button = document.createElement("button");
    button.type = "button";
    button.className = "seat";
    button.dataset.seat = seatId;
    if (student) button.dataset.student = student.id;
    if (student && student.gender === "女") button.classList.add("is-girl");
    if (pin) button.classList.add("is-pin");
    if (group && (!state.assignment || (student && group.studentIds.indexOf(student.id) >= 0))) {
      button.classList.add("is-group");
      button.style.setProperty("--mark", group.color);
    }
    if (state.draft && state.draft.seatIds.indexOf(seatId) >= 0) button.classList.add("is-draft");
    if (state.swapFrom && state.swapFrom.type === "seat" && state.swapFrom.id === seatId) button.classList.add("is-picked");
    var count = state.columns && state.columns.length ? state.columns.length : (state.rows[row] || 0);
    var shown = state.teacherView ? count - col : col + 1;
    var coord = document.createElement("span");
    coord.className = "seat-coord";
    coord.textContent = String(shown);
    var num = document.createElement("span");
    num.className = "seat-num";
    num.textContent = student ? student.number : "";
    var name = document.createElement("span");
    name.className = "seat-name";
    name.textContent = student ? student.name : state.assignment ? "空席" : "";
    var tag = document.createElement("span");
    tag.className = "seat-tag";
    var how = state.assignment ? howOf(seatId, studentId) : "";
    tag.textContent = how === "固定" || how === "手直し" || how.indexOf("限定") === 0 ? (how.indexOf("限定") === 0 ? "限定" : how) : "";
    button.append(coord, num, name, tag);
    button.title = (row + 1) + "行目、" + (state.teacherView ? "教卓から左" : "向かって左から") + shown + "列" + (student ? "、" + student.number + " " + student.name : "");
    return button;
  }

  function renderUnseated() {
    var box = document.getElementById("unseated");
    box.textContent = "";
    if (!state.assignment || !state.unseated.length) return;
    var heading = document.createElement("h3");
    heading.textContent = "席が足りない人";
    box.appendChild(heading);
    state.unseated.forEach(function (id) {
      var student = studentById(id);
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.unseated = id;
      button.textContent = student ? (student.number ? student.number + " " : "") + student.name : id;
      if (state.swapFrom && state.swapFrom.type === "person" && state.swapFrom.id === id) button.classList.add("is-picked");
      box.appendChild(button);
    });
  }

  function renderPins() {
    var list = document.getElementById("pinList");
    list.textContent = "";
    state.pins.forEach(function (pin) {
      var student = studentById(pin.studentId);
      var seat = /^r(\d+)c(\d+)$/.exec(pin.seatId);
      var item = document.createElement("li");
      var text = document.createElement("span");
      text.textContent = (student ? (student.number ? student.number + " " : "") + student.name : "不明") + " → " + (seat ? (Number(seat[1]) + 1) + "列" + (Number(seat[2]) + 1) : "");
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.removePin = pin.studentId;
      button.textContent = "外す";
      item.append(text, button);
      list.appendChild(item);
    });
  }

  function renderGroups() {
    var list = document.getElementById("groupList");
    list.textContent = "";
    state.groups.forEach(function (group) {
      var item = document.createElement("li");
      var text = document.createElement("span");
      var swatch = document.createElement("i");
      swatch.className = "swatch";
      swatch.style.background = group.color;
      text.appendChild(swatch);
      text.appendChild(document.createTextNode((group.name || "組") + " " + group.studentIds.length + "人 / " + group.seatIds.length + "席"));
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.removeGroup = group.id;
      button.textContent = "外す";
      item.append(text, button);
      list.appendChild(item);
    });
  }

  function proposedRows() {
    return Sekigae.gridSeats(
      clampInt(document.getElementById("gridRows").value, 1, 20),
      clampInt(document.getElementById("gridCols").value, 1, 20)
    );
  }
  function updateLayoutPreview() {
    var next = proposedRows();
    document.getElementById("layoutPreview").textContent = next.ok
      ? "いま " + describe(state.rows, state.gaps.length) + "。指定すると " + describe(next.rows, 0) + "。"
      : next.error;
  }
  function syncLayoutPanels() {
    var chart = document.getElementById("layoutMode").value === "chart";
    document.getElementById("gridBox").hidden = chart;
    document.getElementById("applyLayout").hidden = chart;
    document.getElementById("layoutPreview").hidden = chart;
    document.getElementById("gapHint").hidden = false;
  }
  function revealRoom() {
    var room = document.getElementById("room");
    var seat = room && room.querySelector(".seat, .is-gap");
    if (!seat) return;
    var bar = document.querySelector(".drawbar");
    var barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    var top = seat.getBoundingClientRect().top;
    if (top >= 88 && top + seat.offsetHeight < barTop - 8) return;
    window.scrollBy(0, top - 96);
  }
  function exitChart() {
    var select = document.getElementById("layoutMode");
    if (!select || select.value !== "chart") return;
    select.value = "grid";
    if (state.mode === "gap") state.mode = "view";
    syncLayoutPanels();
  }

  function onPersonEdit(id, field, value) {
    var student = studentById(id);
    if (!student) return;
    if (field === "gender") student.gender = Sekigae.cleanGender(value);
    else student[field] = String(value).slice(0, field === "name" ? 80 : 20);
    if (field === "number" || field === "name") {
      document.querySelectorAll(".seat").forEach(function (seat) {
        if (seat.dataset.student !== id) return;
        var node = seat.querySelector(field === "name" ? ".seat-name" : ".seat-num");
        if (node) node.textContent = student[field];
      });
    }
    if (field === "gender") {
      document.querySelectorAll(".seat").forEach(function (seat) {
        if (seat.dataset.student === id) seat.classList.toggle("is-girl", student.gender === "女");
      });
    }
    var option = document.querySelector('#pinStudent option[value="' + id + '"]');
    if (option) option.textContent = (student.number ? student.number + " " : "") + student.name + (student.gender ? "（" + student.gender + "）" : "");
    save();
    renderStatus();
  }

  function removeStudent(id) {
    state.students = state.students.filter(function (student) { return student.id !== id; });
    state.pins = state.pins.filter(function (pin) { return pin.studentId !== id; });
    state.groups.forEach(function (group) { group.studentIds = group.studentIds.filter(function (sid) { return sid !== id; }); });
    state.groups = state.groups.filter(function (group) { return group.studentIds.length && group.seatIds.length; });
    if (state.draft) state.draft.studentIds = state.draft.studentIds.filter(function (sid) { return sid !== id; });
    if (state.assignment) {
      Object.keys(state.assignment).forEach(function (seatId) { if (state.assignment[seatId] === id) delete state.assignment[seatId]; });
    }
    state.unseated = state.unseated.filter(function (sid) { return sid !== id; });
    refresh();
  }

  function pruneToSeats() {
    var known = {};
    seatsNow().forEach(function (seat) { known[seat.id] = 1; });
    state.pins = state.pins.filter(function (pin) { return known[pin.seatId]; });
    state.groups.forEach(function (group) { group.seatIds = group.seatIds.filter(function (id) { return known[id]; }); });
    state.groups = state.groups.filter(function (group) { return group.seatIds.length && group.studentIds.length && group.studentIds.length <= group.seatIds.length; });
    if (state.draft) state.draft.seatIds = state.draft.seatIds.filter(function (id) { return known[id]; });
    if (state.assignment) {
      var next = {};
      Object.keys(state.assignment).forEach(function (seatId) {
        if (known[seatId]) next[seatId] = state.assignment[seatId];
        else state.unseated.push(state.assignment[seatId]);
      });
      state.assignment = next;
    }
  }

  function applyLayout() {
    var next = proposedRows();
    if (!next.ok) { flash(next.error); return; }
    var known = {};
    Sekigae.makeSeats(next.rows, null).forEach(function (seat) { known[seat.id] = 1; });
    var lost = state.pins.some(function (pin) { return !known[pin.seatId]; }) || state.groups.some(function (group) {
      return group.seatIds.some(function (id) { return !known[id]; });
    });
    if ((state.gaps.length || lost) && !window.confirm("行と列で座席を作り直します。抜いた席と、はみ出す指定は外れます。")) return;
    state.rows = next.rows;
    state.columns = null;
    state.gaps = [];
    pruneToSeats();
    refresh();
  }

  function refresh() {
    renderRoster();
    renderRoom();
    renderPins();
    renderGroups();
    renderStatus();
    updateLayoutPreview();
    updateDraftCount();
    save();
  }

  function addPeople(people, replace) {
    if (replace) {
      state.students = [];
      state.pins = [];
      state.groups = [];
      state.assignment = null;
      state.unseated = [];
      state.filledBy = "";
      state.draft = null;
      state.mode = "view";
      exitChart();
    }
    people.slice(0, 500 - state.students.length).forEach(function (person) {
      if (!person.name) return;
      state.nextId += 1;
      state.students.push({
        id: "s" + state.nextId,
        number: String(person.number || "").slice(0, 20),
        name: String(person.name).slice(0, 80),
        gender: Sekigae.cleanGender(person.gender)
      });
    });
    refresh();
  }

  function snapshot() {
    return {
      assignment: state.assignment ? Object.assign({}, state.assignment) : null,
      unseated: state.unseated.slice(),
      filledBy: state.filledBy
    };
  }
  function remember() { state.history = snapshot(); }
  function undo() {
    if (!state.history) return;
    var current = snapshot();
    state.assignment = state.history.assignment ? Object.assign({}, state.history.assignment) : null;
    state.unseated = state.history.unseated.slice();
    state.filledBy = state.history.filledBy === "left" || state.history.filledBy === "right" ? state.history.filledBy : "";
    state.history = current;
    renderRoom();
    renderStatus();
    save();
  }

  function pinTo(seatId) {
    var studentId = document.getElementById("pinStudent").value;
    if (!studentId) { flash("固定する人を選んでください。"); return; }
    if (state.groups.some(function (group) { return group.studentIds.indexOf(studentId) >= 0; })) { flash("この人は限定抽選に入っています。"); return; }
    if (groupForSeat(seatId)) { flash("この席は限定抽選に入っています。"); return; }
    var same = state.pins.some(function (pin) { return pin.studentId === studentId && pin.seatId === seatId; });
    state.pins = state.pins.filter(function (pin) { return pin.studentId !== studentId && pin.seatId !== seatId; });
    if (!same) state.pins.push({ studentId: studentId, seatId: seatId });
    renderRoom();
    renderPins();
    renderStatus();
    save();
  }

  function toggleDraftSeat(seatId) {
    if (heldSeat(seatId) && state.draft.seatIds.indexOf(seatId) < 0) { flash("この席はすでに指定されています。"); return; }
    toggle(state.draft.seatIds, seatId);
    renderRoom();
    updateDraftCount();
    save();
  }
  function updateDraftCount() {
    var box = document.getElementById("draftCount");
    if (!state.draft || !box) return;
    var people = state.draft.studentIds.length;
    var seats = state.draft.seatIds.length;
    var note = "人と席を選んでください。";
    if (people > seats) note = "人が席より多いです。";
    else if (people && seats > people) note = "余った" + (seats - people) + "席は、残りの抽選に入ります。";
    else if (people && people === seats) note = "この" + people + "人を、この席の中だけで引きます。";
    box.textContent = people + "人 / " + seats + "席。" + note;
    document.getElementById("draftSave").disabled = !(people > 0 && seats >= people);
    renderDraftPeople();
  }
  function renderDraftPeople() {
    var box = document.getElementById("draftPeople");
    if (!box) return;
    box.textContent = "";
    if (!(state.mode === "group" && state.draft)) return;
    state.students.forEach(function (student) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "draft-person";
      button.dataset.pickStudent = student.id;
      var chosen = state.draft.studentIds.indexOf(student.id) >= 0;
      button.setAttribute("aria-pressed", chosen ? "true" : "false");
      button.textContent = (chosen ? "選択中 " : "") + (student.number ? student.number + " " : "") + student.name;
      box.appendChild(button);
    });
  }

  function exchange(a, b) {
    var left = state.assignment[a];
    var right = state.assignment[b];
    if (left === undefined) delete state.assignment[b];
    else state.assignment[b] = left;
    if (right === undefined) delete state.assignment[a];
    else state.assignment[a] = right;
  }
  function placePerson(personId, seatId) {
    var from = "";
    Object.keys(state.assignment).forEach(function (id) { if (state.assignment[id] === personId) from = id; });
    var occupant = state.assignment[seatId];
    if (from) delete state.assignment[from];
    else state.unseated = state.unseated.filter(function (id) { return id !== personId; });
    if (occupant) {
      if (from) state.assignment[from] = occupant;
      else state.unseated.push(occupant);
    }
    if (personId) state.assignment[seatId] = personId;
  }

  function toggleGap(seatId) {
    var index = state.gaps.indexOf(seatId);
    if (index >= 0) {
      state.gaps.splice(index, 1);
      refresh();
      return;
    }
    var exists = false;
    Sekigae.makeSeats(state.rows, state.columns).forEach(function (seat) { if (seat.id === seatId) exists = true; });
    if (!exists) return;
    if (seatsNow().length <= 1) { flash("席は1つ以上残してください。"); return; }
    var pinned = state.pins.some(function (pin) { return pin.seatId === seatId; });
    var grouped = state.groups.some(function (group) { return group.seatIds.indexOf(seatId) >= 0; });
    state.gaps.push(seatId);
    state.pins = state.pins.filter(function (pin) { return pin.seatId !== seatId; });
    state.groups.forEach(function (group) {
      group.seatIds = group.seatIds.filter(function (id) { return id !== seatId; });
    });
    state.groups = state.groups.filter(function (group) {
      return group.seatIds.length && group.studentIds.length && group.studentIds.length <= group.seatIds.length;
    });
    if (state.draft) state.draft.seatIds = state.draft.seatIds.filter(function (id) { return id !== seatId; });
    if (state.assignment && state.assignment[seatId]) {
      state.unseated.push(state.assignment[seatId]);
      delete state.assignment[seatId];
    }
    if (pinned || grouped) flash("抜いた席についていた指定を外しました。");
    refresh();
    revealRoom();
  }

  function onSeat(seatId) {
    if (busy) return;
    if (isGap(seatId)) { toggleGap(seatId); return; }
    if (state.mode === "pin") { pinTo(seatId); return; }
    if (state.mode === "group" && state.draft) { toggleDraftSeat(seatId); return; }
    if (state.mode === "swap" && state.assignment) {
      if (!state.swapFrom) { state.swapFrom = { type: "seat", id: seatId }; renderRoom(); return; }
      if (state.swapFrom.type === "seat" && state.swapFrom.id === seatId) { state.swapFrom = null; renderRoom(); return; }
      remember();
      if (state.swapFrom.type === "person") placePerson(state.swapFrom.id, seatId);
      else exchange(state.swapFrom.id, seatId);
      state.swapFrom = null;
      renderRoom();
      renderStatus();
      save();
      return;
    }
    if (state.mode === "pin" || state.mode === "group" || state.mode === "swap") return;
    toggleGap(seatId);
  }

  function resolveSeat(row, col) {
    var seatId = "r" + row + "c" + col;
    var studentId = state.assignment ? state.assignment[seatId] : "";
    var student = studentId ? studentById(studentId) : null;
    if (!student) return null;
    var how = howOf(seatId, studentId);
    return { number: student.number, name: student.name, kind: kindOf(how), gender: student.gender || "" };
  }
  function teacherList() {
    var list = [];
    seatsNow().forEach(function (seat) {
      var span = state.columns && state.columns.length ? state.columns.length : (state.rows[seat.row] || 0);
      var studentId = state.assignment ? state.assignment[seat.id] : "";
      var student = studentId ? studentById(studentId) : null;
      list.push({
        rowLabel: String(seat.row + 1),
        fromLeft: String(seat.col + 1),
        fromTeacher: String(span - seat.col),
        number: student ? student.number : "",
        name: student ? student.name : "",
        gender: student ? student.gender || "" : "",
        how: howOf(seat.id, studentId)
      });
    });
    state.unseated.forEach(function (id) {
      var student = studentById(id);
      if (!student) return;
      list.push({ rowLabel: "", fromLeft: "", fromTeacher: "", number: student.number, name: student.name, gender: student.gender || "", how: "席なし" });
    });
    return list;
  }
  function exportOptions(mirror, caption, header) {
    return {
      caption: caption,
      header: header,
      grid: chartGrid(mirror),
      resolve: resolveSeat,
      list: teacherList()
    };
  }
  function download(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function fileStamp() {
    var now = new Date();
    return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
  }
  function savePoster() {
    if (!state.assignment) { flash("先に席替えをしてください。"); return; }
    download(SekigaeXlsx.posterFile(exportOptions(false, "掲示用（貼り出し）　黒板に向かって左が左", "掲示用・黒板は前の中央")), "席替え_掲示用_" + fileStamp() + ".xlsx");
  }
  function saveTeacher() {
    if (!state.assignment) { flash("先に席替えをしてください。"); return; }
    download(SekigaeXlsx.teacherFile(exportOptions(true, "教員用　教卓から見て左が左", "教員用・黒板は前の中央")), "席替え_教員用_" + fileStamp() + ".xlsx");
  }

  function draw(withShow) {
    if (busy) return;
    var report = problems();
    if (report.errors.length) { flash(report.errors[0]); return; }
    if (state.assignment && !window.confirm("いまの結果を消して、もう一度引きます。")) return;
    var drawOptions = {};
    if (state.assignMode === "number") {
      drawOptions.numberOrder = state.numberFrom === "right" ? "right" : "left";
    } else if (state.avoidOpposite) {
      drawOptions.avoidOpposite = true;
      drawOptions.neighbors = neighborMap();
    }
    var result = Sekigae.draw(state.students, report.seats, state.pins, state.groups, null, drawOptions);
    if (!result.ok) { flash(result.errors[0] || "引けませんでした。"); return; }
    remember();
    state.assignment = result.assignment;
    state.unseated = result.unseated;
    state.filledBy = state.assignMode === "number" ? drawOptions.numberOrder : "";
    state.swapFrom = null;
    save();
    renderRoom();
    renderStatus();
    if (!withShow || reduceMotion()) { flash(resultMessage()); return; }
    busy = true;
    renderStatus();
    runShow().then(function () {
      renderRoom();
      revealRoom();
      busy = false;
      renderStatus();
      flash(resultMessage());
    });
  }

  function resultMessage() {
    var head = state.filledBy === "left"
      ? "出席番号順に、左はじから席が決まりました。"
      : state.filledBy === "right"
        ? "出席番号順に、右はじから席が決まりました。"
        : "席が決まりました。";
    if (state.filledBy || !state.avoidOpposite || !state.assignment) return head;
    var left = Sekigae.countOpposite(state.students, state.assignment, neighborMap());
    if (left > 0) return "席が決まりました。周りが異性だけの席が" + left + "人分残っています。";
    return "席が決まりました。";
  }

  function shuffleNodes(list) {
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  }
  function seatPos(seat) {
    var match = /^r(\d+)c(\d+)$/.exec(seat.dataset.seat || "");
    if (!match) return { row: -1, col: -1 };
    return { row: Number(match[1]), col: Number(match[2]) };
  }
  function backRowIndex() {
    var gaps = {};
    state.gaps.forEach(function (id) { gaps[id] = 1; });
    var row;
    for (row = state.rows.length - 1; row >= 0; row -= 1) {
      var cols = state.rows[row] || 0;
      var col;
      for (col = 0; col < cols; col += 1) {
        if (!gaps["r" + row + "c" + col]) return row;
      }
    }
    return Math.max(0, state.rows.length - 1);
  }
  function showPhases() {
    var byStudent = {};
    state.groups.forEach(function (group, index) {
      group.studentIds.forEach(function (id) {
        if (byStudent[id] === undefined) byStudent[id] = index;
      });
    });
    var buckets = state.groups.map(function () { return []; });
    var rest = [];
    document.querySelectorAll(".seat[data-student]").forEach(function (seat) {
      var index = byStudent[seat.dataset.student];
      if (index === undefined) rest.push(seat);
      else buckets[index].push(seat);
    });
    var phases = [];
    var groupIndex = 0;
    buckets.forEach(function (list, index) {
      if (!list.length) return;
      phases.push({
        kind: "group",
        name: state.groups[index].name,
        groupIndex: groupIndex,
        seats: shuffleNodes(list)
      });
      groupIndex += 1;
    });
    if (!phases.length || rest.length) phases.push({ kind: "rest", seats: shuffleNodes(rest) });
    return phases;
  }
  function coverShowSeats() {
    document.querySelectorAll(".seat[data-student]").forEach(function (seat) {
      seat.classList.add("is-secret");
    });
  }
  function commentary(kind, index, total) {
    if (kind === "group-open") return index === 0 ? "この組だけ、先に引きます" : "次の組です";
    if (kind === "group-name") {
      var groupLines = ["この人は、どこに座るのでしょう", "名前が出ました。席はまだ秘密です", "席はどれでしょう", "次は誰でしょう", "さあ、どこだ"];
      return groupLines[index % groupLines.length];
    }
    if (kind === "group-place") {
      var groupPlaces = ["そこです", "その席に決まりました", "決まりました", "その席です"];
      return groupPlaces[index % groupPlaces.length];
    }
    if (kind === "rest-open") return "ここから、残りの人です";
    if (kind === "open") return "名前が先に出ます。席はそのあとです";
    if (kind === "done") return "全員、決まりました";
    if (kind === "super-place") return "一番うしろ、この席です";
    if (kind === "name") {
      if (total > 1 && index === total - 1) return "最後の一人です";
      var lines = ["この人は、どこに座るのでしょう", "名前が出ました。席はまだ秘密です", "席はどれでしょう", "次は誰でしょう", "さあ、どこだ"];
      return lines[index % lines.length];
    }
    var places = ["そこです", "その席に決まりました", "決まりました", "その席です"];
    return places[index % places.length];
  }
  function showPace(index, total) {
    var t = total <= 1 ? 1 : index / (total - 1);
    var name = 560 - t * 200;
    var hold = 420 - t * 120;
    if (total > 28) { name *= 0.75; hold *= 0.75; }
    if (total > 45) { name *= 0.75; hold *= 0.75; }
    return { name: Math.max(320, Math.round(name)), hold: Math.max(260, Math.round(hold)) };
  }
  function seatPlace(seat) {
    var parts = String(seat.title || "").split("、");
    if (parts.length >= 2) return parts[0] + "、" + parts[1];
    return parts[0];
  }
  function seatLabel(seat) {
    var num = seat.querySelector(".seat-num");
    var name = seat.querySelector(".seat-name");
    var number = num ? num.textContent : "";
    var person = name ? name.textContent : "";
    return (number ? number + " " : "") + person;
  }
  function setCopy(name, kicker) {
    var title = document.getElementById("revealName");
    var note = document.getElementById("revealKicker");
    if (note) note.textContent = kicker || "";
    if (!title) return;
    title.textContent = name || "";
    title.classList.remove("is-hit");
    void title.offsetWidth;
    title.classList.add("is-hit");
  }
  function setCall(text) {
    var line = document.getElementById("revealCallText");
    var box = document.getElementById("revealCall");
    if (line) line.textContent = text || "";
    if (!box) return;
    box.classList.remove("is-hit");
    void box.offsetWidth;
    box.classList.add("is-hit");
    callBlip();
  }
  function fitShowChart() {
    var room = document.getElementById("room");
    var stack = room && room.querySelector(".room-stack");
    if (!stack) return;
    stack.style.zoom = "1";
    var availW = Math.max(1, room.clientWidth - 8);
    var availH = Math.max(1, room.clientHeight - 8);
    var scale = Math.min(1, availW / Math.max(1, stack.offsetWidth), availH / Math.max(1, stack.offsetHeight));
    if (!isFinite(scale) || scale < 0.2) scale = 0.2;
    stack.style.zoom = String(Math.round(scale * 1000) / 1000);
  }
  function flashOnce() {
    var flashEl = document.getElementById("flash");
    flashEl.classList.remove("on");
    void flashEl.offsetWidth;
    flashEl.classList.add("on");
  }
  function shakeStage(hard) {
    var panel = document.querySelector(".room-panel");
    if (!panel) return;
    panel.classList.remove("is-shaking", "is-shaking-hard");
    void panel.offsetWidth;
    panel.classList.add(hard ? "is-shaking-hard" : "is-shaking");
  }
  function setBannerSuper(on) {
    var banner = document.querySelector(".reveal-banner");
    if (banner) banner.classList.toggle("is-super", !!on);
  }
  function runShow() {
    return new Promise(function (resolve) {
      var phases = showPhases();
      var hadGroup = phases.some(function (phase) { return phase.kind === "group"; });
      var back = backRowIndex();
      var phaseAt = -1;
      var step = -1;
      var seats = [];
      var current = null;
      var timer = 0;
      var flashTimer = 0;
      var closed = false;
      var total = 0;
      phases.forEach(function (phase) { total += phase.seats.length; });
      function finish() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        clearTimeout(flashTimer);
        stopFx();
        document.getElementById("ceremony").hidden = true;
        document.body.classList.remove("is-reveal");
        var panel = document.querySelector(".room-panel");
        if (panel) panel.classList.remove("is-shaking", "is-shaking-hard");
        setBannerSuper(false);
        document.querySelectorAll(".decide-stamp").forEach(function (el) { el.remove(); });
        resolve();
      }
      function beginPhase() {
        if (closed) return;
        phaseAt += 1;
        step = -1;
        if (phaseAt >= phases.length) {
          setBannerSuper(false);
          setCopy("決定", total ? total + "人" : "");
          setCall(commentary("done", 0, total));
          stampDecide();
          burstAt(window.innerWidth * 0.5, window.innerHeight * 0.42, 180);
          thud(64);
          flashOnce();
          shakeStage();
          timer = setTimeout(finish, 1100);
          return;
        }
        current = phases[phaseAt];
        seats = current.seats;
        setBannerSuper(false);
        if (current.kind === "group") {
          setCopy("限定抽選", (current.name ? current.name + "　" : "") + "この組だけ");
          setCall(commentary("group-open", current.groupIndex, seats.length));
        } else {
          setCopy("席替え", "名前、それから席");
          setCall(hadGroup ? commentary("rest-open", 0, seats.length) : commentary("open", 0, seats.length));
          burstAt(window.innerWidth * 0.5, 92, 90);
        }
        thud(78);
        timer = setTimeout(next, 780);
      }
      document.getElementById("skipCeremony").onclick = finish;
      document.body.classList.add("is-reveal");
      coverShowSeats();
      syncBoard();
      fitShowChart();
      document.getElementById("ceremony").hidden = false;
      startFx();
      function next() {
        if (closed) return;
        if (step >= 0 && seats[step]) seats[step].classList.remove("is-calling");
        step += 1;
        if (step >= seats.length) {
          beginPhase();
          return;
        }
        var seat = seats[step];
        var main = !current || current.kind === "rest";
        var backSeat = main && seatPos(seat).row === back;
        var last = main && step === seats.length - 1;
        var pace = showPace(step, seats.length);
        var count = (step + 1) + " / " + seats.length;
        setBannerSuper(false);
        setCopy(seatLabel(seat), (last ? "最後の一人　" : "") + count);
        setCall(commentary(main ? "name" : "group-name", step, seats.length));
        charge();
        timer = setTimeout(function () {
          if (closed) return;
          seat.classList.add("is-calling");
          if (backSeat) {
            seat.classList.add("is-finale");
            setBannerSuper(true);
            burstAt(window.innerWidth * 0.5, 86, 150);
            flashOnce();
            shakeStage(true);
            chargeSuper();
          }
          setCopy(seatLabel(seat), (backSeat ? "一番うしろ　" : "") + seatPlace(seat) + "　" + count);
          setCall(commentary(backSeat ? "super-place" : (main ? "place" : "group-place"), step, seats.length));
          timer = setTimeout(function () {
            if (closed) return;
            seat.classList.remove("is-secret", "is-calling");
            seat.classList.add("is-slam");
            var rect = seat.getBoundingClientRect();
            var x = rect.left + rect.width / 2;
            var y = rect.top + rect.height / 2;
            burstAt(x, y, backSeat ? 170 : 78);
            flashOnce();
            shakeStage(backSeat);
            thud(backSeat ? 92 : 150 + Math.min(step, 18) * 8);
            if (backSeat) {
              burstAt(rect.left, rect.top, 70);
              burstAt(rect.right, rect.bottom, 70);
              if (last) flashTimer = setTimeout(function () { if (!closed) flashOnce(); }, 180);
            }
            timer = setTimeout(next, backSeat ? Math.max(pace.hold, 880) : pace.hold);
          }, backSeat ? 460 : 180);
        }, pace.name);
      }
      beginPhase();
    });
  }
  function stampDecide() {
    var el = document.createElement("div");
    el.className = "decide-stamp";
    el.textContent = "決定";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1100);
  }

  function audio() {
    if (!state.sound) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function thud(freq) {
    var ctx = audio();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.34);
  }
  function callBlip() {
    var ctx = audio();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }
  function charge() {
    var ctx = audio();
    if (!ctx) return;
    [0, 0.09, 0.18].forEach(function (delay, index) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(220 + index * 110, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.08);
    });
  }
  function chargeSuper() {
    var ctx = audio();
    if (!ctx) return;
    [0, 0.07, 0.14, 0.22, 0.32, 0.44].forEach(function (delay, index) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = index < 4 ? "square" : "triangle";
      osc.frequency.setValueAtTime(180 + index * 90, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(index < 4 ? 0.05 : 0.16, ctx.currentTime + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.13);
    });
  }
  function startFx() {
    var canvas = document.getElementById("fx");
    var ctx = canvas.getContext("2d");
    var particles = [];
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    function burst(x, y, count) {
      var big = count > 120;
      for (var i = 0; i < count; i += 1) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 70 + Math.random() * (big ? 980 : 560);
        var ring = big ? 0 : 34;
        particles.push({
          x: x + Math.cos(angle) * ring,
          y: y + Math.sin(angle) * ring,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (big ? 40 : 120),
          life: 0.38 + Math.random() * 0.5,
          age: 0,
          size: 1.8 + Math.random() * (big ? 5 : 3.4),
          color: Math.random() > 0.74 ? "#fff6d0" : Math.random() > 0.42 ? "#ffb703" : "#ff5a1f"
        });
      }
    }
    canvas._burst = burst;
    canvas._resize = resize;
    window.addEventListener("resize", resize);
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alive = [];
      particles.forEach(function (particle) {
        particle.age += dt;
        if (particle.age > particle.life) return;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 320 * dt;
        ctx.globalAlpha = Math.max(0, 1 - particle.age / particle.life);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        alive.push(particle);
      });
      particles = alive;
      ctx.globalAlpha = 1;
      fxTimer = requestAnimationFrame(frame);
    }
    fxTimer = requestAnimationFrame(frame);
  }
  function burstAt(x, y, count) {
    var canvas = document.getElementById("fx");
    if (canvas && canvas._burst) canvas._burst(x, y, count);
  }
  function stopFx() {
    cancelAnimationFrame(fxTimer);
    var canvas = document.getElementById("fx");
    if (!canvas) return;
    if (canvas._resize) window.removeEventListener("resize", canvas._resize);
    canvas._burst = null;
    canvas._resize = null;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  function columnLabel(index) {
    var n = index;
    var out = "";
    do {
      out = String.fromCharCode(65 + (n % 26)) + out;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
  }
  function matrixOf(sheetName) {
    var sheet = pending.workbook.Sheets[sheetName];
    var ref = sheet["!ref"];
    if (ref && window.XLSX) {
      var range = XLSX.utils.decode_range(ref);
      if (range.e.r - range.s.r + 1 > 3000 || range.e.c - range.s.c + 1 > 40) throw new Error("range");
    }
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }).slice(0, 3000);
  }
  function fillMapping() {
    var matrix = matrixOf(document.getElementById("sheet").value);
    var guess = Sekigae.guessMapping(matrix);
    var cols = Sekigae.columnCount(matrix);
    var numberSel = document.getElementById("colNumber");
    var nameSel = document.getElementById("colName");
    var genderSel = document.getElementById("colGender");
    var headerSel = document.getElementById("headerRow");
    numberSel.textContent = "";
    nameSel.textContent = "";
    genderSel.textContent = "";
    headerSel.textContent = "";
    var blank = document.createElement("option");
    blank.value = "-1";
    blank.textContent = "見出しなし";
    headerSel.appendChild(blank);
    var unused = document.createElement("option");
    unused.value = "-1";
    unused.textContent = "使わない";
    genderSel.appendChild(unused);
    for (var c = 0; c < Math.min(cols, 40); c += 1) {
      var sample = "";
      for (var r = 0; r < Math.min(matrix.length, 6); r += 1) {
        if (matrix[r] && String(matrix[r][c] || "").trim()) { sample = String(matrix[r][c]).slice(0, 12); break; }
      }
      [numberSel, nameSel, genderSel].forEach(function (select) {
        var option = document.createElement("option");
        option.value = String(c);
        option.textContent = columnLabel(c) + (sample ? "：" + sample : "");
        select.appendChild(option);
      });
    }
    for (var i = 0; i < Math.min(matrix.length, 8); i += 1) {
      var option = document.createElement("option");
      option.value = String(i);
      option.textContent = (i + 1) + "行目：" + (matrix[i] || []).slice(0, 4).join(" / ").slice(0, 28);
      headerSel.appendChild(option);
    }
    numberSel.value = String(guess.numberCol);
    nameSel.value = String(Math.min(guess.nameCol, cols - 1));
    genderSel.value = String(guess.genderCol >= 0 ? guess.genderCol : -1);
    headerSel.value = String(guess.headerRow);
    updatePreview();
  }
  function updatePreview() {
    var box = document.getElementById("preview");
    box.textContent = "";
    var matrix = matrixOf(document.getElementById("sheet").value);
    var extracted = Sekigae.extractPeople(matrix, Number(document.getElementById("headerRow").value), Number(document.getElementById("colNumber").value), Number(document.getElementById("colName").value), Number(document.getElementById("colGender").value));
    var lead = document.createElement("p");
    lead.className = "hint";
    lead.textContent = extracted.people.length + "人読み取れます" + (extracted.skipped.length ? "。名前が空の行を飛ばします。" : "。");
    var table = document.createElement("table");
    table.className = "preview-table";
    var head = document.createElement("tr");
    ["番号", "名前", "性別"].forEach(function (label) {
      var cell = document.createElement("th");
      cell.textContent = label;
      head.appendChild(cell);
    });
    table.appendChild(head);
    extracted.people.slice(0, 8).forEach(function (person) {
      var row = document.createElement("tr");
      var num = document.createElement("td");
      var name = document.createElement("td");
      var gender = document.createElement("td");
      num.textContent = person.number;
      name.textContent = person.name;
      gender.textContent = person.gender;
      row.append(num, name, gender);
      table.appendChild(row);
    });
    box.append(lead, table);
  }
  function openFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { flash("ファイルは5MBまでです。"); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var bytes = new Uint8Array(reader.result);
        var name = file.name.toLowerCase();
        var workbook;
        if (/\.(csv|txt|tsv)$/.test(name)) workbook = XLSX.read(Sekigae.decodeTableText(bytes), { type: "string" });
        else workbook = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, bookVBA: false });
        pending = { workbook: workbook };
        var sheetSel = document.getElementById("sheet");
        sheetSel.textContent = "";
        workbook.SheetNames.forEach(function (sheetName) {
          var option = document.createElement("option");
          option.value = sheetName;
          option.textContent = sheetName;
          sheetSel.appendChild(option);
        });
        document.getElementById("mapping").hidden = false;
        fillMapping();
      } catch (err) {
        flash("このファイルは読み取れませんでした。");
      }
    };
    reader.readAsArrayBuffer(file);
  }
  function commitImport(replace) {
    try {
      var matrix = matrixOf(document.getElementById("sheet").value);
      var numberCol = Number(document.getElementById("colNumber").value);
      var nameCol = Number(document.getElementById("colName").value);
      var genderCol = Number(document.getElementById("colGender").value);
      if (numberCol === nameCol || (genderCol >= 0 && (genderCol === numberCol || genderCol === nameCol))) {
        flash("番号、名前、性別は別の列にしてください。");
        return;
      }
      var extracted = Sekigae.extractPeople(matrix, Number(document.getElementById("headerRow").value), numberCol, nameCol, genderCol);
      if (!extracted.people.length) { flash("名前が読み取れません。列を確認してください。"); return; }
      addPeople(extracted.people, replace);
      document.getElementById("mapping").hidden = true;
      pending = null;
      flash(extracted.people.length + "人を読み込みました。");
    } catch (err) {
      flash("この表は大きすぎるか、読み取れません。");
    }
  }

  function templateFile() {
    var sheet = XLSX.utils.aoa_to_sheet([["番号", "名前", "性別"], ["1", "青葉 湊", "女"]]);
    var book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "名簿");
    XLSX.writeFile(book, "名簿テンプレート.xlsx");
  }

  function bind() {
    document.getElementById("file").addEventListener("change", function (event) {
      openFile(event.target.files[0]);
      event.target.value = "";
    });
    var drop = document.getElementById("drop");
    ["dragenter", "dragover"].forEach(function (type) {
      drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.add("is-over"); });
    });
    drop.addEventListener("dragleave", function () { drop.classList.remove("is-over"); });
    drop.addEventListener("drop", function (event) {
      event.preventDefault();
      drop.classList.remove("is-over");
      openFile(event.dataTransfer.files[0]);
    });
    window.addEventListener("dragover", function (event) { event.preventDefault(); });
    window.addEventListener("drop", function (event) { event.preventDefault(); });
    document.getElementById("sheet").addEventListener("change", function () { try { fillMapping(); } catch (err) { flash("このシートは読み取れません。"); } });
    ["colNumber", "colName", "colGender", "headerRow"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () { try { updatePreview(); } catch (err) { flash("プレビューを更新できません。"); } });
    });
    document.getElementById("importReplace").addEventListener("click", function () { commitImport(true); });
    document.getElementById("importAppend").addEventListener("click", function () { commitImport(false); });
    document.getElementById("importCancel").addEventListener("click", function () { pending = null; document.getElementById("mapping").hidden = true; });
    document.getElementById("rosterFilter").addEventListener("input", renderRoster);
    document.getElementById("btnSort").addEventListener("click", function () {
      state.students.sort(function (a, b) {
        var na = /^\d+$/.test(a.number) ? Number(a.number) : NaN;
        var nb = /^\d+$/.test(b.number) ? Number(b.number) : NaN;
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return String(a.number).localeCompare(String(b.number), "ja");
      });
      refresh();
    });
    document.getElementById("addForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var name = document.getElementById("addName").value.trim();
      if (!name) return;
      addPeople([{
        number: document.getElementById("addNumber").value.trim(),
        name: name,
        gender: document.getElementById("addGender").value
      }], false);
      event.target.reset();
    });
    function toggleDraftStudent(id) {
      if (!(state.mode === "group" && state.draft) || !id) return;
      if (heldStudent(id) && state.draft.studentIds.indexOf(id) < 0) { flash("この人はすでに指定されています。"); return; }
      toggle(state.draft.studentIds, id);
      paintPeople();
      updateDraftCount();
      save();
    }
    document.getElementById("draftPeople").addEventListener("click", function (event) {
      var pick = event.target.closest("[data-pick-student]");
      if (pick) toggleDraftStudent(pick.dataset.pickStudent);
    });
    document.getElementById("roster").addEventListener("click", function (event) {
      var remove = event.target.closest("[data-remove-student]");
      if (remove) { removeStudent(remove.dataset.removeStudent); return; }
      var pick = event.target.closest("[data-pick-student]");
      if (pick) { toggleDraftStudent(pick.dataset.pickStudent); return; }
      if (!(state.mode === "group" && state.draft)) return;
      if (event.target.closest("input, select, [data-remove-student]")) return;
      var person = event.target.closest(".person");
      if (!person) return;
      toggleDraftStudent(person.dataset.id);
    });
    document.getElementById("room").addEventListener("click", function (event) {
      var seat = event.target.closest("[data-seat]");
      if (seat) onSeat(seat.dataset.seat);
    });
    document.getElementById("unseated").addEventListener("click", function (event) {
      var button = event.target.closest("[data-unseated]");
      if (!button || !state.assignment) return;
      exitChart();
      state.mode = "swap";
      state.swapFrom = { type: "person", id: button.dataset.unseated };
      renderRoom();
      renderStatus();
    });
    document.getElementById("layoutMode").addEventListener("change", function () {
      var chart = document.getElementById("layoutMode").value === "chart";
      if (chart) {
        if (state.draft && (state.draft.studentIds.length || state.draft.seatIds.length)) {
          flash("作りかけの限定抽選を先に確定してください。");
          document.getElementById("layoutMode").value = "grid";
          syncLayoutPanels();
          return;
        }
        state.draft = null;
        state.swapFrom = null;
        state.mode = "gap";
      } else if (state.mode === "gap") {
        state.mode = "view";
      }
      syncLayoutPanels();
      updateLayoutPreview();
      renderRoom();
      renderStatus();
      save();
      if (chart) revealRoom();
    });
    ["gridRows", "gridCols"].forEach(function (id) { document.getElementById(id).addEventListener("input", updateLayoutPreview); });
    document.getElementById("applyLayout").addEventListener("click", applyLayout);
    document.getElementById("aisle").addEventListener("change", function (event) {
      state.aisle = event.target.checked;
      renderRoom();
      save();
    });
    document.getElementById("viewPoster").addEventListener("click", function () { state.teacherView = false; renderRoom(); renderStatus(); save(); });
    document.getElementById("viewTeacher").addEventListener("click", function () { state.teacherView = true; renderRoom(); renderStatus(); save(); });
    document.getElementById("pinMode").addEventListener("click", function () {
      if (state.draft && (state.draft.studentIds.length || state.draft.seatIds.length)) { flash("作りかけの限定抽選を先に確定してください。"); return; }
      state.draft = null;
      exitChart();
      state.mode = state.mode === "pin" ? "view" : "pin";
      renderStatus();
      renderRoom();
    });
    document.getElementById("pinList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-remove-pin]");
      if (!button) return;
      state.pins = state.pins.filter(function (pin) { return pin.studentId !== button.dataset.removePin; });
      renderPins();
      renderRoom();
      renderStatus();
      save();
    });
    document.getElementById("newGroup").addEventListener("click", function () {
      exitChart();
      state.mode = "group";
      state.draft = { studentIds: [], seatIds: [] };
      document.getElementById("draftName").value = "";
      updateDraftCount();
      renderRoster();
      renderRoom();
      renderStatus();
      document.getElementById("draftBox").scrollIntoView({ block: "nearest" });
    });
    document.getElementById("draftCancel").addEventListener("click", function () {
      state.draft = null;
      exitChart();
      state.mode = "view";
      refresh();
    });
    document.getElementById("draftSave").addEventListener("click", function () {
      if (!state.draft || document.getElementById("draftSave").disabled) return;
      state.nextId += 1;
      state.groups.push({
        id: "g" + state.nextId,
        name: document.getElementById("draftName").value.trim().slice(0, 24) || ("組" + (state.groups.length + 1)),
        studentIds: state.draft.studentIds.slice(),
        seatIds: state.draft.seatIds.slice(),
        color: COLORS[state.groups.length % COLORS.length]
      });
      state.draft = null;
      exitChart();
      state.mode = "view";
      refresh();
    });
    document.getElementById("groupList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-remove-group]");
      if (!button) return;
      state.groups = state.groups.filter(function (group) { return group.id !== button.dataset.removeGroup; });
      renderGroups();
      renderRoom();
      renderPinSelect();
      renderStatus();
      save();
    });
    document.getElementById("swapMode").addEventListener("click", function () {
      if (!state.assignment) { flash("先に席替えをしてください。"); return; }
      exitChart();
      state.mode = state.mode === "swap" ? "view" : "swap";
      state.swapFrom = null;
      renderRoom();
      renderStatus();
    });
    document.getElementById("btnUndo").addEventListener("click", undo);
    document.getElementById("btnClearResult").addEventListener("click", function () {
      state.assignment = null;
      state.unseated = [];
      state.filledBy = "";
      state.swapFrom = null;
      renderRoom();
      renderStatus();
      save();
    });
    document.getElementById("assignMode").addEventListener("change", function (event) {
      state.assignMode = event.target.value === "number" ? "number" : "random";
      renderStatus();
      save();
    });
    document.getElementById("numberFrom").addEventListener("change", function (event) {
      state.numberFrom = event.target.value === "right" ? "right" : "left";
      save();
    });
    document.getElementById("avoidOpposite").addEventListener("change", function (event) {
      state.avoidOpposite = event.target.checked;
      renderStatus();
      save();
    });
    document.getElementById("btnDraw").addEventListener("click", function () { draw(true); });
    document.getElementById("btnQuiet").addEventListener("click", function () { draw(false); });
    document.getElementById("openPoster").addEventListener("click", function (event) {
      if (!state.assignment) { event.preventDefault(); flash("先に席替えをしてください。"); }
    });
    document.getElementById("openTeacher").addEventListener("click", function (event) {
      if (!state.assignment) { event.preventDefault(); flash("先に席替えをしてください。"); }
    });
    document.getElementById("btnPoster").addEventListener("click", savePoster);
    document.getElementById("btnTeacher").addEventListener("click", saveTeacher);
    document.getElementById("btnBoth").addEventListener("click", function () { savePoster(); setTimeout(saveTeacher, 400); });
    document.getElementById("btnPrint").addEventListener("click", function () { window.print(); });
    document.getElementById("btnTemplate").addEventListener("click", templateFile);
    document.getElementById("btnSound").addEventListener("click", function () { state.sound = !state.sound; renderStatus(); save(); });
    document.getElementById("btnReset").addEventListener("click", function () {
      if (!window.confirm("名簿も座席も結果も消します。")) return;
      state = defaultState();
      pending = null;
      localStorage.removeItem(KEY);
      document.getElementById("mapping").hidden = true;
      document.getElementById("gridRows").value = "4";
      document.getElementById("gridCols").value = "6";
      document.getElementById("layoutMode").value = "grid";
      syncLayoutPanels();
      refresh();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !document.getElementById("ceremony").hidden) document.getElementById("skipCeremony").click();
    });
    window.addEventListener("resize", function () {
      syncBoard();
      if (document.body.classList.contains("is-reveal")) fitShowChart();
    });
  }

  load();
  bind();
  document.getElementById("gridRows").value = String(state.rows.length || 4);
  document.getElementById("gridCols").value = String(state.rows[0] || 6);
  document.getElementById("layoutMode").value = state.mode === "gap" ? "chart" : "grid";
  syncLayoutPanels();
  refresh();
  revealRoom();
})();
