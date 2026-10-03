/*global QUnit */
sap.ui.define([
	"com/frank/pivot/engine/PivotEngine",
	"com/frank/pivot/provider/ApplyBuilder"
], function (PivotEngine, ApplyBuilder) {
	"use strict";

	// Comparación de versiones: v4 (anterior) y v5 (nueva) en el mismo registro
	var DATA = [
		{ Estado: "Modificada", Ceco: "CC01", Mes: "Sep", V4: 34651, V5: 34651, Costo: 100 },
		{ Estado: "Modificada", Ceco: "CC01", Mes: "Oct", V4: 37973, V5: 38000, Costo: 100 },
		{ Estado: "Modificada", Ceco: "CC02", Mes: "Sep", V4: 19767, V5: 19767, Costo: 50 },
		{ Estado: "Eliminada", Ceco: "CC09", Mes: "Sep", V4: 17147, V5: null, Costo: 10 }
	];

	function row(oResult, aKeys, sType) {
		return oResult.rows.filter(function (r) {
			return r.__type === (sType || "data") && JSON.stringify(r.__rowKeys) === JSON.stringify(aKeys);
		})[0];
	}

	function col(oResult, sType, aKeys, iValue) {
		return oResult.columns.filter(function (c) {
			return c.type === sType && c.valueIndex === (iValue || 0) &&
				(!aKeys || JSON.stringify(c.columnKeys) === JSON.stringify(aKeys));
		})[0].id;
	}

	QUnit.module("PivotEngine - valor anterior (previousField)");

	QUnit.test("Cada celda, subtotal y total lleva el valor anterior agregado igual", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Estado", "Ceco"], columns: ["Mes"],
			values: [{ field: "V5", previousField: "V4" }, { field: "V5", previousField: "V4", aggregation: "avg" }]
		});
		var sSep = col(oResult, "data", ["Sep"]);
		var sOct = col(oResult, "data", ["Oct"]);
		var sTotal = col(oResult, "total");
		var oCc01 = row(oResult, ["Modificada", "CC01"]);
		assert.deepEqual([oCc01[sOct], oCc01[sOct + "_prev"]], [38000, 37973], "celda modificada");
		assert.deepEqual([oCc01[sSep], oCc01[sSep + "_prev"]], [34651, 34651], "celda sin cambios");
		var oCc09 = row(oResult, ["Eliminada", "CC09"]);
		assert.deepEqual([oCc09[sSep], oCc09[sSep + "_prev"]], [null, 17147], "fila eliminada");
		assert.strictEqual(oCc09[sOct + "_prev"], null, "celda sin registros: null");
		var oSub = row(oResult, ["Modificada"], "subtotal");
		assert.deepEqual([oSub[sTotal], oSub[sTotal + "_prev"]], [34651 + 38000 + 19767, 34651 + 37973 + 19767], "subtotal");
		var oTotal = oResult.rows.filter(function (r) { return r.__type === "total"; })[0];
		var sAvg = col(oResult, "total", null, 1);
		assert.strictEqual(oTotal[sAvg + "_prev"], (34651 + 37973 + 19767 + 17147) / 4, "avg del anterior");
		assert.strictEqual(oResult.values[0].previousField, "V4", "se informa en values");
	});

	QUnit.test("Sin previousField no hay propiedades nuevas", function (assert) {
		var oResult = PivotEngine.compute(DATA, { rows: ["Estado"], values: [{ field: "V5" }] });
		assert.notOk(Object.keys(oResult.rows[0]).some(function (k) { return /_prev$/.test(k); }));
		assert.notOk("previousField" in oResult.values[0]);
	});

	QUnit.test("Con campos calculados: record como anterior, aggregate no admitido", function (assert) {
		var oResult = PivotEngine.compute(DATA, {
			rows: ["Estado"],
			values: [
				{ field: "Neto5", previousField: "Neto4" },
				{ field: "Margen", aggregation: "formula", previousField: "V4" }
			],
			calculatedFields: {
				Neto5: { formula: "{V5} - {Costo}", level: "record" },
				Neto4: { formula: "{V4} - {Costo}", level: "record" },
				Margen: { formula: "{V5} / {V4}", level: "aggregate" }
			}
		});
		var oMod = row(oResult, ["Modificada"]);
		assert.deepEqual([oMod.v0, oMod.v0_prev], [34651 + 38000 + 19767 - 250, 34651 + 37973 + 19767 - 250]);
		assert.notOk("v1_prev" in oMod, "aggregate: se ignora");
		assert.ok(oResult.issues.some(function (o) {
			return o.type === "warning" && o.field === "Margen" && /valor anterior/.test(o.message);
		}));
	});

	QUnit.test("Modo servidor: $apply pide el anterior con alias propio y se re-agrega", function (assert) {
		var oConfig = {
			rows: ["Estado"],
			values: [{ field: "V5", previousField: "V4" }, { field: "V5", aggregation: "avg", previousField: "V4" },
				{ field: "V5", aggregation: "max", previousField: "V4" }]
		};
		assert.strictEqual(ApplyBuilder.build(oConfig),
			"groupby((Estado),aggregate(V5 with sum as pv0,V4 with sum as pv0_prev,V5 with sum as pv1_sum," +
			"V4 with sum as pv1_prev_sum,V5 with max as pv2,V4 with max as pv2_prev,$count as pv__count))");
		var oResult = PivotEngine.compute([
			{ Estado: "A", pv0: 10, pv0_prev: 8, pv1_sum: 10, pv1_prev_sum: 8, pv__count: 2, pv2: 7, pv2_prev: 6 },
			{ Estado: "B", pv0: 5, pv0_prev: 9, pv1_sum: 5, pv1_prev_sum: 9, pv__count: 3, pv2: 4, pv2_prev: 9 }
		], Object.assign({ preAggregated: true }, oConfig));
		var oTotal = oResult.rows.filter(function (r) { return r.__type === "total"; })[0];
		assert.deepEqual([oTotal.v0, oTotal.v0_prev, oTotal.v1, oTotal.v1_prev, oTotal.v2, oTotal.v2_prev],
			[15, 17, 3, 17 / 5, 7, 9]);
	});
});
