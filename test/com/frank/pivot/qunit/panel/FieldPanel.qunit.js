/*global QUnit */
sap.ui.define([
	"com/frank/pivot/panel/FieldPanel",
	"com/frank/pivot/PivotTable",
	"com/frank/pivot/PivotField",
	"com/frank/pivot/PivotValue"
], function (FieldPanel, PivotTable, PivotField, PivotValue) {
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

	QUnit.module("FieldPanel - campos calculados");

	QUnit.test("Un calculado Aggregate siempre se añade con Formula y conserva sus marcas", function (assert) {
		var oState = state();
		oState.available.push({ name: "Margen", label: "Margen %", measure: true, calculated: true, locked: true },
			{ name: "Utilidad", label: "Utilidad", measure: true, calculated: true, locked: false });
		FieldPanel._moveField(oState, "available", 2, "values");
		FieldPanel._moveField(oState, "available", 3, "values");
		assert.strictEqual(oState.values[1].aggregationType, "Formula", "Aggregate -> Formula");
		assert.ok(oState.values[1].calculated && oState.values[1].locked, "marcas conservadas");
		assert.strictEqual(oState.values[2].aggregationType, "Sum", "Record -> agregación normal");
		FieldPanel._moveField(oState, "values", 1, "rows");
		assert.ok(oState.rows[2].locked, "las marcas se conservan al moverlo a filas");
		assert.strictEqual(FieldPanel._stateToConfig(oState).values[1].aggregationType, "Sum");
	});

	QUnit.test("collectFields y createState marcan los calculados y normalizan la agregación", function (assert) {
		var oPivot = new PivotTable({
			records: [{ Ventas: 1, Utilidad: 2 }],
			fields: [
				new PivotField({ name: "Margen", label: "Margen %", formula: "{Utilidad} / {Ventas}" }),
				new PivotField({ name: "Utilidad", formula: "{Ventas} * 2", calculationLevel: "Record" }),
				new PivotField({ name: "Ventas", measure: true })
			],
			values: [
				new PivotValue({ field: "Margen", aggregationType: "Sum" }),
				new PivotValue({ field: "Ventas", aggregationType: "Formula" })
			]
		});
		var mFields = {};
		FieldPanel._collectFields(oPivot).forEach(function (f) { mFields[f.name] = f; });
		assert.deepEqual([mFields.Margen.calculated, mFields.Margen.locked, mFields.Margen.measure], [true, true, true]);
		assert.deepEqual([mFields.Utilidad.calculated, mFields.Utilidad.locked], [true, false]);
		assert.deepEqual([mFields.Ventas.calculated, mFields.Ventas.locked], [false, false]);
		var oState = FieldPanel._createState(oPivot, FieldPanel._collectFields(oPivot));
		assert.deepEqual(oState.values.map(function (v) { return v.aggregationType; }), ["Formula", "Sum"]);
		oPivot.destroy();
	});
});
