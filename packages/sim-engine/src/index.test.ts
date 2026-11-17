import { describe, expect, it } from "vitest";
import * as simEngine from "./index.js";

describe("@floraflow/sim-engine", () => {
	it("loads its entry point", () => {
		expect(simEngine).toBeDefined();
	});
});
