/*!
 * com.frank.pivot - Tabla pivote para SAPUI5 / SAP Fiori.
 */
sap.ui.define([
	"sap/ui/core/Lib",
	"sap/ui/base/DataType",
	"sap/ui/dom/includeStylesheet",
	"sap/ui/core/library",
	"sap/m/library",
	"sap/ui/table/library"
], function (Lib, DataType, includeStylesheet) {
	"use strict";

	/**
	 * Librería de tabla pivote.
	 *
	 * @namespace
	 * @alias com.frank.pivot
	 * @public
	 */
	var thisLib = Lib.init({
		apiVersion: 2,
		name: "com.frank.pivot",
		version: "${version}",
		dependencies: ["sap.ui.core", "sap.m", "sap.ui.table"],
		types: [
			"com.frank.pivot.AggregationType",
			"com.frank.pivot.ValueFormat",
			"com.frank.pivot.DataMode",
			"com.frank.pivot.CalculationLevel"
		],
		controls: ["com.frank.pivot.PivotTable"],
		elements: ["com.frank.pivot.PivotValue", "com.frank.pivot.PivotField"],
		// Los estilos usan las variables CSS del tema activo (Horizon, Quartz, alto contraste...)
		noLibraryCSS: true
	});

	/**
	 * Función de agregación de un valor.
	 * @enum {string}
	 * @public
	 */
	thisLib.AggregationType = {
		Sum: "Sum",
		Count: "Count",
		CountDistinct: "CountDistinct",
		Average: "Average",
		Min: "Min",
		Max: "Max",
		/**
		 * Fórmula de un campo calculado con <code>calculationLevel</code> Aggregate: se suman los
		 * operandos en cada celda, subtotal o total y después se aplica la fórmula.
		 */
		Formula: "Formula"
	};

	/**
	 * Formato de presentación de un valor.
	 * @enum {string}
	 * @public
	 */
	thisLib.ValueFormat = {
		Number: "Number",
		Integer: "Integer",
		Currency: "Currency",
		Percent: "Percent"
	};

	/**
	 * Origen de los datos.
	 * @enum {string}
	 * @public
	 */
	thisLib.DataMode = {
		/** Registros en memoria (propiedad <code>records</code>); agregación en el navegador. */
		Client: "Client",
		/** EntitySet OData V4; agregación en el backend con <code>$apply</code>. */
		ODataV4: "ODataV4"
	};

	/**
	 * Nivel al que se calcula la fórmula de un campo calculado (<code>PivotField#formula</code>).
	 * @enum {string}
	 * @public
	 */
	thisLib.CalculationLevel = {
		/**
		 * Se suman los operandos dentro de cada celda, subtotal o total y después se aplica la fórmula
		 * (p. ej. Margen = Sum(Utilidad) / Sum(Ventas)). Sus valores usan siempre la agregación Formula.
		 */
		Aggregate: "Aggregate",
		/** Se calcula en cada registro antes de agrupar; después admite cualquier agregación. */
		Record: "Record"
	};

	DataType.registerEnum("com.frank.pivot.AggregationType", thisLib.AggregationType);
	DataType.registerEnum("com.frank.pivot.CalculationLevel", thisLib.CalculationLevel);
	DataType.registerEnum("com.frank.pivot.ValueFormat", thisLib.ValueFormat);
	DataType.registerEnum("com.frank.pivot.DataMode", thisLib.DataMode);

	includeStylesheet(sap.ui.require.toUrl("com/frank/pivot/css/PivotTable.css"), "com-frank-pivot-css");

	return thisLib;
});
