/*!
 * com.frank.pivot - Reglas de color de celdas.
 *
 * Una regla asigna un color a un campo de dimensión, a todos sus valores o a uno concreto:
 *   { field: "Anio", color: "#BBDEFB" }                 -> todas las columnas/filas con Año
 *   { field: "Region", value: "EMEA", color: "#FFCDD2" } -> solo las de EMEA
 *
 * Si el campo es una dimensión de columna se pintan esas columnas (celdas y cabecera);
 * si es una dimensión de fila, esas filas. Prioridad: valor concreto > campo completo >
 * orden de definición; y el color de columna prevalece sobre el de fila.
 *
 * Módulo sin dependencias de UI5 (probado también en Node.js).
 */
sap.ui.define([], function () {
	"use strict";

	/** Paleta por defecto: tonos claros que mantienen legible el texto oscuro. */
	var PALETTE = [
		"#FFF3B0", "#FFE0B2", "#FFCDD2", "#F8BBD0", "#E1BEE7",
		"#D1C4E9", "#C5CAE9", "#BBDEFB", "#B2EBF2", "#B2DFDB",
		"#C8E6C9", "#DCEDC8", "#F0F4C3", "#D7CCC8", "#CFD8DC"
	];

	var COLOR_PATTERN = /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]{3,30})$/i;

	/**
	 * @param {string} sColor Color CSS
	 * @returns {string|null} El color si es seguro de insertar en CSS; si no, null
	 */
	function sanitizeColor(sColor) {
		var s = String(sColor || "").trim();
		return COLOR_PATTERN.test(s) ? s : null;
	}

	function hasValue(oRule) {
		return oRule.value !== undefined && oRule.value !== null;
	}

	/**
	 * Descarta reglas incompletas o con colores no válidos.
	 * @param {object[]} aRules Reglas
	 * @returns {object[]} Reglas normalizadas ({field, value?, color})
	 */
	function normalize(aRules) {
		return (Array.isArray(aRules) ? aRules : []).map(function (oRule) {
			if (!oRule || !oRule.field || !sanitizeColor(oRule.color)) {
				return null;
			}
			var oNormalized = { field: String(oRule.field), color: sanitizeColor(oRule.color) };
			if (hasValue(oRule)) {
				oNormalized.value = oRule.value;
			}
			return oNormalized;
		}).filter(Boolean);
	}

	function sameValue(a, b) {
		if (a instanceof Date || b instanceof Date) {
			return new Date(a).getTime() === new Date(b).getTime();
		}
		return String(a) === String(b);
	}

	/**
	 * Mejor regla para una ruta de claves de dimensión.
	 * @param {object[]} aRules Reglas normalizadas
	 * @param {string[]} aDimensions Nombres de las dimensiones (en orden)
	 * @param {any[]} aKeys Valores de la ruta (puede ser más corta: subtotales)
	 * @returns {int} Índice de la regla o -1
	 */
	function match(aRules, aDimensions, aKeys) {
		var iBest = -1;
		var iBestScore = 0;
		aRules.forEach(function (oRule, i) {
			var iDim = aDimensions.indexOf(oRule.field);
			if (iDim < 0 || iDim >= aKeys.length) {
				return;
			}
			var bSpecific = hasValue(oRule);
			if (bSpecific && !sameValue(aKeys[iDim], oRule.value)) {
				return;
			}
			var iScore = bSpecific ? 2 : 1;
			if (iScore > iBestScore) {
				iBest = i;
				iBestScore = iScore;
			}
		});
		return iBest;
	}

	/**
	 * Crea el resolutor de colores para un resultado del motor.
	 * @param {object} oResult Resultado de PivotEngine.compute
	 * @param {object[]} aRules Reglas
	 * @returns {object|null} {rules, column(leaf), row(rowKeys), columnHeader(leaf, level)} o null si no hay reglas
	 */
	function createResolver(oResult, aRules) {
		var aNormalized = normalize(aRules);
		if (!aNormalized.length) {
			return null;
		}
		var aColumnDims = oResult.columnDimensions.map(function (d) {
			return d.name;
		});
		var aRowDims = oResult.rowDimensions.map(function (d) {
			return d.name;
		});
		return {
			rules: aNormalized,
			/** Regla de una columna de valor (-1 si ninguna). */
			column: function (oLeaf) {
				return match(aNormalized, aColumnDims, oLeaf.columnKeys || []);
			},
			/** Regla de una fila según sus claves (-1 si ninguna). */
			row: function (aRowKeys) {
				return match(aNormalized, aRowDims, aRowKeys || []);
			},
			/**
			 * Regla de la etiqueta de cabecera de nivel iLevel de una columna: solo cuentan las
			 * dimensiones hasta ese nivel (así "2024" toma el color de Año aunque su primera
			 * columna, T1, tenga una regla propia). Niveles por debajo de las dimensiones
			 * (etiqueta del valor) usan la regla de la columna completa.
			 */
			columnHeader: function (oLeaf, iLevel) {
				if (oLeaf.type === "total") {
					return -1;
				}
				var aKeys = oLeaf.columnKeys || [];
				return iLevel >= aColumnDims.length ?
					match(aNormalized, aColumnDims, aKeys) :
					match(aNormalized, aColumnDims.slice(0, iLevel + 1), aKeys.slice(0, iLevel + 1));
			}
		};
	}

	/**
	 * Niveles de tono: 0 = celda de detalle, 1 = subtotal (filas/columnas de subtotal y
	 * grupos del árbol), 2 = total general.
	 */
	var LEVELS = { data: 0, subtotal: 1, group: 1, total: 2 };

	/**
	 * Nivel de tono de un tipo de fila (__type) o de columna (leaf.type).
	 * @param {string} sType Tipo
	 * @returns {int} 0, 1 o 2
	 */
	function levelOf(sType) {
		return LEVELS[sType] || 0;
	}

	/**
	 * Nivel de tono de una fila. En la vista jerárquica todos los nodos con hijos son "group"
	 * (aunque estén contraídos); para que el tono siga destacando, solo los grupos del
	 * primer nivel usan el tono de subtotal.
	 * @param {string} sType __type de la fila
	 * @param {int} iLevel __level de la fila
	 * @returns {int} 0, 1 o 2
	 */
	function rowLevelOf(sType, iLevel) {
		return sType === "group" && iLevel > 0 ? 0 : levelOf(sType);
	}

	/**
	 * Token que identifica regla y tono en el atributo data-pivot-color: "c3", "c3-1", "c3-2" o "none".
	 * @param {int} iRule Índice de la regla (-1 = ninguna)
	 * @param {int} [iLevel=0] Nivel de tono
	 * @returns {string} Token
	 */
	function token(iRule, iLevel) {
		if (iRule < 0) {
			return "none";
		}
		return "c" + iRule + (iLevel > 0 ? "-" + iLevel : "");
	}

	function parseRgb(sColor) {
		var s = sColor.trim();
		var m = /^#([0-9a-f]{3,8})$/i.exec(s);
		if (m) {
			var h = m[1];
			if (h.length <= 4) {
				h = h.split("").map(function (c) {
					return c + c;
				}).join("");
			}
			return [0, 2, 4].map(function (i) {
				return parseInt(h.substr(i, 2), 16);
			});
		}
		m = /^rgba?\(([^)]+)\)$/i.exec(s);
		if (m) {
			return m[1].split(",").slice(0, 3).map(function (p) {
				p = p.trim();
				return /%$/.test(p) ? parseFloat(p) * 2.55 : parseFloat(p);
			});
		}
		return null;
	}

	function luminance(aRgb) {
		var aLinear = aRgb.map(function (c) {
			var v = c / 255;
			return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * aLinear[0] + 0.7152 * aLinear[1] + 0.0722 * aLinear[2];
	}

	/**
	 * Color de texto legible sobre un fondo (contraste por luminancia relativa).
	 * @param {string} sBackground Color de fondo
	 * @returns {string|null} Color de texto, o null si no se puede calcular
	 */
	function textColor(sBackground) {
		var aRgb = parseRgb(sBackground);
		if (!aRgb) {
			return null;
		}
		return luminance(aRgb) > 0.179 ? "#1d2d3e" : "#ffffff";
	}

	function toHex(aRgb) {
		return "#" + aRgb.map(function (c) {
			return ("0" + Math.round(Math.max(0, Math.min(255, c))).toString(16)).slice(-2);
		}).join("");
	}

	/**
	 * Variante de tono de un color para subtotales (nivel 1) y totales (nivel 2).
	 * Los colores claros se oscurecen y los oscuros se aclaran, para que la diferencia
	 * se vea siempre. Nombres de color CSS: se usa color-mix().
	 * @param {string} sColor Color base
	 * @param {int} iLevel Nivel de tono (0 = el propio color)
	 * @param {float} [fStep=0.15] Intensidad por nivel (0 = sin variación)
	 * @returns {string} Color CSS
	 */
	function shade(sColor, iLevel, fStep) {
		var fAmount = Math.min(Math.max(iLevel || 0, 0) * (fStep === undefined ? 0.15 : fStep), 0.9);
		if (!fAmount) {
			return sColor;
		}
		var aRgb = parseRgb(sColor);
		if (!aRgb) {
			return "color-mix(in srgb, " + sColor + " " + Math.round((1 - fAmount) * 100) + "%, #000)";
		}
		var iTarget = luminance(aRgb) < 0.08 ? 255 : 0; // muy oscuro -> aclarar
		return toHex(aRgb.map(function (c) {
			return c + (iTarget - c) * fAmount;
		}));
	}

	/**
	 * CSS de las reglas (un bloque por regla y nivel de tono), acotado al control.
	 * @param {string} sScopeId Id del elemento raíz del control
	 * @param {object[]} aRules Reglas normalizadas
	 * @param {float} [fStep=0.15] Intensidad del tono por nivel (ver shade)
	 * @returns {string} Hoja de estilo (vacía si no hay reglas)
	 */
	function buildCss(sScopeId, aRules, fStep) {
		var sScope = "[id=\"" + String(sScopeId).replace(/["\\]/g, "") + "\"]";
		var aCss = [];
		(aRules || []).forEach(function (oRule, i) {
			[0, 1, 2].forEach(function (iLevel) {
				var sColor = shade(oRule.color, iLevel, fStep);
				var sAttr = "[data-pivot-color=\"" + token(i, iLevel) + "\"]";
				var sText = textColor(sColor);
				aCss.push(sScope + " td:has(" + sAttr + "), " + sScope + " .sapUiTableHeaderCell:has(" + sAttr + ")" +
					" { background-color: " + sColor + " !important; }");
				if (sText) {
					aCss.push(sScope + " " + sAttr + " { color: " + sText + " !important; }");
				}
			});
		});
		return aCss.join("\n");
	}

	return {
		PALETTE: PALETTE,
		sanitizeColor: sanitizeColor,
		normalize: normalize,
		match: match,
		createResolver: createResolver,
		token: token,
		levelOf: levelOf,
		rowLevelOf: rowLevelOf,
		shade: shade,
		textColor: textColor,
		buildCss: buildCss
	};
});
