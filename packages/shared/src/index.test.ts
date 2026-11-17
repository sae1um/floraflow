import { describe, expect, it } from "vitest";
import * as shared from "./index.js";

describe("@floraflow/shared", () => {
	it("loads its entry point", () => {
		expect(shared).toBeDefined();
	});
});
