/*!
 * com.frank.pivot - Base de los almacenes de vistas personales.
 *
 * Guarda todas las vistas de una tabla (persistencyKey) como un único bloque
 * { variants: [vista...], defaultKey }. Las subclases solo implementan _read y _write.
 *
 * Interfaz de un almacén de vistas (la cumplen también ODataV4Store y los almacenes propios):
 *   supportsPublic                 -> boolean: muestra la casilla "Pública"
 *   load(sPersistencyKey)          -> Promise<{variants: object[], defaultKey: string|null}>
 *   save(sPersistencyKey, oView)   -> Promise<object> vista guardada (con key si era nueva)
 *   remove(sPersistencyKey, sKey)  -> Promise
 *   setDefault(sPersistencyKey, sKey|null) -> Promise
 *
 * Módulo sin dependencias de UI5 (probado también en Node.js).
 */
sap.ui.define([
	"./ViewFormat"
], function (ViewFormat) {
	"use strict";

	/**
	 * @param {object} [mSettings] Ajustes
	 * @param {function():string} [mSettings.getAuthor] Nombre del usuario actual
	 */
	function PersonalStore(mSettings) {
		this._fnGetAuthor = (mSettings && mSettings.getAuthor) || function () {
			return "";
		};
		this._pQueue = Promise.resolve();
	}

	/** Las vistas personales solo las ve su autor. */
	PersonalStore.prototype.supportsPublic = false;

	/**
	 * @abstract
	 * @param {string} sPersistencyKey Clave de la tabla
	 * @returns {Promise<object|null>} Bloque guardado
	 */
	PersonalStore.prototype._read = function () {
		return Promise.reject(new Error("PersonalStore#_read no implementado"));
	};

	/**
	 * @abstract
	 * @param {string} sPersistencyKey Clave de la tabla
	 * @param {object} oData Bloque a guardar
	 * @returns {Promise} Se resuelve al guardar
	 */
	PersonalStore.prototype._write = function () {
		return Promise.reject(new Error("PersonalStore#_write no implementado"));
	};

	/**
	 * Ejecuta las operaciones de una en una: cada una lee y reescribe el bloque completo,
	 * así que dos operaciones simultáneas (p. ej. renombrar y borrar en "Gestionar")
	 * perderían cambios.
	 * @param {function():Promise} fnOperation Operación
	 * @returns {Promise} Resultado de la operación
	 * @private
	 */
	PersonalStore.prototype._enqueue = function (fnOperation) {
		var pResult = this._pQueue.then(fnOperation);
		this._pQueue = pResult.catch(function () {});
		return pResult;
	};

	PersonalStore.prototype._readData = function (sPersistencyKey) {
		return this._read(sPersistencyKey).then(function (oData) {
			var aVariants = oData && Array.isArray(oData.variants) ? oData.variants : [];
			return {
				variants: aVariants.filter(function (oView) {
					return oView && oView.key;
				}).map(ViewFormat.normalizeView),
				defaultKey: (oData && oData.defaultKey) || null
			};
		});
	};

	PersonalStore.prototype.load = function (sPersistencyKey) {
		return this._enqueue(this._readData.bind(this, sPersistencyKey));
	};

	PersonalStore.prototype.save = function (sPersistencyKey, oView) {
		var that = this;
		return this._enqueue(function () {
			return that._readData(sPersistencyKey).then(function (oData) {
				var oSaved = ViewFormat.normalizeView(Object.assign({}, oView, {
					key: oView.key || ViewFormat.createKey(),
					"public": false,
					editable: true,
					author: oView.author || that._fnGetAuthor(),
					schemaVersion: ViewFormat.SCHEMA_VERSION
				}));
				var iIndex = oData.variants.findIndex(function (o) {
					return o.key === oSaved.key;
				});
				if (iIndex >= 0) {
					oData.variants[iIndex] = oSaved;
				} else {
					oData.variants.push(oSaved);
				}
				return that._write(sPersistencyKey, oData).then(function () {
					return oSaved;
				});
			});
		});
	};

	PersonalStore.prototype.remove = function (sPersistencyKey, sKey) {
		var that = this;
		return this._enqueue(function () {
			return that._readData(sPersistencyKey).then(function (oData) {
				oData.variants = oData.variants.filter(function (o) {
					return o.key !== sKey;
				});
				if (oData.defaultKey === sKey) {
					oData.defaultKey = null;
				}
				return that._write(sPersistencyKey, oData);
			});
		});
	};

	PersonalStore.prototype.setDefault = function (sPersistencyKey, sKey) {
		var that = this;
		return this._enqueue(function () {
			return that._readData(sPersistencyKey).then(function (oData) {
				oData.defaultKey = sKey || null;
				return that._write(sPersistencyKey, oData);
			});
		});
	};

	return PersonalStore;
});
