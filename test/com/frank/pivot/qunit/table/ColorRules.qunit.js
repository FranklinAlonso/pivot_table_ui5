/*global QUnit */
sap.ui.define([
	"com/frank/pivot/table/ColorRules"
], function (ColorRules) {
	"use strict";

	var RESULT = {
		rowDimensions: [{ name: "Region" }, { name: "Pais" }],
		columnDimensions: [{ name: "Anio" }, { name: "Trimestre" }]
	};

	QUnit.module("ColorRules");

	QUnit.test("normalize descarta reglas incompletas y colores inseguros", function (assert) {
		assert.deepEqual(ColorRules.normalize([
			{ field: "Anio", color: "#BBDEFB" },
			{ field: "Anio", value: 2024, color: "rgb(255, 0, 0)" },
			{ field: "Anio", value: null, color: "red" },
			{ field: "", color: "#fff" },
			{ field: "Anio", color: "red; background:url(x)" },
			{ field: "Anio", color: "#12345" },
			null
		]), [
			{ field: "Anio", color: "#BBDEFB" },
			{ field: "Anio", value: 2024, color: "rgb(255, 0, 0)" },
			{ field: "Anio", color: "red" }
		]);
		assert.deepEqual(ColorRules.normalize(null), []);
	});

	QUnit.test("Columnas: valor concreto tiene prioridad sobre el campo completo", function (assert) {
		var oResolver = ColorRules.createResolver(RESULT, [
			{ field: "Anio", color: "#111111" },
			{ field: "Trimestre", value: "T1", color: "#222222" },
			{ field: "Anio", value: 2024, color: "#333333" }
		]);
		assert.strictEqual(oResolver.column({ columnKeys: [2023, "T2"] }), 0, "campo completo");
		assert.strictEqual(oResolver.column({ columnKeys: [2023, "T1"] }), 1, "valor concreto de Trimestre");
		assert.strictEqual(oResolver.column({ columnKeys: [2024, "T2"] }), 2, "valor concreto de Año");
		assert.strictEqual(oResolver.column({ columnKeys: [2024, "T1"] }), 1, "empate entre valores: la primera regla");
		assert.strictEqual(oResolver.column({ columnKeys: [2024] }), 2, "subtotal de 2024");
		assert.strictEqual(oResolver.column({ type: "total", columnKeys: [] }), -1, "total general sin color");
		assert.strictEqual(oResolver.columnHeader({ columnKeys: [2023, "T1"] }, 0), 0, "cabecera 2023: regla de Año");
		assert.strictEqual(oResolver.columnHeader({ columnKeys: [2023, "T1"] }, 1), 1, "cabecera T1: regla de Trimestre");
		assert.strictEqual(oResolver.columnHeader({ columnKeys: [2023, "T1"] }, 2), 1, "etiqueta de valor: regla de la columna");
		assert.strictEqual(oResolver.columnHeader({ type: "total", columnKeys: [] }, 0), -1);
	});

	QUnit.test("Filas y comparación tolerante de tipos", function (assert) {
		var oResolver = ColorRules.createResolver(RESULT, [{ field: "Region", value: "EMEA", color: "#FFCDD2" }]);
		assert.strictEqual(oResolver.row(["EMEA", "España"]), 0);
		assert.strictEqual(oResolver.row(["EMEA"]), 0, "subtotal de la región");
		assert.strictEqual(oResolver.row(["APJ", "India"]), -1);
		assert.strictEqual(oResolver.row([]), -1, "total general");
		var oNumeric = ColorRules.createResolver(RESULT, [{ field: "Anio", value: "2024", color: "#fff" }]);
		assert.strictEqual(oNumeric.column({ columnKeys: [2024, "T1"] }), 0, "\"2024\" coincide con 2024");
		assert.strictEqual(ColorRules.createResolver(RESULT, []), null, "sin reglas no hay resolutor");
	});

	QUnit.test("Color de texto por contraste", function (assert) {
		assert.strictEqual(ColorRules.textColor("#FFF3B0"), "#1d2d3e", "fondo claro -> texto oscuro");
		assert.strictEqual(ColorRules.textColor("#123"), "#ffffff", "fondo oscuro -> texto blanco");
		assert.strictEqual(ColorRules.textColor("rgb(0, 0, 128)"), "#ffffff");
		assert.strictEqual(ColorRules.textColor("red"), null, "nombres de color: sin cálculo");
	});

	QUnit.test("Tonos para subtotales y totales", function (assert) {
		assert.strictEqual(ColorRules.levelOf("data"), 0);
		assert.strictEqual(ColorRules.levelOf("subtotal"), 1);
		assert.strictEqual(ColorRules.levelOf("group"), 1);
		assert.strictEqual(ColorRules.levelOf("total"), 2);
		assert.strictEqual(ColorRules.levelOf(undefined), 0);
		assert.strictEqual(ColorRules.rowLevelOf("group", 0), 1, "árbol: grupo de primer nivel");
		assert.strictEqual(ColorRules.rowLevelOf("group", 1), 0, "árbol: grupos inferiores con el color base");
		assert.strictEqual(ColorRules.rowLevelOf("subtotal", 1), 1, "vista plana: todos los subtotales");
		assert.strictEqual(ColorRules.token(0, 1), "c0-1");
		assert.strictEqual(ColorRules.token(2, 0), "c2");
		assert.strictEqual(ColorRules.shade("#BBDEFB", 0), "#BBDEFB", "nivel 0: el propio color");
		assert.strictEqual(ColorRules.shade("#BBDEFB", 1), "#9fbdd5", "claro -> se oscurece un 15 %");
		assert.strictEqual(ColorRules.shade("#BBDEFB", 2), "#839bb0", "total -> se oscurece un 30 %");
		assert.strictEqual(ColorRules.shade("#000000", 1), "#262626", "muy oscuro -> se aclara");
		assert.strictEqual(ColorRules.shade("rgb(255, 0, 0)", 1, 0.2), "#cc0000", "intensidad configurable");
		assert.strictEqual(ColorRules.shade("#BBDEFB", 2, 0), "#BBDEFB", "intensidad 0: sin variación");
		assert.strictEqual(ColorRules.shade("red", 1), "color-mix(in srgb, red 85%, #000)", "nombres CSS: color-mix");
	});

	QUnit.test("CSS acotado al control", function (assert) {
		var sCss = ColorRules.buildCss("__xmlview0--pivot", [{ field: "Anio", color: "#BBDEFB" }]);
		assert.ok(sCss.indexOf("[id=\"__xmlview0--pivot\"] td:has([data-pivot-color=\"c0\"])") === 0);
		assert.ok(sCss.indexOf("background-color: #BBDEFB !important") > 0);
		assert.ok(sCss.indexOf("color: #1d2d3e !important") > 0);
		assert.ok(sCss.indexOf("[data-pivot-color=\"c0-1\"]) { background-color: #9fbdd5 !important; }") > 0, "tono de subtotal");
		assert.ok(sCss.indexOf("[data-pivot-color=\"c0-2\"]") > 0, "tono de total");
		assert.strictEqual(ColorRules.buildCss("x", []), "");
		assert.strictEqual(ColorRules.token(3), "c3");
		assert.strictEqual(ColorRules.token(-1), "none");
	});
});
