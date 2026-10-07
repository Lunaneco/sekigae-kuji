(function () {
  "use strict";

  var KEY = "sekigae-kuji-v1";
  var teacher = new URLSearchParams(location.search).get("view") === "teacher";

  function cleanId(id, prefix) {
    return typeof id === "string" && new RegExp("^" + prefix + "\\d+$").test(id) ? id : "";
  }

  function loadState() {
    var data;
    try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (err) { return null; }
    if (!data || data.v !== 1 || !Array.isArray(data.students) || !Array.isArray(data.rows)) return null;
    if (data.rows.length > 20 || !data.rows.every(function (n) { return typeof n === "number" && n >= 0 && n <= 20; })) return null;
    var students = [];
    var known = {};
    data.students.slice(0, 500).forEach(function (item) {
      var id = cleanId(item && item.id, "s");
      if (!id || !item.name || known[id]) return;
      known[id] = { id: id, number: String(item.number || "").slice(0, 20), name: String(item.name).slice(0, 80) };
      students.push(known[id]);
    });
    var columns = null;
    var rows = data.rows.slice();
    if (Array.isArray(data.columns) && data.columns.length) {
      var built = Sekigae.columnSeats(data.columns);
      if (built.ok) {
        columns = built.columns;
        rows = built.rows;
      }
    }
    var seats = {};
    Sekigae.makeSeats(rows, columns).forEach(function (seat) { seats[seat.id] = 1; });
    var assignment = null;
    if (data.assignment && typeof data.assignment === "object") {
      assignment = {};
      Object.keys(data.assignment).forEach(function (seatId) {
        if (seats[seatId] && known[data.assignment[seatId]]) assignment[seatId] = data.assignment[seatId];
      });
    }
    var unseated = Array.isArray(data.unseated) ? data.unseated.filter(function (id) { return known[id]; }) : [];
    return { students: known, rows: rows, columns: columns, aisle: !!data.aisle, assignment: assignment, unseated: unseated };
  }

  function cell(tag, className, text) {
    var el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function renderEmpty() {
    var chart = document.getElementById("chart");
    chart.appendChild(cell("p", "sheet-empty", "まだ席が決まっていません。席替えのページで席を決めてから、もう一度開いてください。"));
    document.getElementById("caption").textContent = "座席表";
  }

  function render(state) {
    var grid = Sekigae.buildChartGrid(state.rows, { aisle: state.aisle, mirror: teacher, columns: state.columns });
    document.title = teacher ? "教員用の座席表" : "掲示用の座席表";
    document.getElementById("caption").textContent = teacher
      ? "教員用。教卓から見て左が左。黒板は前の中央。"
      : "掲示用。黒板に向かって左が左。黒板は前の中央。";
    var switchView = document.getElementById("switchView");
    switchView.href = teacher ? "sheet.html?view=poster" : "sheet.html?view=teacher";
    switchView.textContent = teacher ? "掲示用を開く" : "教員用を開く";

    var chart = document.getElementById("chart");
    var stack = document.createElement("div");
    stack.className = "room-stack";
    stack.style.setProperty("--slots", String(grid.maxSlots || 1));
    stack.append(cell("p", "front-label", "前"), cell("div", "board", "黒板"));
    var list = [];
    grid.lines.forEach(function (line) {
      var row = document.createElement("div");
      row.className = "seat-row";
      row.appendChild(cell("div", "row-label", line.row + 1 + "行目"));
      var lineEl = document.createElement("div");
      lineEl.className = "seat-line";
      line.cells.forEach(function (item) {
        if (item.type === "pad") {
          lineEl.appendChild(cell("span", "pad", ""));
          return;
        }
        if (item.type === "aisle") {
          lineEl.appendChild(cell("span", "aisle", "通路"));
          return;
        }
        var count = state.columns && state.columns.length ? state.columns.length : (state.rows[line.row] || 0);
        var shown = teacher ? count - item.col : item.col + 1;
        var seatId = "r" + line.row + "c" + item.col;
        var student = state.assignment ? state.students[state.assignment[seatId]] : null;
        var seat = cell("div", "seat", "");
        seat.append(
          cell("span", "seat-coord", String(shown)),
          cell("span", "seat-num", student ? student.number : ""),
          cell("span", "seat-name", student ? student.name : "空席")
        );
        lineEl.appendChild(seat);
        list.push({
          row: String(line.row + 1),
          fromLeft: String(item.col + 1),
          fromTeacher: String(count - item.col),
          number: student ? student.number : "",
          name: student ? student.name : ""
        });
      });
      row.appendChild(lineEl);
      stack.appendChild(row);
    });
    stack.appendChild(cell("p", "back-label", "うしろ"));
    chart.appendChild(stack);

    var extra = document.getElementById("extra");
    if (teacher) {
      extra.hidden = false;
      extra.appendChild(cell("h2", "", "一覧"));
      var table = document.createElement("table");
      var head = document.createElement("tr");
      ["行（前から）", "列（向かって左から）", "列（先生から左から）", "出席番号", "氏名"].forEach(function (label) {
        head.appendChild(cell("th", "", label));
      });
      table.appendChild(head);
      list.forEach(function (item) {
        if (!item.name && !item.number) return;
        var tr = document.createElement("tr");
        [item.row, item.fromLeft, item.fromTeacher, item.number, item.name].forEach(function (value) {
          tr.appendChild(cell("td", "", value));
        });
        table.appendChild(tr);
      });
      state.unseated.forEach(function (id) {
        var student = state.students[id];
        if (!student) return;
        var tr = document.createElement("tr");
        ["", "", "", student.number, student.name + "（席なし）"].forEach(function (value) {
          tr.appendChild(cell("td", "", value));
        });
        table.appendChild(tr);
      });
      extra.appendChild(table);
    } else if (state.unseated.length) {
      extra.hidden = false;
      var names = state.unseated.map(function (id) {
        var student = state.students[id];
        return student ? ((student.number ? student.number + " " : "") + student.name) : "";
      }).filter(Boolean);
      extra.appendChild(cell("p", "", "席が足りない人: " + names.join("、")));
    }
    fitSeats(grid.maxSlots || 1);
  }

  function fitSeats(slots) {
    var seat = Math.max(64, Math.min(120, Math.floor((window.innerWidth - 96) / slots)));
    document.documentElement.style.setProperty("--seat", seat + "px");
    var board = document.querySelector(".board");
    var width = 0;
    document.querySelectorAll(".seat-line").forEach(function (line) { width = Math.max(width, line.offsetWidth); });
    if (board && width) board.style.width = width + "px";
  }

  document.getElementById("printSheet").addEventListener("click", function () { window.print(); });
  var state = loadState();
  if (!state || !state.assignment) renderEmpty();
  else render(state);
  window.addEventListener("resize", function () {
    var slots = Number(getComputedStyle(document.querySelector(".room-stack") || document.body).getPropertyValue("--slots")) || 1;
    if (state && state.assignment) fitSeats(slots);
  });
})();
