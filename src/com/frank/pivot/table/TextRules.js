/*!
 * com.frank.pivot - Reglas de estilo de texto.
 *
 * Una regla aplica color, negrita, cursiva o tachado al texto de filas, columnas o celdas:
 *   { scope: "row", field: "Estado", value: "Eliminada", color: "Negative", strikethrough: true }
 *   { scope: "column", field: "Anio", value: 2027, italic: true }
 *   { scope: "cell", valueField: "VarAbs", operator: "lt", to: 0, color: "Negative", bold: true }
 *   { scope: "cell", operator: "changed", color: "Critical" }   // valor distinto del anterior
 *
 * - row: dimensión de fila (sin value = cualquier valor). Afecta a las celdas de dimensión y de
 *   valor de las filas de detalle; nunca a subtotales, grupos ni totales.
 * - column: dimensión de columna. Solo columnas de detalle (no subtotales ni total general).
 * - cell: valor numérico de la celda (opcionalmente solo de un campo de valor, valueField).
 *   Operadores: eq, ne, lt, le, gt, ge (con to), between (to y to2), empty y changed.
 * Varias reglas se combinan; si definen la misma propiedad gana la última.
 *
 * Colores: semánticos del tema (Negative, Critical, Positive, Information, Neutral) o hex.
 *
 * Módulo sin dependencias de UI5 (probado también en Node.js).
 */
sap.ui.define([], function () {
	"use strict";

	var SCOPES = ["row", "column", "cell"];
	var OPERATORS = ["eq", "ne", "lt", "le", "gt", "ge", "between", "empty", "changed"];
	var STYLE_KEYS = ["bold", "italic", "strikethrough"];

	/** Colores semánticos: variable CSS del tema y valor hex (respaldo y exportación a Excel). */
	var SEMANTIC_COLORS = {
		Negative: { css: "--sapNegativeTextColor", hex: "#aa0808" },
		Critical: { css: "--sapCriticalTextColor", hex: "#b44f00" },
		Positive: { css: "--sapPositiveTextColor", hex: "#256f3a" },
		Information: { css: "--sapInformativeTextColor", hex: "#0064d9" },
		Neutral: { css: "--sapNeutralTextColor", hex: "#131e29" }
	};
	var HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

	function isNumber(v) {
		return typeof v === "number" && isFinite(v);
	}

	function hasValue(oRule) {
		return oRule.value !== undefined && oRule.value !== null;
	}

	/**
	 * @param {string} sColor Color semántico o hex
	 * @returns {string|null} El color si es válido; si no, null
	 */
	function sanitizeColor(sColor) {
		var s = String(sColor || "").trim();
		if (SEMANTIC_COLORS[s]) {
			return s;
		}
		return HEX_PATTERN.test(s) ? s.toLowerCase() : null;
	}

	/**
	 * Color CSS de una regla: variable del tema (con respaldo) o hex.
	 * @param {string} sColor Color normalizado
	 * @returns {string} Valor CSS
	 */
	function cssColor(sColor) {
		var oSemantic = SEMANTIC_COLORS[sColor];
		return oSemantic ? "var(" + oSemantic.css + ", " + oSemantic.hex + ")" : sColor;
	}

	/**
	 * Color hex de una regla (para la exportación a Excel).
	 * @param {string} sColor Color normalizado
	 * @returns {string|null} "#rrggbb"
	 */
	function hexColor(sColor) {
		var s = SEMANTIC_COLORS[sColor] ? SEMANTIC_COLORS[sColor].hex : sColor;
		if (!s || !HEX_PATTERN.test(s)) {
			return null;
		}
		if (s.length === 4) {
			s = "#" + s.slice(1).split("").map(function (c) {
				return c + c;
			}).join("");
		}
		return s.toLowerCase();
	}

	/**
	 * Descarta reglas incompletas o no válidas y copia solo las propiedades conocidas.
	 * @param {object[]} aRules Reglas
	 * @returns {object[]} Reglas normalizadas
	 */
	function normalize(aRules) {
		return (Array.isArray(aRules) ? aRules : []).map(function (oRule) {
			if (!oRule || typeof oRule !== "object" || SCOPES.indexOf(oRule.scope) < 0) {
				return null;
			}
			var oOut = { scope: oRule.scope };
			if (oRule.scope === "cell") {
				if (OPERATORS.indexOf(oRule.operator) < 0) {
					return null;
				}
				oOut.operator = oRule.operator;
				if (["empty", "changed"].indexOf(oRule.operator) < 0) {
					if (!isNumber(oRule.to) || (oRule.operator === "between" && !isNumber(oRule.to2))) {
						return null;
					}
					oOut.to = oRule.to;
					if (oRule.operator === "between") {
						oOut.to2 = oRule.to2;
					}
				}
				if (typeof oRule.valueField === "string" && oRule.valueField) {
					oOut.valueField = oRule.valueField;
				}
			} else {
				if (typeof oRule.field !== "string" || !oRule.field) {
					return null;
				}
				oOut.field = oRule.field;
				if (hasValue(oRule)) {
					oOut.value = oRule.value;
				}
			}
			var bStyle = false;
			if (oRule.color !== undefined && oRule.color !== null && oRule.color !== "") {
				var sColor = sanitizeColor(oRule.color);
				if (!sColor) {
					return null; // color inseguro o desconocido: se descarta la regla completa
				}
				oOut.color = sColor;
				bStyle = true;
			}
			STYLE_KEYS.forEach(function (sKey) {
				if (typeof oRule[sKey] === "boolean") {
					oOut[sKey] = oRule[sKey];
					bStyle = true;
				}
			});
			return bStyle ? oOut : null;
		}).filter(Boolean);
	}

	function sameValue(a, b) {
		if (a instanceof Date || b instanceof Date) {
			return new Date(a).getTime() === new Date(b).getTime();
		}
		return String(a) === String(b);
	}

	/**
	 * true si el valor de la celda es distinto del anterior (tolerancia de redondeo; vacío = sin valor).
	 * @param {number|null} vCurrent Valor actual
	 * @param {number|null} vPrevious Valor anterior
	 * @returns {boolean} Si cambió
	 */
	function isChanged(vCurrent, vPrevious) {
		var bCurrent = isNumber(vCurrent);
		var bPrevious = isNumber(vPrevious);
		if (!bCurrent || !bPrevious) {
			return bCurrent !== bPrevious;
		}
		return Math.abs(vCurrent - vPrevious) > 1e-9 * Math.max(1, Math.abs(vCurrent), Math.abs(vPrevious));
	}

	function testCell(oRule, vValue, vPrevious) {
		switch (oRule.operator) {
			case "empty": return !isNumber(vValue);
			case "changed": return vPrevious !== undefined && isChanged(vValue, vPrevious);
			default:
				if (!isNumber(vValue)) {
					return false;
				}
				switch (oRule.operator) {
					case "eq": return vValue === oRule.to;
					case "ne": return vValue !== oRule.to;
					case "lt": return vValue < oRule.to;
					case "le": return vValue <= oRule.to;
					case "gt": return vValue > oRule.to;
					case "ge": return vValue >= oRule.to;
					default: // between
						return vValue >= Math.min(oRule.to, oRule.to2) && vValue <= Math.max(oRule.to, oRule.to2);
				}
		}
	}

	function matchesPath(oRule, aDimensions, aKeys) {
		var iDim = aDimensions.indexOf(oRule.field);
		if (iDim < 0 || iDim >= aKeys.length) {
			return false;
		}
		return !hasValue(oRule) || sameValue(aKeys[iDim], oRule.value);
	}

	/**
	 * Crea el resolutor de estilos para un resultado del motor.
	 * @param {object} oResult Resultado de PivotEngine.compute
	 * @param {object[]} aRules Reglas
	 * @param {object[]} [aValueSpecs] Valores configurados (para valueField); por defecto oResult.values
	 * @returns {object|null} {rules, unused, dimension(rowKeys, rowType), value(leaf, rowKeys, rowType, value, previous)}
	 *   que devuelven los índices de las reglas aplicables, o null si no hay reglas
	 */
	function createResolver(oResult, aRules, aValueSpecs) {
		var aNormalized = normalize(aRules);
		if (!aNormalized.length) {
			return null;
		}
		var aRowDims = oResult.rowDimensions.map(function (d) {
			return d.name;
		});
		var aColumnDims = oResult.columnDimensions.map(function (d) {
			return d.name;
		});
		var aValues = aValueSpecs || oResult.values || [];

		// Reglas sobre campos que no están en filas/columnas (o sobre valores inexistentes): no aplican
		var aUnused = [];
		aNormalized.forEach(function (oRule, i) {
			var bUsed = oRule.scope === "row" ? aRowDims.indexOf(oRule.field) >= 0 :
				oRule.scope === "column" ? aColumnDims.indexOf(oRule.field) >= 0 :
				!oRule.valueField || aValues.some(function (v) {
					return v && v.field === oRule.valueField;
				});
			if (!bUsed) {
				aUnused.push(i);
			}
		});

		function rowRules(aRowKeys, sRowType) {
			if (sRowType !== "data" || !aRowKeys) {
				return [];
			}
			var aOut = [];
			aNormalized.forEach(function (oRule, i) {
				if (oRule.scope === "row" && matchesPath(oRule, aRowDims, aRowKeys)) {
					aOut.push(i);
				}
			});
			return aOut;
		}

		return {
			rules: aNormalized,
			/** Índices de las reglas que no pueden aplicarse a esta configuración. */
			unused: aUnused,
			/** Reglas de una celda de dimensión de fila. */
			dimension: function (aRowKeys, sRowType) {
				return rowRules(aRowKeys, sRowType);
			},
			/** Reglas de columna de una hoja (independientes de la fila). */
			column: function (oLeaf) {
				var aOut = [];
				if (oLeaf.type !== "data") {
					return aOut;
				}
				aNormalized.forEach(function (oRule, i) {
					if (oRule.scope === "column" && matchesPath(oRule, aColumnDims, oLeaf.columnKeys || [])) {
						aOut.push(i);
					}
				});
				return aOut;
			},
			/**
			 * Reglas de una celda de valor: de fila, de columna y de celda, en orden de definición.
			 * @param {object} oLeaf Columna de valor del resultado
			 * @param {any[]} aRowKeys Claves de la fila
			 * @param {string} sRowType Tipo de fila
			 * @param {number|null} vValue Valor de la celda
			 * @param {number|null} [vPrevious] Valor anterior (undefined si el valor no tiene previousField)
			 * @returns {int[]} Índices de las reglas
			 */
			value: function (oLeaf, aRowKeys, sRowType, vValue, vPrevious) {
				if (!aRowKeys) {
					return [];
				}
				var aRow = rowRules(aRowKeys, sRowType);
				var aColumn = this.column(oLeaf);
				var oSpec = aValues[oLeaf.valueIndex] || {};
				var aOut = [];
				aNormalized.forEach(function (oRule, i) {
					if (oRule.scope === "row" ? aRow.indexOf(i) >= 0 :
						oRule.scope === "column" ? aColumn.indexOf(i) >= 0 :
						(!oRule.valueField || oRule.valueField === oSpec.field) && testCell(oRule, vValue, vPrevious)) {
						aOut.push(i);
					}
				});
				return aOut;
			}
		};
	}

	/**
	 * Valor del atributo data-pivot-text: "t0 t3" o "none".
	 * @param {int[]} aRules Índices de las reglas
	 * @returns {string} Token
	 */
	function token(aRules) {
		return aRules && aRules.length ? aRules.map(function (i) {
			return "t" + i;
		}).join(" ") : "none";
	}

	/**
	 * Estilo combinado de varias reglas (la última gana).
	 * @param {object[]} aRules Reglas normalizadas
	 * @param {int[]} aIndexes Índices aplicables
	 * @returns {object|null} {color (hex), bold, italic, strikethrough} o null
	 */
	function combine(aRules, aIndexes) {
		if (!aIndexes || !aIndexes.length) {
			return null;
		}
		var oStyle = {};
		aIndexes.forEach(function (i) {
			var oRule = aRules[i];
			if (oRule.color) {
				oStyle.color = hexColor(oRule.color);
			}
			STYLE_KEYS.forEach(function (sKey) {
				if (typeof oRule[sKey] === "boolean") {
					oStyle[sKey] = oRule[sKey];
				}
			});
		});
		return oStyle;
	}

	/**
	 * CSS de las reglas, acotado al control. Se emite en orden de definición para que, ante
	 * propiedades en conflicto, gane la última regla; la especificidad y !important hacen que
	 * prevalezca sobre el color de contraste de las reglas de fondo (ColorRules).
	 * @param {string} sScopeId Id del elemento raíz del control
	 * @param {object[]} aRules Reglas normalizadas
	 * @returns {string} Hoja de estilo (vacía si no hay reglas)
	 */
	function buildCss(sScopeId, aRules) {
		// El elemento raíz del control lleva la clase pvPivotTable (más especificidad que el estilo
		// de valor cambiado de PivotTable.css y que el color de contraste de ColorRules)
		var sScope = "[id=\"" + String(sScopeId).replace(/["\\]/g, "") + "\"].pvPivotTable";
		return (aRules || []).map(function (oRule, i) {
			var aDecl = [];
			if (oRule.color) {
				aDecl.push("color: " + cssColor(oRule.color) + " !important");
			}
			if (typeof oRule.bold === "boolean") {
				aDecl.push("font-weight: " + (oRule.bold ? "bold" : "normal") + " !important");
				aDecl.push("font-family: " + (oRule.bold ? "var(--sapFontBoldFamily, inherit)" : "inherit") + " !important");
			}
			if (typeof oRule.italic === "boolean") {
				aDecl.push("font-style: " + (oRule.italic ? "italic" : "normal") + " !important");
			}
			if (typeof oRule.strikethrough === "boolean") {
				aDecl.push("text-decoration: " + (oRule.strikethrough ? "line-through" : "none") + " !important");
			}
			var sAttr = "[data-pivot-text~=\"t" + i + "\"][data-pivot-text]";
			return sScope + " " + sAttr + " { " + aDecl.join("; ") + "; }";
		}).join("\n");
	}

	return {
		SCOPES: SCOPES,
		OPERATORS: OPERATORS,
		SEMANTIC_COLORS: Object.keys(SEMANTIC_COLORS),
		sanitizeColor: sanitizeColor,
		hexColor: hexColor,
		normalize: normalize,
		isChanged: isChanged,
		createResolver: createResolver,
		token: token,
		combine: combine,
		buildCss: buildCss
	};
});
