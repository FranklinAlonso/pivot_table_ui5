sap.ui.define(function () {
	"use strict";

	return {
		name: "QUnit - com.frank.pivot",
		defaults: {
			page: "test-resources/com/frank/pivot/qunit/Test.qunit.html?testsuite={suite}&test={name}",
			qunit: { version: 2 },
			sinon: { version: 4 },
			ui5: {
				language: "es",
				libs: ["com.frank.pivot"],
				theme: "sap_horizon"
			},
			coverage: {
				only: ["com/frank/pivot/"],
				never: ["test-resources/com/frank/pivot/"]
			},
			autostart: true
		},
		tests: {
			"engine/PivotEngine": { title: "Motor pivote" },
			"provider/ApplyBuilder": { title: "Generación de $apply" },
			"provider/ODataV4Provider": { title: "Proveedor OData V4" },
			"panel/FieldPanel": { title: "Panel de campos" },
			"table/ColorRules": { title: "Reglas de color" },
			"panel/ColorRulesDialog": { title: "Diálogo de colores" },
			"PivotTable": { title: "Control PivotTable" }
		}
	};
});
