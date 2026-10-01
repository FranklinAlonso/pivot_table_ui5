/*global QUnit */
sap.ui.define([
	"com/frank/pivot/panel/ColorRulesDialog",
	"sap/ui/test/utils/nextUIUpdate",
	"sap/ui/core/Element"
], function (ColorRulesDialog, nextUIUpdate, Element) {
	"use strict";

	function getValues(sField) {
		return sField === "Anio" ? [2023, 2024] : ["EMEA", "APJ"];
	}

	QUnit.module("ColorRulesDialog - conversión");

	QUnit.test("Reglas -> modelo -> reglas", function (assert) {
		var aRules = [
			{ field: "Anio", color: "#BBDEFB" },
			{ field: "Anio", value: 2024, color: "#FFCDD2" },
			{ field: "Region", value: "LATAM", color: "#C8E6C9" }
		];
		var aModel = ColorRulesDialog._toModelRules(aRules, getValues, "(Todos)");
		assert.strictEqual(aModel[0].valueKey, ColorRulesDialog.ALL);
		assert.strictEqual(aModel[1].valueKey, "2024", "clave JSON del número");
		assert.deepEqual(aModel[0].values.map(function (o) { return o.text; }), ["(Todos)", "2023", "2024"]);
		assert.deepEqual(aModel[2].values.map(function (o) { return o.text; }), ["(Todos)", "EMEA", "APJ", "LATAM"],
			"el valor actual se conserva aunque ya no esté en los datos");
		assert.deepEqual(ColorRulesDialog._fromModelRules(aModel), aRules, "ida y vuelta sin pérdidas");
	});

	QUnit.module("ColorRulesDialog - interacción");

	QUnit.test("Añadir una regla y aceptar", async function (assert) {
		var pResult = ColorRulesDialog.open({
			fields: [{ name: "Anio", label: "Año" }],
			rules: [],
			getValues: getValues
		});
		await nextUIUpdate();
		var oDialog = Element.registry.filter(function (e) {
			return e.isA("sap.m.Dialog") && e.hasStyleClass("pvColorRulesDialog");
		})[0];
		assert.ok(oDialog && oDialog.isOpen(), "diálogo abierto");
		var oTable = oDialog.getContent()[1];
		oTable.getHeaderToolbar().getContent()[2].firePress(); // Añadir regla
		await nextUIUpdate();
		assert.strictEqual(oTable.getItems().length, 1, "una fila");
		oTable.getItems()[0].getCells()[1].setSelectedKey("2024");
		oDialog.getButtons()[0].firePress(); // Aceptar
		var aRules = await pResult;
		assert.deepEqual(aRules, [{ field: "Anio", value: 2024, color: "#FFF3B0" }]);
	});
});
