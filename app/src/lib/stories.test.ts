import { describe, expect, it } from "vitest";
import { applyFix, checkStory, storyProblem } from "./stories";

const kinds = (s: string) => checkStory("", [s]).map((f) => `${f.kind}:${f.text}`);

describe("story identity check", () => {
  it("blocks contact details", () => {
    const f = checkStory("", ["Text me on 0803 123 4567 or mail ada@mail.com, I'm @adaeze_x on there"]);
    expect(f.filter((x) => x.blocking).map((x) => x.kind).sort()).toEqual(["email", "handle", "phone"]);
    expect(storyProblem("A title", ["Cheating"], ["Text me on 0803 123 4567 please, this is a long enough story to post here, with plenty more words added."])).toMatch(/Phone number/);
  });
  it("flags names, schools and workplaces with fixes", () => {
    expect(kinds("So Mr Tunde and I met at a party.")).toEqual(["name:Mr Tunde"]);
    expect(kinds("We both studied at Covenant University together.")).toEqual(["school:Covenant University"]);
    expect(kinds("He works at Zenith Bank in town.")[0]).toBe("workplace:Zenith Bank");
    expect(kinds("I told my friend Chidinma everything.")).toEqual(["name:Chidinma"]);
  });
  it("leaves X names, sentence starts and safe words alone", () => {
    expect(kinds("So Mr X and I met on Instagram in December. He was sweet. Then Miss X showed up.")).toEqual([]);
  });
  it("applies a fix", () => {
    const text = "So Mr Tunde and I met.";
    const [f] = checkStory("", [text]);
    expect(applyFix(text, f, f.fixes[0])).toBe("So Mr X and I met.");
    const t2 = "call me @someone now";
    const [h] = checkStory("", [t2]);
    expect(applyFix(t2, h, "")).toBe("call me now");
  });
  it("validates the thread", () => {
    expect(storyProblem("Hi", ["Lies"], ["x"])).toMatch(/title/);
    expect(storyProblem("Good title", [], ["x"])).toMatch(/tags/);
    expect(storyProblem("Good title", ["Lies"], ["short"])).toMatch(/at least/);
    expect(storyProblem("Good title", ["Lies"], ["So Mr X and I met at a friend's birthday and it went downhill from the very first week, honestly."])).toBeNull();
  });
});
