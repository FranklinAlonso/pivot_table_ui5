/*!
 * com.frank.pivot - Web Worker del motor pivote.
 *
 * Carga Aggregations.js y PivotEngine.js (módulos AMD sin dependencias de UI5)
 * con un sap.ui.define mínimo y calcula el pivote fuera del hilo principal.
 * No es un módulo UI5: se excluye de library-preload (ver ui5.yaml).
 */
/* global importScripts */
(function () {
	"use strict";

	var mModules = {};
	var sCurrent;

	self.sap = {
		ui: {
			define: function (aDeps, fnFactory) {
				if (typeof aDeps === "function") {
					fnFactory = aDeps;
					aDeps = [];
				}
				mModules[sCurrent] = fnFactory.apply(null, aDeps.map(function (sDep) {
					return mModules[sDep.split("/").pop()];
				}));
			}
		}
	};

	function load(sName) {
		sCurrent = sName;
		importScripts(sName + ".js");
	}

	load("Aggregations");
	load("PivotEngine");

	self.onmessage = function (oEvent) {
		try {
			self.postMessage({ result: mModules.PivotEngine.compute(oEvent.data.records, oEvent.data.config) });
		} catch (oError) {
			self.postMessage({ error: oError.message });
		}
	};
})();
