/*!
 * com.frank.pivot - Gestión de vistas guardadas de PivotTable.
 *
 * Une el selector de vistas (sap.m.VariantManagement) con la tabla y con el almacén
 * de vistas. Uso interno de PivotTable.
 */
sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/core/Lib",
	"sap/base/Log",
	"sap/m/VariantManagement",
	"sap/m/VariantItem",
	"sap/m/MessageToast",
	"sap/m/library",
	"./ViewFormat"
], function (BaseObject, Lib, Log, VariantManagement, VariantItem, MessageToast, mobileLibrary, ViewFormat) {
	"use strict";

	var SharingMode = mobileLibrary.SharingMode;
	var STANDARD_KEY = "__standard";

	function bundle() {
		return Lib.getResourceBundleFor("com.frank.pivot");
	}

	/**
	 * @param {com.frank.pivot.PivotTable} oPivot Tabla
	 * @private
	 */
	var VariantController = BaseObject.extend("com.frank.pivot.variant.VariantController", {
		constructor: function (oPivot) {
			BaseObject.call(this);
			this._oPivot = oPivot;
			this._oStore = null;
			this._sPersistencyKey = "";
			this._oStandard = null;
			this._mViews = {};
			this._oVM = new VariantManagement(oPivot.getId() + "-variants", {
				level: "H3",
				supportFavorites: false,
				supportApplyAutomatically: false,
				supportPublic: false,
				select: this._onSelect.bind(this),
				save: this._onSave.bind(this),
				manage: this._onManage.bind(this)
			});
		},

		destroy: function () {
			this._oVM = null; // lo destruye la barra de herramientas que lo contiene
			BaseObject.prototype.destroy.apply(this, arguments);
		}
	});

	VariantController.STANDARD_KEY = STANDARD_KEY;

	/** @returns {sap.m.VariantManagement} Selector de vistas */
	VariantController.prototype.getControl = function () {
		return this._oVM;
	};

	/**
	 * Carga las vistas del almacén y aplica la vista por defecto del usuario.
	 * La configuración actual de la tabla pasa a ser la vista "Estándar" (solo la primera vez).
	 * @param {object} oStore Almacén de vistas
	 * @param {string} sPersistencyKey Clave de la tabla
	 * @returns {Promise} Se resuelve (también si falla la carga) cuando la tabla tiene su vista inicial
	 */
	VariantController.prototype.activate = function (oStore, sPersistencyKey) {
		var that = this;
		this._oStore = oStore;
		this._sPersistencyKey = sPersistencyKey;
		if (!this._oStandard) {
			this._oStandard = this._oPivot.getConfiguration();
		}
		this._oVM.setSupportPublic(!!oStore.supportsPublic);
		this._oVM.setSelectedKey(STANDARD_KEY);
		this._oVM.setModified(false);
		return this._loadItems().then(function (bLoaded) {
			var sDefault = that._oVM.getDefaultKey();
			if (bLoaded && sDefault !== STANDARD_KEY) {
				that._select(sDefault, false);
			}
		});
	};

	/**
	 * Vuelve a leer las vistas del almacén sin cambiar la configuración de la tabla.
	 * @returns {Promise<boolean>} true si se cargaron
	 * @private
	 */
	VariantController.prototype._loadItems = function () {
		var that = this;
		var oStore = this._oStore;
		this._mViews = {};
		this._oVM.getItems().forEach(function (oItem) {
			if (oItem.getKey() !== STANDARD_KEY) {
				that._oVM.removeItem(oItem);
				oItem.destroy();
			}
		});
		if (!this._oVM.getItemByKey(STANDARD_KEY)) {
			this._oVM.insertItem(new VariantItem({
				key: STANDARD_KEY,
				title: bundle().getText("VARIANT_STANDARD"),
				sharing: SharingMode.Public,
				remove: false,
				rename: false,
				changeable: false
			}), 0);
		}
		this._oVM.setDefaultKey(STANDARD_KEY);

		return oStore.load(this._sPersistencyKey).then(function (oData) {
			if (that._oStore !== oStore || that._oPivot.isDestroyed()) {
				return false; // se cambió de almacén o se destruyó la tabla mientras se cargaba
			}
			(oData && oData.variants || []).forEach(function (oView) {
				that._addView(oView);
			});
			that._oVM.setDefaultKey(oData && that._mViews[oData.defaultKey] ? oData.defaultKey : STANDARD_KEY);
			return true;
		}).catch(function (oError) {
			that._showError("VARIANT_LOAD_ERROR", oError);
			return false;
		});
	};

	/** @returns {object[]} Vistas cargadas (copias) */
	VariantController.prototype.getViews = function () {
		var that = this;
		return Object.keys(this._mViews).map(function (sKey) {
			return ViewFormat.normalizeView(that._mViews[sKey]);
		});
	};

	/** @returns {string} Clave de la vista seleccionada */
	VariantController.prototype.getSelectedKey = function () {
		return this._oVM.getSelectedKey();
	};

	/** La configuración cambió desde el panel: la vista queda modificada (*). */
	VariantController.prototype.markModified = function () {
		this._oVM.setModified(true);
	};

	/**
	 * Aplica una vista guardada (o la estándar) a la tabla.
	 * @param {string} sKey Clave
	 * @returns {boolean} false si la vista no existe
	 */
	VariantController.prototype.select = function (sKey) {
		if (sKey !== STANDARD_KEY && !this._mViews[sKey]) {
			return false;
		}
		this._select(sKey, true);
		return true;
	};

	/**
	 * Guarda la configuración actual como vista nueva o sobre una existente.
	 * @param {object} mOptions Opciones
	 * @param {string} mOptions.name Nombre
	 * @param {string} [mOptions.key] Vista existente a sobrescribir
	 * @param {boolean} [mOptions.public] Compartida (si el almacén lo admite)
	 * @param {boolean} [mOptions.default] Marcar como vista por defecto
	 * @returns {Promise<object>} Vista guardada
	 */
	VariantController.prototype.save = function (mOptions) {
		var that = this;
		var oExisting = mOptions.key && this._mViews[mOptions.key];
		if (mOptions.key && !oExisting) {
			return Promise.reject(new Error("Vista desconocida: " + mOptions.key));
		}
		var oView = Object.assign({}, oExisting, {
			name: mOptions.name || (oExisting && oExisting.name) || "",
			"public": !!this._oStore.supportsPublic && (mOptions["public"] !== undefined ?
				!!mOptions["public"] : !!(oExisting && oExisting["public"])),
			schemaVersion: ViewFormat.SCHEMA_VERSION,
			configuration: this._oPivot.getConfiguration()
		});

		return this._oStore.save(this._sPersistencyKey, oView).then(function (oSaved) {
			if (oExisting && oSaved.key !== oExisting.key) {
				that._removeView(oExisting.key);
			}
			that._addView(oSaved);
			that._oVM.setSelectedKey(oSaved.key);
			that._oVM.setModified(false);
			return mOptions["default"] ? that._setDefault(oSaved.key).then(function () {
				return oSaved;
			}) : oSaved;
		}).then(function (oSaved) {
			that._oPivot.fireVariantSave({
				key: oSaved.key,
				name: oSaved.name,
				"public": oSaved["public"],
				overwrite: !!oExisting
			});
			return ViewFormat.normalizeView(oSaved);
		});
	};

	// ------------------------------------------------------------------ interno

	VariantController.prototype._addView = function (oView) {
		var oItem = this._oVM.getItemByKey(oView.key);
		this._mViews[oView.key] = oView;
		if (!oItem) {
			oItem = new VariantItem({ key: oView.key });
			this._oVM.addItem(oItem);
		}
		oItem.setTitle(oView.name);
		oItem.setAuthor(oView.author || "");
		oItem.setSharing(oView["public"] ? SharingMode.Public : SharingMode.Private);
		oItem.setRemove(oView.editable);
		oItem.setRename(oView.editable);
		oItem.setChangeable(oView.editable);
	};

	VariantController.prototype._removeView = function (sKey) {
		var oItem = this._oVM.getItemByKey(sKey);
		delete this._mViews[sKey];
		if (oItem) {
			this._oVM.removeItem(oItem);
			oItem.destroy();
		}
	};

	VariantController.prototype._setDefault = function (sKey) {
		var that = this;
		return this._oStore.setDefault(this._sPersistencyKey, sKey === STANDARD_KEY ? null : sKey).then(function () {
			that._oVM.setDefaultKey(sKey);
		});
	};

	/** Campos que existen en los datos, o null si no se pueden determinar con certeza. */
	VariantController.prototype._getKnownFields = function () {
		var oPivot = this._oPivot;
		var aFields = oPivot.getFields().map(function (oField) {
			return oField.getName();
		});
		if (oPivot.getMode() === "ODataV4") {
			var oModel = oPivot.getModel(oPivot.getModelName() || undefined);
			var oType = oModel && oModel.getMetaModel && oPivot.getEntitySet() &&
				oModel.getMetaModel().getObject(oPivot.getEntitySet() + "/");
			if (!oType) {
				return null; // metadatos aún no cargados: no se descartan campos
			}
			return aFields.concat(Object.keys(oType).filter(function (sName) {
				return oType[sName] && oType[sName].$kind === "Property";
			}));
		}
		var aRecords = oPivot.getRecords();
		if (!aRecords || !aRecords.length) {
			return null;
		}
		var mSeen = {};
		aRecords.slice(0, 100).forEach(function (oRecord) {
			Object.keys(oRecord || {}).forEach(function (sName) {
				mSeen[sName] = true;
			});
		});
		return aFields.concat(Object.keys(mSeen));
	};

	/**
	 * @param {string} sKey Clave de la vista
	 * @param {boolean} bNotify Disparar variantSelect
	 */
	VariantController.prototype._select = function (sKey, bNotify) {
		var oView = this._mViews[sKey];
		var oConfig = this._oStandard;
		if (oView) {
			var oSanitized = ViewFormat.sanitize(ViewFormat.migrate(oView.configuration, oView.schemaVersion),
				this._getKnownFields());
			// Lo que la vista no guarda (p. ej. opciones añadidas en versiones posteriores) toma el valor estándar
			oConfig = Object.assign({}, this._oStandard, oSanitized.configuration);
			if (oSanitized.droppedFields.length) {
				MessageToast.show(bundle().getText("VARIANT_FIELDS_DROPPED", [oSanitized.droppedFields.join(", ")]));
			}
		}
		this._oPivot.setConfiguration(oConfig);
		this._oVM.setSelectedKey(sKey);
		this._oVM.setModified(false);
		if (bNotify) {
			this._oPivot.fireVariantSelect({
				key: sKey,
				name: oView ? oView.name : bundle().getText("VARIANT_STANDARD"),
				configuration: this._oPivot.getConfiguration()
			});
		}
	};

	VariantController.prototype._showError = function (sTextKey, oError) {
		var sMessage = oError && oError.message || String(oError);
		Log.error("Vistas de la tabla pivote", sMessage, "com.frank.pivot");
		sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
			MessageBox.error(bundle().getText(sTextKey, [sMessage]));
		});
	};

	VariantController.prototype._onSelect = function (oEvent) {
		this._select(oEvent.getParameter("key"), true);
	};

	VariantController.prototype._onSave = function (oEvent) {
		var that = this;
		var bOverwrite = oEvent.getParameter("overwrite");
		this.save({
			name: oEvent.getParameter("name"),
			key: bOverwrite ? oEvent.getParameter("key") : undefined,
			"public": oEvent.getParameter("public"),
			"default": oEvent.getParameter("def")
		}).then(function (oSaved) {
			MessageToast.show(bundle().getText("VARIANT_SAVED", [oSaved.name]));
		}, function (oError) {
			that._showError("VARIANT_SAVE_ERROR", oError);
		});
	};

	VariantController.prototype._onManage = function (oEvent) {
		var that = this;
		var sKey = this._sPersistencyKey;
		var aDeleted = oEvent.getParameter("deleted") || [];
		var aOperations = [];

		(oEvent.getParameter("renamed") || []).forEach(function (oRenamed) {
			var oView = that._mViews[oRenamed.key];
			if (oView && aDeleted.indexOf(oRenamed.key) < 0) {
				aOperations.push(that._oStore.save(sKey, Object.assign({}, oView, { name: oRenamed.name }))
					.then(function (oSaved) {
						that._addView(oSaved);
					}));
			}
		});
		aDeleted.forEach(function (sDeleted) {
			aOperations.push(that._oStore.remove(sKey, sDeleted).then(function () {
				that._removeView(sDeleted);
			}));
		});
		var sDefault = oEvent.getParameter("def");
		if (sDefault !== undefined) {
			aOperations.push(this._setDefault(sDefault));
		}
		if (aDeleted.indexOf(this._oVM.getSelectedKey()) >= 0) {
			this._select(STANDARD_KEY, true);
		}

		Promise.all(aOperations).catch(function (oError) {
			that._showError("VARIANT_SAVE_ERROR", oError);
			// Se recarga desde el almacén para mostrar el estado real
			var sSelected = that._oVM.getSelectedKey();
			that._loadItems().then(function () {
				if (that._mViews[sSelected]) {
					that._oVM.setSelectedKey(sSelected);
				} else if (sSelected !== STANDARD_KEY) {
					that._select(STANDARD_KEY, true);
				}
			});
		});
	};

	return VariantController;
});
