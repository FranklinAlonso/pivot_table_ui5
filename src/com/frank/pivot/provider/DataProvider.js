/*!
 * com.frank.pivot - Clase base de los proveedores de datos (patrón estrategia).
 */
sap.ui.define(["sap/ui/base/Object"], function (BaseObject) {
	"use strict";

	/**
	 * Un proveedor entrega al control los registros sobre los que trabaja el motor.
	 *
	 * @abstract
	 * @alias com.frank.pivot.provider.DataProvider
	 */
	return BaseObject.extend("com.frank.pivot.provider.DataProvider", {
		/**
		 * @abstract
		 * @param {object} oConfig Configuración del motor
		 * @returns {Promise<{records: object[], preAggregated: boolean, truncated: boolean}>} Registros
		 */
		load: function (oConfig) {
			return Promise.reject(new Error("DataProvider.load no implementado"));
		}
	});
});
