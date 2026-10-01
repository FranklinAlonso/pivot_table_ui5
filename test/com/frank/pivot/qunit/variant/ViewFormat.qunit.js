/*global QUnit */
sap.ui.define([
	"com/frank/pivot/variant/ViewFormat"
], function (ViewFormat) {
	"use strict";

	var CONFIG = {
		rows: ["Region", "Pais"],
		columns: ["Anio"],
		values: [{ field: "Importe", aggregationType: "Sum", label: "", format: "Currency", decimals: 2, unit: "EUR" }],
		filters: { Region: ["EMEA"] },
		colorRules: [{ field: "Anio", value: 2024, color: "#FFF3B0" }],
		showSubtotals: true,
		showGrandTotals: false,
		hierarchical: false,
		expandLevel: 2,
		repeatRowLabels: true,
		colorShadeStep: 0.2
	};

	QUnit.module("ViewFormat");

	QUnit.test("parse acepta texto JSON u objeto y devuelve una copia", function (assert) {
		var oParsed = ViewFormat.parse(JSON.stringify(CONFIG));
		assert.deepEqual(oParsed, CONFIG);
		var oCopy = ViewFormat.parse(CONFIG);
		oCopy.rows.push("X");
		assert.deepEqual(CONFIG.rows, ["Region", "Pais"], "no modifica el original");
		assert.strictEqual(ViewFormat.parse("{no es json"), null);
		assert.strictEqual(ViewFormat.parse("[1,2]"), null, "debe ser un objeto");
		assert.strictEqual(ViewFormat.parse(null), null);
	});

	QUnit.test("sanitize conserva una configuración válida", function (assert) {
		var oResult = ViewFormat.sanitize(CONFIG, null);
		assert.deepEqual(oResult.configuration, CONFIG);
		assert.deepEqual(oResult.droppedFields, []);
	});

	QUnit.test("sanitize descarta tipos incorrectos y valores inseguros", function (assert) {
		var oResult = ViewFormat.sanitize({
			rows: ["Region", 5, "", null],
			columns: "Anio",
			values: [
				{ field: "Importe", aggregationType: "Hack", format: "Html", decimals: 1.5, label: 3 },
				{ field: "*", aggregationType: "Count" },
				{ aggregationType: "Sum" },
				"Importe"
			],
			filters: { Region: "EMEA", Pais: ["España"] },
			colorRules: [{ field: "Anio", color: "red; background:url(x)" }, { field: "Anio", color: "#BBDEFB" }],
			showSubtotals: "true",
			expandLevel: -1,
			colorShadeStep: 3,
			unknownKey: true
		});
		assert.deepEqual(oResult.configuration, {
			rows: ["Region"],
			values: [{ field: "Importe" }, { field: "*", aggregationType: "Count" }],
			filters: { Pais: ["España"] },
			colorRules: [{ field: "Anio", color: "#BBDEFB" }],
			colorShadeStep: 0.45
		});
	});

	QUnit.test("sanitize omite campos que ya no existen", function (assert) {
		var oResult = ViewFormat.sanitize(CONFIG, ["Region", "Anio", "Importe"]);
		assert.deepEqual(oResult.configuration.rows, ["Region"]);
		assert.deepEqual(oResult.configuration.filters, { Region: ["EMEA"] });
		assert.deepEqual(oResult.droppedFields, ["Pais"]);

		oResult = ViewFormat.sanitize({ values: [{ field: "*", aggregationType: "Count" }, { field: "Coste" }] }, ["Region"]);
		assert.deepEqual(oResult.configuration.values, [{ field: "*", aggregationType: "Count" }], "\"*\" siempre es válido");
		assert.deepEqual(oResult.droppedFields, ["Coste"]);
	});

	QUnit.test("sanitize solo incluye las claves presentes", function (assert) {
		assert.deepEqual(ViewFormat.sanitize({ rows: ["A"] }).configuration, { rows: ["A"] });
		assert.deepEqual(ViewFormat.sanitize({ filters: null, colorRules: null }).configuration, { filters: null, colorRules: [] });
		assert.deepEqual(ViewFormat.sanitize(null).configuration, {});
	});

	QUnit.test("migrate mantiene el formato actual", function (assert) {
		assert.strictEqual(ViewFormat.SCHEMA_VERSION, 1);
		assert.deepEqual(ViewFormat.migrate(CONFIG, 1), CONFIG);
	});

	QUnit.test("Entidad OData <-> vista", function (assert) {
		var oEntity = ViewFormat.toEntity("ventas.pivot", { key: "x", name: "Mi vista", "public": 1, configuration: CONFIG });
		assert.deepEqual(oEntity, {
			persistencyKey: "ventas.pivot",
			name: "Mi vista",
			isPublic: true,
			schemaVersion: 1,
			configuration: JSON.stringify(CONFIG)
		});

		var oView = ViewFormat.fromEntity(Object.assign({ ID: "42", createdBy: "ana@empresa.com", isOwner: false }, oEntity));
		assert.deepEqual(oView, {
			key: "42",
			name: "Mi vista",
			"public": true,
			author: "ana@empresa.com",
			editable: false,
			schemaVersion: 1,
			configuration: CONFIG
		});
		assert.strictEqual(ViewFormat.fromEntity({ Clave: 7, name: "B", configuration: "{}" }, "Clave").editable, true,
			"sin isOwner se puede editar; clave configurable");
		assert.strictEqual(ViewFormat.fromEntity({ ID: "1", configuration: "dañado" }), null, "configuración no válida");
		assert.strictEqual(ViewFormat.fromEntity({ configuration: "{}" }), null, "sin clave");
	});

	QUnit.test("createKey genera claves distintas", function (assert) {
		var aKeys = [ViewFormat.createKey(), ViewFormat.createKey(), ViewFormat.createKey()];
		assert.strictEqual(new Set(aKeys).size, 3);
		assert.ok(/^pv[a-z0-9]+$/.test(aKeys[0]));
	});
});
