import { describe, expect, it } from "vitest";
import { normalizeDomain, normalizePhone } from "./utils";

describe("normalizePhone", () => {
  it("keeps E.164 as-is", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  it("prefixes US 10-digit numbers with +1", () => {
    expect(normalizePhone("(415) 555-2671")).toBe("+14155552671");
    expect(normalizePhone("4155552671")).toBe("+14155552671");
  });

  it("treats 11-digit 1-prefixed numbers as international", () => {
    expect(normalizePhone("14155552671")).toBe("+14155552671");
  });

  it("returns null for unusable values", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("normalizeDomain", () => {
  it("strips scheme and www", () => {
    expect(normalizeDomain("https://www.Acme-Design.com/contact")).toBe("acme-design.com");
    expect(normalizeDomain("http://acme.com")).toBe("acme.com");
  });

  it("lowercases and keeps ports out of the result", () => {
    expect(normalizeDomain("https://Blog.Example.com:8443/x")).toBe("blog.example.com");
  });

  it("handles bare domains", () => {
    expect(normalizeDomain("acme.com")).toBe("acme.com");
  });

  it("returns null for garbage", () => {
    expect(normalizeDomain("not a url")).toBeNull();
  });
});