/*!
 * com.frank.pivot - Panel de configuración: arrastrar campos a Filas / Columnas / Valores.
 */
sap.ui.define([
	"sap/ui/core/Lib",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/dnd/DragInfo",
	"sap/ui/core/dnd/DropInfo",
	"sap/ui/core/Item",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/List",
	"sap/m/StandardListItem",
	"sap/m/CustomListItem",
	"sap/m/HBox",
	"sap/m/VBox",
	"sap/m/FlexBox",
	"sap/m/Text",
	"sap/m/Select",
	"sap/m/CheckBox",
	"sap/m/Panel",
	"sap/m/Toolbar",
	"sap/m/Title",
	"sap/m/ActionSheet",
	"sap/m/ToolbarSpacer",
	"../library",
	"./ColorRulesDialog"
], function (
	Lib, JSONModel, DragInfo, DropInfo, Item, Dialog, Button, List, StandardListItem, CustomListItem,
	HBox, VBox, FlexBox, Text, Select, CheckBox, Panel, Toolbar, Title, ActionSheet, ToolbarSpacer, library,
	ColorRulesDialog
) {
	"use strict";

	var GROUP = "pvFields";
	var TARGETS = ["available", "rows", "columns", "values"];
	var AGGREGATION_TYPES = Object.keys(library.AggregationType);

	function bundle() {
		return Lib.getResourceBundleFor("com.frank.pivot");
	}

	/**
	 * Lista de campos conocidos: PivotField, campos de la configuración actual y,
	 * en modo Client, las claves del primer registro.
	 * @param {com.frank.pivot.PivotTable} oPivot Tabla
	 * @returns {object[]} Campos {name, label, measure}
	 */
	function collectFields(oPivot) {
		var aFields = [];
		var mSeen = {};

		function add(sName, sLabel, bMeasure) {
			if (sName && !mSeen[sName]) {
				mSeen[sName] = true;
				aFields.push({ name: sName, label: sLabel || sName, measure: !!bMeasure });
			}
		}

		oPivot.getFields().forEach(function (oField) {
			add(oField.getName(), oField.getLabel(), oField.getMeasure());
		});
		oPivot.getRows().concat(oPivot.getColumns()).forEach(function (sName) {
			add(sName);
		});
		oPivot.getValues().forEach(function (oValue) {
			add(oValue.getField(), null, true);
		});
		var aRecords = oPivot.getMode() === "Client" && oPivot.getRecords();
		if (aRecords && aRecords.length) {
			Object.keys(aRecords[0]).forEach(function (sName) {
				add(sName, null, typeof aRecords[0][sName] === "number");
			});
		}
		return aFields;
	}

	function createState(oPivot, aFields) {
		var mByName = {};
		aFields.forEach(function (oField) {
			mByName[oField.name] = oField;
		});
		function field(sName) {
			return Object.assign({}, mByName[sName] || { name: sName, label: sName });
		}
		var oConfig = oPivot.getConfiguration();
		var aUsed = oConfig.rows.concat(oConfig.columns);
		return {
			available: aFields.filter(function (f) {
				return aUsed.indexOf(f.name) < 0;
			}).map(function (f) {
				return Object.assign({}, f);
			}),
			rows: oConfig.rows.map(field),
			columns: oConfig.columns.map(field),
			values: oConfig.values.map(function (oValue) {
				return Object.assign(field(oValue.field), {
					aggregationType: oValue.aggregationType,
					format: oValue.format,
					decimals: oValue.decimals,
					unit: oValue.unit,
					customLabel: oValue.label
				});
			}),
			colorRules: oConfig.colorRules || [],
			showSubtotals: oConfig.showSubtotals,
			showGrandTotals: oConfig.showGrandTotals,
			hierarchical: oConfig.hierarchical
		};
	}

	/**
	 * Mueve un campo entre listas. Reglas:
	 * - A "values" se añade una copia (una medida puede agregarse varias veces).
	 * - Desde "values" se quita la medida; si el destino es filas/columnas se añade allí.
	 * - Entre available/rows/columns se mueve.
	 * @private
	 */
	function moveField(oState, sSource, iSource, sTarget, iTarget) {
		var aSource = oState[sSource];
		var oItem = aSource[iSource];
		if (!oItem) {
			return;
		}
		var aTarget = oState[sTarget];
		var iInsert = iTarget === undefined || iTarget < 0 ? aTarget.length : iTarget;

		function isDimension(sName) {
			return oState.rows.concat(oState.columns).some(function (f) {
				return f.name === sName;
			});
		}
		function removeFromAvailable(sName) {
			oState.available = oState.available.filter(function (f) {
				return f.name !== sName;
			});
		}

		if (sSource === sTarget) {
			aSource.splice(iSource, 1);
			aSource.splice(iInsert > iSource ? iInsert - 1 : iInsert, 0, oItem);
		} else if (sTarget === "values") {
			if (sSource !== "available") {
				aSource.splice(iSource, 1);
				oState.available.push({ name: oItem.name, label: oItem.label, measure: oItem.measure });
			}
			aTarget.splice(iInsert, 0, {
				name: oItem.name,
				label: oItem.label,
				measure: oItem.measure,
				aggregationType: oItem.measure ? "Sum" : "Count"
			});
		} else if (sSource === "values") {
			aSource.splice(iSource, 1);
			if (sTarget !== "available" && !isDimension(oItem.name)) {
				removeFromAvailable(oItem.name);
				aTarget.splice(iInsert, 0, { name: oItem.name, label: oItem.label, measure: oItem.measure });
			}
		} else {
			aSource.splice(iSource, 1);
			aTarget.splice(iInsert, 0, oItem);
		}
	}

	function stateToConfig(oState) {
		function names(aList) {
			return aList.map(function (f) {
				return f.name;
			});
		}
		return {
			rows: names(oState.rows),
			columns: names(oState.columns),
			values: oState.values.map(function (v) {
				return {
					field: v.name,
					aggregationType: v.aggregationType,
					label: v.customLabel || "",
					format: v.format,
					decimals: v.decimals,
					unit: v.unit
				};
			}),
			colorRules: oState.colorRules || [],
			showSubtotals: oState.showSubtotals,
			showGrandTotals: oState.showGrandTotals,
			hierarchical: oState.hierarchical
		};
	}

	function pathInfo(oListItem) {
		var aParts = oListItem.getBindingContext("panel").getPath().split("/");
		return { list: aParts[1], index: parseInt(aParts[2], 10) };
	}

	/**
	 * Abre el panel.
	 * @param {com.frank.pivot.PivotTable} oPivot Tabla
	 * @returns {Promise<object|null>} Configuración elegida o null
	 */
	function open(oPivot) {
		var oBundle = bundle();
		var aFields = collectFields(oPivot);
		var oInitial = createState(oPivot, aFields);
		var oModel = new JSONModel(JSON.parse(JSON.stringify(oInitial)));
		var fnResolve;

		function update(fnChange) {
			var oState = oModel.getData();
			fnChange(oState);
			oModel.setData(oState);
			oModel.refresh(true);
		}

		function onDrop(oEvent) {
			var oDragged = oEvent.getParameter("draggedControl");
			var oDropped = oEvent.getParameter("droppedControl");
			var oSource = pathInfo(oDragged);
			var sTarget;
			var iTarget;
			if (oDropped.isA("sap.m.List")) {
				sTarget = oDropped.data("target");
				iTarget = -1;
			} else {
				var oTargetInfo = pathInfo(oDropped);
				sTarget = oTargetInfo.list;
				iTarget = oTargetInfo.index + (oEvent.getParameter("dropPosition") === "After" ? 1 : 0);
			}
			update(function (oState) {
				moveField(oState, oSource.list, oSource.index, sTarget, iTarget);
			});
		}

		function onDelete(oEvent) {
			var oInfo = pathInfo(oEvent.getParameter("listItem"));
			update(function (oState) {
				moveField(oState, oInfo.list, oInfo.index, "available");
			});
		}

		function onAvailablePress(oEvent) {
			var oListItem = oEvent.getSource();
			var oInfo = pathInfo(oListItem);
			var oSheet = new ActionSheet({
				title: oBundle.getText("PANEL_ADD_TO", [oListItem.getTitle()]),
				showCancelButton: true,
				buttons: ["rows", "columns", "values"].map(function (sTarget) {
					return new Button({
						text: oBundle.getText("PANEL_" + sTarget.toUpperCase()),
						press: function () {
							update(function (oState) {
								moveField(oState, "available", oInfo.index, sTarget);
							});
						}
					});
				}),
				afterClose: function () {
					oSheet.destroy();
				}
			});
			oDialog.addDependent(oSheet);
			oSheet.openBy(oListItem);
		}

		function onColors() {
			var oState = oModel.getData();
			ColorRulesDialog.open({
				owner: oDialog,
				fields: oState.columns.map(function (f) {
					return { name: f.name, label: f.label };
				}),
				rules: oState.colorRules,
				getValues: oPivot.getDistinctValues.bind(oPivot)
			}).then(function (aRules) {
				if (aRules) {
					update(function (oCurrent) {
						oCurrent.colorRules = aRules;
					});
				}
			});
		}

		function createHeader(sTarget) {
			var aContent = [new Title({ text: oBundle.getText("PANEL_" + sTarget.toUpperCase()), level: "H4" })];
			if (sTarget === "columns") {
				aContent.push(new ToolbarSpacer(), new Button({
					icon: "sap-icon://palette",
					type: "Transparent",
					tooltip: oBundle.getText("COLORS_BUTTON"),
					// número de reglas definidas junto al icono
					text: "{= ${panel>/colorRules}.length > 0 ? String(${panel>/colorRules}.length) : '' }",
					enabled: "{= ${panel>/columns}.length > 0 || ${panel>/colorRules}.length > 0 }",
					press: onColors
				}).addStyleClass("pvColorsButton"));
			}
			return new Toolbar({ content: aContent });
		}

		function createList(sTarget) {
			var bValues = sTarget === "values";
			var oTemplate;
			if (bValues) {
				oTemplate = new CustomListItem({
					content: new HBox({
						alignItems: "Center",
						justifyContent: "SpaceBetween",
						width: "100%",
						items: [
							new Text({ text: "{panel>label}", tooltip: "{panel>name}", wrapping: false }).addStyleClass("sapUiSmallMarginBegin"),
							new Select({
								width: "9rem",
								selectedKey: "{panel>aggregationType}",
								items: AGGREGATION_TYPES.map(function (sType) {
									return new Item({ key: sType, text: oBundle.getText("PIVOT_AGG_" + sType.toUpperCase()) });
								})
							}).addStyleClass("sapUiTinyMarginEnd")
						]
					})
				});
			} else {
				oTemplate = new StandardListItem({
					title: "{panel>label}",
					tooltip: "{panel>name}",
					icon: "{= ${panel>measure} ? 'sap-icon://measure' : 'sap-icon://dimension' }"
				});
				if (sTarget === "available") {
					oTemplate.setType("Active").attachPress(onAvailablePress);
				}
			}
			var oList = new List({
				mode: sTarget === "available" ? "None" : "Delete",
				noDataText: oBundle.getText("PANEL_DROP_HINT"),
				items: { path: "panel>/" + sTarget, template: oTemplate, templateShareable: false },
				delete: onDelete,
				dragDropConfig: [
					new DragInfo({ sourceAggregation: "items", groupName: GROUP }),
					new DropInfo({ targetAggregation: "items", groupName: GROUP, dropPosition: "Between", drop: onDrop }),
					new DropInfo({ groupName: GROUP, drop: onDrop }) // listas vacías
				]
			});
			oList.data("target", sTarget);
			return new Panel({
				width: "16rem",
				headerToolbar: createHeader(sTarget),
				content: oList
			}).addStyleClass("sapUiTinyMargin");
		}

		var oDialog = new Dialog({
			title: oBundle.getText("PANEL_TITLE"),
			contentWidth: "70rem",
			resizable: true,
			draggable: true,
			content: new VBox({
				items: [
					new FlexBox({ wrap: "Wrap", items: TARGETS.map(createList) }),
					new HBox({
						wrap: "Wrap",
						items: [
							new CheckBox({ text: oBundle.getText("PANEL_SUBTOTALS"), selected: "{panel>/showSubtotals}" }),
							new CheckBox({ text: oBundle.getText("PANEL_GRAND_TOTALS"), selected: "{panel>/showGrandTotals}" }),
							new CheckBox({ text: oBundle.getText("PANEL_HIERARCHICAL"), selected: "{panel>/hierarchical}" })
						]
					}).addStyleClass("sapUiSmallMarginBegin")
				]
			}),
			buttons: [
				new Button({
					text: oBundle.getText("PANEL_OK"),
					type: "Emphasized",
					press: function () {
						fnResolve(stateToConfig(oModel.getData()));
						oDialog.close();
					}
				}),
				new Button({
					text: oBundle.getText("PANEL_RESET"),
					press: function () {
						oModel.setData(JSON.parse(JSON.stringify(oInitial)));
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
				fnResolve(null); // sin efecto si ya se resolvió con "Aplicar"
				oDialog.destroy();
				oModel.destroy();
			}
		});
		oDialog.setModel(oModel, "panel");
		oDialog.addStyleClass("pvFieldPanel");
		oPivot.addDependent(oDialog);

		return new Promise(function (fnDone) {
			fnResolve = fnDone;
			oDialog.open();
		});
	}

	return {
		open: open,
		/** @private expuestos para pruebas */
		_moveField: moveField,
		_stateToConfig: stateToConfig
	};
});
