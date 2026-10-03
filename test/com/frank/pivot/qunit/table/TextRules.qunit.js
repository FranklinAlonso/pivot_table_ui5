/*global QUnit */
sap.ui.define([
	"com/frank/pivot/table/TextRules",
	"com/frank/pivot/engine/PivotEngine"
], function (TextRules, PivotEngine) {
	"use strict";

	var DATA = [
		{ Estado: "Modificada", Ceco: "CC01", Anio: 2026, VarAbs: 19388 },
		{ Estado: "Modificada", Ceco: "CC02", Anio: 2027, VarAbs: -6759 },
		{ Estado: "Eliminada", Ceco: "CC09", Anio: 2026, VarAbs: 27622 }
	];

	function compute() {
		return PivotEngine.compute(DATA, {
			rows: ["Estado", "Ceco"], columns: ["Anio"],
			values: [{ field: "VarAbs" }]
		});
	}

	function leaf(oResult, aKeys) {
		return oResult.columns.filter(function (c) {
			return JSON.stringify(c.columnKeys) === JSON.stringify(aKeys) && c.type === "data";
		})[0];
	}

	QUnit.module("TextRules - normalización");

	QUnit.test("Descarta reglas incompletas, colores inseguros y propiedades desconocidas", function (assert) {
		var aRules = TextRules.normalize([
			{ scope: "row", field: "Estado", value: "Eliminada", color: "Negative", strikethrough: true, extra: 1 },
			{ scope: "row", field: "Estado", color: "red; background:url(x)" },
			{ scope: "row", field: "Estado" },                       // sin estilo
			{ scope: "cell", operator: "lt", color: "#F00" },        // falta "to"
			{ scope: "cell", operator: "between", to: 1, bold: true }, // falta "to2"
			{ scope: "cell", operator: "changed", valueField: "VarAbs", color: "#B44F00", bold: false },
			{ scope: "column", field: "", italic: true },
			{ scope: "otro", field: "Estado", bold: true },
			null
		]);
		assert.deepEqual(aRules, [
			{ scope: "row", field: "Estado", value: "Eliminada", color: "Negative", strikethrough: true },
			{ scope: "cell", operator: "changed", valueField: "VarAbs", color: "#b44f00", bold: false }
		]);
		assert.deepEqual(TextRules.normalize(null), []);
	});

	QUnit.test("Colores: semánticos, hex y conversión para Excel", function (assert) {
		assert.strictEqual(TextRules.sanitizeColor("Critical"), "Critical");
		assert.strictEqual(TextRules.sanitizeColor("#ABC"), "#abc");
		assert.strictEqual(TextRules.sanitizeColor("red"), null, "solo semánticos o hex");
		assert.strictEqual(TextRules.hexColor("Negative"), "#aa0808");
		assert.strictEqual(TextRules.hexColor("#abc"), "#aabbcc");
	});

	QUnit.test("isChanged: tolerancia de redondeo y vacíos", function (assert) {
		assert.notOk(TextRules.isChanged(34651, 34651.0000000001), "misma cifra");
		assert.ok(TextRules.isChanged(34651, 34650));
		assert.ok(TextRules.isChanged(1, null), "nuevo valor");
		assert.ok(TextRules.isChanged(null, 1), "valor eliminado");
		assert.notOk(TextRules.isChanged(null, undefined), "ambos vacíos");
	});

	QUnit.module("TextRules - resolución");

	QUnit.test("Reglas de fila: celdas de detalle sí, subtotales y totales no", function (assert) {
		var oResult = compute();
		var oResolver = TextRules.createResolver(oResult, [
			{ scope: "row", field: "Estado", value: "Eliminada", color: "Negative", strikethrough: true },
			{ scope: "row", field: "Ceco", bold: true }
		]);
		var oLeaf = leaf(oResult, [2026]);
		assert.deepEqual(oResolver.dimension(["Eliminada", "CC09"], "data"), [0, 1]);
		assert.deepEqual(oResolver.dimension(["Modificada", "CC01"], "data"), [1]);
		assert.deepEqual(oResolver.dimension(["Eliminada"], "subtotal"), [], "subtotal");
		assert.deepEqual(oResolver.dimension([], "total"), [], "total");
		assert.deepEqual(oResolver.dimension(["Eliminada"], "group"), [], "grupo del árbol");
		assert.deepEqual(oResolver.value(oLeaf, ["Eliminada", "CC09"], "data", 27622), [0, 1], "celdas de valor de la fila");
		assert.deepEqual(oResolver.unused, []);
	});

	QUnit.test("Reglas de columna y de celda, en orden de definición", function (assert) {
		var oResult = compute();
		var oResolver = TextRules.createResolver(oResult, [
			{ scope: "cell", operator: "lt", to: 0, color: "Negative" },
			{ scope: "column", field: "Anio", value: 2027, italic: true },
			{ scope: "cell", valueField: "VarAbs", operator: "between", to: 20000, to2: 10000, bold: true },
			{ scope: "cell", valueField: "Otro", operator: "empty", bold: true },
			{ scope: "cell", operator: "changed", color: "Critical" },
			{ scope: "row", field: "NoEsta", bold: true }
		]);
		var o2026 = leaf(oResult, [2026]);
		var o2027 = leaf(oResult, [2027]);
		var oTotal = oResult.columns.filter(function (c) { return c.type === "total"; })[0];
		assert.deepEqual(oResolver.value(o2027, ["Modificada", "CC02"], "data", -6759), [0, 1]);
		assert.deepEqual(oResolver.value(o2026, ["Modificada", "CC01"], "data", 19388), [2], "between");
		assert.deepEqual(oResolver.value(oTotal, [], "total", -1), [0], "las reglas de celda sí aplican a totales");
		assert.deepEqual(oResolver.column(oTotal), [], "las de columna no aplican al total general");
		assert.deepEqual(oResolver.value(o2026, ["Modificada", "CC01"], "data", 5, 4), [4], "changed con valor anterior");
		assert.deepEqual(oResolver.value(o2026, ["Modificada", "CC01"], "data", 5, undefined), [],
			"changed sin previousField no aplica");
		assert.deepEqual(oResolver.unused, [3, 5], "reglas sobre campos que no están en la tabla");
		assert.strictEqual(TextRules.createResolver(oResult, []), null);
	});

	QUnit.test("token, combine y buildCss", function (assert) {
		var aRules = TextRules.normalize([
			{ scope: "row", field: "Estado", color: "Negative", strikethrough: true },
			{ scope: "cell", operator: "changed", color: "#123456", bold: true, strikethrough: false }
		]);
		assert.strictEqual(TextRules.token([0, 1]), "t0 t1");
		assert.strictEqual(TextRules.token([]), "none");
		assert.deepEqual(TextRules.combine(aRules, [0, 1]),
			{ color: "#123456", strikethrough: false, bold: true }, "la última regla gana");
		assert.strictEqual(TextRules.combine(aRules, []), null);
		var sCss = TextRules.buildCss("pivot\"1", aRules);
		assert.ok(sCss.indexOf("[id=\"pivot1\"].pvPivotTable [data-pivot-text~=\"t0\"][data-pivot-text]") === 0, "acotado al control");
		assert.ok(/t0[^\n]*color: var\(--sapNegativeTextColor, #aa0808\) !important; text-decoration: line-through/.test(sCss));
		assert.ok(/t1[^\n]*font-weight: bold[^\n]*text-decoration: none/.test(sCss));
		assert.strictEqual(sCss.split("\n").length, 2, "una línea por regla");
	});
});
