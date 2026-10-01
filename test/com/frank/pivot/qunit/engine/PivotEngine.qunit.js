/*global QUnit */
sap.ui.define([
	"com/frank/pivot/engine/PivotEngine"
], function (PivotEngine) {
	"use strict";

	var DATA = [
		{ Region: "EMEA", Pais: "España", Anio: 2024, Trimestre: "Q1", Importe: 100, Cliente: "A" },
		{ Region: "EMEA", Pais: "España", Anio: 2024, Trimestre: "Q2", Importe: 50, Cliente: "B" },
		{ Region: "EMEA", Pais: "Francia", Anio: 2024, Trimestre: "Q1", Importe: 30, Cliente: "A" },
		{ Region: "EMEA", Pais: "Francia", Anio: 2025, Trimestre: "Q1", Importe: 20, Cliente: "C" },
		{ Region: "América", Pais: "México", Anio: 2025, Trimestre: "Q2", Importe: 70, Cliente: "D" },
		{ Region: "América", Pais: "México", Anio: 2025, Trimestre: "Q2", Importe: 5, Cliente: "D" }
	];

	function byType(aItems, sType) {
		return aItems.filter(function (o) {
			return o.__type === sType || o.type === sType;
		});
	}

	function column(oResult, aKeys, iValueIndex) {
		return oResult.columns.filter(function (c) {
			return c.type === "data" && JSON.stringify(c.columnKeys) === JSON.stringify(aKeys) &&
				c.valueIndex === (iValueIndex || 0);
		})[0];
	}

	function row(oResult, aKeys, sType) {
		return oResult.rows.filter(function (r) {
			return r.__type === (sType || "data") && JSON.stringify(r.__rowKeys) === JSON.stringify(aKeys);
		})[0];
	}

	QUnit.module("PivotEngine - agregación básica");

	QUnit.test("Suma por filas y columnas", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region"], columns: ["Anio"],
			values: [{ field: "Importe", aggregation: "sum" }]
		});
		var o2024 = column(oResult, [2024]);
		var o2025 = column(oResult, [2025]);
		var oTotalCol = byType(oResult.columns, "total")[0];
		var oEmea = row(oResult, ["EMEA"]);
		var oAmerica = row(oResult, ["América"]);
		var oTotalRow = byType(oResult.rows, "total")[0];

		assert.strictEqual(oResult.columns.length, 3, "2024, 2025 y total general");
		assert.strictEqual(oEmea[o2024.id], 180, "EMEA 2024");
		assert.strictEqual(oEmea[o2025.id], 20, "EMEA 2025");
		assert.strictEqual(oAmerica[o2024.id], null, "celda sin datos = null");
		assert.strictEqual(oAmerica[oTotalCol.id], 75, "total de fila");
		assert.strictEqual(oTotalRow[o2025.id], 95, "total de columna");
		assert.strictEqual(oTotalRow[oTotalCol.id], 275, "total general");
	});

	QUnit.test("Orden de dimensiones: numérico, alfabético y descendente", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: [{ name: "Region", sortOrder: "desc" }], columns: ["Anio"],
			values: [{ field: "Importe" }], showGrandTotals: false
		});
		assert.deepEqual(oResult.rows.map(function (r) { return r.d0; }), ["EMEA", "América"], "filas descendentes");
		assert.deepEqual(oResult.columns.map(function (c) { return c.labels[0]; }), ["2024", "2025"], "columnas ascendentes");
	});

	QUnit.test("Agregaciones count, countdistinct, avg, min y max", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region"], columns: [],
			values: [
				{ field: "Importe", aggregation: "count" },
				{ field: "Cliente", aggregation: "countDistinct" },
				{ field: "Importe", aggregation: "avg" },
				{ field: "Importe", aggregation: "min" },
				{ field: "Importe", aggregation: "max" }
			]
		});
		var oEmea = row(oResult, ["EMEA"]);
		assert.strictEqual(oResult.headerLevels, 1, "sin dimensiones de columna solo hay nivel de valores");
		assert.deepEqual([oEmea.v0, oEmea.v1, oEmea.v2, oEmea.v3, oEmea.v4], [4, 3, 50, 20, 100]);
	});

	QUnit.test("Valores nulos, vacíos y no numéricos", function (assert) {
		var oResult = PivotEngine.compute([
			{ Region: null, Importe: "10" },
			{ Region: "", Importe: "abc" },
			{ Region: "X", Importe: null }
		], { rows: ["Region"], values: [{ field: "Importe" }], texts: { empty: "(vacío)" }, showGrandTotals: false });
		assert.deepEqual(oResult.rows.map(function (r) { return r.d0; }), ["X", "(vacío)"], "vacíos agrupados y al final");
		assert.strictEqual(oResult.rows[0].v0, null, "suma sin valores numéricos = null");
		assert.strictEqual(oResult.rows[1].v0, 10, "texto numérico convertido");
	});

	QUnit.test("Filtros", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Pais"], values: [{ field: "Importe" }],
			filters: { Region: ["EMEA"], Anio: [2024] }, showGrandTotals: false
		});
		assert.strictEqual(oResult.usedRecordCount, 3);
		assert.deepEqual(oResult.rows.map(function (r) { return [r.d0, r.v0]; }), [["España", 150], ["Francia", 30]]);
	});

	QUnit.test("Agregación desconocida", function (assert) {
		assert.throws(function () {
			PivotEngine.compute(DATA, { values: [{ field: "Importe", aggregation: "median" }] });
		}, /no soportada/);
	});

	QUnit.module("PivotEngine - subtotales y cabeceras");

	QUnit.test("Subtotales de filas y etiquetas compactas", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region", "Pais"], columns: [],
			values: [{ field: "Importe" }],
			texts: { total: "Total {0}", grandTotal: "Total general" }
		});
		assert.deepEqual(oResult.rows.map(function (r) {
			return [r.__type, r.d0, r.d1, r.v0];
		}), [
			["data", "América", "México", 75],
			["subtotal", "Total América", "", 75],
			["data", "EMEA", "España", 150],
			["data", "", "Francia", 50],
			["subtotal", "Total EMEA", "", 200],
			["total", "Total general", "", 275]
		]);
	});

	QUnit.test("repeatRowLabels y sin totales", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region", "Pais"], values: [{ field: "Importe" }],
			repeatRowLabels: true, showSubtotals: false, showGrandTotals: false
		});
		assert.deepEqual(oResult.rows.map(function (r) { return r.d0 + "/" + r.d1; }),
			["América/México", "EMEA/España", "EMEA/Francia"]);
	});

	QUnit.test("Cabeceras multinivel con subtotales de columna y varios valores", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region"], columns: ["Anio", "Trimestre"],
			values: [{ field: "Importe", label: "Importe" }, { field: "Importe", aggregation: "count", label: "Nº" }],
			texts: { total: "Total {0}", grandTotal: "Total general" }
		});
		assert.strictEqual(oResult.headerLevels, 3, "Año, Trimestre y Valor");
		assert.deepEqual(oResult.columns.map(function (c) { return c.labels.join("|"); }), [
			"2024|Q1|Importe", "2024|Q1|Nº", "2024|Q2|Importe", "2024|Q2|Nº", "2024|Total 2024|Importe", "2024|Total 2024|Nº",
			"2025|Q1|Importe", "2025|Q1|Nº", "2025|Q2|Importe", "2025|Q2|Nº", "2025|Total 2025|Importe", "2025|Total 2025|Nº",
			"Total general||Importe", "Total general||Nº"
		]);
		assert.deepEqual(oResult.columns.map(function (c) { return c.spans[0]; }),
			[6, 1, 1, 1, 1, 1, 6, 1, 1, 1, 1, 1, 2, 1], "span del nivel Año");
		assert.deepEqual(oResult.columns.map(function (c) { return c.spans[1]; }),
			[2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1], "span del nivel Trimestre");
		assert.deepEqual(oResult.columns.map(function (c) { return c.spans[2]; }),
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], "nivel de valores");

		var oSub2024 = oResult.columns[4];
		assert.strictEqual(oSub2024.type, "subtotal");
		assert.strictEqual(row(oResult, ["EMEA"])[oSub2024.id], 180, "subtotal 2024 EMEA");
		assert.strictEqual(byType(oResult.rows, "total")[0][oResult.columns[13].id], 6, "conteo total");
	});

	QUnit.test("Límite de columnas", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region"], columns: ["Cliente"], values: [{ field: "Importe" }], maxColumns: 2
		});
		assert.ok(oResult.truncated, "marcado como truncado");
		assert.strictEqual(oResult.totalColumns, 5, "4 clientes + total");
		assert.strictEqual(oResult.columns.length, 2);
	});

	QUnit.test("Sin dimensiones: una sola fila con el total", function (assert) {
		var oResult = PivotEngine.compute(DATA, { values: [{ field: "Importe" }] });
		assert.strictEqual(oResult.rows.length, 1);
		assert.strictEqual(oResult.rows[0].v0, 275);
	});

	QUnit.module("PivotEngine - jerarquía y modo servidor");

	QUnit.test("Árbol para TreeTable con valores de grupo", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Region", "Pais"], columns: ["Anio"], values: [{ field: "Importe" }],
			hierarchical: true, showSubtotals: false, texts: { grandTotal: "Total general" }
		});
		var oCol2024 = column(oResult, [2024]);
		assert.strictEqual(oResult.tree.length, 3, "América, EMEA y total general");
		assert.strictEqual(oResult.tree[1].label, "EMEA");
		assert.strictEqual(oResult.tree[1].__type, "group");
		assert.strictEqual(oResult.tree[1][oCol2024.id], 180, "valor del grupo = subtotal");
		assert.deepEqual(oResult.tree[1].nodes.map(function (n) { return n.label; }), ["España", "Francia"]);
		assert.deepEqual(oResult.tree[1].nodes[1].__rowKeys, ["EMEA", "Francia"]);
		assert.strictEqual(oResult.tree[2].__type, "total");
		assert.strictEqual(byType(oResult.rows, "subtotal").length, 0, "sin subtotales en la vista plana");
	});

	QUnit.test("Registros pre-agregados (OData V4 $apply)", function (assert) {
		// Resultado de groupby((Region,Anio),aggregate(Importe with sum as pv0, Importe with sum as pv1_sum, $count as pv__count))
		var aServer = [
			{ Region: "EMEA", Anio: 2024, pv0: "180", pv1_sum: "180", pv__count: "3", pv2: 30 },
			{ Region: "EMEA", Anio: 2025, pv0: "20", pv1_sum: "20", pv__count: "1", pv2: 20 },
			{ Region: "América", Anio: 2025, pv0: "75", pv1_sum: "75", pv__count: "2", pv2: 5 }
		];
		var oResult = PivotEngine.compute(aServer, {
			rows: ["Region"], columns: ["Anio"], preAggregated: true,
			values: [
				{ field: "Importe", aggregation: "sum" },
				{ field: "Importe", aggregation: "avg" },
				{ field: "Importe", aggregation: "min" },
				{ field: "Importe", aggregation: "count" }
			],
			filters: { Pais: ["España"] } // se ignora: el backend ya filtró
		});
		var oTotal = byType(oResult.rows, "total")[0];
		var aTotalCols = byType(oResult.columns, "total");
		assert.deepEqual(aTotalCols.map(function (c) { return oTotal[c.id]; }), [275, 275 / 6, 5, 6]);
	});
});
