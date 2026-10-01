/*!
 * com.frank.pivot - Proveedor OData V4: delega la agregación en el backend con $apply.
 */
sap.ui.define([
	"./DataProvider",
	"./ApplyBuilder"
], function (DataProvider, ApplyBuilder) {
	"use strict";

	/**
	 * @alias com.frank.pivot.provider.ODataV4Provider
	 * @param {object} mSettings
	 * @param {sap.ui.model.odata.v4.ODataModel} mSettings.model Modelo OData V4
	 * @param {string} mSettings.path Ruta absoluta del EntitySet (p. ej. "/Ventas")
	 * @param {int} [mSettings.maxRecords=50000] Máximo de grupos a leer
	 */
	return DataProvider.extend("com.frank.pivot.provider.ODataV4Provider", {
		constructor: function (mSettings) {
			DataProvider.apply(this);
			this._oModel = mSettings.model;
			this._sPath = mSettings.path;
			this._iMaxRecords = mSettings.maxRecords > 0 ? mSettings.maxRecords : 50000;
		},

		load: function (oConfig) {
			var sApply;
			try {
				sApply = ApplyBuilder.build(oConfig);
			} catch (oError) {
				return Promise.reject(oError);
			}
			if (!this._oModel || !this._sPath) {
				return Promise.reject(new Error("ODataV4Provider: falta el modelo o la ruta del EntitySet"));
			}
			var mParameters = sApply ? { $apply: sApply } : {};
			var oBinding = this._oModel.bindList(this._sPath, undefined, undefined, undefined, mParameters);
			var iMax = this._iMaxRecords;
			return oBinding.requestContexts(0, iMax).then(function (aContexts) {
				var aRecords = aContexts.map(function (oContext) {
					return oContext.getObject();
				});
				return { records: aRecords, preAggregated: true, truncated: aRecords.length >= iMax, apply: sApply };
			}).finally(function () {
				oBinding.destroy();
			});
		}
	});
});
