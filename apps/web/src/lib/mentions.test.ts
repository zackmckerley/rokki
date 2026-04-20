import { describe, it, expect } from "vitest";
import {
  extractMentions,
  mentionedUserIds,
  renderMentionsAsText,
} from "./mentions";

const uuid1 = "11111111-1111-1111-1111-111111111111";
const uuid2 = "22222222-2222-2222-2222-222222222222";

describe("mentions", () => {
  it("extracts a single mention", () => {
    const body = `Hey @[Zack](user:${uuid1}), take a look.`;
    const refs = extractMentions(body);
    expect(refs).toHaveLength(1);
    expect(refs[0].userId).toBe(uuid1);
    expect(refs[0].displayName).toBe("Zack");
  });

  it("extracts multiple mentions in order", () => {
    const body = `@[Zack](user:${uuid1}) and @[Ash](user:${uuid2}) should see this`;
    const refs = extractMentions(body);
    expect(refs.map((r) => r.userId)).toEqual([uuid1, uuid2]);
  });

  it("dedupes user ids from multiple references", () => {
    const body = `@[Zack](user:${uuid1}) — again, @[Z](user:${uuid1})`;
    expect(mentionedUserIds(body)).toEqual([uuid1]);
  });

  it("renders mentions as @name for emails", () => {
    const body = `Hi @[Zack](user:${uuid1}) re: the plan`;
    expect(renderMentionsAsText(body)).toBe("Hi @Zack re: the plan");
  });

  it("ignores malformed tokens", () => {
    const body = "plain @user but not formal";
    expect(extractMentions(body)).toEqual([]);
    expect(renderMentionsAsText(body)).toBe(body);
  });
});
