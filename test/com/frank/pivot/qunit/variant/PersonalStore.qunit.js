/*global QUnit */
sap.ui.define([
	"com/frank/pivot/variant/LocalStorageStore",
	"com/frank/pivot/variant/UshellPersonalizationStore"
], function (LocalStorageStore, UshellPersonalizationStore) {
	"use strict";

	/** Sustituto de window.localStorage */
	function createStorage() {
		var mData = {};
		return {
			data: mData,
			getItem: function (sKey) {
				return Object.prototype.hasOwnProperty.call(mData, sKey) ? mData[sKey] : null;
			},
			setItem: function (sKey, sValue) {
				mData[sKey] = String(sValue);
			}
		};
	}

	/** Sustituto de sap/ushell/Container con el servicio PersonalizationV2 */
	function createUshell(bOnlyV1) {
		var mContainers = {};
		var oUshell = {
			saves: 0,
			requestedKeys: [],
			getUser: function () {
				return { getFullName: function () { return "Ana Pérez"; } };
			},
			getServiceAsync: function (sName) {
				if (bOnlyV1 && sName === "PersonalizationV2") {
					return Promise.reject(new Error("no disponible"));
				}
				return Promise.resolve({
					getContainer: function (sKey, oScope) {
						oUshell.requestedKeys.push(sKey);
						oUshell.scope = oScope;
						var mItems = mContainers[sKey] = mContainers[sKey] || {};
						return Promise.resolve({
							getItemValue: function (sItem) {
								return mItems[sItem];
							},
							setItemValue: function (sItem, vValue) {
								mItems[sItem] = JSON.parse(JSON.stringify(vValue));
							},
							save: function () {
								oUshell.saves++;
								return Promise.resolve();
							}
						});
					}
				});
			}
		};
		return oUshell;
	}

	var CONFIG = { rows: ["Region"], columns: ["Anio"] };

	function runStoreTests(sName, fnCreate) {
		QUnit.test(sName + ": guardar, sobrescribir, por defecto y borrar", async function (assert) {
			var oStore = fnCreate();
			assert.strictEqual(oStore.supportsPublic, false, "solo vistas personales");
			assert.deepEqual(await oStore.load("ventas"), { variants: [], defaultKey: null }, "vacío al principio");

			var oSaved = await oStore.save("ventas", { name: "Mía", "public": true, configuration: CONFIG });
			assert.ok(oSaved.key, "se asigna una clave");
			assert.strictEqual(oSaved["public"], false, "una vista personal nunca es pública");
			assert.strictEqual(oSaved.editable, true);
			assert.deepEqual(oSaved.configuration, CONFIG);

			await oStore.save("ventas", Object.assign({}, oSaved, { name: "Mía 2" }));
			await oStore.save("otra.tabla", { name: "Otra", configuration: {} });
			await oStore.setDefault("ventas", oSaved.key);
			var oData = await oStore.load("ventas");
			assert.deepEqual(oData.variants.map(function (o) { return o.name; }), ["Mía 2"], "sobrescrita y separada por tabla");
			assert.strictEqual(oData.defaultKey, oSaved.key);

			await oStore.remove("ventas", oSaved.key);
			assert.deepEqual(await oStore.load("ventas"), { variants: [], defaultKey: null }, "al borrar se quita la vista por defecto");
			assert.strictEqual((await oStore.load("otra.tabla")).variants.length, 1);
		});

		QUnit.test(sName + ": operaciones simultáneas no pierden cambios", async function (assert) {
			var oStore = fnCreate();
			var oA = await oStore.save("ventas", { name: "A", configuration: CONFIG });
			var oB = await oStore.save("ventas", { name: "B", configuration: CONFIG });
			await Promise.all([
				oStore.save("ventas", Object.assign({}, oA, { name: "A2" })),
				oStore.remove("ventas", oB.key),
				oStore.setDefault("ventas", oA.key)
			]);
			var oData = await oStore.load("ventas");
			assert.deepEqual(oData.variants.map(function (o) { return o.name; }), ["A2"]);
			assert.strictEqual(oData.defaultKey, oA.key);
		});
	}

	QUnit.module("PersonalStore");

	runStoreTests("LocalStorageStore", function () {
		return new LocalStorageStore({ storage: createStorage() });
	});

	runStoreTests("UshellPersonalizationStore", function () {
		return new UshellPersonalizationStore({ container: createUshell() });
	});

	QUnit.test("LocalStorageStore: contenido dañado no bloquea el guardado", async function (assert) {
		var oStorage = createStorage();
		oStorage.setItem("com.frank.pivot.views.ventas", "{dañado");
		var oStore = new LocalStorageStore({ storage: oStorage });
		assert.deepEqual(await oStore.load("ventas"), { variants: [], defaultKey: null });
		await oStore.save("ventas", { name: "Nueva", configuration: CONFIG });
		assert.strictEqual((await oStore.load("ventas")).variants.length, 1);
	});

	QUnit.test("UshellPersonalizationStore: autor, ámbito, clave de contenedor y servicio V1", async function (assert) {
		var oUshell = createUshell(true);
		var oStore = new UshellPersonalizationStore({ container: oUshell });
		var sLongKey = "app.muy.larga.con.un.nombre.de.tabla.extenso.pivotRegion";
		var oSaved = await oStore.save(sLongKey, { name: "Mía", configuration: CONFIG });
		assert.strictEqual(oSaved.author, "Ana Pérez");
		assert.strictEqual(oUshell.saves, 1);
		assert.deepEqual(oUshell.scope, { keyCategory: "FIXED_KEY", writeFrequency: "LOW", clientStorageAllowed: false });
		assert.ok(oUshell.requestedKeys[0].length <= 40, "clave de contenedor de 40 caracteres como máximo");
		assert.strictEqual(UshellPersonalizationStore._containerKey("ventas"), "pv.ventas");
		assert.notStrictEqual(UshellPersonalizationStore._containerKey(sLongKey),
			UshellPersonalizationStore._containerKey(sLongKey + "2"), "claves largas distintas no colisionan");
		assert.strictEqual((await oStore.load(sLongKey)).variants[0].name, "Mía", "funciona con Personalization (V1)");
	});
});
