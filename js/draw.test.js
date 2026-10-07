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

const matrix = [["クラス名簿"], ["出席番号", "ふりがな", "氏名"], [1, "あおば", "青葉 湊"], [2, "いぶき", "伊吹 早苗"]];
const guess = S.guessMapping(matrix);
check("見出しとふりがなを外す", guess.headerRow === 1 && guess.numberCol === 0 && guess.nameCol === 2);
const extracted = S.extractPeople(matrix, guess.headerRow, guess.numberCol, guess.nameCol);
check("名前だけ抜く", extracted.people.map((p) => p.name).join() === "青葉 湊,伊吹 早苗");
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
const boardMerge = (sheet["!merges"] || []).some((m) => m.s.c === 1 && m.s.r === 1 && m.e.c === 4);
check("黒板は席の幅いっぱい", boardMerge);
check("短い列の人は中央列", sheet.C3 && String(sheet.C3.v).indexOf("=1+1") >= 0);
check("名前は計算されない", sheet.C3.t !== "n");
const teacher = X.teacherFile({
  caption: "教員用",
  header: "教員用",
  grid: S.buildChartGrid([2], { mirror: true }),
  resolve,
  list: [{ rowLabel: "1", fromLeft: "1", fromTeacher: "2", number: "1", name: "=1+1", how: "ランダム" }]
});
const teacherBook = XLSX.read(teacher, { type: "array" });
check("教員用は配置と一覧", teacherBook.SheetNames.join() === "配置,一覧");
check("教員用は左が生徒の右", teacherBook.Sheets["配置"].B3 && String(teacherBook.Sheets["配置"].B3.v).indexOf("右") >= 0);

const before = Object.keys(Object.prototype).length;
XLSX.read(fs.readFileSync("/tmp/sekigae-poster.xlsx"), { type: "array", cellFormula: false, cellHTML: false, bookVBA: false });
check("読み込みで原型を汚さない", Object.keys(Object.prototype).length === before);

if (failed) { console.error(failed + " failed"); process.exit(1); }
console.log("all passed");
