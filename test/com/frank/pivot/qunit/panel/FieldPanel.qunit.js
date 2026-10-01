/*global QUnit */
sap.ui.define([
	"com/frank/pivot/panel/FieldPanel"
], function (FieldPanel) {
	"use strict";

	function state() {
		return {
			available: [{ name: "Cliente", label: "Cliente" }, { name: "Importe", label: "Importe", measure: true }],
			rows: [{ name: "Region", label: "Región" }, { name: "Pais", label: "País" }],
			columns: [{ name: "Anio", label: "Año" }],
			values: [{ name: "Importe", label: "Importe", measure: true, aggregationType: "Sum" }],
			showSubtotals: true,
			showGrandTotals: true,
			hierarchical: false
		};
	}

	function names(aList) {
		return aList.map(function (f) { return f.name; });
	}

	QUnit.module("FieldPanel - reglas de movimiento");

	QUnit.test("Mover entre filas y columnas", function (assert) {
		var oState = state();
		FieldPanel._moveField(oState, "rows", 1, "columns", 0);
		assert.deepEqual(names(oState.rows), ["Region"]);
		assert.deepEqual(names(oState.columns), ["Pais", "Anio"]);
	});

	QUnit.test("Reordenar dentro de la misma lista", function (assert) {
		var oState = state();
		FieldPanel._moveField(oState, "rows", 0, "rows", 2);
		assert.deepEqual(names(oState.rows), ["Pais", "Region"]);
	});

	QUnit.test("Añadir a valores copia el campo (agregación por defecto según tipo)", function (assert) {
		var oState = state();
		FieldPanel._moveField(oState, "available", 0, "values");
		assert.deepEqual(names(oState.available), ["Cliente", "Importe"], "sigue disponible");
		assert.strictEqual(oState.values[1].aggregationType, "Count", "dimensión -> Count");
		FieldPanel._moveField(oState, "available", 1, "values");
		assert.strictEqual(oState.values[2].aggregationType, "Sum", "medida -> Sum");
	});

	QUnit.test("Quitar de filas devuelve el campo a disponibles", function (assert) {
		var oState = state();
		FieldPanel._moveField(oState, "rows", 0, "available");
		assert.deepEqual(names(oState.rows), ["Pais"]);
		assert.ok(names(oState.available).indexOf("Region") >= 0);
	});

	QUnit.test("Configuración resultante", function (assert) {
		var oConfig = FieldPanel._stateToConfig(state());
		assert.deepEqual(oConfig.rows, ["Region", "Pais"]);
		assert.deepEqual(oConfig.columns, ["Anio"]);
		assert.strictEqual(oConfig.values[0].field, "Importe");
		assert.strictEqual(oConfig.values[0].aggregationType, "Sum");
	});
});
