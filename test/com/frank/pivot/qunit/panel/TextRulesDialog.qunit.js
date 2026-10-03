/*global QUnit */
sap.ui.define([
	"com/frank/pivot/panel/TextRulesDialog",
	"sap/ui/test/utils/nextUIUpdate"
], function (TextRulesDialog, nextUIUpdate) {
	"use strict";

	var CONTEXT = {
		fields: {
			row: [{ name: "Estado", label: "Estado" }],
			column: [{ name: "Anio", label: "Año" }],
			cell: [{ name: TextRulesDialog.ALL, label: "(Cualquier valor)" }, { name: "V5", label: "Real" }]
		},
		getValues: function () {
			return ["Eliminada", "Modificada"];
		},
		allText: "(Todos)"
	};

	QUnit.module("TextRulesDialog - modelo");

	QUnit.test("Reglas -> filas del diálogo -> reglas", function (assert) {
		var aRules = [
			{ scope: "row", field: "Estado", value: "Eliminada", color: "Negative", strikethrough: true },
			{ scope: "cell", valueField: "V5", operator: "between", to: -10, to2: 10.5, color: "#123456", bold: true },
			{ scope: "cell", operator: "changed", italic: true },
			{ scope: "column", field: "Anio", bold: true }
		];
		var aRows = aRules.map(function (oRule) {
			return TextRulesDialog._toModelRule(oRule, CONTEXT);
		});
		assert.strictEqual(aRows[0].valueKey, "\"Eliminada\"");
		assert.strictEqual(aRows[0].colorKey, "Negative");
		assert.deepEqual([aRows[1].colorKey, aRows[1].customColor, aRows[1].to, aRows[1].to2], ["custom", "#123456", "-10", "10.5"]);
		assert.strictEqual(aRows[2].field, TextRulesDialog.ALL, "celda sin valueField = cualquier valor");
		assert.strictEqual(aRows[3].valueKey, TextRulesDialog.ALL, "columna sin value = todos los valores");
		var oBack = TextRulesDialog._fromModelRules(aRows);
		assert.deepEqual(oBack.rules, aRules, "ida y vuelta sin pérdidas");
		assert.deepEqual(oBack.invalid, []);
	});

	QUnit.test("Filas incompletas y números con coma", function (assert) {
		var oRow = TextRulesDialog._toModelRule({ scope: "cell", operator: "lt", to: 0, color: "Negative" }, CONTEXT);
		oRow.to = "1.234,5";
		var oNoStyle = TextRulesDialog._toModelRule({ scope: "row", field: "Estado", bold: true }, CONTEXT);
		oNoStyle.bold = false;
		var oNoNumber = TextRulesDialog._toModelRule({ scope: "cell", operator: "gt", to: 1, bold: true }, CONTEXT);
		oNoNumber.to = "abc";
		var oResult = TextRulesDialog._fromModelRules([oRow, oNoStyle, oNoNumber]);
		assert.deepEqual(oResult.rules, [{ scope: "cell", operator: "lt", to: 1234.5, color: "Negative" }]);
		assert.deepEqual(oResult.invalid, [1, 2], "sin estilo / sin número");
		assert.strictEqual(TextRulesDialog._parseNumber("-0.5"), -0.5);
		assert.strictEqual(TextRulesDialog._toHexColor("rgb(255, 0, 16)"), "#ff0010");
		assert.ok(/line-through/.test(TextRulesDialog._previewHtml(TextRulesDialog._toModelRule(
			{ scope: "row", field: "Estado", strikethrough: true }, CONTEXT))), "vista previa");
	});

	QUnit.module("TextRulesDialog - interfaz");

	QUnit.test("Aceptar devuelve las reglas; una regla incompleta bloquea el cierre", async function (assert) {
		var pResult = TextRulesDialog.open({
			rowFields: [{ name: "Estado", label: "Estado" }],
			columnFields: [],
			valueFields: [{ name: "V5", label: "Real" }],
			rules: [{ scope: "row", field: "Estado", value: "Eliminada", color: "Negative", strikethrough: true }],
			getValues: CONTEXT.getValues
		});
		await nextUIUpdate();
		var oDialog = sap.ui.require("sap/ui/core/Element").registry.filter(function (o) {
			return o.isA("sap.m.Dialog") && o.hasStyleClass("pvTextRulesDialog");
		})[0];
		assert.ok(oDialog && oDialog.isOpen(), "abierto");
		var oModel = oDialog.getModel("texts");
		assert.ok(/line-through/.test(oModel.getProperty("/rules/0/preview")), "vista previa calculada");

		oModel.setProperty("/rules/0/strikethrough", false);
		oModel.setProperty("/rules/0/colorKey", "");
		oDialog.getButtons()[0].firePress();
		assert.ok(oDialog.isOpen(), "no se cierra con una regla sin estilo");
		assert.ok(oModel.getProperty("/invalid"), "mensaje de error");
		assert.strictEqual(oModel.getProperty("/rules/0/invalid"), true, "fila marcada");

		oModel.setProperty("/rules/0/bold", true);
		oDialog.getButtons()[0].firePress();
		assert.deepEqual(await pResult, [{ scope: "row", field: "Estado", value: "Eliminada", bold: true }]);
	});
});
