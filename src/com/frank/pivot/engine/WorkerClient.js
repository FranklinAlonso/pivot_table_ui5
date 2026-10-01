/*!
 * com.frank.pivot - Ejecuta el motor pivote en un Web Worker con caída a modo síncrono.
 */
sap.ui.define([
	"sap/base/Log",
	"./PivotEngine"
], function (Log, PivotEngine) {
	"use strict";

	var WORKER_URL = sap.ui.require.toUrl("com/frank/pivot/engine/PivotWorker.js");

	function computeSync(aRecords, oConfig) {
		return new Promise(function (fnResolve) {
			fnResolve(PivotEngine.compute(aRecords, oConfig));
		});
	}

	return {
		/**
		 * Calcula el pivote en segundo plano.
		 * @param {object[]} aRecords Registros
		 * @param {object} oConfig Configuración del motor
		 * @returns {Promise<object>} Resultado del motor
		 */
		compute: function (aRecords, oConfig) {
			if (typeof Worker === "undefined") {
				return computeSync(aRecords, oConfig);
			}
			var oWorker;
			try {
				oWorker = new Worker(WORKER_URL);
			} catch (oError) {
				Log.warning("No se pudo crear el Web Worker; se calcula en el hilo principal", oError, "com.frank.pivot");
				return computeSync(aRecords, oConfig);
			}
			return new Promise(function (fnResolve, fnReject) {
				oWorker.onmessage = function (oEvent) {
					oWorker.terminate();
					if (oEvent.data.error) {
						fnReject(new Error(oEvent.data.error));
					} else {
						fnResolve(oEvent.data.result);
					}
				};
				oWorker.onerror = function (oEvent) {
					oEvent.preventDefault();
					oWorker.terminate();
					Log.warning("Error en el Web Worker; se calcula en el hilo principal", oEvent.message, "com.frank.pivot");
					computeSync(aRecords, oConfig).then(fnResolve, fnReject);
				};
				oWorker.postMessage({ records: aRecords, config: oConfig });
			});
		}
	};
});
