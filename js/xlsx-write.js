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

  function fontXml(size, color, bold) {
    return "<font>" + (bold ? "<b/>" : "") + '<sz val="' + size + '"/>' +
      (color ? '<color rgb="' + color + '"/>' : "") +
      '<name val="游ゴシック"/><charset val="128"/></font>';
  }

  function solidFill(rgb) {
    return '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/></patternFill></fill>';
  }

  function boxBorder(style, rgb) {
    return ["left", "right", "top", "bottom"].map(function (edge) {
      return "<" + edge + ' style="' + style + '"><color rgb="' + rgb + '"/></' + edge + ">";
    }).join("");
  }

  function cellXf(fontId, fillId, borderId, align, wrap, shrink) {
    return '<xf numFmtId="0" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0" applyFont="1"' +
      (fillId ? ' applyFill="1"' : "") + (borderId ? ' applyBorder="1"' : "") + ' applyAlignment="1">' +
      '<alignment horizontal="' + align + '" vertical="center"' + (wrap ? ' wrapText="1"' : "") + (shrink ? ' shrinkToFit="1"' : "") + "/></xf>";
  }

  function stylesXml(fonts) {
    fonts = fonts || {};
    var board = fonts.board || 26;
    var seat = fonts.seat || 14;
    var empty = fonts.empty || 12;
    var aisle = fonts.aisle || 11;
    var ink = "FF1A1A1A";
    var white = "FFFFFFFF";
    var gray = "FF8A8A8A";
    var line = "FFC8C8C8";
    var hair = "FFD4D4D4";
    var fills = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
      solidFill(ink),
      solidFill(white),
      solidFill("FFF3F3F3"),
      solidFill(white),
      solidFill("FFE6E6E6"),
      solidFill("FFF7F7F7"),
      solidFill(ink),
      '<fill><patternFill patternType="lightDown"><fgColor rgb="' + gray + '"/><bgColor rgb="' + white + '"/></patternFill></fill>',
      '<fill><patternFill patternType="lightDown"><fgColor rgb="' + gray + '"/><bgColor rgb="' + white + '"/></patternFill></fill>',
      '<fill><patternFill patternType="lightDown"><fgColor rgb="' + gray + '"/><bgColor rgb="FFE6E6E6"/></patternFill></fill>',
      solidFill("FFF4F4F4")
    ];
    var borders = [
      "<border><left/><right/><top/><bottom/></border>",
      "<border>" + boxBorder("thin", line) + "</border>",
      "<border>" + boxBorder("medium", ink) + "</border>",
      "<border>" + boxBorder("hair", hair) + "</border>"
    ];
    var xfs = [
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      cellXf(1, 0, 0, "center", false),
      cellXf(2, 2, 0, "center", false),
      cellXf(3, 3, 1, "center", true),
      cellXf(4, 4, 1, "center", false),
      cellXf(3, 5, 2, "center", true),
      cellXf(3, 6, 1, "center", true),
      cellXf(5, 7, 0, "center", false),
      cellXf(6, 8, 0, "center", false),
      cellXf(7, 3, 3, "center", false, true),
      cellXf(3, 9, 1, "center", true),
      cellXf(3, 10, 2, "center", true),
      cellXf(3, 11, 1, "center", true),
      cellXf(7, 12, 3, "center", false, true),
      cellXf(8, 0, 0, "center", false)
    ];
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="9">' +
      fontXml(11, ink, false) +
      fontXml(11, "FF5C5C5C", false) +
      fontXml(board, white, true) +
      fontXml(seat, ink, true) +
      fontXml(empty, gray, false) +
      fontXml(aisle, "FF6E6E6E", false) +
      fontXml(11, white, true) +
      fontXml(11, ink, false) +
      fontXml(16, ink, true) +
      "</fonts>" +
      '<fills count="' + fills.length + '">' + fills.join("") + "</fills>" +
      '<borders count="' + borders.length + '">' + borders.join("") + "</borders>" +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + xfs.length + '">' + xfs.join("") + "</cellXfs></styleSheet>"
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
      "<sheetPr>" + (model.tabColor ? '<tabColor rgb="' + model.tabColor + '"/>' : "") + '<pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:' + colLetter(Math.max(1, maxCol)) + Math.max(1, maxRow) + '"/>' +
      "<sheetViews><sheetView workbookViewId=\"0\"" + (model.showGridLines === false ? ' showGridLines="0"' : "") + (selected ? ' tabSelected="1"' : "") + ">" + pane + "</sheetView></sheetViews>" +
      '<sheetFormatPr defaultRowHeight="18"/>' +
      "<cols>" + cols + "</cols><sheetData>" + data + "</sheetData>" +
      filter + merges +
      '<printOptions horizontalCentered="1"' + (model.centerVertical ? ' verticalCentered="1"' : "") + "/>" +
      '<pageMargins left="0.4" right="0.4" top="0.4" bottom="0.4" header="0" footer="0"/>' +
      '<pageSetup paperSize="9" orientation="' + (model.orientation || "landscape") + '" fitToWidth="' + (model.fitWidth == null ? 1 : model.fitWidth) + '" fitToHeight="' + (model.fitHeight == null ? 1 : model.fitHeight) + '" pageOrder="downThenOver"/>' +
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

  function textUnits(text) {
    var units = 0;
    var i;
    var s = String(text || "");
    for (i = 0; i < s.length; i += 1) units += s.charCodeAt(i) <= 0x007f ? 0.55 : 1;
    return units;
  }

  function wrapUnits(text, unitsPerLine) {
    var s = String(text || "");
    if (!s) return "";
    var per = unitsPerLine > 1 ? unitsPerLine : 1;
    var lines = [];
    var line = "";
    var used = 0;
    var i;
    for (i = 0; i < s.length; i += 1) {
      var ch = s.charAt(i);
      var width = s.charCodeAt(i) <= 0x007f ? 0.55 : 1;
      if (line && used + width > per) {
        lines.push(line);
        line = ch;
        used = width;
      } else {
        line += ch;
        used += width;
      }
    }
    if (line) lines.push(line);
    return lines.join("\n");
  }

  function unitsPerLine(cellWpt, font) {
    return Math.max(1, (cellWpt - 14) / (font * 1.15));
  }

  function blockPt(number, name, font, per) {
    var numberLines = wrapUnits(number, per).split("\n").filter(Boolean).length;
    var nameLines = wrapUnits(name, per).split("\n").filter(Boolean).length;
    var lines = numberLines + nameLines;
    if (!lines) lines = 1;
    return lines * font * 1.5 + 10;
  }

  function chooseSeatFont(cellWpt, seatPt, entries) {
    var font;
    for (font = 16; font >= 6; font -= 1) {
      var per = unitsPerLine(cellWpt, font);
      var fits = entries.every(function (entry) { return blockPt(entry.number, entry.name, font, per) <= seatPt + 0.1; });
      if (fits) return font;
    }
    for (font = 12; font >= 6; font -= 1) {
      if (unitsPerLine(cellWpt, font) >= 3) return font;
    }
    return 6;
  }

  function seatText(info, per) {
    if (!info || !info.name) return { value: "空席", style: 4 };
    var number = info.number ? wrapUnits(String(info.number), per) : "";
    var name = wrapUnits(String(info.name), per);
    var girl = info.gender === "女";
    var style = info.kind === "pin" ? (girl ? 11 : 5) : info.kind === "group" ? (girl ? 12 : 6) : (girl ? 10 : 3);
    return { value: number ? number + "\n" + name : name, style: style };
  }

  function inchesToWch(inches) {
    var pixels = Math.max(16, inches * 96);
    return Math.round(((pixels - 5) / 8) * 10) / 10;
  }

  function chartMetrics(slotCount, lineCount, withCaption) {
    var printableW = 297 / 25.4 - 0.8;
    var printableH = (210 / 25.4 - 0.85) * 72;
    var slack = 0.96;
    var gaps = Math.max(0, slotCount - 1);
    var gapIn = gaps ? 0.16 : 0;
    var labelIn = Math.min(0.95, Math.max(0.7, printableW * 0.09));
    var seatIn = (printableW - labelIn - gapIn * gaps) / Math.max(1, slotCount);
    var target = inchesToWch(printableW * slack);
    var labelWch = inchesToWch(labelIn * slack);
    var gapWch = gaps ? Math.round(((gapIn * 96 - 5) / 8) * 10) / 10 : 0;
    if (gapWch < 0.8) gapWch = 0.8;
    var seatWch = Math.round(((target - labelWch - gapWch * gaps) / Math.max(1, slotCount)) * 10) / 10;
    if (seatWch < 3) seatWch = 3;
    var captionPt = withCaption ? 26 : 0;
    var backPt = 16;
    var gapPt = 10;
    var boardPt = Math.max(28, Math.min(44, Math.round(printableH * 0.11)));
    var between = Math.max(0, lineCount - 1) * gapPt;
    var natural = (printableH * slack - captionPt - boardPt - backPt - between) / Math.max(1, lineCount);
    var seatPt = Math.max(26, Math.min(72, Math.round(natural)));
    var cellWpt = (seatWch * 8 + 5) / 96 * 72;
    var byName = Math.floor((cellWpt - 14) / 4.6);
    var byHeight = Math.floor((seatPt - 10) / 3);
    var seatFont = Math.max(8, Math.min(16, byName, byHeight));
    return {
      labelWch: labelWch,
      seatWch: seatWch,
      gapWch: gaps ? gapWch : 0,
      cellWpt: cellWpt,
      captionPt: captionPt,
      boardPt: boardPt,
      seatPt: seatPt,
      gapPt: gapPt,
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
    var caption = options.caption ? String(options.caption) : "";
    var metrics = chartMetrics(maxSlots, grid.lines.length, !!caption);
    var entries = [];
    grid.lines.forEach(function (line) {
      line.cells.forEach(function (cell) {
        if (cell.type !== "seat") return;
        var info = options.resolve(line.row, cell.col);
        entries.push({
          number: info && info.number ? String(info.number) : "",
          name: info && info.name ? String(info.name) : "空席",
        });
      });
    });
    var seatFont = chooseSeatFont(metrics.cellWpt, metrics.seatPt, entries);
    metrics.fonts.seat = seatFont;
    metrics.fonts.empty = Math.max(6, seatFont - 1);
    metrics.fonts.aisle = Math.max(6, Math.min(12, seatFont));
    var per = unitsPerLine(metrics.cellWpt, seatFont);
    var cols = [{ wch: metrics.labelWch }];
    var c;
    for (c = 0; c < maxSlots; c += 1) {
      cols.push({ wch: metrics.seatWch });
      if (c < maxSlots - 1) cols.push({ wch: metrics.gapWch });
    }
    var rows = [];
    if (caption) rows.push({ hpt: metrics.captionPt, cells: [{ col: 1, value: caption, style: 14 }] });
    var boardRow = rows.length + 1;
    rows.push({ hpt: metrics.boardPt, cells: [{ col: 1, value: "前", style: 1 }, { col: 2, value: "黒板", style: 2 }] });
    grid.lines.forEach(function (line, lineIndex) {
      if (lineIndex > 0) rows.push({ hpt: metrics.gapPt, cells: [] });
      var cells = [{ col: 1, value: line.row + 1 + "行目", style: 1 }];
      var rowPt = metrics.seatPt;
      line.cells.forEach(function (cell, index) {
        var col = 2 + index * 2;
        if (cell.type === "pad" || cell.type === "gap") return;
        if (cell.type === "aisle") {
          cells.push({ col: col, value: "通路", style: 7 });
          return;
        }
        var info = options.resolve(line.row, cell.col);
        var text = seatText(info, per);
        var number = info && info.number ? String(info.number) : "";
        var name = info && info.name ? String(info.name) : "空席";
        var need = blockPt(number, name, seatFont, per);
        if (need > rowPt) rowPt = need;
        cells.push({ col: col, value: text.value, style: text.style });
      });
      rows.push({ hpt: Math.ceil(rowPt), cells: cells });
    });
    var backRow = rows.length + 1;
    rows.push({ hpt: metrics.backPt, cells: [{ col: 2, value: "うしろ", style: 1 }] });
    var lastCol = cols.length;
    var lastRow = rows.length;
    var merges = [];
    if (caption) merges.push({ r1: 1, c1: 1, r2: 1, c2: lastCol });
    merges.push({ r1: boardRow, c1: 2, r2: boardRow, c2: lastCol });
    merges.push({ r1: backRow, c1: 2, r2: backRow, c2: lastCol });
    return {
      cols: cols,
      rows: rows,
      merges: merges,
      freeze: false,
      autoFilter: null,
      orientation: "landscape",
      fitWidth: 1,
      fitHeight: 1,
      centerVertical: true,
      fonts: metrics.fonts,
      showGridLines: false,
      tabColor: "FF2A2A2A",
      printArea: "$A$1:$" + colLetter(lastCol) + "$" + lastRow,
    };
  }

  function listModel(list) {
    var header = ["行（前から）", "列（向かって左から）", "列（先生から左から）", "番号", "名前", "性別", "決まり方"];
    var weights = [12, 14, 16, 8, 32, 8, 12];
    var weightSum = 0;
    var w;
    for (w = 0; w < weights.length; w += 1) weightSum += weights[w];
    var totalWch = inchesToWch((210 / 25.4 - 0.8) * 0.96);
    var rows = [{
      hpt: 24,
      cells: header.map(function (value, index) { return { col: index + 1, value: value, style: 8 }; }),
    }];
    list.forEach(function (item, index) {
      var values = [item.rowLabel, item.fromLeft, item.fromTeacher, item.number, item.name, item.gender, item.how];
      var style = index % 2 ? 13 : 9;
      rows.push({
        hpt: 20,
        cells: values.map(function (value, colIndex) { return { col: colIndex + 1, value: value == null ? "" : String(value), style: style }; }),
      });
    });
    return {
      cols: weights.map(function (weight) { return { wch: Math.round(totalWch * weight / weightSum * 10) / 10 }; }),
      rows: rows,
      merges: [],
      freeze: true,
      autoFilter: "A1:G" + Math.max(1, rows.length),
      orientation: "portrait",
      fitWidth: 1,
      fitHeight: 0,
      centerVertical: false,
      printArea: "$A$1:$G$" + Math.max(1, rows.length),
      printTitle: "$1:$1",
      showGridLines: false,
      tabColor: "FF6A6A6A",
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
