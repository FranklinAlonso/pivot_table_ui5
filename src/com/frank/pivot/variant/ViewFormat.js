/*!
 * com.frank.pivot - Formato de las vistas guardadas (variantes).
 *
 * Una vista es un objeto { key, name, public, author, editable, schemaVersion, configuration }
 * donde configuration es lo que devuelve PivotTable#getConfiguration(). Este módulo:
 *   - adapta configuraciones guardadas con versiones anteriores (migrate),
 *   - limpia configuraciones que no son de confianza (sanitize): vistas compartidas por
 *     otros usuarios o datos editados a mano en el backend,
 *   - convierte vistas a/desde la entidad OData sugerida en el README (toEntity/fromEntity).
 *
 * Módulo sin dependencias de UI5 (probado también en Node.js).
 */
sap.ui.define([
	"../table/ColorRules",
	"../table/TextRules"
], function (ColorRules, TextRules) {
	"use strict";

	/** Versión del formato de "configuration". Incrementar al cambiarlo y añadir el paso en migrate(). */
	var SCHEMA_VERSION = 1;

	// Copias de los enums de library.js (este módulo no puede depender de UI5)
	var AGGREGATION_TYPES = ["Sum", "Count", "CountDistinct", "Average", "Min", "Max", "Formula"];
	var VALUE_FORMATS = ["Number", "Integer", "Currency", "Percent"];
	var BOOLEAN_KEYS = ["showSubtotals", "showGrandTotals", "hierarchical", "repeatRowLabels"];
	var MAX_SHADE_STEP = 0.45;

	function isPlainObject(v) {
		return v !== null && typeof v === "object" && !Array.isArray(v);
	}

	/**
	 * Convierte la configuración guardada (texto JSON u objeto) en un objeto nuevo.
	 * @param {string|object} vConfiguration Configuración
	 * @returns {object|null} Copia de la configuración o null si no es válida
	 */
	function parse(vConfiguration) {
		try {
			var oConfig = typeof vConfiguration === "string" ? JSON.parse(vConfiguration) :
				JSON.parse(JSON.stringify(vConfiguration));
			return isPlainObject(oConfig) ? oConfig : null;
		} catch (oError) {
			return null;
		}
	}

	/**
	 * Adapta una configuración guardada con una versión anterior del formato.
	 * @param {object} oConfig Configuración
	 * @param {int} [iVersion=1] Versión con la que se guardó
	 * @returns {object} Configuración en el formato actual
	 */
	function migrate(oConfig, iVersion) { // eslint-disable-line no-unused-vars
		// Cada cambio de formato añade un paso, p. ej.: if ((iVersion || 1) < 2) { oConfig = ...; }
		// Las versiones posteriores a SCHEMA_VERSION se intentan aplicar tal cual (sanitize las limpia).
		return oConfig;
	}

	/**
	 * Valida una configuración de origen no fiable. Descarta claves desconocidas, tipos incorrectos,
	 * colores inseguros y, si se indican los campos existentes, las referencias a campos que ya no existen.
	 * Solo incluye las claves presentes en la entrada (como setConfiguration, admite configuraciones parciales).
	 * @param {object} oConfig Configuración
	 * @param {string[]|null} [aKnownFields] Campos existentes; null = no comprobar campos
	 * @returns {{configuration: object, droppedFields: string[]}} Configuración limpia y campos descartados
	 */
	function sanitize(oConfig, aKnownFields) {
		var oIn = isPlainObject(oConfig) ? oConfig : {};
		var oOut = {};
		var mKnown = null;
		var aDropped = [];

		if (Array.isArray(aKnownFields) && aKnownFields.length) {
			mKnown = {};
			aKnownFields.forEach(function (sName) {
				mKnown[sName] = true;
			});
		}

		function isField(vName, bAllowAll) {
			if (typeof vName !== "string" || !vName) {
				return false;
			}
			if (!mKnown || mKnown[vName] || (bAllowAll && vName === "*")) {
				return true;
			}
			if (aDropped.indexOf(vName) < 0) {
				aDropped.push(vName);
			}
			return false;
		}

		["rows", "columns"].forEach(function (sKey) {
			if (Array.isArray(oIn[sKey])) {
				oOut[sKey] = oIn[sKey].filter(function (sName) {
					return isField(sName);
				});
			}
		});

		if (Array.isArray(oIn.values)) {
			oOut.values = oIn.values.filter(function (oValue) {
				return isPlainObject(oValue) && isField(oValue.field, true);
			}).map(function (oValue) {
				var oClean = { field: oValue.field };
				if (AGGREGATION_TYPES.indexOf(oValue.aggregationType) >= 0) {
					oClean.aggregationType = oValue.aggregationType;
				}
				if (VALUE_FORMATS.indexOf(oValue.format) >= 0) {
					oClean.format = oValue.format;
				}
				if (Number.isInteger(oValue.decimals) && oValue.decimals >= -1) {
					oClean.decimals = oValue.decimals;
				}
				["label", "unit"].forEach(function (sKey) {
					if (typeof oValue[sKey] === "string") {
						oClean[sKey] = oValue[sKey];
					}
				});
				// Valor anterior: se conserva vacío ("" = sin él); un campo que ya no existe se descarta
				if (typeof oValue.previousField === "string" && (!oValue.previousField || isField(oValue.previousField))) {
					oClean.previousField = oValue.previousField;
				}
				return oClean;
			});
		}

		if (oIn.filters === null) {
			oOut.filters = null;
		} else if (isPlainObject(oIn.filters)) {
			oOut.filters = {};
			Object.keys(oIn.filters).forEach(function (sName) {
				if (Array.isArray(oIn.filters[sName]) && isField(sName)) {
					oOut.filters[sName] = oIn.filters[sName].slice();
				}
			});
		}

		if (oIn.colorRules === null || Array.isArray(oIn.colorRules)) {
			oOut.colorRules = ColorRules.normalize(oIn.colorRules).filter(function (oRule) {
				return isField(oRule.field);
			});
		}

		if (oIn.textRules === null || Array.isArray(oIn.textRules)) {
			oOut.textRules = TextRules.normalize(oIn.textRules).filter(function (oRule) {
				return oRule.scope === "cell" ? !oRule.valueField || isField(oRule.valueField) : isField(oRule.field);
			});
		}

		BOOLEAN_KEYS.forEach(function (sKey) {
			if (typeof oIn[sKey] === "boolean") {
				oOut[sKey] = oIn[sKey];
			}
		});
		if (Number.isInteger(oIn.expandLevel) && oIn.expandLevel >= 0) {
			oOut.expandLevel = oIn.expandLevel;
		}
		if (typeof oIn.colorShadeStep === "number" && isFinite(oIn.colorShadeStep)) {
			oOut.colorShadeStep = Math.min(Math.max(oIn.colorShadeStep, 0), MAX_SHADE_STEP);
		}

		return { configuration: oOut, droppedFields: aDropped };
	}

	/**
	 * Clave nueva para una vista guardada en el navegador o en el Launchpad.
	 * @returns {string} Clave única
	 */
	function createKey() {
		return "pv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
	}

	/**
	 * Copia una vista conservando solo las propiedades conocidas.
	 * @param {object} oView Vista
	 * @returns {object} Vista normalizada
	 */
	function normalizeView(oView) {
		return {
			key: String(oView.key),
			name: String(oView.name || ""),
			"public": !!oView["public"],
			author: oView.author ? String(oView.author) : "",
			editable: oView.editable !== false,
			schemaVersion: oView.schemaVersion || SCHEMA_VERSION,
			configuration: parse(oView.configuration) || {}
		};
	}

	/**
	 * Vista -> datos de la entidad OData (ver README, "Vistas compartidas con CAP").
	 * @param {string} sPersistencyKey Clave de la tabla
	 * @param {object} oView Vista
	 * @returns {object} { persistencyKey, name, isPublic, schemaVersion, configuration (texto JSON) }
	 */
	function toEntity(sPersistencyKey, oView) {
		return {
			persistencyKey: sPersistencyKey,
			name: String(oView.name || ""),
			isPublic: !!oView["public"],
			schemaVersion: SCHEMA_VERSION,
			configuration: JSON.stringify(oView.configuration || {})
		};
	}

	/**
	 * Datos de la entidad OData -> vista.
	 * @param {object} oEntity Entidad leída del servicio
	 * @param {string} [sKeyProperty="ID"] Propiedad clave
	 * @returns {object|null} Vista, o null si la configuración guardada no es JSON válido
	 */
	function fromEntity(oEntity, sKeyProperty) {
		var vKey = oEntity && oEntity[sKeyProperty || "ID"];
		var oConfig = oEntity && parse(oEntity.configuration);
		if (vKey === undefined || vKey === null || !oConfig) {
			return null;
		}
		return normalizeView({
			key: vKey,
			name: oEntity.name,
			"public": oEntity.isPublic,
			author: oEntity.createdBy,
			// isOwner es opcional: si el servicio no lo expone, el backend decide al guardar
			editable: oEntity.isOwner !== false,
			schemaVersion: oEntity.schemaVersion,
			configuration: oConfig
		});
	}

	return {
		SCHEMA_VERSION: SCHEMA_VERSION,
		parse: parse,
		migrate: migrate,
		sanitize: sanitize,
		createKey: createKey,
		normalizeView: normalizeView,
		toEntity: toEntity,
		fromEntity: fromEntity
	};
});
