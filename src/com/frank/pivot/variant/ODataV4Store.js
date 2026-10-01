/*!
 * com.frank.pivot - Vistas personales y compartidas en un servicio OData V4 (p. ej. CAP).
 *
 * El servicio expone una entidad con las propiedades sugeridas en el README
 * ("Vistas compartidas con CAP"): ID, persistencyKey, name, isPublic, schemaVersion,
 * configuration (texto JSON), createdBy y, opcionalmente, isOwner. Qué vistas ve y puede
 * modificar cada usuario lo decide el servicio con sus permisos.
 *
 * La vista por defecto es una preferencia de cada usuario: se guarda en un almacén
 * personal (defaultStore), no en el servicio.
 */
sap.ui.define([
	"sap/ui/core/Lib",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"./ViewFormat"
], function (Lib, Filter, FilterOperator, Sorter, ViewFormat) {
	"use strict";

	var MAX_VIEWS = 500;
	/**
	 * Grupo propio enviado con submitBatch: con $auto, una creación rechazada por el servicio
	 * queda pendiente de reintento y su promesa no termina nunca.
	 */
	var UPDATE_GROUP = "pivotViews";

	function serviceError() {
		return new Error(Lib.getResourceBundleFor("com.frank.pivot").getText("VARIANT_SERVICE_ERROR"));
	}

	/**
	 * @param {object} mSettings Ajustes
	 * @param {sap.ui.model.odata.v4.ODataModel} mSettings.model Modelo del servicio de vistas
	 * @param {string} mSettings.entitySet Ruta absoluta del EntitySet, p. ej. "/Views"
	 * @param {string} [mSettings.keyProperty="ID"] Propiedad clave de la entidad
	 * @param {object} [mSettings.defaultStore] Almacén personal para la vista por defecto
	 */
	function ODataV4Store(mSettings) {
		this._oModel = mSettings.model;
		this._sEntitySet = mSettings.entitySet;
		this._sKeyProperty = mSettings.keyProperty || "ID";
		this._oDefaultStore = mSettings.defaultStore || null;
		this._mBindings = {};
		this._mContexts = {};
	}

	ODataV4Store.prototype.supportsPublic = true;

	ODataV4Store.prototype._getBinding = function (sPersistencyKey) {
		if (!this._mBindings[sPersistencyKey]) {
			this._mBindings[sPersistencyKey] = this._oModel.bindList(this._sEntitySet, null,
				[new Sorter("name")],
				[new Filter("persistencyKey", FilterOperator.EQ, sPersistencyKey)],
				{ $$updateGroupId: UPDATE_GROUP });
			this._mContexts[sPersistencyKey] = {};
		}
		return this._mBindings[sPersistencyKey];
	};

	ODataV4Store.prototype._toView = function (sPersistencyKey, oContext) {
		var oView = ViewFormat.fromEntity(oContext.getObject(), this._sKeyProperty);
		if (oView) {
			this._mContexts[sPersistencyKey][oView.key] = oContext;
		}
		return oView;
	};

	ODataV4Store.prototype.load = function (sPersistencyKey) {
		var that = this;
		var oBinding = this._getBinding(sPersistencyKey);
		var pContexts = oBinding.getContexts().length ?
			oBinding.requestRefresh().then(function () {
				return oBinding.requestContexts(0, MAX_VIEWS);
			}) :
			oBinding.requestContexts(0, MAX_VIEWS);
		var pDefault = this._oDefaultStore ? this._oDefaultStore.load(sPersistencyKey) : Promise.resolve(null);
		return Promise.all([pContexts, pDefault]).then(function (aResults) {
			that._mContexts[sPersistencyKey] = {};
			return {
				variants: aResults[0].map(function (oContext) {
					return that._toView(sPersistencyKey, oContext);
				}).filter(Boolean),
				defaultKey: (aResults[1] && aResults[1].defaultKey) || null
			};
		});
	};

	ODataV4Store.prototype.save = function (sPersistencyKey, oView) {
		var that = this;
		var oModel = this._oModel;
		var oEntity = ViewFormat.toEntity(sPersistencyKey, oView);
		var oBinding = this._getBinding(sPersistencyKey);
		var oContext = oView.key && this._mContexts[sPersistencyKey][oView.key];

		if (oContext) {
			// Sin bRetry, un PATCH rechazado restaura el valor y rechaza su promesa
			var aPatches = ["name", "isPublic", "schemaVersion", "configuration"].map(function (sProperty) {
				return oContext.setProperty(sProperty, oEntity[sProperty], UPDATE_GROUP);
			});
			return Promise.all(aPatches.concat(oModel.submitBatch(UPDATE_GROUP))).then(function () {
				return that._toView(sPersistencyKey, oContext);
			});
		}
		oContext = oBinding.create(oEntity, true);
		var pCreated = oContext.created();
		return oModel.submitBatch(UPDATE_GROUP).then(function () {
			if (oContext.isTransient()) {
				// El servicio rechazó el POST: se descarta la entidad para no reintentarla
				pCreated.catch(function () {});
				return oContext.delete().then(function () {
					throw serviceError();
				});
			}
			return pCreated;
		}).then(function () {
			return that._toView(sPersistencyKey, oContext);
		});
	};

	ODataV4Store.prototype.remove = function (sPersistencyKey, sKey) {
		var that = this;
		var oContext = this._mContexts[sPersistencyKey] && this._mContexts[sPersistencyKey][sKey];
		if (!oContext) {
			return Promise.reject(new Error("Vista desconocida: " + sKey));
		}
		// Un DELETE rechazado restaura la entidad y rechaza su promesa
		return Promise.all([oContext.delete(UPDATE_GROUP), this._oModel.submitBatch(UPDATE_GROUP)]).then(function () {
			delete that._mContexts[sPersistencyKey][sKey];
		});
	};

	ODataV4Store.prototype.setDefault = function (sPersistencyKey, sKey) {
		return this._oDefaultStore ? this._oDefaultStore.setDefault(sPersistencyKey, sKey) : Promise.resolve();
	};

	return ODataV4Store;
});
