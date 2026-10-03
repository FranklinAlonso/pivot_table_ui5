/*!
 * com.frank.pivot.PivotValue
 */
sap.ui.define([
	"sap/ui/core/Element",
	"./library"
], function (Element) {
	"use strict";

	/**
	 * Medida que se agrega en las celdas de la tabla pivote.
	 *
	 * @extends sap.ui.core.Element
	 * @alias com.frank.pivot.PivotValue
	 * @public
	 */
	return Element.extend("com.frank.pivot.PivotValue", {
		metadata: {
			library: "com.frank.pivot",
			properties: {
				/** Campo del registro a agregar. Con <code>Count</code> puede ser "*" (todos los registros). */
				field: { type: "string", defaultValue: "" },
				/** Función de agregación. */
				aggregationType: { type: "com.frank.pivot.AggregationType", defaultValue: "Sum" },
				/** Texto de la cabecera. Por defecto la etiqueta del campo (y la agregación si no es Sum). */
				label: { type: "string", defaultValue: "" },
				/** Formato de presentación. */
				format: { type: "com.frank.pivot.ValueFormat", defaultValue: "Number" },
				/** Decimales. -1 = automático. */
				decimals: { type: "int", defaultValue: -1 },
				/** Código de moneda (formato Currency), p. ej. "EUR". */
				unit: { type: "string", defaultValue: "" },
				/**
				 * Campo con el valor anterior (p. ej. de otra versión), agregado igual que <code>field</code>.
				 * Si difiere del actual, la celda muestra el anterior tachado encima y el actual resaltado.
				 * No se admite en campos calculados Aggregate.
				 */
				previousField: { type: "string", defaultValue: "" }
			}
		}
	});
});
