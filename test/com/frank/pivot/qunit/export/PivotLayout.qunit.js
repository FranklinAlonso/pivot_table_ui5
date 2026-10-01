/*global QUnit */
sap.ui.define([
	"com/frank/pivot/engine/PivotEngine",
	"com/frank/pivot/export/PivotLayout",
	"com/frank/pivot/export/XlsxWriter"
], function (PivotEngine, PivotLayout, XlsxWriter) {
	"use strict";

	var DATA = [
		{ Region: "EMEA", Pais: "España", Anio: 2024, Trim: "T1", Importe: 100 },
		{ Region: "EMEA", Pais: "Francia", Anio: 2025, Trim: "T1", Importe: 20.5 },
		{ Region: "América", Pais: "México", Anio: 2025, Trim: "T2", Importe: 75 }
	];
	var VALUES = [
		{ field: "Importe", aggregation: "sum", label: "Importe" },
		{ field: "Importe", aggregation: "count", label: "Nº" }
	];

	function texts(oLayout, iRow) {
		return oLayout.rows[iRow].cells.map(function (c) {
			return c.value;
		});
	}

	function merge(oLayout, iRow, iCol) {
		return oLayout.merges.filter(function (m) {
			return m.row === iRow && m.col === iCol;
		})[0];
	}

	QUnit.module("PivotLayout");

	QUnit.test("Cabeceras multinivel con celdas combinadas", function (assert) {
		var oResult = PivotEngine.compute(DATA, { rows: ["Region", "Pais"], columns: ["Anio"], values: VALUES });
		var oLayout = PivotLayout.create(oResult, VALUES);

		assert.strictEqual(oLayout.headerRows, 2, "año + valor");
		assert.deepEqual(texts(oLayout, 0), ["", "Anio", "2024", "", "2025", "", "Grand total", ""],
			"nombre de la dimensión de columna sobre la última dimensión de fila");
		assert.deepEqual(texts(oLayout, 1), ["Region", "Pais", "Importe", "Nº", "Importe", "Nº", "Importe", "Nº"]);
		assert.deepEqual(merge(oLayout, 0, 2), { row: 0, col: 2, rowSpan: 1, colSpan: 2 }, "2024 abarca sus valores");
		assert.deepEqual(merge(oLayout, 0, 6), { row: 0, col: 6, rowSpan: 1, colSpan: 2 }, "total general");
		assert.strictEqual(oLayout.freezeRows, 2);
		assert.strictEqual(oLayout.freezeColumns, 2);
	});

	QUnit.test("Total general combinado hacia abajo en los niveles sin etiqueta", function (assert) {
		var oResult = PivotEngine.compute(DATA, { rows: ["Region"], columns: ["Anio", "Trim"], values: VALUES });
		var oLayout = PivotLayout.create(oResult, VALUES);
		var iTotal = oLayout.rows[0].cells.map(function (c) {
			return c.value;
		}).indexOf("Grand total");
		assert.deepEqual(merge(oLayout, 0, iTotal), { row: 0, col: iTotal, rowSpan: 2, colSpan: 2 });
		var iSub = texts(oLayout, 1).indexOf("Total 2024");
		assert.deepEqual(merge(oLayout, 1, iSub), { row: 1, col: iSub, rowSpan: 1, colSpan: 2 }, "subtotal de columna");
	});

	QUnit.test("Filas como en pantalla: etiquetas compactas, subtotales y totales", function (assert) {
		var oResult = PivotEngine.compute(DATA, { rows: ["Region", "Pais"], columns: ["Anio"], values: [VALUES[0]] });
		var oLayout = PivotLayout.create(oResult, [VALUES[0]]);
		var aBody = oLayout.rows.slice(oLayout.headerRows);

		assert.strictEqual(oLayout.headerRows, 1, "un valor: sin nivel de valor");
		assert.deepEqual(aBody.map(function (r) {
			return [r.cells[0].value, r.cells[1].value];
		}), [
			["América", "México"], ["Total América", ""],
			["EMEA", "España"], ["", "Francia"], ["Total EMEA", ""],
			["Grand total", ""]
		], "las etiquetas repetidas quedan vacías, igual que en la tabla");
		assert.strictEqual(aBody[1].cells[2].total, true, "fila de subtotal en negrita");
		assert.strictEqual(aBody[0].cells[4].total, true, "columna de total en negrita");
		assert.strictEqual(aBody[3].cells[3].value, 20.5, "valores numéricos");
		assert.strictEqual(aBody[3].cells[3].format, "#,##0.00", "decimales si la columna los tiene");
		assert.strictEqual(aBody[0].cells[2].value, null, "celda vacía");
	});

	QUnit.test("Vista jerárquica: una columna con sangría y esquema", function (assert) {
		var oResult = PivotEngine.compute(DATA, { rows: ["Region", "Pais"], columns: ["Anio"], values: [VALUES[0]], hierarchical: true });
		var oLayout = PivotLayout.create(oResult, [VALUES[0]], { hierarchical: true });
		var aBody = oLayout.rows.slice(oLayout.headerRows);

		assert.strictEqual(oLayout.rows[0].cells[0].value, "Region / Pais");
		assert.ok(oLayout.outline);
		assert.deepEqual(aBody.map(function (r) {
			return [r.cells[0].value, r.cells[0].indent, r.outlineLevel];
		}), [
			["América", 0, 0], ["México", 1, 1],
			["EMEA", 0, 0], ["España", 1, 1], ["Francia", 1, 1],
			["Grand total", 0, 0]
		]);
		assert.strictEqual(aBody[2].cells[3].value, 120.5, "el grupo lleva su subtotal en la misma fila");
	});

	QUnit.test("Formatos numéricos", function (assert) {
		assert.strictEqual(PivotLayout.numberFormat({ aggregation: "sum" }, true), "#,##0");
		assert.strictEqual(PivotLayout.numberFormat({ aggregation: "count" }, false), "#,##0");
		assert.strictEqual(PivotLayout.numberFormat({ format: "Number", decimals: 3 }, true), "#,##0.000");
		assert.strictEqual(PivotLayout.numberFormat({ format: "Percent" }, false), "0.0%");
		assert.strictEqual(PivotLayout.numberFormat({ format: "Currency", unit: "EUR", decimals: 2 }, true), "#,##0.00 \"EUR\"");
	});

	QUnit.module("XlsxWriter");

	QUnit.test("Partes del paquete: combinaciones, paneles fijos y esquema", function (assert) {
		var oResult = PivotEngine.compute(DATA, { rows: ["Region", "Pais"], columns: ["Anio"], values: VALUES, hierarchical: true });
		var mParts = XlsxWriter.createParts(PivotLayout.create(oResult, VALUES, { hierarchical: true }), "Ventas: 2024/2025");
		var sSheet = mParts["xl/worksheets/sheet1.xml"];

		assert.deepEqual(Object.keys(mParts).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels",
			"xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
		assert.ok(sSheet.indexOf("<mergeCell ref=\"B1:C1\"/>") >= 0, "2024 combinada");
		assert.ok(sSheet.indexOf("xSplit=\"1\" ySplit=\"2\" topLeftCell=\"B3\"") >= 0, "paneles fijos");
		assert.ok(sSheet.indexOf("<outlinePr summaryBelow=\"0\"/>") >= 0, "grupos encima de sus hijas");
		assert.ok(/<row r="4" outlineLevel="1">/.test(sSheet), "fila de detalle agrupada");
		assert.ok(mParts["xl/workbook.xml"].indexOf("name=\"Ventas  2024 2025\"") >= 0, "nombre de hoja válido");
	});

	QUnit.test("Utilidades", function (assert) {
		assert.strictEqual(XlsxWriter.columnName(0), "A");
		assert.strictEqual(XlsxWriter.columnName(25), "Z");
		assert.strictEqual(XlsxWriter.columnName(26), "AA");
		assert.strictEqual(XlsxWriter.columnName(701), "ZZ");
		assert.strictEqual(XlsxWriter.columnName(702), "AAA");
		assert.strictEqual(XlsxWriter.sheetName(""), "Pivot");
		assert.strictEqual(XlsxWriter.sheetName(new Array(40).join("x")).length, 31);
		assert.strictEqual(XlsxWriter.escapeXml("a<b & \"c\"\u0001"), "a&lt;b &amp; &quot;c&quot;");
	});
});
