/*!
 * com.frank.pivot - Vistas personales en el servicio de personalización del Launchpad.
 *
 * En SAP Build Work Zone (y en el Fiori Launchpad ABAP) las vistas se guardan por usuario
 * en el backend del Launchpad: están disponibles en cualquier dispositivo y no requieren
 * desarrollo en el servidor. Usa PersonalizationV2 y, si no existe, Personalization.
 */
sap.ui.define([
	"./PersonalStore"
], function (PersonalStore) {
	"use strict";

	var ITEM_KEY = "views";
	var CONTAINER_PREFIX = "pv.";
	var MAX_CONTAINER_KEY = 40; // límite del servicio de personalización
	var SCOPE = { keyCategory: "FIXED_KEY", writeFrequency: "LOW", clientStorageAllowed: false };

	/** Clave de contenedor de 40 caracteres como máximo. */
	function containerKey(sPersistencyKey) {
		var sKey = CONTAINER_PREFIX + sPersistencyKey;
		if (sKey.length <= MAX_CONTAINER_KEY) {
			return sKey;
		}
		var iHash = 0;
		for (var i = 0; i < sPersistencyKey.length; i++) {
			iHash = (Math.imul(iHash, 31) + sPersistencyKey.charCodeAt(i)) | 0;
		}
		var sHash = (iHash >>> 0).toString(36);
		return sKey.slice(0, MAX_CONTAINER_KEY - sHash.length - 1) + "~" + sHash;
	}

	/**
	 * @param {object} [mSettings] Ajustes
	 * @param {object} [mSettings.container] sap/ushell/Container (por defecto, el ya cargado)
	 * @param {sap.ui.core.Component} [mSettings.component] Componente de la app
	 */
	function UshellPersonalizationStore(mSettings) {
		var that = this;
		PersonalStore.call(this, {
			getAuthor: function () {
				var oUser = that._oContainer && that._oContainer.getUser && that._oContainer.getUser();
				return oUser && oUser.getFullName ? oUser.getFullName() : "";
			}
		});
		this._oContainer = (mSettings && mSettings.container) || UshellPersonalizationStore.getContainer();
		this._oComponent = mSettings && mSettings.component;
		this._mContainers = {};
	}

	UshellPersonalizationStore.prototype = Object.create(PersonalStore.prototype);
	UshellPersonalizationStore.prototype.constructor = UshellPersonalizationStore;

	/**
	 * Contenedor del Launchpad si la app se ejecuta dentro de él.
	 * @returns {object|undefined} sap/ushell/Container
	 */
	UshellPersonalizationStore.getContainer = function () {
		// Consulta síncrona: solo devuelve el módulo si el Launchpad ya lo cargó
		var oContainer = sap.ui.require("sap/ushell/Container");
		return oContainer && oContainer.getServiceAsync ? oContainer : undefined;
	};

	/** @returns {boolean} true si hay Launchpad */
	UshellPersonalizationStore.isAvailable = function () {
		return !!UshellPersonalizationStore.getContainer();
	};

	UshellPersonalizationStore.prototype._getPersonalizationContainer = function (sPersistencyKey) {
		var that = this;
		var sKey = containerKey(sPersistencyKey);
		if (!this._mContainers[sKey]) {
			this._mContainers[sKey] = this._oContainer.getServiceAsync("PersonalizationV2").catch(function () {
				return that._oContainer.getServiceAsync("Personalization");
			}).then(function (oService) {
				// Personalization (V1) devuelve una promesa jQuery: Promise.resolve la adopta
				return Promise.resolve(oService.getContainer(sKey, SCOPE, that._oComponent));
			});
			this._mContainers[sKey].catch(function () {
				delete that._mContainers[sKey]; // reintentar en la próxima llamada
			});
		}
		return this._mContainers[sKey];
	};

	UshellPersonalizationStore.prototype._read = function (sPersistencyKey) {
		return this._getPersonalizationContainer(sPersistencyKey).then(function (oContainer) {
			return oContainer.getItemValue(ITEM_KEY) || null;
		});
	};

	UshellPersonalizationStore.prototype._write = function (sPersistencyKey, oData) {
		return this._getPersonalizationContainer(sPersistencyKey).then(function (oContainer) {
			oContainer.setItemValue(ITEM_KEY, oData);
			return Promise.resolve(oContainer.save());
		});
	};

	UshellPersonalizationStore._containerKey = containerKey;

	return UshellPersonalizationStore;
});
