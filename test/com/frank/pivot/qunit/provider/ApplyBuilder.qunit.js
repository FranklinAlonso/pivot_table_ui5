/*global QUnit */
sap.ui.define([
	"com/frank/pivot/provider/ApplyBuilder"
], function (ApplyBuilder) {
	"use strict";

	QUnit.module("ApplyBuilder");

	QUnit.test("groupby + aggregate", function (assert) {
		assert.strictEqual(ApplyBuilder.build({
			rows: ["Region", { name: "Pais" }], columns: ["Anio", "Region"],
			values: [{ field: "Importe", aggregation: "sum" }, { field: "Unidades", aggregation: "max" }]
		}), "groupby((Region,Pais,Anio),aggregate(Importe with sum as pv0,Unidades with max as pv1))");
	});

	QUnit.test("avg y count comparten $count", function (assert) {
		assert.strictEqual(ApplyBuilder.build({
			rows: ["Region"],
			values: [{ field: "Importe", aggregation: "avg" }, { field: "Importe", aggregation: "count" }]
		}), "groupby((Region),aggregate(Importe with sum as pv0_sum,$count as pv__count))");
	});

	QUnit.test("Filtros y literales", function (assert) {
		assert.strictEqual(ApplyBuilder.build({
			rows: ["Region"], values: [{ field: "Importe" }],
			filters: { Region: ["EMEA", "O'Neil"], Anio: [2024], Vacio: [] }
		}), "filter((Region eq 'EMEA' or Region eq 'O''Neil') and Anio eq 2024)/groupby((Region),aggregate(Importe with sum as pv0))");
	});

	QUnit.test("Sin dimensiones", function (assert) {
		assert.strictEqual(ApplyBuilder.build({ values: [{ field: "Importe" }] }), "aggregate(Importe with sum as pv0)");
	});

	QUnit.test("countDistinct no soportado en servidor", function (assert) {
		assert.throws(function () {
			ApplyBuilder.build({ rows: ["Region"], values: [{ field: "Cliente", aggregation: "countdistinct" }] });
		}, /no está soportada/);
	});
});
