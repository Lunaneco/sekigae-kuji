/* 席替えの抽選。名簿・座席・固定・限定抽選はここだけで決める。 */
(function (root) {
  "use strict";

  var NUMBER_KEYS = {
    "出席番号": 1,
    "番号": 1,
    "整理番号": 1,
    "学籍番号": 1,
    "no": 1,
    "number": 1,
    "番": 1,
  };
  var NAME_KEYS = {
    "氏名": 1,
    "名前": 1,
    "なまえ": 1,
    "姓名": 1,
    "生徒名": 1,
    "児童名": 1,
    "学生名": 1,
    "name": 1,
  };

  function normHeader(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[！-～]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .replace(/[\s\u3000._・．]/g, "");
  }

  function isNumberHeader(value) {
    var key = normHeader(value);
    if (!key || key.indexOf("電話") >= 0 || key.indexOf("郵便") >= 0) return false;
    if (NUMBER_KEYS[key]) return true;
    return key.indexOf("出席番号") >= 0;
  }

  function isNameHeader(value) {
    var key = normHeader(value);
    if (!key || key.indexOf("ふりがな") >= 0 || key.indexOf("フリガナ") >= 0) return false;
    if (NAME_KEYS[key]) return true;
    return key.indexOf("氏名") >= 0 || key.indexOf("名前") >= 0;
  }

  function cleanNumber(value) {
    var text = String(value == null ? "" : value).replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
    if (/^\d+\.0$/.test(text)) text = text.slice(0, -2);
    return text;
  }

  function cleanName(value) {
    return String(value == null ? "" : value)
      .replace(/^[\s\u3000]+|[\s\u3000]+$/g, "")
      .replace(/[\s\u3000]{2,}/g, " ");
  }

  function guessMapping(matrix) {
    var rows = Array.isArray(matrix) ? matrix : [];
    var limit = Math.min(8, rows.length);
    var r;
    var c;
    for (r = 0; r < limit; r += 1) {
      var row = rows[r] || [];
      var numberCol = -1;
      var nameCol = -1;
      for (c = 0; c < row.length; c += 1) {
        if (numberCol < 0 && isNumberHeader(row[c])) numberCol = c;
        else if (nameCol < 0 && isNameHeader(row[c])) nameCol = c;
      }
      if (numberCol >= 0 && nameCol >= 0) {
        return { headerRow: r, numberCol: numberCol, nameCol: nameCol };
      }
    }
    return { headerRow: -1, numberCol: 0, nameCol: Math.min(1, columnCount(rows) - 1) };
  }

  function columnCount(matrix) {
    var max = 0;
    var r;
    for (r = 0; r < matrix.length; r += 1) {
      max = Math.max(max, (matrix[r] || []).length);
    }
    return Math.max(max, 1);
  }

  function extractPeople(matrix, headerRow, numberCol, nameCol) {
    var rows = Array.isArray(matrix) ? matrix : [];
    var start = headerRow >= 0 ? headerRow + 1 : 0;
    var people = [];
    var skipped = [];
    var r;
    for (r = start; r < rows.length; r += 1) {
      var row = rows[r] || [];
      var number = cleanNumber(row[numberCol]);
      var name = cleanName(row[nameCol]);
      if (!number && !name) continue;
      if (!name) {
        skipped.push(r + 1);
        continue;
      }
      people.push({ number: number, name: name });
    }
    return { people: people, skipped: skipped };
  }

  function distributeSeats(total, rowCount) {
  total = total | 0;
  rowCount = rowCount | 0;
  if (total < 1) return { ok: false, error: "座席数は1以上にしてください。", rows: [] };
  if (rowCount < 1) return { ok: false, error: "行の数は1以上にしてください。", rows: [] };
  if (total > 400) return { ok: false, error: "座席数は400席までです。", rows: [] };
  if (rowCount > 20) return { ok: false, error: "行は20行までです。", rows: [] };
  if (total < rowCount) rowCount = total;
  var base = Math.floor(total / rowCount);
  var extra = total % rowCount;
  if (base + (extra ? 1 : 0) > 20) {
    return { ok: false, error: "1行が20席を超えます。行の数を増やしてください。", rows: [] };
  }
  var rows = [];
  var i;
  for (i = 0; i < rowCount; i += 1) rows.push(base + (i >= rowCount - extra ? 1 : 0));
  return { ok: true, error: "", rows: rows };
}

  function gridSeats(rowCount, colCount) {
    rowCount = rowCount | 0;
    colCount = colCount | 0;
    if (rowCount < 1 || colCount < 1) return { ok: false, error: "行と列は1以上にしてください。", rows: [] };
    if (rowCount > 20) return { ok: false, error: "行は20行までです。", rows: [] };
    if (colCount > 20) return { ok: false, error: "列は20列までです。", rows: [] };
    if (rowCount * colCount > 400) return { ok: false, error: "座席数は400席までです。", rows: [] };
    var rows = [];
    var i;
    for (i = 0; i < rowCount; i += 1) rows.push(colCount);
    return { ok: true, error: "", rows: rows };
  }

function makeSeats(rowCounts) {
    var seats = [];
    var r;
    var c;
    for (r = 0; r < rowCounts.length; r += 1) {
      var count = rowCounts[r] | 0;
      if (count < 0) count = 0;
      for (c = 0; c < count; c += 1) {
        seats.push({ id: "r" + r + "c" + c, row: r, col: c });
      }
    }
    return seats;
  }

  function shuffle(items, rng) {
    var list = items.slice();
    var i;
    for (i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function studentSet(students) {
    var set = {};
    var i;
    for (i = 0; i < students.length; i += 1) set[students[i].id] = 1;
    return set;
  }

  function seatSet(seats) {
    var set = {};
    var i;
    for (i = 0; i < seats.length; i += 1) set[seats[i].id] = 1;
    return set;
  }

  function validate(students, seats, pins, groups) {
    var errors = [];
    var knownStudents = studentSet(students);
    var knownSeats = seatSet(seats);
    var usedStudents = {};
    var usedSeats = {};
    var i;
    var j;

    function takeStudent(id, label) {
      if (!knownStudents[id]) {
        errors.push(label + "に、名簿にいない人が含まれています。");
        return;
      }
      if (usedStudents[id]) {
        errors.push("同じ人が、固定席か限定抽選に重複しています。");
        return;
      }
      usedStudents[id] = 1;
    }

    function takeSeat(id, label) {
      if (!knownSeats[id]) {
        errors.push(label + "に、いまの座席表にない席が含まれています。");
        return;
      }
      if (usedSeats[id]) {
        errors.push("同じ席が、固定席か限定抽選に重複しています。");
        return;
      }
      usedSeats[id] = 1;
    }

    for (i = 0; i < pins.length; i += 1) {
      takeStudent(pins[i].studentId, "固定席");
      takeSeat(pins[i].seatId, "固定席");
    }

    for (i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var label = group.name ? "限定抽選「" + group.name + "」" : "限定抽選";
      if (!group.studentIds.length || !group.seatIds.length) {
        errors.push(label + "には、人と席をそれぞれ1つ以上入れてください。");
      }
      if (group.studentIds.length > group.seatIds.length) {
        errors.push(
          label +
            "は人が席より" +
            (group.studentIds.length - group.seatIds.length) +
            "人多いので、席を増やすか人を減らしてください。"
        );
      }
      var seenPeople = {};
      var seenSeats = {};
      for (j = 0; j < group.studentIds.length; j += 1) {
        if (seenPeople[group.studentIds[j]]) {
          errors.push(label + "に同じ人が二度入っています。");
        }
        seenPeople[group.studentIds[j]] = 1;
        takeStudent(group.studentIds[j], label);
      }
      for (j = 0; j < group.seatIds.length; j += 1) {
        if (seenSeats[group.seatIds[j]]) {
          errors.push(label + "に同じ席が二度入っています。");
        }
        seenSeats[group.seatIds[j]] = 1;
        takeSeat(group.seatIds[j], label);
      }
    }

    return unique(errors);
  }

  function warningsFor(students, seats, pins, groups) {
    var warnings = [];
    var reserved = {};
    var heldStudents = {};
    var i;
    var j;
    for (i = 0; i < pins.length; i += 1) {
      reserved[pins[i].seatId] = 1;
      heldStudents[pins[i].studentId] = 1;
    }
    for (i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var spare = group.seatIds.length - group.studentIds.length;
      if (spare > 0) {
        var label = group.name ? "「" + group.name + "」" : "限定抽選";
        warnings.push(label + "は席が" + spare + "席多いので、余った指定席は空席のままにします。");
      }
      for (j = 0; j < group.seatIds.length; j += 1) reserved[group.seatIds[j]] = 1;
      for (j = 0; j < group.studentIds.length; j += 1) heldStudents[group.studentIds[j]] = 1;
    }
    var freeSeats = 0;
    for (i = 0; i < seats.length; i += 1) if (!reserved[seats[i].id]) freeSeats += 1;
    var freeStudents = 0;
    for (i = 0; i < students.length; i += 1) if (!heldStudents[students[i].id]) freeStudents += 1;
    if (freeStudents > freeSeats) {
      warnings.push("自由に座れる席が" + (freeStudents - freeSeats) + "人分足りません。足りない人は席なしになります。");
    }
    var numbers = {};
    for (i = 0; i < students.length; i += 1) {
      var num = students[i].number;
      if (!num) continue;
      if (numbers[num]) warnings.push("出席番号 " + num + " が重複しています。");
      numbers[num] = 1;
    }
    return unique(warnings);
  }

  function unique(list) {
    var out = [];
    var seen = {};
    var i;
    for (i = 0; i < list.length; i += 1) {
      if (seen[list[i]]) continue;
      seen[list[i]] = 1;
      out.push(list[i]);
    }
    return out;
  }

  function draw(students, seats, pins, groups, rng) {
    var random = rng || Math.random;
    var errors = validate(students, seats, pins, groups);
    if (errors.length) {
      return { ok: false, errors: errors, assignment: {}, unseated: students.map(function (s) { return s.id; }) };
    }

    var assignment = {};
    var usedStudents = {};
    var reservedSeats = {};
    var i;

    for (i = 0; i < pins.length; i += 1) {
      assignment[pins[i].seatId] = pins[i].studentId;
      usedStudents[pins[i].studentId] = 1;
      reservedSeats[pins[i].seatId] = 1;
    }

    for (i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var people = shuffle(group.studentIds, random);
      var seatPool = shuffle(group.seatIds, random);
      var n = people.length;
      var k;
      for (k = 0; k < n; k += 1) {
        assignment[seatPool[k]] = people[k];
        usedStudents[people[k]] = 1;
      }
      for (k = 0; k < group.seatIds.length; k += 1) reservedSeats[group.seatIds[k]] = 1;
    }

    var restPeople = [];
    for (i = 0; i < students.length; i += 1) {
      if (!usedStudents[students[i].id]) restPeople.push(students[i].id);
    }
    restPeople = shuffle(restPeople, random);

    var restSeats = [];
    for (i = 0; i < seats.length; i += 1) {
      if (!reservedSeats[seats[i].id]) restSeats.push(seats[i].id);
    }
    restSeats = shuffle(restSeats, random);

    var pairCount = Math.min(restPeople.length, restSeats.length);
    for (i = 0; i < pairCount; i += 1) assignment[restSeats[i]] = restPeople[i];

    return {
      ok: true,
      errors: [],
      assignment: assignment,
      unseated: restPeople.slice(pairCount),
    };
  }

  function visualLine(count, aisle) {
    var slots = [];
    var c;
    var n = count | 0;
    if (n < 0) n = 0;
    if (aisle && n > 1) {
      var mid = Math.ceil(n / 2);
      for (c = 0; c < n; c += 1) {
        if (c === mid) slots.push({ type: "aisle" });
        slots.push({ type: "seat", col: c });
      }
    } else {
      for (c = 0; c < n; c += 1) slots.push({ type: "seat", col: c });
    }
    return slots;
  }

  function buildChartGrid(rowCounts, options) {
    var aisle = !!(options && options.aisle);
    var mirror = !!(options && options.mirror);
    var lines = [];
    var maxSlots = 0;
    var r;
    for (r = 0; r < rowCounts.length; r += 1) {
      var slots = visualLine(rowCounts[r], aisle);
      if (mirror) slots = slots.slice().reverse();
      if (slots.length > maxSlots) maxSlots = slots.length;
      lines.push({ row: r, slots: slots });
    }
    for (r = 0; r < lines.length; r += 1) {
      var lineSlots = lines[r].slots;
      var pad = Math.floor((maxSlots - lineSlots.length) / 2);
      var cells = [];
      var i;
      for (i = 0; i < pad; i += 1) cells.push({ type: "pad" });
      for (i = 0; i < lineSlots.length; i += 1) cells.push(lineSlots[i]);
      while (cells.length < maxSlots) cells.push({ type: "pad" });
      lines[r].cells = cells;
    }
    return { maxSlots: maxSlots, lines: lines };
  }

  function excelSafe(value) {
    var text = String(value == null ? "" : value);
    var head = text.charAt(0);
    if (head === "=" || head === "+" || head === "-" || head === "@" || head === "\t" || head === "\r") {
      return "'" + text;
    }
    return text;
  }

  function decodeTableText(bytes) {
    var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
      return new TextDecoder("utf-8").decode(data.subarray(3));
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch (err) {
      return new TextDecoder("shift_jis").decode(data);
    }
  }

  root.Sekigae = {
    guessMapping: guessMapping,
    extractPeople: extractPeople,
    distributeSeats: distributeSeats,
    gridSeats: gridSeats,
    makeSeats: makeSeats,
    buildChartGrid: buildChartGrid,
    shuffle: shuffle,
    validate: validate,
    warningsFor: warningsFor,
    draw: draw,
    decodeTableText: decodeTableText,
    cleanName: cleanName,
    cleanNumber: cleanNumber,
    columnCount: columnCount,
    excelSafe: excelSafe,
  };
})(typeof window !== "undefined" ? window : globalThis);
