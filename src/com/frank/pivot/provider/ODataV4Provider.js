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
			var that = this;
			var bCalculated = !!oConfig.calculatedFields && Object.keys(oConfig.calculatedFields).length > 0;
			if (!bCalculated) {
				return this._load(oConfig, null);
			}
			// Con campos calculados se leen antes los metadatos: una fórmula que referencia una propiedad
			// inexistente se marca como error (celdas vacías) en lugar de hacer fallar todo el $apply
			return this._requestKnownFields().then(function (aKnownFields) {
				return that._load(aKnownFields ? Object.assign({}, oConfig, { knownFields: aKnownFields }) : oConfig,
					aKnownFields);
			});
		},

		_load: function (oConfig, aKnownFields) {
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
				return {
					records: aRecords,
					preAggregated: true,
					truncated: aRecords.length >= iMax,
					apply: sApply,
					knownFields: aKnownFields
				};
			}).finally(function () {
				oBinding.destroy();
			});
		},

		/**
		 * Propiedades del tipo del EntitySet, o null si no se pueden leer los metadatos.
		 * @returns {Promise<string[]|null>} Nombres de las propiedades
		 * @private
		 */
		_requestKnownFields: function () {
			var oMetaModel = this._oModel && this._oModel.getMetaModel && this._oModel.getMetaModel();
			if (!oMetaModel || !oMetaModel.requestObject || !this._sPath) {
				return Promise.resolve(null);
			}
			return Promise.resolve(oMetaModel.requestObject(this._sPath + "/")).then(function (oType) {
				return oType ? Object.keys(oType).filter(function (sName) {
					return oType[sName] && oType[sName].$kind === "Property";
				}) : null;
			}, function () {
				return null;
			});
		}
	});
});
