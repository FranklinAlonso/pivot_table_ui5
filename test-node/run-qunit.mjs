/**
 * Ejecuta en Node.js las pruebas QUnit de los módulos puros (motor y $apply),
 * sin navegador: simula sap.ui.define y un subconjunto de la API de QUnit.
 *
 *   node test-node/run-qunit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = {
	"com/frank/pivot/test/": path.join(ROOT, "test/com/frank/pivot/qunit/"),
	"com/frank/pivot/": path.join(ROOT, "src/com/frank/pivot/")
};
const TESTS = [
	"com/frank/pivot/test/engine/Formula.qunit",
	"com/frank/pivot/test/engine/PivotEngine.qunit",
	"com/frank/pivot/test/engine/CalculatedFields.qunit",
	"com/frank/pivot/test/engine/PreviousValue.qunit",
	"com/frank/pivot/test/provider/ApplyBuilder.qunit",
	"com/frank/pivot/test/table/ColorRules.qunit",
	"com/frank/pivot/test/table/TextRules.qunit",
	"com/frank/pivot/test/export/PivotLayout.qunit",
	"com/frank/pivot/test/variant/ViewFormat.qunit",
	"com/frank/pivot/test/variant/PersonalStore.qunit"
];

// ---------------------------------------------------------------- mini-loader AMD
const modules = new Map();
let pendingDefine = null;

function fileFor(name) {
	const prefix = Object.keys(ROOTS).find((p) => name.startsWith(p));
	if (!prefix) {
		throw new Error(`Módulo fuera de la librería (no disponible en Node): ${name}`);
	}
	return ROOTS[prefix] + name.slice(prefix.length) + ".js";
}

function resolve(dep, from) {
	return dep.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(from), dep)) : dep;
}

function requireModule(name) {
	if (modules.has(name)) {
		return modules.get(name);
	}
	vm.runInThisContext(fs.readFileSync(fileFor(name), "utf8"), { filename: fileFor(name) });
	const { deps, factory } = pendingDefine;
	pendingDefine = null;
	const exports = factory(...deps.map((d) => requireModule(resolve(d, name))));
	modules.set(name, exports);
	return exports;
}

globalThis.sap = {
	ui: {
		define(deps, factory) {
			pendingDefine = typeof deps === "function" ? { deps: [], factory: deps } : { deps, factory };
		}
	}
};

// ---------------------------------------------------------------- mini-QUnit
const tests = [];
let currentModule = "";
globalThis.QUnit = {
	module(name) { currentModule = name; },
	test(name, fn) { tests.push({ name: `${currentModule} › ${name}`, fn }); }
};

const assertApi = {
	ok: (v, msg) => assert.ok(v, msg),
	notOk: (v, msg) => assert.ok(!v, msg),
	equal: (a, b, msg) => assert.equal(a, b, msg),
	strictEqual: (a, b, msg) => assert.strictEqual(a, b, msg),
	notStrictEqual: (a, b, msg) => assert.notStrictEqual(a, b, msg),
	deepEqual: (a, b, msg) => assert.deepStrictEqual(a, b, msg),
	propEqual: (a, b, msg) => assert.deepStrictEqual({ ...a }, { ...b }, msg),
	throws: (fn, re, msg) => (re instanceof RegExp ? assert.throws(fn, re, msg) : assert.throws(fn, re)),
	expect: () => {}
};

TESTS.forEach(requireModule);

let failed = 0;
for (const t of tests) {
	try {
		await t.fn(assertApi);
		console.log(`  ✔ ${t.name}`);
	} catch (e) {
		failed++;
		console.log(`  ✘ ${t.name}\n    ${e.message.split("\n").join("\n    ")}`);
	}
}
console.log(`\n${tests.length - failed}/${tests.length} pruebas correctas`);
process.exit(failed ? 1 : 0);
