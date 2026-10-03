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
			"engine/Formula": { title: "Fórmulas" },
			"engine/PivotEngine": { title: "Motor pivote" },
			"engine/CalculatedFields": { title: "Campos calculados" },
			"engine/PreviousValue": { title: "Valor anterior" },
			"provider/ApplyBuilder": { title: "Generación de $apply" },
			"provider/ODataV4Provider": { title: "Proveedor OData V4" },
			"panel/FieldPanel": { title: "Panel de campos" },
			"table/ColorRules": { title: "Reglas de color" },
			"table/TextRules": { title: "Estilos de texto" },
			"export/PivotLayout": { title: "Exportación a Excel" },
			"panel/ColorRulesDialog": { title: "Diálogo de colores" },
			"panel/TextRulesDialog": { title: "Diálogo de estilos de texto" },
			"variant/ViewFormat": { title: "Formato de vistas" },
			"variant/PersonalStore": { title: "Vistas personales" },
			"variant/ODataV4Store": { title: "Vistas en OData V4" },
			"PivotTable": { title: "Control PivotTable" }
		}
	};
});
