const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const sandbox = {
  console, TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, ArrayBuffer,
  Math, Date, Number, String, Object, Array, JSON, parseInt, isFinite, isNaN, RegExp, Error, Function
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "js/draw.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "js/xlsx-write.js"), "utf8"), sandbox);
const S = sandbox.Sekigae;
const X = sandbox.SekigaeXlsx;
const XLSX = require(path.join(root, "vendor/xlsx.full.min.js"));
let failed = 0;
function check(name, cond) {
  if (!cond) { failed += 1; console.error("FAIL", name); }
  else console.log("ok", name);
}

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

check("36席6列", S.distributeSeats(36, 6).rows.join() === "6,6,6,6,6,6");
check("37席はうしろが増える", S.distributeSeats(37, 6).rows.join() === "6,6,6,6,6,7");
check("席が列より少ない", S.distributeSeats(5, 8).rows.join() === "1,1,1,1,1");
check("1列20席を超えない", S.distributeSeats(100, 2).ok === false);
check("4行6列", S.gridSeats(4, 6).rows.join() === "6,6,6,6");
check("20行20列まで", S.gridSeats(20, 20).ok === true && S.gridSeats(21, 1).ok === false && S.gridSeats(1, 21).ok === false);
const byCol = S.columnSeats([5, 6, 6, 4]);
check("列ごとの席数", byCol.ok && byCol.rows.join() === "4,4,4,4,3,2");
const byColGrid = S.buildChartGrid(byCol.rows, { columns: byCol.columns });
check("短い列はうしろが空く", byColGrid.lines[4].cells.map((c) => c.type === "seat" ? c.col : "-").join() === "0,1,2,-");
check("いちばん長い列だけ残る", byColGrid.lines[5].cells.map((c) => c.type === "seat" ? c.col : "-").join() === "-,1,2,-");
const byColSeats = S.makeSeats(byCol.rows, byCol.columns).map((seat) => seat.id);
check("列の席だけ作る", byColSeats.indexOf("r4c0") >= 0 && byColSeats.indexOf("r4c3") < 0 && byColSeats.indexOf("r5c1") >= 0);
const byColMirror = S.buildChartGrid(byCol.rows, { columns: byCol.columns, mirror: true });
check("教員用でも列の位置を保つ", byColMirror.lines[5].cells.map((c) => c.type === "seat" ? c.col : "-").join() === "-,2,1,-");
const byColAisle = S.buildChartGrid(byCol.rows, { columns: byCol.columns, aisle: true });
check("列指定でも通路は同じ位置", byColAisle.lines[0].cells.findIndex((c) => c.type === "aisle") === 2 && byColAisle.lines[5].cells.findIndex((c) => c.type === "aisle") === 2);
check("列数の上限", S.columnSeats([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]).ok === false && S.columnSeats([21]).ok === false);

const centered = S.buildChartGrid([2, 4], {});
check("短い列は中央", centered.maxSlots === 4 && centered.lines[0].cells.map((c) => c.type === "seat" ? c.col : "-").join() === "-,0,1,-");
const mirrored = S.buildChartGrid([2], { mirror: true });
check("教員用は左右が逆", mirrored.lines[0].cells.map((c) => c.col).join() === "1,0");
const aisle = S.buildChartGrid([4, 6], { aisle: true });
function aisleAt(line) { return line.cells.findIndex((c) => c.type === "aisle"); }
check("通路は黒板の中央列", aisleAt(aisle.lines[0]) === aisleAt(aisle.lines[1]) && aisleAt(aisle.lines[1]) === 3);

const students = ["a", "b", "c", "d"].map((id, i) => ({ id, number: String(i + 1), name: "名" + id }));
const seats = S.makeSeats([2, 2]);
const pins = [{ studentId: "a", seatId: "r0c0" }];
const groups = [{ studentIds: ["b", "c"], seatIds: ["r1c0", "r1c1"] }];
let outsiders = 0;
for (let n = 0; n < 200; n += 1) {
  const drawn = S.draw(students, seats, pins, groups, rng(n + 1));
  if (!drawn.ok || drawn.assignment.r0c0 !== "a") outsiders += 1;
  ["b", "c"].forEach((id) => {
    const seat = Object.keys(drawn.assignment).find((key) => drawn.assignment[key] === id);
    if (seat !== "r1c0" && seat !== "r1c1") outsiders += 1;
  });
  if (drawn.assignment.r1c0 === "d" || drawn.assignment.r1c1 === "d") outsiders += 1;
}
check("固定と限定抽選を守る", outsiders === 0);
check("人が席より多い組は拒否", S.validate(students, seats, [], [{ studentIds: ["a", "b", "c"], seatIds: ["r0c0"] }]).length > 0);
const poolStudents = ["a", "b", "c"].map((id, i) => ({ id, number: String(i + 1), name: "名" + id }));
const poolSeats = S.makeSeats([3]);
const poolGroup = [{ studentIds: ["a", "b"], seatIds: ["r0c0", "r0c1", "r0c2"] }];
const poolSeen = { r0c0: 0, r0c1: 0, r0c2: 0 };
let poolBad = 0;
for (let n = 0; n < 80; n += 1) {
  const drawn = S.draw(poolStudents, poolSeats, [], poolGroup, rng(n + 9));
  const seatOf = {};
  Object.keys(drawn.assignment).forEach((key) => { seatOf[drawn.assignment[key]] = key; });
  const ids = ["r0c0", "r0c1", "r0c2"];
  if (!drawn.ok || drawn.unseated.length || Object.keys(drawn.assignment).length !== 3) poolBad += 1;
  ["a", "b", "c"].forEach((id) => { if (ids.indexOf(seatOf[id]) < 0) poolBad += 1; });
  if (seatOf.a === seatOf.b || seatOf.a === seatOf.c || seatOf.b === seatOf.c) poolBad += 1;
  if (seatOf.c) poolSeen[seatOf.c] += 1;
}
check("余った席は残りの人に渡る", poolBad === 0 && poolSeen.r0c0 > 0 && poolSeen.r0c1 > 0 && poolSeen.r0c2 > 0);
const spareOrder = S.draw(
  [{ id: "a", number: "2", name: "a" }, { id: "b", number: "1", name: "b" }, { id: "c", number: "3", name: "c" }],
  S.makeSeats([3]), [], [{ studentIds: ["a", "b"], seatIds: ["r0c0", "r0c1", "r0c2"] }], rng(1), { numberOrder: "left" }
);
check("余った席も番号順に入る", spareOrder.assignment.r0c0 === "b" && spareOrder.assignment.r0c1 === "a" && spareOrder.assignment.r0c2 === "c");
const spareWarn = S.warningsFor(poolStudents, poolSeats, [], poolGroup);
check("余った席の注意", spareWarn.some((line) => line.indexOf("余った席は残りの抽選に入ります") >= 0));
const evenWarn = S.warningsFor(students, seats, [], groups);
check("席が同じなら余りの注意はない", evenWarn.every((line) => line.indexOf("余った席") < 0));
const mixPeople = ["a", "b", "c", "d"].map((id, i) => ({ id, number: String(i + 1), name: "名" + id, gender: i % 2 === 0 ? "男" : "女" }));
const mixGroup = [{ studentIds: ["a"], seatIds: ["r0c0", "r0c1"] }];
const mixSeen = { r0c0: 0, r0c1: 0 };
let mixBad = 0;
for (let n = 0; n < 40; n += 1) {
  const drawn = S.draw(mixPeople, S.makeSeats([2, 2]), [], mixGroup, rng(n + 11), { avoidOpposite: true, neighbors: S.seatNeighbors([2, 2]) });
  const seatOf = {};
  Object.keys(drawn.assignment).forEach((key) => { seatOf[drawn.assignment[key]] = key; });
  if (!drawn.ok || drawn.unseated.length || Object.keys(drawn.assignment).length !== 4) mixBad += 1;
  if (seatOf.a !== "r0c0" && seatOf.a !== "r0c1") mixBad += 1;
  const leftover = seatOf.a === "r0c0" ? "r0c1" : "r0c0";
  if (!drawn.assignment[leftover] || drawn.assignment[leftover] === "a") mixBad += 1;
  if (drawn.assignment[leftover]) mixSeen[leftover] += 1;
}
check("余った席は性別の入れ替えにも残る", mixBad === 0 && mixSeen.r0c0 > 0 && mixSeen.r0c1 > 0);
const ortho = S.seatNeighbors([2, 2]);
const diag = S.seatNeighbors([2, 2], { diagonal: true });
check("斜めは八方", ortho.r0c0.indexOf("r1c1") < 0 && diag.r0c0.indexOf("r1c1") >= 0 && diag.r0c0.indexOf("r0c1") >= 0 && diag.r0c0.indexOf("r1c0") >= 0);
const holeDiag = S.seatNeighbors([3, 3], { gaps: ["r0c1"], diagonal: true });
check("抜いた席は斜めを飛ばさない", holeDiag.r0c0.indexOf("r0c2") < 0 && holeDiag.r0c0.indexOf("r1c1") >= 0 && (holeDiag.r1c1 || []).indexOf("r0c1") < 0);
const aisleDiag = S.seatNeighbors([4, 4], { aisle: true, diagonal: true });
check("通路の斜め先は隣にならない", aisleDiag.r0c1.indexOf("r1c2") < 0 && aisleDiag.r0c1.indexOf("r1c1") >= 0);
const apartPeople = [];
for (let i = 0; i < 16; i += 1) apartPeople.push({ id: "p" + i, number: String(i + 1), name: "人" + i });
const apartAround = S.seatNeighbors([4, 4], { diagonal: true });
let apartBad = 0;
for (let n = 0; n < 20; n += 1) {
  const drawn = S.draw(apartPeople, S.makeSeats([4, 4]), [], [], rng(n + 1), { separate: ["p0", "p1"], around: apartAround });
  if (!drawn.ok || drawn.separateLeft !== 0 || S.countSeparate(drawn.assignment, apartAround, ["p0", "p1"]) !== 0) apartBad += 1;
}
check("指定の二人は斜めも離れる", apartBad === 0);
const apartPin = S.draw(apartPeople, S.makeSeats([4, 4]), [{ studentId: "p0", seatId: "r0c0" }], [], rng(4), { separate: ["p0", "p1"], around: apartAround });
check("固定の周りに指定の人は来ない", apartPin.ok && apartPin.assignment.r0c0 === "p0" && apartPin.separateLeft === 0);
const tightPeople = ["a", "b", "c", "d"].map((id, i) => ({ id, number: String(i + 1), name: id }));
const tightAround = S.seatNeighbors([2, 2], { diagonal: true });
const tight = S.draw(tightPeople, S.makeSeats([2, 2]), [], [], rng(1), { separate: ["a", "b"], around: tightAround });
check("離れられないときは席を決める", tight.ok && tight.separateLeft === 1 && Object.keys(tight.assignment).length === 4);
const orderedApart = S.draw(tightPeople, S.makeSeats([2, 2]), [], [], rng(1), { numberOrder: "left", separate: ["a", "b"], around: tightAround });
check("番号順は離す指定より優先", orderedApart.assignment.r0c0 === "a" && orderedApart.assignment.r1c0 === "b" && orderedApart.separateLeft === 1);
const bothPeople = [];
for (let i = 0; i < 16; i += 1) bothPeople.push({ id: "b" + i, number: String(i + 1), name: "名" + i, gender: i % 2 ? "女" : "男" });
const bothNeighbors = S.seatNeighbors([4, 4]);
const bothAround = S.seatNeighbors([4, 4], { diagonal: true });
let bothBad = 0;
for (let n = 0; n < 8; n += 1) {
  const drawn = S.draw(bothPeople, S.makeSeats([4, 4]), [], [], rng(40 + n), {
    avoidOpposite: true, neighbors: bothNeighbors, separate: ["b0", "b1"], around: bothAround
  });
  if (!drawn.ok || drawn.separateLeft !== 0 || drawn.oppositeLeft !== 0) bothBad += 1;
}
check("異性避けと二人を離す", bothBad === 0);
const boxPeople = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, number: String(i + 1), name: id }));
const boxGroup = [{ studentIds: ["a", "b"], seatIds: ["r0c0", "r0c1", "r1c0", "r1c1"] }];
const boxAround = S.seatNeighbors([3, 3], { diagonal: true });
const boxed = S.draw(boxPeople, S.makeSeats([3, 3]), [], boxGroup, rng(2), { separate: ["a", "b"], around: boxAround });
const boxSeat = {};
Object.keys(boxed.assignment || {}).forEach((seat) => { boxSeat[boxed.assignment[seat]] = seat; });
const boxZone = ["r0c0", "r0c1", "r1c0", "r1c1"];
check("組の中で離れられなくても席は決まる", boxed.ok && boxed.separateLeft === 1 && boxZone.indexOf(boxSeat.a) >= 0 && boxZone.indexOf(boxSeat.b) >= 0);

const matrix = [["クラス名簿"], ["出席番号", "ふりがな", "氏名"], [1, "あおば", "青葉 湊"], [2, "いぶき", "伊吹 早苗"]];
const guess = S.guessMapping(matrix);
check("見出しとふりがなを外す", guess.headerRow === 1 && guess.numberCol === 0 && guess.nameCol === 2 && guess.genderCol === -1);
const extracted = S.extractPeople(matrix, guess.headerRow, guess.numberCol, guess.nameCol);
check("名前だけ抜く", extracted.people.map((p) => p.name).join() === "青葉 湊,伊吹 早苗");
check("性別の列がなければ空", extracted.people.every((p) => p.gender === ""));
const gendered = [["出席番号", "ふりがな", "氏名", "性別"], [1, "あおば", "青葉 湊", "女性"], [2, "いぶき", "伊吹 早苗", "男"]];
const gmap = S.guessMapping(gendered);
check("性別の列を見つける", gmap.numberCol === 0 && gmap.nameCol === 2 && gmap.genderCol === 3);
const gpeople = S.extractPeople(gendered, gmap.headerRow, gmap.numberCol, gmap.nameCol, gmap.genderCol);
check("性別を男と女にする", gpeople.people.map((p) => p.gender).join() === "女,男");
check("わからない性別は空", S.cleanGender("その他") === "" && S.cleanGender("男性") === "男");

const rowNeighbors = S.seatNeighbors([4], { aisle: true });
check("通路で隣が切れる", rowNeighbors.r0c0.indexOf("r0c1") >= 0 && rowNeighbors.r0c1.indexOf("r0c2") < 0 && rowNeighbors.r0c2.indexOf("r0c3") >= 0);
const colNeighbors = S.seatNeighbors(S.columnSeats([2, 1]).rows, { columns: [2, 1] });
check("空いた列のうしろは隣にならない", colNeighbors.r0c0.indexOf("r1c0") >= 0 && colNeighbors.r0c1.indexOf("r1c0") < 0 && (colNeighbors.r0c1 || []).indexOf("r1c1") < 0);

function surrounded(assignment, neighbors, people) {
  const genders = {};
  people.forEach((person) => { genders[person.id] = person.gender; });
  return Object.keys(assignment).filter((seatId) => {
    const gender = genders[assignment[seatId]];
    if (gender !== "男" && gender !== "女") return false;
    const around = (neighbors[seatId] || []).map((id) => genders[assignment[id]]).filter((value) => value === "男" || value === "女");
    const same = around.filter((value) => value === gender).length;
    return around.length - same > 0 && same === 0;
  }).length;
}
const quad = ["a", "b", "c", "d"].map((id, i) => ({ id, number: String(i + 1), name: "名" + id, gender: i < 2 ? "男" : "女" }));
const quadNeighbors = S.seatNeighbors([2, 2]);
let quadBad = 0;
for (let n = 0; n < 20; n += 1) {
  const drawn = S.draw(quad, S.makeSeats([2, 2]), [], [], rng(n + 3), { avoidOpposite: true, neighbors: quadNeighbors });
  if (!drawn.ok || drawn.oppositeLeft !== 0 || surrounded(drawn.assignment, quadNeighbors, quad) !== 0) quadBad += 1;
}
check("周りが異性だけにならない", quadBad === 0);
const lonely = [
  { id: "a", number: "1", name: "男", gender: "男" },
  { id: "b", number: "2", name: "女1", gender: "女" },
  { id: "c", number: "3", name: "女2", gender: "女" },
  { id: "d", number: "4", name: "女3", gender: "女" }
];
const hard = S.draw(lonely, S.makeSeats([2, 2]), [], [], rng(9), { avoidOpposite: true, neighbors: quadNeighbors });
check("避けきれなくても席は決まる", hard.ok && hard.oppositeLeft >= 1 && surrounded(hard.assignment, quadNeighbors, lonely) === hard.oppositeLeft);
const room = [];
for (let i = 0; i < 24; i += 1) room.push({ id: "p" + i, number: String(i + 1), name: "人" + i, gender: i < 12 ? "男" : "女" });
const roomNeighbors = S.seatNeighbors([6, 6, 6, 6]);
let roomBad = 0;
for (let n = 0; n < 8; n += 1) {
  const drawn = S.draw(room, S.makeSeats([6, 6, 6, 6]), [{ studentId: "p0", seatId: "r0c0" }], [], rng(200 + n), { avoidOpposite: true, neighbors: roomNeighbors });
  if (!drawn.ok || drawn.assignment.r0c0 !== "p0" || drawn.oppositeLeft !== 0) roomBad += 1;
}
check("24人でも固定を守って避ける", roomBad === 0);
const numbered = [
  { id: "a", number: "2", name: "a" },
  { id: "b", number: "１０", name: "b" },
  { id: "c", number: "1", name: "c" },
  { id: "d", number: "3", name: "d" }
];
const fromLeft = S.draw(numbered, S.makeSeats([2, 2]), [], [], rng(1), { numberOrder: "left" });
check("左の列から番号順", fromLeft.assignment.r0c0 === "c" && fromLeft.assignment.r1c0 === "a" && fromLeft.assignment.r0c1 === "d" && fromLeft.assignment.r1c1 === "b");
const fromRight = S.draw(numbered, S.makeSeats([2, 2]), [], [], rng(1), { numberOrder: "right" });
check("右の列から番号順", fromRight.assignment.r0c1 === "c" && fromRight.assignment.r1c1 === "a" && fromRight.assignment.r0c0 === "d" && fromRight.assignment.r1c0 === "b");
const numberedPin = S.draw(numbered, S.makeSeats([2, 2]), [{ studentId: "a", seatId: "r0c0" }], [], rng(1), { numberOrder: "left" });
check("番号順でも固定を守る", numberedPin.assignment.r0c0 === "a" && numberedPin.assignment.r1c0 === "c" && numberedPin.assignment.r0c1 === "d" && numberedPin.assignment.r1c1 === "b");
const few = [
  { id: "c", number: "1", name: "c" },
  { id: "a", number: "2", name: "a" },
  { id: "d", number: "3", name: "d" }
];
const frontFirst = S.draw(few, S.makeSeats([2, 2]), [], [], rng(1), { numberOrder: "left" });
check("余った席は最後の列のうしろ", frontFirst.assignment.r0c0 === "c" && frontFirst.assignment.r1c0 === "a" && frontFirst.assignment.r0c1 === "d" && !frontFirst.assignment.r1c1);
const colBuilt = S.columnSeats([2, 1]);
const fromColRight = S.draw(
  [{ id: "a", number: "1", name: "a" }, { id: "b", number: "2", name: "b" }, { id: "c", number: "3", name: "c" }],
  S.makeSeats(colBuilt.rows, colBuilt.columns), [], [], rng(1), { numberOrder: "right" }
);
check("右はじは列の右から", fromColRight.assignment.r0c1 === "a" && fromColRight.assignment.r0c0 === "b" && fromColRight.assignment.r1c0 === "c");
const grouped = S.draw(
  [{ id: "a", number: "5", name: "a" }, { id: "b", number: "1", name: "b" }, { id: "c", number: "3", name: "c" }, { id: "d", number: "2", name: "d" }],
  S.makeSeats([2, 2]), [], [{ studentIds: ["a", "b"], seatIds: ["r1c0", "r1c1"] }], rng(4), { numberOrder: "left" }
);
check("限定抽選の中も番号順", grouped.assignment.r1c0 === "b" && grouped.assignment.r1c1 === "a" && grouped.assignment.r0c0 === "d" && grouped.assignment.r0c1 === "c");
const blankFirst = S.draw(
  [{ id: "a", number: "", name: "後" }, { id: "b", number: "1", name: "先" }],
  S.makeSeats([2]), [], [], rng(1), { numberOrder: "left" }
);
check("番号のない人はうしろ", blankFirst.assignment.r0c0 === "b" && blankFirst.assignment.r0c1 === "a");
const priority = S.draw(
  [
    { id: "a", number: "1", name: "a", gender: "男" },
    { id: "b", number: "2", name: "b", gender: "女" },
    { id: "c", number: "3", name: "c", gender: "男" },
    { id: "d", number: "4", name: "d", gender: "女" }
  ],
  S.makeSeats([2, 2]), [], [], rng(3),
  { numberOrder: "left", avoidOpposite: true, neighbors: S.seatNeighbors([2, 2]) }
);
check("番号順は性別指定より優先", priority.assignment.r0c0 === "a" && priority.assignment.r1c0 === "b" && priority.assignment.r0c1 === "c" && priority.assignment.r1c1 === "d");
const middleGap = S.buildChartGrid([4], { gaps: ["r0c1"] });
check("途中の席を抜いても列は動かない", middleGap.lines[0].cells.map((cell) => cell.type).join() === "seat,gap,seat,seat" && middleGap.lines[0].cells[2].col === 2);
const frontGap = S.buildChartGrid([2, 2], { gaps: ["r0c0"] });
check("前の席を抜ける", frontGap.lines[0].cells[0].type === "gap" && frontGap.lines[0].cells[1].type === "seat" && frontGap.lines[1].cells[0].type === "seat");
const gapNeighbors = S.seatNeighbors([4], { gaps: ["r0c1"] });
check("抜いた席の向こうは隣にならない", gapNeighbors.r0c0.indexOf("r0c2") < 0 && !gapNeighbors.r0c1);
const skipped = S.draw(
  [{ id: "a", number: "1", name: "a" }, { id: "b", number: "2", name: "b" }, { id: "c", number: "3", name: "c" }],
  S.makeSeats([2, 2]).filter((seat) => seat.id !== "r0c0"),
  [], [], rng(1), { numberOrder: "left" }
);
check("抜いた前の席を飛ばして番号順", skipped.assignment.r1c0 === "a" && skipped.assignment.r0c1 === "b" && skipped.assignment.r1c1 === "c" && !skipped.assignment.r0c0);
const downColumns = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, number: String(i + 1), name: id }));
const downLeft = S.draw(downColumns, S.makeSeats([3, 3]), [], [], rng(1), { numberOrder: "left" });
check("列を前からうしろへ埋める", downLeft.assignment.r0c0 === "a" && downLeft.assignment.r1c0 === "b" && downLeft.assignment.r0c1 === "c" && downLeft.assignment.r1c1 === "d" && downLeft.assignment.r0c2 === "e" && downLeft.assignment.r1c2 === "f");
const holeFile = X.posterFile({
  caption: "抜き",
  header: "抜き",
  grid: S.buildChartGrid([3], { gaps: ["r0c1"] }),
  resolve: function (row, col) { return { number: String(col + 1), name: "人", kind: "open" }; }
});
const holeXml = sheetXmlOf(holeFile, "xl/worksheets/sheet1.xml");
check("抜いた席はExcelに出さない", holeXml.indexOf('r="B3"') >= 0 && holeXml.indexOf('r="F3"') >= 0 && holeXml.indexOf('r="D3"') < 0 && holeXml.indexOf("×") < 0 && holeXml.indexOf('showGridLines="0"') >= 0);
check("式として始まる文字を避ける", S.excelSafe("=1+1") === "'=1+1" && S.excelSafe("青葉") === "青葉");

execFileSync("python3", ["-c", "open('/tmp/sekigae-sjis.csv','w',encoding='cp932').write('出席番号,氏名\\n1,青葉 湊\\n')"]);
const sjis = S.decodeTableText(fs.readFileSync("/tmp/sekigae-sjis.csv"));
check("Shift_JIS", sjis.indexOf("青葉 湊") >= 0);

function resolve(row, col) {
  if (row === 0 && col === 0) return { number: "1", name: "=1+1", kind: "open" };
  if (row === 0 && col === 1) return { number: "2", name: "右", kind: "pin" };
  return null;
}
const poster = X.posterFile({
  caption: "掲示用",
  header: "掲示用",
  grid: S.buildChartGrid([2, 4], {}),
  resolve
});
fs.writeFileSync("/tmp/sekigae-poster.xlsx", poster);
execFileSync("python3", ["-c", "import zipfile; zipfile.ZipFile('/tmp/sekigae-poster.xlsx').testzip()"]);
const book = XLSX.read(poster, { type: "array" });
const sheet = book.Sheets[book.SheetNames[0]];
check("黒板が結合の起点", sheet.B2 && sheet.B2.v === "黒板");
const boardMerge = (sheet["!merges"] || []).some((m) => m.s.c === 1 && m.s.r === 1 && m.e.c === 7);
check("黒板は席の幅いっぱい", boardMerge);
check("短い列の人は中央列", sheet.D3 && String(sheet.D3.v).indexOf("=1+1") >= 0);
check("名前は計算されない", sheet.D3.t !== "n");
const teacher = X.teacherFile({
  caption: "教員用",
  header: "教員用",
  grid: S.buildChartGrid([2], { mirror: true }),
  resolve,
  list: [{ rowLabel: "1", fromLeft: "1", fromTeacher: "2", number: "1", name: "=1+1", gender: "女", how: "ランダム" }]
});
const teacherBook = XLSX.read(teacher, { type: "array" });
check("教員用は配置と一覧", teacherBook.SheetNames.join() === "配置,一覧");
check("教員用は左が生徒の右", teacherBook.Sheets["配置"].B3 && String(teacherBook.Sheets["配置"].B3.v).indexOf("右") >= 0);

function sheetXmlOf(bytes, name) {
  fs.writeFileSync("/tmp/sekigae-page.xlsx", Buffer.from(bytes));
  return execFileSync("python3", ["-c", "import zipfile; print(zipfile.ZipFile('/tmp/sekigae-page.xlsx').read('" + name + "').decode())"], { encoding: "utf8" });
}
function colWidths(xmlText) {
  return Array.from(xmlText.matchAll(/<col [^>]*width="([\d.]+)"/g)).map(function (match) { return Number(match[1]); });
}
const posterXml = sheetXmlOf(poster, "xl/worksheets/sheet1.xml");
const posterWidths = colWidths(posterXml);
const wideXml = sheetXmlOf(X.posterFile({
  caption: "広",
  header: "広",
  grid: S.buildChartGrid([12], {}),
  resolve
}), "xl/worksheets/sheet1.xml");
const wideWidths = colWidths(wideXml);
const posterSum = posterWidths.reduce(function (sum, n) { return sum + n; }, 0);
check("掲示用はA4横1枚", posterXml.indexOf('paperSize="9"') >= 0 && posterXml.indexOf('orientation="landscape"') >= 0 && posterXml.indexOf('fitToWidth="1"') >= 0 && posterXml.indexOf('fitToHeight="1"') >= 0 && posterXml.indexOf('fitToPage="1"') >= 0);
check("席が多いと列が狭くなる", wideWidths.length === 24 && posterWidths.length === 8 && wideWidths[1] < posterWidths[1]);
check("掲示用の幅がA4に近い", posterSum > 90 && posterSum < 145 && Math.abs(posterSum - colWidths(wideXml).reduce(function (sum, n) { return sum + n; }, 0)) < 8);
fs.writeFileSync("/tmp/sekigae-page.xlsx", Buffer.from(teacher));
const teacherSheet = sheetXmlOf(teacher, "xl/worksheets/sheet1.xml");
const listSheet = sheetXmlOf(teacher, "xl/worksheets/sheet2.xml");
const workbookXml = sheetXmlOf(teacher, "xl/workbook.xml");
check("配置はA4横1枚", teacherSheet.indexOf('orientation="landscape"') >= 0 && teacherSheet.indexOf('fitToHeight="1"') >= 0);
check("一覧はA4縦", listSheet.indexOf('paperSize="9"') >= 0 && listSheet.indexOf('orientation="portrait"') >= 0 && listSheet.indexOf('fitToWidth="1"') >= 0 && listSheet.indexOf('fitToHeight="0"') >= 0);
check("一覧の見出しを繰り返す", workbookXml.indexOf("Print_Titles") >= 0 && workbookXml.indexOf("一覧") >= 0);
const numberAt = listSheet.indexOf(">番号<");
const nameAt = listSheet.indexOf(">名前<");
const genderAt = listSheet.indexOf(">性別<");
check("一覧は番号・名前・性別の順", numberAt >= 0 && numberAt < nameAt && nameAt < genderAt && listSheet.indexOf(">女<") > genderAt && listSheet.indexOf("A1:G") >= 0 && workbookXml.indexOf("$G$") >= 0);
const girlPoster = X.posterFile({
  caption: "網掛け",
  header: "網掛け",
  grid: S.buildChartGrid([2], {}),
  resolve: function (row, col) {
    if (col === 0) return { number: "1", name: "青葉", kind: "open", gender: "女" };
    return { number: "2", name: "伊吹", kind: "pin", gender: "女" };
  }
});
const girlXml = sheetXmlOf(girlPoster, "xl/worksheets/sheet1.xml");
const girlStyles = sheetXmlOf(girlPoster, "xl/styles.xml");
check("女子の席は網掛け", girlXml.indexOf('r="B3" t="inlineStr" s="10"') >= 0 && girlXml.indexOf('r="D3" t="inlineStr" s="11"') >= 0 && girlStyles.indexOf('patternType="lightDown"') >= 0);
const girlWidths = colWidths(girlXml);
const gapRow = posterXml.match(/<row r="4" ht="([\d.]+)"/);
const seatRow = posterXml.match(/<row r="3" ht="([\d.]+)"/);
check("席の間に余白がある", girlWidths.length === 4 && girlWidths[2] < girlWidths[1] && girlXml.indexOf('r="C3"') < 0 && gapRow && seatRow && Number(gapRow[1]) < Number(seatRow[1]));
check("出力の色は白黒とグレー", Array.from(girlStyles.matchAll(/rgb="FF([0-9A-F]{6})"/g)).every(function (match) {
  return match[1].slice(0, 2) === match[1].slice(2, 4) && match[1].slice(2, 4) === match[1].slice(4, 6);
}));
const boyXml = sheetXmlOf(X.posterFile({
  caption: "男",
  header: "男",
  grid: S.buildChartGrid([1], {}),
  resolve: function () { return { number: "1", name: "蓮", kind: "open", gender: "男" }; }
}), "xl/worksheets/sheet1.xml");
check("男子の席は網掛けしない", boyXml.indexOf('s="10"') < 0 && boyXml.indexOf('s="3"') >= 0);

const before = Object.keys(Object.prototype).length;
XLSX.read(fs.readFileSync("/tmp/sekigae-poster.xlsx"), { type: "array", cellFormula: false, cellHTML: false, bookVBA: false });
check("読み込みで原型を汚さない", Object.keys(Object.prototype).length === before);

const colNorm = S.normalizeLayout([2, 1], [2, 1]);
check("列指定はうしろの空きになる", colNorm.rows.join() === "2,2" && colNorm.gaps.join() === "r1c1" && colNorm.mapId("r1c0") === "r1c0" && colNorm.mapId("r0c1") === "r0c1");
const keptCol = S.normalizeLayout([4, 2], [1, 2, 2, 1]);
check("長い列の席番号は動かさない", keptCol.rows.join() === "4,4" && keptCol.gaps.slice().sort().join() === "r1c0,r1c3" && keptCol.mapId("r1c1") === "r1c1" && keptCol.mapId("r1c2") === "r1c2");
const rowNorm = S.normalizeLayout([4, 2], null);
check("短い行は両端の空きになる", rowNorm.rows.join() === "4,4" && rowNorm.gaps.slice().sort().join() === "r1c0,r1c3" && rowNorm.mapId("r1c0") === "r1c1" && rowNorm.mapId("r1c1") === "r1c2");
const evenNorm = S.normalizeLayout([6, 6, 6, 6], null);
check("揃った行列はそのまま", evenNorm.rows.join() === "6,6,6,6" && evenNorm.gaps.length === 0 && evenNorm.mapId("r2c3") === "r2c3");
const adopted = S.adoptLayout([4, 2], null, ["r1c0"]);
check("抜いた席は中央寄せのあとへ移す", adopted.rows.join() === "4,4" && adopted.gaps.slice().sort().join() === "r1c0,r1c1,r1c3" && adopted.mapId("r1c1") === "r1c2" && !adopted.seats.r1c1 && adopted.seats.r1c2 === 1);
const adoptedCol = S.adoptLayout([2, 1], [2, 1], ["r0c0"]);
check("列の抜いた席とうしろの空きを合わせる", adoptedCol.gaps.slice().sort().join() === "r0c0,r1c1" && adoptedCol.mapId("r1c0") === "r1c0" && adoptedCol.seats.r1c0 === 1);

if (failed) { console.error(failed + " failed"); process.exit(1); }
console.log("all passed");
