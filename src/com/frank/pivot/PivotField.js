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
				measure: { type: "boolean", defaultValue: false },
				/**
				 * Fórmula de un campo calculado, p. ej. <code>"{Utilidad} / {Ventas}"</code>. Las referencias
				 * <code>{campo}</code> son nombres de otros campos (de los registros o calculados). Vacío = campo normal.
				 * Sintaxis: + - * /, paréntesis, SI(c; a; b), MIN, MAX, ABS, REDONDEAR(v; d); ";" separa argumentos.
				 */
				formula: { type: "string", defaultValue: "" },
				/** Nivel de cálculo de la fórmula (ver README, "Campos calculados"). */
				calculationLevel: { type: "com.frank.pivot.CalculationLevel", defaultValue: "Aggregate" }
			}
		},

		/**
		 * Una fórmula indicada como texto en los settings se toma literalmente: sin esto, UI5 interpretaría
		 * "{Ventas} / {Costo}" como un binding. Para enlazarla a un modelo use la forma objeto,
		 * p. ej. <code>formula: {path: "modelo>formula"}</code> (en XML: <code>formula="{modelo>formula}"</code>).
		 * @override
		 */
		applySettings: function (mSettings, oScope) {
			if (mSettings && typeof mSettings.formula === "string") {
				// Las llaves escapadas (\{ \}), necesarias en XML, se aceptan igual que en un binding
				var sFormula = mSettings.formula.replace(/\\([\\{}])/g, "$1");
				mSettings = Object.assign({}, mSettings);
				delete mSettings.formula;
				Element.prototype.applySettings.call(this, mSettings, oScope);
				return this.setFormula(sFormula);
			}
			return Element.prototype.applySettings.apply(this, arguments);
		}
	});
});
