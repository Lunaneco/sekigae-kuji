/* 掲示用・教員用のExcelを、数式ではなく文字列セルだけで書く。 */
(function (root) {
  "use strict";

  function utf8(text) {
    return new TextEncoder().encode(text);
  }

  function concat(parts) {
    var len = 0;
    var i;
    for (i = 0; i < parts.length; i += 1) len += parts[i].length;
    var out = new Uint8Array(len);
    var offset = 0;
    for (i = 0; i < parts.length; i += 1) {
      out.set(parts[i], offset);
      offset += parts[i].length;
    }
    return out;
  }

  function num(value, size) {
    var bytes = new Uint8Array(size);
    var view = new DataView(bytes.buffer);
    if (size === 2) view.setUint16(0, value, true);
    else view.setUint32(0, value >>> 0, true);
    return bytes;
  }

  function crc32(bytes) {
    if (!crc32.table) {
      var table = new Uint32Array(256);
      var n;
      var k;
      for (n = 0; n < 256; n += 1) {
        var c = n;
        for (k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
      }
      crc32.table = table;
    }
    var crc = 0xffffffff;
    for (n = 0; n < bytes.length; n += 1) crc = crc32.table[(crc ^ bytes[n]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    var locals = [];
    var centrals = [];
    var offset = 0;
    var i;
    for (i = 0; i < files.length; i += 1) {
      var name = utf8(files[i].name);
      var data = files[i].data;
      var crc = crc32(data);
      var local = concat([
        num(0x04034b50, 4), num(20, 2), num(0x800, 2), num(0, 2), num(0, 2), num(0, 2),
        num(crc, 4), num(data.length, 4), num(data.length, 4), num(name.length, 2), num(0, 2),
        name, data,
      ]);
      locals.push(local);
      centrals.push(concat([
        num(0x02014b50, 4), num(20, 2), num(20, 2), num(0x800, 2), num(0, 2), num(0, 2), num(0, 2),
        num(crc, 4), num(data.length, 4), num(data.length, 4), num(name.length, 2), num(0, 2),
        num(0, 2), num(0, 2), num(0, 2), num(0, 4), num(offset, 4), name,
      ]));
      offset += local.length;
    }
    var central = concat(centrals);
    var eocd = concat([
      num(0x06054b50, 4), num(0, 2), num(0, 2), num(files.length, 2), num(files.length, 2),
      num(central.length, 4), num(offset, 4), num(0, 2),
    ]);
    return concat(locals.concat([central, eocd]));
  }

  function xml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function colLetter(index) {
    var n = index;
    var out = "";
    while (n > 0) {
      var m = (n - 1) % 26;
      out = String.fromCharCode(65 + m) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function stylesXml(fonts) {
    fonts = fonts || {};
    var board = fonts.board || 26;
    var seat = fonts.seat || 14;
    var empty = fonts.empty || 12;
    var aisle = fonts.aisle || 11;
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="7">' +
      '<font><sz val="11"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FF241C16"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><b/><sz val="' + board + '"/><color rgb="FFF3F7EA"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><b/><sz val="' + seat + '"/><color rgb="FF241C16"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><sz val="' + empty + '"/><color rgb="FF6D6256"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><sz val="' + aisle + '"/><color rgb="FF415064"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FFF6F0E4"/><name val="游ゴシック"/><charset val="128"/></font>' +
      "</fonts>" +
      '<fills count="9">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1B3A32"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFBF6EA"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE6E1D6"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF8E4E0"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF8E8C8"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD5DDE6"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF243044"/></patternFill></fill>' +
      "</fills>" +
      '<borders count="2"><border><left/><right/><top/><bottom/></border>' +
      '<border><left style="thin"><color rgb="FF2A241C"/></left><right style="thin"><color rgb="FF2A241C"/></right>' +
      '<top style="thin"><color rgb="FF2A241C"/></top><bottom style="thin"><color rgb="FF2A241C"/></bottom></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="10">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="5" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="6" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
      "</cellXfs></styleSheet>"
    );
  }

  function sheetXml(model, selected) {
    var maxRow = model.rows.length;
    var maxCol = model.cols.length;
    model.merges.forEach(function (merge) {
      if (merge.r2 > maxRow) maxRow = merge.r2;
      if (merge.c2 > maxCol) maxCol = merge.c2;
    });
    var cols = model.cols.map(function (col, index) {
      return '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + col.wch + '" customWidth="1"/>';
    }).join("");
    var data = model.rows.map(function (row, index) {
      var r = index + 1;
      var cells = row.cells.map(function (cell) {
        return '<c r="' + colLetter(cell.col) + r + '" t="inlineStr" s="' + cell.style + '"><is><t xml:space="preserve">' + xml(cell.value) + "</t></is></c>";
      }).join("");
      return '<row r="' + r + '" ht="' + row.hpt + '" customHeight="1">' + cells + "</row>";
    }).join("");
    var merges = "";
    if (model.merges.length) {
      merges = '<mergeCells count="' + model.merges.length + '">' + model.merges.map(function (merge) {
        return '<mergeCell ref="' + colLetter(merge.c1) + merge.r1 + ":" + colLetter(merge.c2) + merge.r2 + '"/>';
      }).join("") + "</mergeCells>";
    }
    var filter = model.autoFilter ? '<autoFilter ref="' + xml(model.autoFilter) + '"/>' : "";
    var pane = model.freeze
      ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
      : "";
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:' + colLetter(Math.max(1, maxCol)) + Math.max(1, maxRow) + '"/>' +
      "<sheetViews><sheetView workbookViewId=\"0\"" + (selected ? ' tabSelected="1"' : "") + ">" + pane + "</sheetView></sheetViews>" +
      '<sheetFormatPr defaultRowHeight="18"/>' +
      "<cols>" + cols + "</cols><sheetData>" + data + "</sheetData>" +
      filter + merges +
      '<printOptions horizontalCentered="1"' + (model.centerVertical ? ' verticalCentered="1"' : "") + "/>" +
      '<pageMargins left="0.4" right="0.4" top="0.45" bottom="0.4" header="0.2" footer="0.2"/>' +
      '<pageSetup paperSize="9" orientation="' + (model.orientation || "landscape") + '" fitToWidth="' + (model.fitWidth == null ? 1 : model.fitWidth) + '" fitToHeight="' + (model.fitHeight == null ? 1 : model.fitHeight) + '" pageOrder="downThenOver"/>' +
      "<headerFooter><oddHeader>&amp;C" + xml(model.header) + "</oddHeader><oddFooter>&amp;C" + xml(model.footer) + "</oddFooter></headerFooter>" +
      "</worksheet>"
    );
  }

  function definedNamesXml(sheets) {
    var names = [];
    sheets.forEach(function (sheet, index) {
      var model = sheet.model;
      var quoted = "'" + String(sheet.name).replace(/'/g, "''") + "'!";
      if (model.printArea) {
        names.push('<definedName name="_xlnm.Print_Area" localSheetId="' + index + '">' + xml(quoted + model.printArea) + "</definedName>");
      }
      if (model.printTitle) {
        names.push('<definedName name="_xlnm.Print_Titles" localSheetId="' + index + '">' + xml(quoted + model.printTitle) + "</definedName>");
      }
    });
    return names.length ? "<definedNames>" + names.join("") + "</definedNames>" : "";
  }

  function workbookBytes(sheets) {
    var fonts = null;
    sheets.forEach(function (sheet) { if (sheet.model.fonts) fonts = sheet.model.fonts; });
    var sheetXmls = sheets.map(function (sheet, index) { return sheetXml(sheet.model, index === 0); });
    var names = sheets.map(function (sheet, index) {
      return '<sheet name="' + xml(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>';
    }).join("");
    var overrides = sheetXmls.map(function (_, index) {
      return '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }).join("");
    var rels = sheetXmls.map(function (_, index) {
      return '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>';
    }).join("");
    var styleId = sheetXmls.length + 1;
    rels += '<Relationship Id="rId' + styleId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    var files = [
      { name: "[Content_Types].xml", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + overrides + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
      { name: "_rels/.rels", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: "xl/workbook.xml", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names + "</sheets>" + definedNamesXml(sheets) + "</workbook>") },
      { name: "xl/_rels/workbook.xml.rels", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + "</Relationships>") },
      { name: "xl/styles.xml", data: utf8(stylesXml(fonts)) },
    ];
    sheetXmls.forEach(function (body, index) {
      files.push({ name: "xl/worksheets/sheet" + (index + 1) + ".xml", data: utf8(body) });
    });
    return zipStore(files);
  }

  function seatText(info) {
    if (!info || !info.name) return { value: "空席", style: 4 };
    var number = info.number ? String(info.number) : "";
    var name = String(info.name);
    var style = info.kind === "pin" ? 5 : info.kind === "group" ? 6 : 3;
    return { value: number ? number + "\n" + name : name, style: style };
  }

  function inchesToWch(inches) {
    var pixels = Math.max(16, inches * 96);
    return Math.round(((pixels - 5) / 8) * 10) / 10;
  }

  function chartMetrics(slotCount, lineCount) {
    var printableW = 297 / 25.4 - 0.8;
    var printableH = (210 / 25.4 - 0.85) * 72;
    var labelIn = Math.min(1, Math.max(0.72, printableW * 0.1));
    var seatIn = (printableW - labelIn) / Math.max(1, slotCount);
    var slack = 0.96;
    var captionPt = 18;
    var backPt = 16;
    var boardPt = Math.max(28, Math.min(44, Math.round(printableH * 0.11)));
    var natural = (printableH * slack - captionPt - boardPt - backPt) / Math.max(1, lineCount);
    var seatPt = Math.max(26, Math.min(72, Math.round(natural)));
    var cellWpt = seatIn * slack * 72;
    var byWidth = Math.floor(cellWpt / 5.2);
    var byHeight = Math.floor((seatPt - 6) / 2.15);
    var seatFont = Math.max(8, Math.min(16, byWidth, byHeight));
    return {
      labelWch: inchesToWch(labelIn * slack),
      seatWch: inchesToWch(seatIn * slack),
      captionPt: captionPt,
      boardPt: boardPt,
      seatPt: seatPt,
      backPt: backPt,
      fonts: {
        board: Math.max(16, Math.min(28, Math.round((cellWpt * Math.max(1, slotCount)) / 16))),
        seat: seatFont,
        empty: Math.max(8, seatFont - 1),
        aisle: Math.max(8, Math.min(12, seatFont)),
      },
    };
  }

  function chartModel(options) {
    var grid = options.grid;
    var maxSlots = grid.maxSlots || 1;
    var metrics = chartMetrics(maxSlots, grid.lines.length);
    var cols = [{ wch: metrics.labelWch }];
    var c;
    for (c = 0; c < maxSlots; c += 1) cols.push({ wch: metrics.seatWch });
    var rows = [
      { hpt: metrics.captionPt, cells: [{ col: 1, value: options.caption, style: 1 }] },
      { hpt: metrics.boardPt, cells: [{ col: 1, value: "前", style: 1 }, { col: 2, value: "黒板", style: 2 }] },
    ];
    grid.lines.forEach(function (line) {
      var cells = [{ col: 1, value: line.row + 1 + "行目", style: 1 }];
      line.cells.forEach(function (cell, index) {
        var col = index + 2;
        if (cell.type === "pad") return;
        if (cell.type === "aisle") {
          cells.push({ col: col, value: "通路", style: 7 });
          return;
        }
        var text = seatText(options.resolve(line.row, cell.col));
        cells.push({ col: col, value: text.value, style: text.style });
      });
      rows.push({ hpt: metrics.seatPt, cells: cells });
    });
    rows.push({ hpt: metrics.backPt, cells: [{ col: 2, value: "うしろ", style: 1 }] });
    var lastCol = maxSlots + 1;
    var lastRow = rows.length;
    return {
      cols: cols,
      rows: rows,
      merges: [
        { r1: 1, c1: 1, r2: 1, c2: lastCol },
        { r1: 2, c1: 2, r2: 2, c2: lastCol },
        { r1: lastRow, c1: 2, r2: lastRow, c2: lastCol },
      ],
      freeze: false,
      autoFilter: null,
      header: options.header,
      footer: "名簿はこの端末の中だけで作っています",
      orientation: "landscape",
      fitWidth: 1,
      fitHeight: 1,
      centerVertical: true,
      fonts: metrics.fonts,
      printArea: "$A$1:$" + colLetter(lastCol) + "$" + lastRow,
    };
  }

  function listModel(list) {
    var header = ["行（前から）", "列（向かって左から）", "列（先生から左から）", "番号", "名前", "性別", "決まり方"];
    var weights = [14, 16, 18, 10, 20, 8, 16];
    var weightSum = 0;
    var w;
    for (w = 0; w < weights.length; w += 1) weightSum += weights[w];
    var totalWch = inchesToWch((210 / 25.4 - 0.8) * 0.96);
    var rows = [{
      hpt: 22,
      cells: header.map(function (value, index) { return { col: index + 1, value: value, style: 8 }; }),
    }];
    list.forEach(function (item) {
      var values = [item.rowLabel, item.fromLeft, item.fromTeacher, item.number, item.name, item.gender, item.how];
      rows.push({
        hpt: 18,
        cells: values.map(function (value, index) { return { col: index + 1, value: value == null ? "" : String(value), style: 9 }; }),
      });
    });
    return {
      cols: weights.map(function (weight) { return { wch: Math.round(totalWch * weight / weightSum * 10) / 10 }; }),
      rows: rows,
      merges: [],
      freeze: true,
      autoFilter: "A1:G" + Math.max(1, rows.length),
      header: "教員用の一覧",
      footer: "名簿はこの端末の中だけで作っています",
      orientation: "portrait",
      fitWidth: 1,
      fitHeight: 0,
      centerVertical: false,
      printArea: "$A$1:$G$" + Math.max(1, rows.length),
      printTitle: "$1:$1",
    };
  }

  function posterFile(options) {
    return workbookBytes([{ name: "掲示用", model: chartModel(options) }]);
  }

  function teacherFile(options) {
    return workbookBytes([
      { name: "配置", model: chartModel(options) },
      { name: "一覧", model: listModel(options.list || []) },
    ]);
  }

  root.SekigaeXlsx = { posterFile: posterFile, teacherFile: teacherFile };
})(typeof window !== "undefined" ? window : globalThis);
