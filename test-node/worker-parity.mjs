/**
 * Comprueba que el motor da el mismo resultado dentro del Web Worker (PivotWorker.js) que
 * en el hilo principal, incluidos los campos calculados (las fórmulas viajan como texto).
 *
 * El worker se emula con un contexto vm: importScripts carga los ficheros de engine/ y
 * postMessage serializa con structuredClone, como el navegador (falla si hay funciones).
 *
 *   node test-node/worker-parity.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/com/frank/pivot/engine");

function source(sName) {
	return fs.readFileSync(path.join(ENGINE, sName), "utf8");
}

/** Hilo principal: módulos cargados con un sap.ui.define mínimo, como en run-qunit.mjs. */
function loadEngine() {
	const mModules = {};
	let sCurrent;
	const oContext = vm.createContext({
		sap: {
			ui: {
				define(aDeps, fnFactory) {
					mModules[sCurrent] = fnFactory(...aDeps.map((d) => mModules[d.split("/").pop()]));
				}
			}
		}
	});
	["Formula", "Aggregations", "CalculatedFields", "PivotEngine"].forEach((sName) => {
		sCurrent = sName;
		vm.runInContext(source(sName + ".js"), oContext, { filename: sName + ".js" });
	});
	return mModules.PivotEngine;
}

/** Web Worker emulado con el PivotWorker.js real. */
function createWorker() {
	let fnReply;
	const oSelf = {
		postMessage(oData) {
			fnReply(structuredClone(oData));
		}
	};
	oSelf.self = oSelf;
	oSelf.importScripts = (sFile) => vm.runInContext(source(sFile), oContext, { filename: sFile });
	const oContext = vm.createContext(oSelf);
	vm.runInContext(source("PivotWorker.js"), oContext, { filename: "PivotWorker.js" });
	return {
		compute(aRecords, oConfig) {
			return new Promise((fnResolve) => {
				fnReply = fnResolve;
				oSelf.onmessage({ data: structuredClone({ records: aRecords, config: oConfig }) });
			});
		}
	};
}

const REGIONS = ["Norte", "Sur", "Este", "Oeste"];
const PRODUCTS = ["Laptop", "Teclado", "Monitor", "Ratón", "Cable"];
const DATA = [];
for (let i = 0; i < 5000; i++) {
	const nVentas = (i * 37) % 1000;
	DATA.push({
		Region: REGIONS[i % 4],
		Producto: PRODUCTS[(i * 7) % 5],
		Anio: 2020 + (i % 6),
		Ventas: nVentas,
		Costo: i % 13 === 0 ? null : (nVentas * ((i % 9) + 1)) / 10,
		Unidades: i % 11
	});
}

const CALCULATED = {
	Utilidad: { formula: "{Ventas} - {Costo}", level: "record", label: "Utilidad" },
	Margen: { formula: "{Utilidad} / {Ventas}", level: "aggregate", label: "Margen %" },
	PrecioMedio: { formula: "{Ventas} / {Unidades}", level: "aggregate", label: "Precio medio" },
	Tramo: { formula: "SI({Ventas} >= 500; 1; 0)", level: "record" },
	Malo: { formula: "{Ventas} *", level: "aggregate" },
	Ciclo: { formula: "{Ciclo} + 1", level: "aggregate" }
};

const CASES = {
	"sin campos calculados (v1.2.0)": {
		rows: ["Region", "Producto"], columns: ["Anio"],
		values: [{ field: "Ventas", aggregation: "sum" }, { field: "Costo", aggregation: "avg" }]
	},
	"calculados, subtotales y columnas": {
		rows: ["Region", "Producto"], columns: ["Anio"], calculatedFields: CALCULATED,
		values: [
			{ field: "Utilidad", aggregation: "sum" },
			{ field: "Margen", aggregation: "formula" },
			{ field: "PrecioMedio", aggregation: "formula" },
			{ field: "Malo", aggregation: "formula" },
			{ field: "Ciclo", aggregation: "sum" }
		]
	},
	"calculados, jerárquico y record como dimensión": {
		rows: ["Tramo", "Region"], columns: [], hierarchical: true, calculatedFields: CALCULATED,
		filters: { Region: ["Norte", "Sur"] },
		values: [{ field: "Margen", aggregation: "formula" }, { field: "Utilidad", aggregation: "avg" }]
	}
};

const PivotEngine = loadEngine();
let iFailed = 0;
for (const [sName, oConfig] of Object.entries(CASES)) {
	const oWorker = createWorker();
	const oFromWorker = await oWorker.compute(DATA, oConfig);
	try {
		assert.ok(!oFromWorker.error, oFromWorker.error);
		assert.deepStrictEqual(oFromWorker.result, structuredClone(PivotEngine.compute(DATA, oConfig)));
		console.log(`  ✔ Worker = hilo principal › ${sName} (${oFromWorker.result.rows.length || oFromWorker.result.tree.length} filas, ${(oFromWorker.result.issues || []).length} avisos)`);
	} catch (oError) {
		iFailed++;
		console.log(`  ✘ Worker = hilo principal › ${sName}\n    ${oError.message.split("\n").slice(0, 20).join("\n    ")}`);
	}
}
console.log(`\n${Object.keys(CASES).length - iFailed}/${Object.keys(CASES).length} pruebas de worker correctas`);
process.exit(iFailed ? 1 : 0);
