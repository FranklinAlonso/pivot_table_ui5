/*!
 * com.frank.pivot - Vistas personales en el almacenamiento del navegador.
 *
 * Pensado para desarrollo local y pruebas fuera del Launchpad: las vistas solo existen
 * en ese navegador y se pierden al borrar los datos del sitio.
 */
sap.ui.define([
	"./PersonalStore"
], function (PersonalStore) {
	"use strict";

	var PREFIX = "com.frank.pivot.views.";

	/**
	 * @param {object} [mSettings] Ajustes
	 * @param {Storage} [mSettings.storage=window.localStorage] Almacenamiento (inyectable en pruebas)
	 * @param {function():string} [mSettings.getAuthor] Nombre del usuario actual
	 */
	function LocalStorageStore(mSettings) {
		PersonalStore.call(this, mSettings);
		this._oStorage = (mSettings && mSettings.storage) || null;
	}

	LocalStorageStore.prototype = Object.create(PersonalStore.prototype);
	LocalStorageStore.prototype.constructor = LocalStorageStore;

	LocalStorageStore.prototype._getStorage = function () {
		// window.localStorage puede lanzar una excepción (navegación privada, datos del sitio bloqueados)
		return this._oStorage || globalThis.localStorage;
	};

	LocalStorageStore.prototype._read = function (sPersistencyKey) {
		var that = this;
		return new Promise(function (fnResolve) {
			var sValue = that._getStorage().getItem(PREFIX + sPersistencyKey);
			try {
				fnResolve(sValue ? JSON.parse(sValue) : null);
			} catch (oError) {
				fnResolve(null); // contenido dañado: se empieza de cero en lugar de bloquear el guardado
			}
		});
	};

	LocalStorageStore.prototype._write = function (sPersistencyKey, oData) {
		var that = this;
		return new Promise(function (fnResolve) {
			that._getStorage().setItem(PREFIX + sPersistencyKey, JSON.stringify(oData));
			fnResolve();
		});
	};

	return LocalStorageStore;
});
