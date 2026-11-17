import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	platform: "node",
	format: "esm",
	dts: false, // nothing imports the API's types
	// Workspace packages export .ts source, so they must be inlined;
	// npm dependencies stay external and load from node_modules at runtime.
	deps: { alwaysBundle: [/^@floraflow\//] },
});
