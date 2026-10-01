/*!
 * com.frank.pivot - Diálogo de reglas de color: campo (todos los valores o uno concreto) -> color.
 */
sap.ui.define([
	"sap/ui/core/Lib",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Item",
	"sap/ui/core/Icon",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/Table",
	"sap/m/Column",
	"sap/m/ColumnListItem",
	"sap/m/Select",
	"sap/m/HBox",
	"sap/m/Text",
	"sap/m/OverflowToolbar",
	"sap/m/ToolbarSpacer",
	"sap/m/Title",
	"sap/m/MessageStrip",
	"sap/m/ColorPalettePopover",
	"../table/ColorRules"
], function (
	Lib, JSONModel, Item, Icon, Dialog, Button, Table, Column, ColumnListItem, Select, HBox, Text,
	OverflowToolbar, ToolbarSpacer, Title, MessageStrip, ColorPalettePopover, ColorRules
) {
	"use strict";

	/** Clave del elemento "todos los valores" en el selector de valor. */
	var ALL = "__all__";

	function bundle() {
		return Lib.getResourceBundleFor("com.frank.pivot");
	}

	function valueKey(vValue) {
		return JSON.stringify(vValue);
	}

	function valueText(vValue) {
		return vValue instanceof Date ? vValue.toISOString().slice(0, 10) : String(vValue);
	}

	/**
	 * Opciones del selector de valor de un campo: "todos" + valores distintos
	 * (+ el valor actual de la regla si ya no está en los datos, para no perderlo).
	 * @private
	 */
	function valueItems(sField, vCurrent, fnGetValues, sAllText) {
		var aValues = sField ? fnGetValues(sField) : [];
		var aItems = [{ key: ALL, text: sAllText }].concat(aValues.map(function (vValue) {
			return { key: valueKey(vValue), text: valueText(vValue) };
		}));
		if (vCurrent !== undefined && !aItems.some(function (o) { return o.key === valueKey(vCurrent); })) {
			aItems.push({ key: valueKey(vCurrent), text: valueText(vCurrent) });
		}
		return aItems;
	}

	/**
	 * Reglas -> filas del modelo del diálogo.
	 * @private
	 */
	function toModelRules(aRules, fnGetValues, sAllText) {
		return ColorRules.normalize(aRules).map(function (oRule) {
			return {
				field: oRule.field,
				valueKey: "value" in oRule ? valueKey(oRule.value) : ALL,
				color: oRule.color,
				values: valueItems(oRule.field, oRule.value, fnGetValues, sAllText)
			};
		});
	}

	/**
	 * Filas del modelo del diálogo -> reglas.
	 * @private
	 */
	function fromModelRules(aModelRules) {
		return ColorRules.normalize((aModelRules || []).map(function (oRow) {
			var oRule = { field: oRow.field, color: oRow.color };
			if (oRow.valueKey && oRow.valueKey !== ALL) {
				oRule.value = JSON.parse(oRow.valueKey);
			}
			return oRule;
		}));
	}

	/**
	 * Abre el diálogo.
	 * @param {object} mOptions
	 * @param {sap.ui.core.Element} mOptions.owner Control al que se asocia el diálogo (dependiente)
	 * @param {{name: string, label: string}[]} mOptions.fields Campos seleccionables (dimensiones de columna)
	 * @param {object[]} mOptions.rules Reglas actuales
	 * @param {function(string):any[]} mOptions.getValues Valores distintos de un campo
	 * @returns {Promise<object[]|null>} Reglas nuevas o null si se cancela
	 */
	function open(mOptions) {
		var oBundle = bundle();
		var sAllText = oBundle.getText("COLORS_ALL_VALUES");
		var fnGetValues = mOptions.getValues || function () {
			return [];
		};

		// Campos: los indicados + los que ya tengan reglas (para poder editarlas o borrarlas)
		var aFields = (mOptions.fields || []).slice();
		ColorRules.normalize(mOptions.rules).forEach(function (oRule) {
			if (!aFields.some(function (f) { return f.name === oRule.field; })) {
				aFields.push({ name: oRule.field, label: oRule.field });
			}
		});

		var oModel = new JSONModel({
			fields: aFields,
			rules: toModelRules(mOptions.rules, fnGetValues, sAllText)
		});
		var fnResolve;
		var oDialog;

		function rulePath(oControl) {
			return oControl.getBindingContext("colors").getPath();
		}

		function onFieldChange(oEvent) {
			var sPath = rulePath(oEvent.getSource());
			var sField = oModel.getProperty(sPath + "/field");
			oModel.setProperty(sPath + "/valueKey", ALL);
			oModel.setProperty(sPath + "/values", valueItems(sField, undefined, fnGetValues, sAllText));
		}

		function onPickColor(oEvent) {
			var oSource = oEvent.getSource();
			var sPath = rulePath(oSource);
			var oPopover = new ColorPalettePopover({
				colors: ColorRules.PALETTE,
				showDefaultColor: false,
				showMoreColors: true,
				colorSelect: function (oSelect) {
					var sColor = ColorRules.sanitizeColor(oSelect.getParameter("value"));
					if (sColor) {
						oModel.setProperty(sPath + "/color", sColor);
					}
				}
			});
			oDialog.addDependent(oPopover);
			oPopover.openBy(oSource);
		}

		function onAdd() {
			var aRules = oModel.getProperty("/rules");
			var sField = aFields.length ? aFields[0].name : "";
			aRules.push({
				field: sField,
				valueKey: ALL,
				color: ColorRules.PALETTE[aRules.length % ColorRules.PALETTE.length],
				values: valueItems(sField, undefined, fnGetValues, sAllText)
			});
			oModel.setProperty("/rules", aRules);
		}

		function onDelete(oEvent) {
			var sPath = rulePath(oEvent.getParameter("listItem"));
			var aRules = oModel.getProperty("/rules");
			aRules.splice(parseInt(sPath.split("/").pop(), 10), 1);
			oModel.setProperty("/rules", aRules);
		}

		var oTable = new Table({
			mode: "Delete",
			noDataText: oBundle.getText("COLORS_NO_RULES"),
			delete: onDelete,
			headerToolbar: new OverflowToolbar({
				content: [
					new Title({ text: oBundle.getText("COLORS_RULES"), level: "H4" }),
					new ToolbarSpacer(),
					new Button({
						text: oBundle.getText("COLORS_ADD"),
						icon: "sap-icon://add",
						type: "Transparent",
						enabled: aFields.length > 0,
						press: onAdd
					})
				]
			}),
			columns: [
				new Column({ header: new Text({ text: oBundle.getText("COLORS_FIELD") }) }),
				new Column({ header: new Text({ text: oBundle.getText("COLORS_VALUE") }) }),
				new Column({ header: new Text({ text: oBundle.getText("COLORS_COLOR") }), width: "10rem" })
			],
			items: {
				path: "colors>/rules",
				templateShareable: false,
				template: new ColumnListItem({
					cells: [
						new Select({
							width: "100%",
							selectedKey: "{colors>field}",
							change: onFieldChange,
							items: {
								path: "colors>/fields",
								templateShareable: false,
								template: new Item({ key: "{colors>name}", text: "{colors>label}" })
							}
						}),
						new Select({
							width: "100%",
							selectedKey: "{colors>valueKey}",
							items: {
								path: "colors>values",
								templateShareable: false,
								template: new Item({ key: "{colors>key}", text: "{colors>text}" })
							}
						}),
						new HBox({
							alignItems: "Center",
							items: [
								new Icon({
									src: "sap-icon://color-fill",
									color: "{colors>color}",
									size: "1.5rem",
									tooltip: "{colors>color}"
								}).addStyleClass("sapUiTinyMarginEnd"),
								new Button({
									icon: "sap-icon://palette",
									text: oBundle.getText("COLORS_CHANGE"),
									type: "Transparent",
									press: onPickColor
								})
							]
						})
					]
				})
			}
		});

		oDialog = new Dialog({
			title: oBundle.getText("COLORS_TITLE"),
			contentWidth: "44rem",
			resizable: true,
			draggable: true,
			content: [
				new MessageStrip({
					text: oBundle.getText(aFields.length ? "COLORS_HINT" : "COLORS_NO_FIELDS"),
					type: aFields.length ? "Information" : "Warning",
					showIcon: true
				}).addStyleClass("sapUiSmallMargin"),
				oTable
			],
			buttons: [
				new Button({
					text: oBundle.getText("PANEL_OK"),
					type: "Emphasized",
					press: function () {
						fnResolve(fromModelRules(oModel.getProperty("/rules")));
						oDialog.close();
					}
				}),
				new Button({
					text: oBundle.getText("PANEL_CANCEL"),
					press: function () {
						oDialog.close();
					}
				})
			],
			afterClose: function () {
				fnResolve(null); // sin efecto si ya se resolvió con "Aceptar"
				oDialog.destroy();
				oModel.destroy();
			}
		});
		oDialog.setModel(oModel, "colors");
		oDialog.addStyleClass("pvColorRulesDialog");
		if (mOptions.owner) {
			mOptions.owner.addDependent(oDialog);
		}

		return new Promise(function (fnDone) {
			fnResolve = fnDone;
			oDialog.open();
		});
	}

	return {
		open: open,
		/** @private expuestos para pruebas */
		_toModelRules: toModelRules,
		_fromModelRules: fromModelRules,
		ALL: ALL
	};
});
