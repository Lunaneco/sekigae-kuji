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
    if (key.indexOf("性別") >= 0) return false;
    if (NAME_KEYS[key]) return true;
    return key.indexOf("氏名") >= 0 || key.indexOf("名前") >= 0;
  }

  function isGenderHeader(value) {
    var key = normHeader(value);
    if (!key) return false;
    return key === "性別" || key === "男女" || key === "gender" || key === "sex" || key.indexOf("性別") >= 0;
  }

  function cleanGender(value) {
    var key = normHeader(value);
    if (!key || key.length > 8) return "";
    if (key === "男" || key === "男子" || key === "男性" || key === "男の子" || key === "男児" || key === "m" || key === "male" || key === "boy") return "男";
    if (key === "女" || key === "女子" || key === "女性" || key === "女の子" || key === "女児" || key === "f" || key === "female" || key === "girl") return "女";
    return "";
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
      var genderCol = -1;
      for (c = 0; c < row.length; c += 1) {
        if (numberCol < 0 && isNumberHeader(row[c])) numberCol = c;
        else if (nameCol < 0 && isNameHeader(row[c])) nameCol = c;
        else if (genderCol < 0 && isGenderHeader(row[c])) genderCol = c;
      }
      if (numberCol >= 0 && nameCol >= 0) {
        return { headerRow: r, numberCol: numberCol, nameCol: nameCol, genderCol: genderCol };
      }
    }
    return { headerRow: -1, numberCol: 0, nameCol: Math.min(1, columnCount(rows) - 1), genderCol: -1 };
  }

  function columnCount(matrix) {
    var max = 0;
    var r;
    for (r = 0; r < matrix.length; r += 1) {
      max = Math.max(max, (matrix[r] || []).length);
    }
    return Math.max(max, 1);
  }

  function extractPeople(matrix, headerRow, numberCol, nameCol, genderCol) {
    var rows = Array.isArray(matrix) ? matrix : [];
    var start = headerRow >= 0 ? headerRow + 1 : 0;
    var people = [];
    var skipped = [];
    var r;
    if (!(genderCol >= 0)) genderCol = -1;
    for (r = start; r < rows.length; r += 1) {
      var row = rows[r] || [];
      var number = cleanNumber(row[numberCol]);
      var name = cleanName(row[nameCol]);
      if (!number && !name) continue;
      if (!name) {
        skipped.push(r + 1);
        continue;
      }
      people.push({ number: number, name: name, gender: genderCol >= 0 ? cleanGender(row[genderCol]) : "" });
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

  function columnSeats(depths) {
    if (!Array.isArray(depths) || !depths.length) return { ok: false, error: "列がありません。", rows: [], columns: [] };
    if (depths.length > 20) return { ok: false, error: "列は20列までです。", rows: [], columns: [] };
    var columns = [];
    var total = 0;
    var i;
    for (i = 0; i < depths.length; i += 1) {
      var n = depths[i] | 0;
      if (n < 1) return { ok: false, error: "各列の席数は1以上にしてください。", rows: [], columns: [] };
      if (n > 20) return { ok: false, error: "1列は20席までです。", rows: [], columns: [] };
      columns.push(n);
      total += n;
    }
    if (total > 400) return { ok: false, error: "座席数は400席までです。", rows: [], columns: [] };
    var max = 0;
    for (i = 0; i < columns.length; i += 1) if (columns[i] > max) max = columns[i];
    var rows = [];
    var r;
    var c;
    for (r = 0; r < max; r += 1) {
      var count = 0;
      for (c = 0; c < columns.length; c += 1) if (columns[c] > r) count += 1;
      rows.push(count);
    }
    return { ok: true, error: "", rows: rows, columns: columns };
  }

  function makeSeats(rowCounts, columns) {
    var seats = [];
    var r;
    var c;
    if (columns && columns.length) {
      var max = 0;
      for (c = 0; c < columns.length; c += 1) if ((columns[c] | 0) > max) max = columns[c] | 0;
      for (r = 0; r < max; r += 1) {
        for (c = 0; c < columns.length; c += 1) {
          if ((columns[c] | 0) > r) seats.push({ id: "r" + r + "c" + c, row: r, col: c });
        }
      }
      return seats;
    }
    for (r = 0; r < rowCounts.length; r += 1) {
      var count = rowCounts[r] | 0;
      if (count < 0) count = 0;
      for (c = 0; c < count; c += 1) {
        seats.push({ id: "r" + r + "c" + c, row: r, col: c });
      }
    }
    return seats;
  }

  function normalizeLayout(rows, columns) {
    function identity(id) { return String(id); }
    var built = columns && columns.length ? columnSeats(columns) : null;
    if (built && built.ok) {
      var width = built.columns.length;
      var depth = 0;
      var i;
      for (i = 0; i < width; i += 1) if (built.columns[i] > depth) depth = built.columns[i];
      var rectangular = [];
      var back = [];
      for (i = 0; i < depth; i += 1) rectangular.push(width);
      var r;
      var c;
      for (c = 0; c < width; c += 1) {
        for (r = built.columns[c]; r < depth; r += 1) back.push("r" + r + "c" + c);
      }
      return { rows: rectangular, gaps: back, mapId: identity };
    }
    var counts = [];
    var n;
    var source = Array.isArray(rows) ? rows : [];
    for (n = 0; n < source.length; n += 1) counts.push(source[n] | 0);
    var width = 0;
    for (n = 0; n < counts.length; n += 1) if (counts[n] > width) width = counts[n];
    var even = counts.length > 0 && counts.every(function (count) { return count === counts[0]; });
    if (even || width < 1) return { rows: counts, gaps: [], mapId: identity };
    var full = [];
    var holes = [];
    for (n = 0; n < counts.length; n += 1) full.push(width);
    for (r = 0; r < counts.length; r += 1) {
      var count = counts[r];
      if (count < 0) count = 0;
      var pad = Math.floor((width - count) / 2);
      for (c = 0; c < width; c += 1) {
        if (c < pad || c >= pad + count) holes.push("r" + r + "c" + c);
      }
    }
    function mapId(id) {
      var found = /^r(\d+)c(\d+)$/.exec(String(id));
      if (!found) return String(id);
      var row = parseInt(found[1], 10);
      var col = parseInt(found[2], 10);
      if (row < 0 || row >= counts.length) return String(id);
      var seatsInRow = counts[row];
      if (seatsInRow < 0) seatsInRow = 0;
      return "r" + row + "c" + (col + Math.floor((width - seatsInRow) / 2));
    }
    return { rows: full, gaps: holes, mapId: mapId };
  }

  function adoptLayout(rows, columns, savedGaps) {
    var layout = normalizeLayout(rows, columns);
    var seats = {};
    makeSeats(layout.rows, null).forEach(function (seat) { seats[seat.id] = 1; });
    var gaps = [];
    var seen = {};
    function take(id) {
      if (typeof id !== "string" || !/^r\d+c\d+$/.test(id) || !seats[id] || seen[id]) return;
      seen[id] = 1;
      gaps.push(id);
      delete seats[id];
    }
    layout.gaps.forEach(take);
    if (Array.isArray(savedGaps)) savedGaps.forEach(function (id) { take(layout.mapId(id)); });
    return { rows: layout.rows, gaps: gaps, mapId: layout.mapId, seats: seats };
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
      var openSeats = [];
      for (j = 0; j < group.seatIds.length; j += 1) {
        if (!reserved[group.seatIds[j]]) openSeats.push(group.seatIds[j]);
      }
      var spare = openSeats.length - group.studentIds.length;
      if (spare > 0) {
        var label = group.name ? "「" + group.name + "」" : "限定抽選";
        warnings.push(label + "は席が" + spare + "席多いので、余った席は残りの抽選に入ります。");
      }
      var take = Math.min(group.studentIds.length, openSeats.length);
      for (j = 0; j < take; j += 1) reserved[openSeats[j]] = 1;
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

  function genderMap(students) {
    var map = {};
    var i;
    for (i = 0; i < students.length; i += 1) map[students[i].id] = cleanGender(students[i].gender);
    return map;
  }

  function oppositeCount(assignment, neighbors, genders) {
    if (!neighbors) return 0;
    var bad = 0;
    var ids = Object.keys(assignment);
    var i;
    var k;
    for (i = 0; i < ids.length; i += 1) {
      var seatId = ids[i];
      var gender = genders[assignment[seatId]];
      if (gender !== "男" && gender !== "女") continue;
      var around = neighbors[seatId] || [];
      var same = 0;
      var other = 0;
      for (k = 0; k < around.length; k += 1) {
        var next = genders[assignment[around[k]]];
        if (next !== "男" && next !== "女") continue;
        if (next === gender) same += 1;
        else other += 1;
      }
      if (other > 0 && same === 0) bad += 1;
    }
    return bad;
  }

  function countOpposite(students, assignment, neighbors) {
    return oppositeCount(assignment || {}, neighbors, genderMap(students || []));
  }

  function separateCount(assignment, around, pair) {
    if (!pair || !pair.length || !around) return 0;
    if (Array.isArray(pair[0])) {
      var total = 0;
      var i;
      for (i = 0; i < pair.length; i += 1) total += separateCount(assignment, around, pair[i]);
      return total;
    }
    if (pair.length !== 2 || pair[0] === pair[1]) return 0;
    var seatOf = {};
    Object.keys(assignment || {}).forEach(function (seat) { seatOf[assignment[seat]] = seat; });
    var left = seatOf[pair[0]];
    var right = seatOf[pair[1]];
    if (!left || !right) return 0;
    var near = around[left] || [];
    return near.indexOf(right) >= 0 ? 1 : 0;
  }

  function separatePairs(raw, byId) {
    var list = [];
    var seen = {};
    if (!raw || !raw.length) return list;
    var items = typeof raw[0] === "string" ? [raw] : raw;
    items.forEach(function (pair) {
      if (!pair || pair.length !== 2 || pair[0] === pair[1]) return;
      if (!byId[pair[0]] || !byId[pair[1]]) return;
      var key = pair[0] < pair[1] ? pair[0] + "\0" + pair[1] : pair[1] + "\0" + pair[0];
      if (seen[key]) return;
      seen[key] = 1;
      list.push([pair[0], pair[1]]);
    });
    return list;
  }

  function copyAssignment(src) {
    var out = {};
    var keys = Object.keys(src);
    var i;
    for (i = 0; i < keys.length; i += 1) out[keys[i]] = src[keys[i]];
    return out;
  }

  function draw(students, seats, pins, groups, rng, options) {
    var random = rng || Math.random;
    options = options || {};
    var errors = validate(students, seats, pins, groups);
    if (errors.length) {
      return { ok: false, errors: errors, assignment: {}, unseated: students.map(function (s) { return s.id; }), oppositeLeft: 0 };
    }

    var genders = genderMap(students);
    var neighbors = options.neighbors || null;
    var numberOrder = options.numberOrder === "right" ? "right" : (options.numberOrder === "left" ? "left" : "");
    var byId = {};
    var orderIndex = {};
    var personIndex;
    for (personIndex = 0; personIndex < students.length; personIndex += 1) {
      byId[students[personIndex].id] = students[personIndex];
      orderIndex[students[personIndex].id] = personIndex;
    }

    function numberKey(student) {
      var text = String(student && student.number || "").replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
      text = text.replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xfee0); });
      if (/^\d+$/.test(text)) return { group: 0, n: Number(text), text: text };
      if (text) return { group: 1, n: 0, text: text };
      return { group: 2, n: 0, text: "" };
    }

    function comparePeople(a, b) {
      var ka = numberKey(byId[a]);
      var kb = numberKey(byId[b]);
      if (ka.group !== kb.group) return ka.group - kb.group;
      if (ka.group === 0 && ka.n !== kb.n) return ka.n - kb.n;
      if (ka.text !== kb.text) return ka.text < kb.text ? -1 : 1;
      return orderIndex[a] - orderIndex[b];
    }

    function compareSeats(a, b) {
      var pa = seatPos(a);
      var pb = seatPos(b);
      if (pa.col !== pb.col) return numberOrder === "right" ? pb.col - pa.col : pa.col - pb.col;
      return pa.row - pb.row;
    }

    function place() {
      var assignment = {};
      var usedStudents = {};
      var reservedSeats = {};
      var i;
      for (i = 0; i < pins.length; i += 1) {
        assignment[pins[i].seatId] = pins[i].studentId;
        usedStudents[pins[i].studentId] = 1;
        reservedSeats[pins[i].seatId] = 1;
      }
      var groupPools = [];
      for (i = 0; i < groups.length; i += 1) {
        var group = groups[i];
        var people = numberOrder ? group.studentIds.slice().sort(comparePeople) : shuffle(group.studentIds, random);
        var seatPool = numberOrder ? group.seatIds.slice().sort(compareSeats) : shuffle(group.seatIds, random);
        var used = [];
        var personAt = 0;
        var k;
        for (k = 0; k < seatPool.length && personAt < people.length; k += 1) {
          if (reservedSeats[seatPool[k]]) continue;
          assignment[seatPool[k]] = people[personAt];
          usedStudents[people[personAt]] = 1;
          reservedSeats[seatPool[k]] = 1;
          used.push(seatPool[k]);
          personAt += 1;
        }
        if (used.length) groupPools.push(used);
      }
      var restPeople = [];
      for (i = 0; i < students.length; i += 1) {
        if (!usedStudents[students[i].id]) restPeople.push(students[i].id);
      }
      restPeople = numberOrder ? restPeople.sort(comparePeople) : shuffle(restPeople, random);
      var restSeats = [];
      for (i = 0; i < seats.length; i += 1) {
        if (!reservedSeats[seats[i].id]) restSeats.push(seats[i].id);
      }
      restSeats = numberOrder ? restSeats.sort(compareSeats) : shuffle(restSeats, random);
      var pairCount = Math.min(restPeople.length, restSeats.length);
      for (i = 0; i < pairCount; i += 1) assignment[restSeats[i]] = restPeople[i];
      return { assignment: assignment, unseated: restPeople.slice(pairCount), pools: poolMap(restSeats, groupPools) };
    }

    function poolMap(restSeats, groupPools) {
      var map = {};
      var i;
      var k;
      for (i = 0; i < restSeats.length; i += 1) map[restSeats[i]] = restSeats;
      for (i = 0; i < groupPools.length; i += 1) {
        var ids = groupPools[i];
        for (k = 0; k < ids.length; k += 1) map[ids[k]] = ids;
      }
      return map;
    }

    function improve(assignment, pools, measure) {
      var guard = 0;
      while (guard < 80) {
        guard += 1;
        var before = measure(assignment);
        if (before === 0) return;
        var ids = Object.keys(assignment);
        var changed = false;
        var i;
        for (i = 0; i < ids.length && !changed; i += 1) {
          var seatId = ids[Math.floor(random() * ids.length)];
          var pool = pools[seatId];
          if (!pool || pool.length < 2) continue;
          var tries = Math.min(pool.length - 1, 16);
          var t;
          for (t = 0; t < tries; t += 1) {
            var other = pool[Math.floor(random() * pool.length)];
            if (other === seatId || !assignment[other]) continue;
            var held = assignment[seatId];
            assignment[seatId] = assignment[other];
            assignment[other] = held;
            if (measure(assignment) < before) {
              changed = true;
              break;
            }
            assignment[other] = assignment[seatId];
            assignment[seatId] = held;
          }
        }
        if (!changed) return;
      }
    }

    function seatPos(id) {
      var match = /^r(\d+)c(\d+)$/.exec(id);
      return match ? { row: Number(match[1]), col: Number(match[2]) } : { row: 0, col: 0 };
    }

    function stripe(assignment, pools) {
      var seen = [];
      Object.keys(pools).forEach(function (id) {
        var pool = pools[id];
        if (seen.indexOf(pool) >= 0) return;
        seen.push(pool);
        var pairs = [];
        var k;
        for (k = 0; k < pool.length; k += 1) {
          if (assignment[pool[k]]) pairs.push({ seat: pool[k], person: assignment[pool[k]] });
        }
        if (pairs.length < 2) return;
        pairs.sort(function (a, b) {
          var pa = seatPos(a.seat);
          var pb = seatPos(b.seat);
          if (pa.col !== pb.col) return pa.col - pb.col;
          return pa.row - pb.row;
        });
        var columns = [];
        var colMap = {};
        for (k = 0; k < pairs.length; k += 1) {
          var pos = seatPos(pairs[k].seat);
          if (!colMap[pos.col]) {
            colMap[pos.col] = [];
            columns.push(colMap[pos.col]);
          }
          colMap[pos.col].push(pairs[k].seat);
        }
        columns = shuffle(columns, random);
        var seatOrder = [];
        for (k = 0; k < columns.length; k += 1) seatOrder = seatOrder.concat(columns[k]);
        var boys = [];
        var girls = [];
        var other = [];
        for (k = 0; k < pairs.length; k += 1) {
          var g = genders[pairs[k].person];
          if (g === "男") boys.push(pairs[k].person);
          else if (g === "女") girls.push(pairs[k].person);
          else other.push(pairs[k].person);
        }
        boys = shuffle(boys, random);
        girls = shuffle(girls, random);
        other = shuffle(other, random);
        var bi = 0;
        var gi = 0;
        var oi = 0;
        var prefer = random() < 0.5 ? "男" : "女";
        var ordered = [];
        var lastCol = null;
        for (k = 0; k < seatOrder.length; k += 1) {
          var col = seatPos(seatOrder[k]).col;
          if (col !== lastCol) {
            lastCol = col;
            if (prefer === "男" && bi >= boys.length && gi < girls.length) prefer = "女";
            if (prefer === "女" && gi >= girls.length && bi < boys.length) prefer = "男";
          }
          if (prefer === "男" && bi < boys.length) ordered.push(boys[bi++]);
          else if (prefer === "女" && gi < girls.length) ordered.push(girls[gi++]);
          else if (bi < boys.length) ordered.push(boys[bi++]);
          else if (gi < girls.length) ordered.push(girls[gi++]);
          else ordered.push(other[oi++]);
        }
        for (k = 0; k < seatOrder.length; k += 1) assignment[seatOrder[k]] = ordered[k];
      });
    }

    var pairs = separatePairs(options.separate, byId);
    var around = options.around || null;
    var tuneGender = !numberOrder && !!options.avoidOpposite && !!neighbors;
    var tuneSeparate = !numberOrder && pairs.length > 0 && !!around;
    function apartCount(assignment) {
      if (!pairs.length || !around) return 0;
      return separateCount(assignment, around, pairs);
    }
    function scoreOf(assignment) {
      var apart = tuneSeparate ? apartCount(assignment) : 0;
      var opposite = tuneGender ? oppositeCount(assignment, neighbors, genders) : 0;
      return apart * 1000 + opposite;
    }
    function tune(candidate) {
      improve(candidate.assignment, candidate.pools, scoreOf);
      var score = scoreOf(candidate.assignment);
      if (score === 0 || !tuneGender) return score;
      var backup = copyAssignment(candidate.assignment);
      stripe(candidate.assignment, candidate.pools);
      improve(candidate.assignment, candidate.pools, scoreOf);
      var striped = scoreOf(candidate.assignment);
      if (striped > score) candidate.assignment = backup;
      return striped < score ? striped : score;
    }

    var placed = place();
    if (!tuneGender && !tuneSeparate) {
      return { ok: true, errors: [], assignment: placed.assignment, unseated: placed.unseated, oppositeLeft: 0, separateLeft: apartCount(placed.assignment) };
    }
    var best = placed;
    var bestScore = tune(best);
    var restarts = seats.length > 80 ? 8 : 20;
    var r;
    for (r = 0; r < restarts && bestScore > 0; r += 1) {
      var candidate = place();
      var score = tune(candidate);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return {
      ok: true,
      errors: [],
      assignment: best.assignment,
      unseated: best.unseated,
      oppositeLeft: tuneGender ? oppositeCount(best.assignment, neighbors, genders) : 0,
      separateLeft: apartCount(best.assignment)
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

  function columnSlots(depths, aisle, mirror) {
    var order = [];
    var c;
    for (c = 0; c < depths.length; c += 1) order.push(c);
    if (mirror) order.reverse();
    var slots = [];
    var mid = Math.ceil(order.length / 2);
    for (c = 0; c < order.length; c += 1) {
      if (aisle && order.length > 1 && c === mid) slots.push({ type: "aisle" });
      slots.push({ type: "seat", col: order[c], depth: depths[order[c]] | 0 });
    }
    return slots;
  }

  function buildChartGrid(rowCounts, options) {
    var aisle = !!(options && options.aisle);
    var mirror = !!(options && options.mirror);
    var columns = options && options.columns;
    if (columns && columns.length) {
      var slots = columnSlots(columns, aisle, mirror);
      var depthMax = 0;
      var n;
      for (n = 0; n < columns.length; n += 1) if ((columns[n] | 0) > depthMax) depthMax = columns[n] | 0;
      var columnLines = [];
      for (n = 0; n < depthMax; n += 1) {
        var cells = [];
        var s;
        for (s = 0; s < slots.length; s += 1) {
          var slot = slots[s];
          if (slot.type === "aisle") cells.push({ type: "aisle" });
          else if (n < slot.depth) cells.push({ type: "seat", col: slot.col });
          else cells.push({ type: "pad" });
        }
        columnLines.push({ row: n, cells: cells });
      }
      markGaps(columnLines, options && options.gaps);
      return { maxSlots: slots.length, lines: columnLines };
    }
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
    markGaps(lines, options && options.gaps);
    return { maxSlots: maxSlots, lines: lines };
  }

  function markGaps(lines, gaps) {
    if (!gaps || !gaps.length) return;
    var set = {};
    var i;
    for (i = 0; i < gaps.length; i += 1) set[String(gaps[i])] = 1;
    var r;
    var c;
    for (r = 0; r < lines.length; r += 1) {
      var cells = lines[r].cells;
      for (c = 0; c < cells.length; c += 1) {
        var cell = cells[c];
        if (cell.type === "seat" && set["r" + lines[r].row + "c" + cell.col]) cell.type = "gap";
      }
    }
  }

  function seatNeighbors(rowCounts, options) {
    var grid = buildChartGrid(rowCounts, options || {});
    var idAt = [];
    var map = {};
    var r;
    var c;
    for (r = 0; r < grid.lines.length; r += 1) {
      idAt[r] = [];
      var cells = grid.lines[r].cells;
      for (c = 0; c < cells.length; c += 1) {
        var cell = cells[c];
        if (cell.type !== "seat") {
          idAt[r][c] = "";
          continue;
        }
        var id = "r" + grid.lines[r].row + "c" + cell.col;
        idAt[r][c] = id;
        map[id] = [];
      }
    }
    Object.keys(map).forEach(function (id) {
      var here = null;
      for (r = 0; r < idAt.length && !here; r += 1) {
        for (c = 0; c < idAt[r].length; c += 1) if (idAt[r][c] === id) here = { r: r, c: c };
      }
      var steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (options && options.diagonal) steps.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      steps.forEach(function (step) {
        var row = idAt[here.r + step[0]];
        var other = row && row[here.c + step[1]];
        if (other) map[id].push(other);
      });
    });
    return map;
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
    columnSeats: columnSeats,
    normalizeLayout: normalizeLayout,
    adoptLayout: adoptLayout,
    makeSeats: makeSeats,
    buildChartGrid: buildChartGrid,
    shuffle: shuffle,
    validate: validate,
    warningsFor: warningsFor,
    draw: draw,
    decodeTableText: decodeTableText,
    cleanName: cleanName,
    cleanNumber: cleanNumber,
    cleanGender: cleanGender,
    countOpposite: countOpposite,
    countSeparate: separateCount,
    seatNeighbors: seatNeighbors,
    columnCount: columnCount,
    excelSafe: excelSafe,
  };
})(typeof window !== "undefined" ? window : globalThis);
