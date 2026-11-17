import { describe, expect, it } from "vitest";

// ponytail: placeholder. index.ts starts the server on import, so it can't be
// tested yet; once the app moves to app.ts (per the plan), test it with app.request().
describe("api", () => {
	it("runs the test suite", () => {
		expect(true).toBe(true);
	});
});
