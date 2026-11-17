import { describe, expect, it } from "vitest";
import * as db from "./index.js";

describe("@floraflow/db", () => {
	it("loads its entry point", () => {
		expect(db).toBeDefined();
	});
});
