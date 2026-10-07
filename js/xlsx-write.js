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

  function stylesXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="7">' +
      '<font><sz val="11"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FF241C16"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><b/><sz val="28"/><color rgb="FFF3F7EA"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><b/><sz val="18"/><color rgb="FF241C16"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><sz val="14"/><color rgb="FF6D6256"/><name val="游ゴシック"/><charset val="128"/></font>' +
      '<font><sz val="11"/><color rgb="FF415064"/><name val="游ゴシック"/><charset val="128"/></font>' +
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
      '<printOptions horizontalCentered="1"/>' +
      '<pageMargins left="0.4" right="0.4" top="0.55" bottom="0.45" header="0.2" footer="0.2"/>' +
      '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="' + model.fitHeight + '"/>' +
      "<headerFooter><oddHeader>&amp;C" + xml(model.header) + "</oddHeader><oddFooter>&amp;C" + xml(model.footer) + "</oddFooter></headerFooter>" +
      "</worksheet>"
    );
  }

  function workbookBytes(sheets) {
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
      { name: "xl/workbook.xml", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names + "</sheets></workbook>") },
      { name: "xl/_rels/workbook.xml.rels", data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + "</Relationships>") },
      { name: "xl/styles.xml", data: utf8(stylesXml()) },
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

  function chartModel(options) {
    var grid = options.grid;
    var maxSlots = grid.maxSlots || 1;
    var cols = [{ wch: 12 }];
    var c;
    for (c = 0; c < maxSlots; c += 1) cols.push({ wch: 16 });
    var rows = [
      { hpt: 24, cells: [{ col: 1, value: options.caption, style: 1 }] },
      { hpt: 58, cells: [{ col: 1, value: "前", style: 1 }, { col: 2, value: "黒板", style: 2 }] },
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
      rows.push({ hpt: 72, cells: cells });
    });
    rows.push({ hpt: 22, cells: [{ col: 2, value: "うしろ", style: 1 }] });
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
      fitHeight: 1,
    };
  }

  function listModel(list) {
    var header = ["行（前から）", "列（向かって左から）", "列（先生から左から）", "出席番号", "氏名", "決まり方"];
    var rows = [{
      hpt: 22,
      cells: header.map(function (value, index) { return { col: index + 1, value: value, style: 8 }; }),
    }];
    list.forEach(function (item) {
      var values = [item.rowLabel, item.fromLeft, item.fromTeacher, item.number, item.name, item.how];
      rows.push({
        hpt: 20,
        cells: values.map(function (value, index) { return { col: index + 1, value: value == null ? "" : String(value), style: 9 }; }),
      });
    });
    return {
      cols: [16, 16, 18, 14, 22, 24].map(function (wch) { return { wch: wch }; }),
      rows: rows,
      merges: [],
      freeze: true,
      autoFilter: "A1:F" + Math.max(1, rows.length),
      header: "教員用の一覧",
      footer: "名簿はこの端末の中だけで作っています",
      fitHeight: 0,
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
