/*!
 * com.frank.pivot.PivotField
 */
sap.ui.define([
	"sap/ui/core/Element",
	"sap/ui/core/library",
	"./library"
], function (Element) {
	"use strict";

	/**
	 * Metadatos de un campo disponible: etiqueta y orden. También define la lista de
	 * campos que ofrece el panel de configuración.
	 *
	 * @extends sap.ui.core.Element
	 * @alias com.frank.pivot.PivotField
	 * @public
	 */
	return Element.extend("com.frank.pivot.PivotField", {
		metadata: {
			library: "com.frank.pivot",
			properties: {
				/** Nombre técnico del campo. */
				name: { type: "string", defaultValue: "" },
				/** Etiqueta visible. */
				label: { type: "string", defaultValue: "" },
				/** Orden de los valores cuando el campo es una dimensión. None = orden de aparición. */
				sortOrder: { type: "sap.ui.core.SortOrder", defaultValue: "Ascending" },
				/** Si el campo puede usarse como valor (medida) en el panel. */
				measure: { type: "boolean", defaultValue: false }
			}
		}
	});
});
