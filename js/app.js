(function () {
  "use strict";

  var KEY = "sekigae-kuji-v1";
  var COLORS = ["#8e2f2a", "#21573f", "#2d4f78", "#8a5a12", "#5d4578", "#1f6a70"];
  var MAX_FILE = 5 * 1024 * 1024;
  var SAMPLE = [
    ["1", "青葉 湊"], ["2", "伊吹 早苗"], ["3", "宇佐見 蓮"], ["4", "江田 柊"],
    ["5", "大野 結月"], ["6", "加賀 律"], ["7", "菊池 杏"], ["8", "工藤 碧"],
    ["9", "小原 悠真"], ["10", "佐伯 芽依"], ["11", "篠原 湊太"], ["12", "白石 鈴"],
    ["13", "菅井 旭"], ["14", "高野 美羽"], ["15", "千葉 航"], ["16", "寺田 葵"],
    ["17", "中川 蓮"], ["18", "西山 紬"], ["19", "野村 蒼"], ["20", "長谷川 凛"],
    ["21", "林田 芽"], ["22", "藤崎 朔"], ["23", "星野 陽菜"], ["24", "本田 律"]
  ];

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
  function seatsNow() { return Sekigae.makeSeats(state.rows, state.columns); }
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
  function howOf(seatId, studentId) {
    if (!studentId) return groupForSeat(seatId) ? "指定席の空き" : "空席";
    var pin = null;
    state.pins.forEach(function (item) { if (item.studentId === studentId) pin = item; });
    if (pin) return pin.seatId === seatId ? "固定" : "手直し";
    var group = null;
    state.groups.forEach(function (item) { if (item.studentIds.indexOf(studentId) >= 0) group = item; });
    if (group) {
      if (group.seatIds.indexOf(seatId) >= 0) return group.name ? "限定抽選（" + group.name + "）" : "限定抽選";
      return "手直し";
    }
    if (heldSeat(seatId)) return "手直し";
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
        next.students.push({ id: id, number: String(item.number || "").slice(0, 20), name: String(item.name).slice(0, 80) });
        maxId = Math.max(maxId, parseInt(id.slice(1), 10) || 0);
      });
    }
    if (Array.isArray(data.rows) && data.rows.length <= 20 && data.rows.every(function (n) { return typeof n === "number" && n >= 0 && n <= 20; })) next.rows = data.rows.slice();
    if (Array.isArray(data.columns) && data.columns.length) {
      var built = Sekigae.columnSeats(data.columns);
      if (built.ok) {
        next.columns = built.columns;
        next.rows = built.rows;
      }
    }
    var knownS = {};
    next.students.forEach(function (s) { knownS[s.id] = 1; });
    var knownSeat = {};
    Sekigae.makeSeats(next.rows, next.columns).forEach(function (seat) { knownSeat[seat.id] = 1; });
    if (Array.isArray(data.pins)) {
      data.pins.forEach(function (pin) {
        if (knownS[pin.studentId] && knownSeat[pin.seatId]) next.pins.push({ studentId: pin.studentId, seatId: pin.seatId });
      });
    }
    if (Array.isArray(data.groups)) {
      data.groups.slice(0, 12).forEach(function (group) {
        var id = cleanId(group.id, "g");
        if (!id) return;
        var people = (group.studentIds || []).filter(function (sid) { return knownS[sid]; });
        var seats = (group.seatIds || []).filter(function (sid) { return knownSeat[sid]; });
        if (!people.length || !seats.length || people.length > seats.length) return;
        next.groups.push({ id: id, name: String(group.name || "").slice(0, 24), studentIds: people, seatIds: seats, color: group.color || COLORS[0] });
        maxId = Math.max(maxId, parseInt(id.slice(1), 10) || 0);
      });
    }
    if (data.assignment && typeof data.assignment === "object") {
      next.assignment = {};
      Object.keys(data.assignment).forEach(function (seatId) {
        if (knownSeat[seatId] && knownS[data.assignment[seatId]]) next.assignment[seatId] = data.assignment[seatId];
      });
    }
    next.unseated = Array.isArray(data.unseated) ? data.unseated.filter(function (id) { return knownS[id]; }) : [];
    next.aisle = !!data.aisle;
    next.teacherView = !!data.teacherView;
    next.sound = data.sound !== false;
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

  function describe(rows, columns) {
    var total = rows.reduce(function (sum, n) { return sum + n; }, 0);
    if (columns && columns.length) return "列ごとの席数 " + columns.join("・") + "（合計" + total + "席）";
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
    var bits = ["名簿 " + state.students.length + "人", describe(state.rows, state.columns)];
    if (state.pins.length) bits.push("固定 " + state.pins.length);
    if (state.groups.length) bits.push("限定抽選 " + state.groups.length + "組");
    document.getElementById("status").textContent = bits.concat(report.errors, report.warnings).join(" / ");
    document.getElementById("btnDraw").disabled = report.errors.length > 0 || busy;
    document.getElementById("btnQuiet").disabled = report.errors.length > 0 || busy;
    document.getElementById("btnUndo").disabled = !state.history;
    var poster = document.getElementById("viewPoster");
    var teacher = document.getElementById("viewTeacher");
    poster.setAttribute("aria-pressed", state.teacherView ? "false" : "true");
    teacher.setAttribute("aria-pressed", state.teacherView ? "true" : "false");
    document.getElementById("aisle").checked = state.aisle;
    document.getElementById("pinMode").setAttribute("aria-pressed", state.mode === "pin" ? "true" : "false");
    document.getElementById("swapMode").setAttribute("aria-pressed", state.mode === "swap" ? "true" : "false");
    document.getElementById("btnSound").setAttribute("aria-pressed", state.sound ? "true" : "false");
    document.getElementById("btnSound").textContent = state.sound ? "音あり" : "音なし";
    document.getElementById("draftBox").hidden = !state.draft;
    document.getElementById("newGroup").hidden = !!state.draft;
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
      var name = document.createElement("input");
      name.value = student.name;
      name.maxLength = 80;
      name.setAttribute("aria-label", "名前");
      var remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "削除";
      remove.dataset.removeStudent = student.id;
      number.addEventListener("input", function () { onPersonEdit(student.id, "number", number.value); });
      name.addEventListener("input", function () { onPersonEdit(student.id, "name", name.value); });
      item.append(number, name, remove);
      var hay = (student.number + " " + student.name).toLowerCase();
      item.hidden = !!filter && hay.indexOf(filter) < 0;
      list.appendChild(item);
    });
    paintPeople();
    renderPinSelect();
  }

  function paintPeople() {
    var draftIds = state.draft ? state.draft.studentIds : [];
    document.querySelectorAll(".person").forEach(function (el) {
      el.classList.toggle("is-in-draft", draftIds.indexOf(el.dataset.id) >= 0);
      el.classList.toggle("is-locked", heldStudent(el.dataset.id));
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
      option.textContent = (student.number ? student.number + " " : "") + student.name;
      select.appendChild(option);
    });
    if (current) select.value = current;
  }

  function renderRoom() {
    var grid = Sekigae.buildChartGrid(state.rows, { aisle: state.aisle, mirror: state.teacherView, columns: state.columns });
    var room = document.getElementById("room");
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
    var board = document.getElementById("board");
    var width = 0;
    document.querySelectorAll(".seat-line").forEach(function (line) { width = Math.max(width, line.offsetWidth); });
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
    if (pin) button.classList.add("is-pin");
    if (group) {
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

  function renderCustomRows(counts) {
    var box = document.getElementById("customRows");
    box.textContent = "";
    counts.forEach(function (count, index) {
      var line = document.createElement("div");
      line.className = "row-edit";
      var label = document.createElement("span");
      label.textContent = index + 1 + "行目（前から）";
      var input = document.createElement("input");
      input.className = "row-count";
      input.type = "number";
      input.min = "0";
      input.max = "20";
      input.value = String(count);
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.removeRow = String(index);
      button.textContent = "外す";
      input.addEventListener("input", updateLayoutPreview);
      line.append(label, input, button);
      box.appendChild(line);
    });
  }

  function readCustom() {
    return [].map.call(document.querySelectorAll("#customRows .row-count"), function (input) {
      return clampInt(input.value, 0, 20);
    });
  }
  function columnsFromRows(rows) {
    var width = 0;
    rows.forEach(function (n) { if (n > width) width = n; });
    if (!width) return [4];
    if (rows.every(function (n) { return n === rows[0]; })) {
      var even = [];
      var i;
      for (i = 0; i < rows[0]; i += 1) even.push(rows.length);
      return even;
    }
    var depths = [];
    var c;
    for (c = 0; c < width; c += 1) depths.push(0);
    rows.forEach(function (count, row) {
      var pad = Math.floor((width - count) / 2);
      var i;
      for (i = 0; i < count; i += 1) depths[pad + i] = row + 1;
    });
    return depths.filter(function (n) { return n > 0; });
  }
  function renderCustomCols(depths) {
    var box = document.getElementById("customCols");
    box.textContent = "";
    depths.forEach(function (count, index) {
      var line = document.createElement("div");
      line.className = "row-edit";
      var label = document.createElement("span");
      label.textContent = index + 1 + "列目（左から）";
      var input = document.createElement("input");
      input.className = "col-count";
      input.type = "number";
      input.min = "1";
      input.max = "20";
      input.value = String(count);
      input.setAttribute("aria-label", index + 1 + "列目の席数");
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.removeCol = String(index);
      button.textContent = "外す";
      input.addEventListener("input", updateLayoutPreview);
      line.append(label, input, button);
      box.appendChild(line);
    });
  }
  function readCols() {
    return [].map.call(document.querySelectorAll("#customCols .col-count"), function (input) {
      return clampInt(input.value, 1, 20);
    });
  }
  function proposedRows() {
    var mode = document.getElementById("layoutMode").value;
    if (mode === "grid") {
      return Sekigae.gridSeats(
        clampInt(document.getElementById("gridRows").value, 1, 20),
        clampInt(document.getElementById("gridCols").value, 1, 20)
      );
    }
    if (mode === "total") {
      return Sekigae.distributeSeats(
        clampInt(document.getElementById("totalSeats").value, 1, 400),
        clampInt(document.getElementById("rowCount").value, 1, 20)
      );
    }
    if (mode === "cols") {
      var depths = readCols();
      var built = Sekigae.columnSeats(depths);
      return built.ok ? built : { ok: false, error: built.error, rows: [], columns: [] };
    }
    var rows = readCustom();
    if (!rows.length || rows.every(function (n) { return n === 0; })) return { ok: false, error: "座席がありません。", rows: [] };
    return { ok: true, error: "", rows: rows, columns: null };
  }
  function updateLayoutPreview() {
    var next = proposedRows();
    document.getElementById("layoutPreview").textContent = next.ok
      ? "いま " + describe(state.rows, state.columns) + "。指定すると " + describe(next.rows, next.columns) + "。黒板は前の中央に揃います。"
      : next.error;
  }
  function syncLayoutPanels() {
    var mode = document.getElementById("layoutMode").value;
    document.getElementById("gridBox").hidden = mode !== "grid";
    document.getElementById("totalBox").hidden = mode !== "total";
    document.getElementById("customBox").hidden = mode !== "rows";
    document.getElementById("colBox").hidden = mode !== "cols";
  }

  function onPersonEdit(id, field, value) {
    var student = studentById(id);
    if (!student) return;
    student[field] = String(value).slice(0, field === "name" ? 80 : 20);
    document.querySelectorAll(".seat").forEach(function (seat) {
      if (seat.dataset.student !== id) return;
      var node = seat.querySelector(field === "name" ? ".seat-name" : ".seat-num");
      if (node) node.textContent = student[field];
    });
    var option = document.querySelector('#pinStudent option[value="' + id + '"]');
    if (option) option.textContent = (student.number ? student.number + " " : "") + student.name;
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
    Sekigae.makeSeats(next.rows).forEach(function (seat) { known[seat.id] = 1; });
    var lost = state.pins.some(function (pin) { return !known[pin.seatId]; }) || state.groups.some(function (group) {
      return group.seatIds.some(function (id) { return !known[id]; });
    });
    if (lost && !window.confirm("座席を変えると、はみ出す固定席と限定抽選を外します。")) return;
    state.rows = next.rows;
    state.columns = next.columns || null;
    pruneToSeats();
    renderCustomRows(state.rows.slice());
    renderCustomCols(state.columns || columnsFromRows(state.rows));
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
      state.draft = null;
      state.mode = "view";
    }
    people.slice(0, 500 - state.students.length).forEach(function (person) {
      if (!person.name) return;
      state.nextId += 1;
      state.students.push({ id: "s" + state.nextId, number: String(person.number || "").slice(0, 20), name: String(person.name).slice(0, 80) });
    });
    refresh();
  }

  function snapshot() {
    return { assignment: state.assignment ? Object.assign({}, state.assignment) : null, unseated: state.unseated.slice() };
  }
  function remember() { state.history = snapshot(); }
  function undo() {
    if (!state.history) return;
    var current = snapshot();
    state.assignment = state.history.assignment ? Object.assign({}, state.history.assignment) : null;
    state.unseated = state.history.unseated.slice();
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
    else if (people && seats > people) note = "余った" + (seats - people) + "席は空席のままです。他の人は座りません。";
    else if (people && people === seats) note = "この" + people + "人を、この席の中だけで引きます。";
    box.textContent = people + "人 / " + seats + "席。" + note;
    document.getElementById("draftSave").disabled = !(people > 0 && seats >= people);
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

  function onSeat(seatId) {
    if (busy) return;
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
    }
  }

  function resolveSeat(row, col) {
    var seatId = "r" + row + "c" + col;
    var studentId = state.assignment ? state.assignment[seatId] : "";
    var student = studentId ? studentById(studentId) : null;
    if (!student) return null;
    var how = howOf(seatId, studentId);
    return { number: student.number, name: student.name, kind: kindOf(how) };
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
        how: howOf(seat.id, studentId)
      });
    });
    state.unseated.forEach(function (id) {
      var student = studentById(id);
      if (!student) return;
      list.push({ rowLabel: "", fromLeft: "", fromTeacher: "", number: student.number, name: student.name, how: "席なし" });
    });
    return list;
  }
  function exportOptions(mirror, caption, header) {
    return {
      caption: caption,
      header: header,
      grid: Sekigae.buildChartGrid(state.rows, { aisle: state.aisle, mirror: mirror, columns: state.columns }),
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
    var result = Sekigae.draw(state.students, report.seats, state.pins, state.groups);
    if (!result.ok) { flash(result.errors[0] || "引けませんでした。"); return; }
    remember();
    state.assignment = result.assignment;
    state.unseated = result.unseated;
    state.swapFrom = null;
    save();
    renderRoom();
    renderStatus();
    if (!withShow || reduceMotion()) { flash("席が決まりました。"); return; }
    busy = true;
    renderStatus();
    document.querySelectorAll(".seat").forEach(function (seat) { seat.classList.add("is-secret"); });
    runCeremony().then(function (skipped) {
      if (skipped) {
        document.querySelectorAll(".seat").forEach(function (seat) { seat.classList.remove("is-secret"); });
        return;
      }
      return revealRows();
    }).then(function () {
      busy = false;
      renderStatus();
      flash("席が決まりました。");
    });
  }

  function playVideo(video) {
    return new Promise(function (resolve) {
      var done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      video.onended = finish;
      video.onerror = finish;
      var playing = video.play();
      if (playing && playing.catch) playing.catch(finish);
      setTimeout(finish, 12000);
    });
  }
  function runCeremony() {
    return new Promise(function (resolve) {
      var root = document.getElementById("ceremony");
      var video = document.getElementById("ceremonyVideo");
      var closed = false;
      function finish(skipped) {
        if (closed) return;
        closed = true;
        stopFx();
        video.pause();
        root.hidden = true;
        resolve(!!skipped);
      }
      document.getElementById("skipCeremony").onclick = function () { finish(true); };
      root.hidden = false;
      video.muted = !state.sound;
      try { video.currentTime = 0; } catch (err) { /* 未読込でも演出は続ける */ }
      startFx();
      thud(90);
      var started = performance.now();
      playVideo(video).then(function () {
        var hold = video.error ? 2600 : 280;
        setTimeout(function () { finish(false); }, Math.max(0, hold - (performance.now() - started)));
      });
    });
  }
  function revealRows() {
    return new Promise(function (resolve) {
      var rows = [].slice.call(document.querySelectorAll(".seat-row"));
      var index = 0;
      function next() {
        if (index >= rows.length) { stampDecide(); resolve(); return; }
        var row = rows[index];
        index += 1;
        row.querySelectorAll(".seat").forEach(function (seat) {
          seat.classList.remove("is-secret");
          seat.classList.add("is-slam");
        });
        thud(150 + index * 12);
        var flashEl = document.getElementById("flash");
        flashEl.classList.remove("on");
        void flashEl.offsetWidth;
        flashEl.classList.add("on");
        var stack = document.querySelector(".room-stack");
        if (stack) { stack.classList.remove("is-shaking"); void stack.offsetWidth; stack.classList.add("is-shaking"); }
        setTimeout(next, 480);
      }
      next();
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
    osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
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
    function spawn(width, height) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 90 + Math.random() * 720;
      particles.push({
        x: width * 0.5, y: height * 0.46,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.7, age: 0,
        size: 1.4 + Math.random() * 3.2,
        color: Math.random() > 0.7 ? "#fff6d0" : Math.random() > 0.4 ? "#ffb703" : "#ff7a18"
      });
    }
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      while (particles.length < 220) spawn(canvas.width, canvas.height);
      particles.forEach(function (particle) {
        particle.age += dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 40 * dt;
        if (particle.age > particle.life) {
          particle.age = 0;
          particle.x = canvas.width * 0.5;
          particle.y = canvas.height * 0.46;
          var angle = Math.random() * Math.PI * 2;
          var speed = 90 + Math.random() * 720;
          particle.vx = Math.cos(angle) * speed;
          particle.vy = Math.sin(angle) * speed;
        }
        ctx.globalAlpha = Math.max(0, 1 - particle.age / particle.life);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      fxTimer = requestAnimationFrame(frame);
    }
    fxTimer = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    canvas._resize = resize;
  }
  function stopFx() {
    cancelAnimationFrame(fxTimer);
    var canvas = document.getElementById("fx");
    if (canvas._resize) window.removeEventListener("resize", canvas._resize);
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
    var headerSel = document.getElementById("headerRow");
    numberSel.textContent = "";
    nameSel.textContent = "";
    headerSel.textContent = "";
    var blank = document.createElement("option");
    blank.value = "-1";
    blank.textContent = "見出しなし";
    headerSel.appendChild(blank);
    for (var c = 0; c < Math.min(cols, 40); c += 1) {
      var sample = "";
      for (var r = 0; r < Math.min(matrix.length, 6); r += 1) {
        if (matrix[r] && String(matrix[r][c] || "").trim()) { sample = String(matrix[r][c]).slice(0, 12); break; }
      }
      [numberSel, nameSel].forEach(function (select) {
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
    headerSel.value = String(guess.headerRow);
    updatePreview();
  }
  function updatePreview() {
    var box = document.getElementById("preview");
    box.textContent = "";
    var matrix = matrixOf(document.getElementById("sheet").value);
    var extracted = Sekigae.extractPeople(matrix, Number(document.getElementById("headerRow").value), Number(document.getElementById("colNumber").value), Number(document.getElementById("colName").value));
    var lead = document.createElement("p");
    lead.className = "hint";
    lead.textContent = extracted.people.length + "人読み取れます" + (extracted.skipped.length ? "。名前が空の行を飛ばします。" : "。");
    var table = document.createElement("table");
    table.className = "preview-table";
    extracted.people.slice(0, 8).forEach(function (person) {
      var row = document.createElement("tr");
      var num = document.createElement("td");
      var name = document.createElement("td");
      num.textContent = person.number;
      name.textContent = person.name;
      row.append(num, name);
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
      if (numberCol === nameCol) { flash("番号と名前は別の列にしてください。"); return; }
      var extracted = Sekigae.extractPeople(matrix, Number(document.getElementById("headerRow").value), numberCol, nameCol);
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
    var sheet = XLSX.utils.aoa_to_sheet([["出席番号", "氏名"], ["1", "青葉 湊"]]);
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
    ["colNumber", "colName", "headerRow"].forEach(function (id) {
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
      addPeople([{ number: document.getElementById("addNumber").value.trim(), name: name }], false);
      event.target.reset();
    });
    document.getElementById("roster").addEventListener("click", function (event) {
      var remove = event.target.closest("[data-remove-student]");
      if (remove) { removeStudent(remove.dataset.removeStudent); return; }
      var person = event.target.closest(".person");
      if (!person || event.target.closest("input, button")) return;
      if (!(state.mode === "group" && state.draft)) return;
      var id = person.dataset.id;
      if (heldStudent(id) && state.draft.studentIds.indexOf(id) < 0) { flash("この人はすでに指定されています。"); return; }
      toggle(state.draft.studentIds, id);
      paintPeople();
      updateDraftCount();
      save();
    });
    document.getElementById("room").addEventListener("click", function (event) {
      var seat = event.target.closest("[data-seat]");
      if (seat) onSeat(seat.dataset.seat);
    });
    document.getElementById("unseated").addEventListener("click", function (event) {
      var button = event.target.closest("[data-unseated]");
      if (!button || !state.assignment) return;
      state.mode = "swap";
      state.swapFrom = { type: "person", id: button.dataset.unseated };
      renderRoom();
      renderStatus();
    });
    document.getElementById("layoutMode").addEventListener("change", function () {
      syncLayoutPanels();
      if (document.getElementById("layoutMode").value === "rows") renderCustomRows(state.rows.slice());
      if (document.getElementById("layoutMode").value === "cols" && !readCols().length) {
        renderCustomCols(state.columns || columnsFromRows(state.rows));
      }
      updateLayoutPreview();
    });
    ["gridRows", "gridCols", "totalSeats", "rowCount"].forEach(function (id) { document.getElementById(id).addEventListener("input", updateLayoutPreview); });
    document.getElementById("applyLayout").addEventListener("click", applyLayout);
    document.getElementById("addRow").addEventListener("click", function () {
      var rows = readCustom();
      if (rows.length >= 20) return;
      rows.push(6);
      renderCustomRows(rows);
      updateLayoutPreview();
    });
    document.getElementById("addCol").addEventListener("click", function () {
      var depths = readCols();
      if (!depths.length) depths = columnsFromRows(state.rows);
      if (depths.length >= 20) return;
      depths.push(depths[depths.length - 1] || 4);
      renderCustomCols(depths);
      updateLayoutPreview();
    });
    document.getElementById("customCols").addEventListener("click", function (event) {
      var button = event.target.closest("[data-remove-col]");
      if (!button) return;
      var depths = readCols();
      depths.splice(Number(button.dataset.removeCol), 1);
      if (!depths.length) depths = [4];
      renderCustomCols(depths);
      updateLayoutPreview();
    });
    document.getElementById("customRows").addEventListener("click", function (event) {
      var button = event.target.closest("[data-remove-row]");
      if (!button) return;
      var rows = readCustom();
      rows.splice(Number(button.dataset.removeRow), 1);
      if (!rows.length) rows = [6];
      renderCustomRows(rows);
      updateLayoutPreview();
    });
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
      state.mode = "group";
      state.draft = { studentIds: [], seatIds: [] };
      document.getElementById("draftName").value = "";
      updateDraftCount();
      paintPeople();
      renderRoom();
      renderStatus();
    });
    document.getElementById("draftCancel").addEventListener("click", function () {
      state.draft = null;
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
      state.mode = state.mode === "swap" ? "view" : "swap";
      state.swapFrom = null;
      renderRoom();
      renderStatus();
    });
    document.getElementById("btnUndo").addEventListener("click", undo);
    document.getElementById("btnClearResult").addEventListener("click", function () {
      state.assignment = null;
      state.unseated = [];
      state.swapFrom = null;
      renderRoom();
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
    document.getElementById("btnSample").addEventListener("click", function () {
      if (state.students.length && !window.confirm("いまの名簿をサンプルに入れ替えます。")) return;
      addPeople(SAMPLE.map(function (row) { return { number: row[0], name: row[1] }; }), true);
    });
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
      document.getElementById("totalSeats").value = "24";
      document.getElementById("rowCount").value = "4";
      document.getElementById("layoutMode").value = "grid";
      syncLayoutPanels();
      renderCustomRows(state.rows.slice());
      refresh();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !document.getElementById("ceremony").hidden) document.getElementById("skipCeremony").click();
    });
  }

  load();
  bind();
  document.getElementById("gridRows").value = String(state.rows.length);
  document.getElementById("gridCols").value = String(state.rows[0] || 6);
  document.getElementById("totalSeats").value = String(state.rows.reduce(function (sum, n) { return sum + n; }, 0));
  document.getElementById("rowCount").value = String(state.rows.length);
  var even = state.rows.length > 0 && state.rows.every(function (n) { return n === state.rows[0]; });
  document.getElementById("layoutMode").value = state.columns && state.columns.length ? "cols" : (even ? "grid" : "rows");
  syncLayoutPanels();
  renderCustomRows(state.rows.slice());
  renderCustomCols(state.columns || columnsFromRows(state.rows));
  refresh();
})();
